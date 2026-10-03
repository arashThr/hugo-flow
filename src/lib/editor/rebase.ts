// The rich editor re-serialises the whole document, so even a one-word edit can reformat
// unrelated lines ("[X]" -> "[x]", "  " -> "\" hard breaks, blank lines after headings).
// To keep git diffs minimal we find the hunks that actually changed between the editor's
// normalised version of the original and the current text, and splice only those hunks
// into the original file text. Untouched regions stay byte-for-byte identical.

type Op = { kind: "same"; a: number; b: number } | { kind: "del"; a: number } | { kind: "ins"; b: number };

/**
 * Line diff via LCS. Posts are small, so the O(n*m) table is fine; bail out for huge inputs.
 * With `anchorsOnly`, blank lines never match: the editor adds and removes blank lines freely,
 * and pairing up the wrong ones would misalign the real content around them.
 */
function diffLines(a: string[], b: string[], anchorsOnly = false): Op[] | null {
  const eq = anchorsOnly
    ? (x: string, y: string) => x.trim() !== "" && canonical(x) === canonical(y)
    : (x: string, y: string) => x === y;
  const n = a.length;
  const m = b.length;
  if ((n + 1) * (m + 1) > 4_000_000) return null;
  const lcs: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = eq(a[i], b[j]) ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const ops: Op[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (eq(a[i], b[j])) ops.push({ kind: "same", a: i++, b: j++ });
    else if (lcs[i + 1][j] >= lcs[i][j + 1]) ops.push({ kind: "del", a: i++ });
    else ops.push({ kind: "ins", b: j++ });
  }
  while (i < n) ops.push({ kind: "del", a: i++ });
  while (j < m) ops.push({ kind: "ins", b: j++ });
  return ops;
}

/** Spellings the editor rewrites that mean the same thing in markdown. */
function canonical(line: string): string {
  return line
    .replace(/^(\s*(?:[-*+]|\d+[.)])\s+)\[X\]/, "$1[x]") // task checkbox case
    .replace(/(?: {2,}|\\)$/, "\u0000"); // hard line break: trailing spaces or backslash
}

interface Region {
  ns: number; // normalised line range [ns, ne)
  ne: number;
  cs: number; // current line range [cs, ce)
  ce: number;
}

/**
 * @param original   the body exactly as stored in the repo
 * @param normalized the same body after a round trip through the editor
 * @param current    what the editor produces now
 * @param roundTrip  parses markdown into the editor's model and serialises it again
 * @returns current's content, reusing original's text wherever the user didn't edit
 */
export function rebaseOntoOriginal(
  original: string,
  normalized: string,
  current: string,
  roundTrip: (markdown: string) => string
): string {
  const rebased = splice(original, normalized, current);
  // Splicing lines into a block the editor re-serialised can, rarely, change its meaning
  // (e.g. a tight list becoming loose). Only use the result if the editor reads it as
  // exactly the document the user is looking at.
  return rebased === current || roundTrip(rebased) === current ? rebased : current;
}

function splice(original: string, normalized: string, current: string): string {
  if (normalized === current) return original;
  if (original === normalized) return current;
  const O = original.split("\n");
  const N = normalized.split("\n");
  const C = current.split("\n");

  const on = diffLines(O, N, true);
  const nc = diffLines(N, C);
  if (!on || !nc) return current;

  const nToO = new Int32Array(N.length).fill(-1); // normalised line -> identical original line
  for (const op of on) if (op.kind === "same") nToO[op.b] = op.a;
  const nToC = new Int32Array(N.length).fill(-1); // normalised line -> where it is kept in current
  for (const op of nc) if (op.kind === "same") nToC[op.a] = op.b;

  // 1. Hunks of edits, in both normalised and current coordinates.
  const hunks: Region[] = [];
  let n = 0;
  let c = 0;
  for (let k = 0; k < nc.length; ) {
    if (nc[k].kind === "same") {
      n++;
      c++;
      k++;
      continue;
    }
    const h: Region = { ns: n, ne: n, cs: c, ce: c };
    while (k < nc.length && nc[k].kind !== "same") {
      if (nc[k].kind === "del") n++;
      else c++;
      k++;
    }
    h.ne = n;
    h.ce = c;
    hunks.push(h);
  }

  // 2. Widen each hunk until both edges sit next to lines that exist verbatim in the original,
  //    so the matching original range is known exactly. Merge hunks that end up overlapping.
  const regions: Region[] = [];
  for (const h of hunks) {
    let ns = h.ns;
    while (ns > 0 && nToO[ns - 1] < 0) ns--;
    let ne = h.ne;
    while (ne < N.length && nToO[ne] < 0) ne++;
    // Lines pulled in by widening are outside every hunk, so they are kept in current.
    const cs = ns < h.ns ? nToC[ns] : h.cs;
    const ce = ne > h.ne ? nToC[ne - 1] + 1 : h.ce;
    const prev = regions[regions.length - 1];
    if (prev && ns <= prev.ne) {
      prev.ne = Math.max(prev.ne, ne);
      prev.ce = Math.max(prev.ce, ce);
    } else {
      regions.push({ ns, ne, cs, ce });
    }
  }

  // 3. Splice: original text outside the regions, current text inside them.
  const out: string[] = [];
  let cursor = 0;
  for (const r of regions) {
    const os = r.ns === 0 ? 0 : nToO[r.ns - 1] + 1;
    const oe = r.ne === N.length ? O.length : nToO[r.ne];
    if (os < cursor || oe < os || r.cs < 0 || r.ce < r.cs) return current; // inconsistent mapping; be safe
    out.push(...O.slice(cursor, os), ...C.slice(r.cs, r.ce));
    cursor = oe;
  }
  out.push(...O.slice(cursor));
  return out.join("\n");
}
