// Re-serialising a whole front matter block keeps the data but rewrites every line: quotes
// change, comments vanish, TOML dates get quoted. To keep commits honest we find the lines each
// key occupies in the original block and rewrite only keys whose value changed. Anything we
// can't place safely returns null, and the caller falls back to a full rewrite.

import * as toml from "@iarna/toml";
import YAML, { isMap, isScalar, isSeq, type Node as YamlNode } from "yaml";
import { deepEqual, isPlainObject, normalizeDates, type FrontMatter, type FrontMatterFormat } from "./frontmatter";

type Path = string[];

interface ValueStyle {
  quote?: "'" | '"' | "plain"; // strings: how the original value was written
  itemQuote?: "'" | '"'; // arrays: how the original elements were quoted
  flow?: boolean; // YAML sequences written as [a, b]
  seqIndent?: string; // YAML block sequences: indentation before "-", relative to the key
}

interface Span {
  start: number; // line range [start, end) within the block, delimiters excluded
  end: number;
  indent: string;
  keyText: string; // the key exactly as written
  tail: string; // a trailing comment on a single-line value, kept on rewrite
  style: ValueStyle;
}

interface Container {
  after: number; // new child keys go after this line (-1 = top of the block)
  indent: string;
  header?: number; // TOML tables: the [header] line
}

interface Layout {
  spans: Map<string, Span>;
  containers: Map<string, Container>;
  blocked: Set<string>; // paths whose children we can't place safely (dotted keys, arrays of tables)
  seqIndent: string; // YAML: how this file indents block sequences
}

interface Op {
  start: number;
  end: number;
  lines: string[];
  order: number;
}

const key = (path: Path) => JSON.stringify(path);
const BARE_KEY = /^[A-Za-z0-9_-]+$/;

/**
 * Rewrite only what changed between `before` (what `prefix` parses to) and `after`.
 * @returns the new front matter block, delimiters and the gap after it included, or null.
 */
export function patchFrontMatter(prefix: string, format: FrontMatterFormat, before: FrontMatter, after: FrontMatter): string | null {
  if (deepEqual(before, after)) return prefix;
  if (format === "json") return patchJson(prefix, after);
  if ((format !== "toml" && format !== "yaml") || prefix.includes("\r")) return null;

  const delim = format === "toml" ? /^\+\+\+[ \t]*$/ : /^---[ \t]*$/;
  const all = prefix.split("\n");
  if (!delim.test(all[0])) return null;
  const close = all.findIndex((line, i) => i > 0 && delim.test(line));
  if (close < 0) return null;
  const lines = all.slice(1, close);

  const layout = format === "toml" ? tomlLayout(lines) : yamlLayout(lines);
  if (!layout) return null;

  const ops: Op[] = [];
  const appended: string[] = []; // TOML tables created at the end of the block
  if (!diff(format, layout, before, after, [], ops, appended)) return null;

  const out = [...lines];
  ops.sort((a, b) => b.start - a.start || b.order - a.order).forEach((op) => out.splice(op.start, op.end - op.start, ...op.lines));
  if (appended.length) {
    while (out.length && out[out.length - 1].trim() === "") out.pop();
    out.push(...appended);
  }

  // Only trust the patch if it reads back as exactly what the editor holds.
  try {
    const inner = out.join("\n");
    const reparsed = format === "toml" ? normalizeDates(toml.parse(inner) as FrontMatter) : ((YAML.parse(inner) ?? {}) as FrontMatter);
    if (!deepEqual(reparsed, after)) return null;
  } catch {
    return null;
  }
  return [all[0], ...out, ...all.slice(close)].join("\n");
}

function diff(format: "toml" | "yaml", layout: Layout, before: FrontMatter, after: FrontMatter, path: Path, ops: Op[], appended: string[]): boolean {
  const push = (start: number, end: number, lines: string[]) => ops.push({ start, end, lines, order: ops.length });
  const names = [...Object.keys(after), ...Object.keys(before).filter((name) => !(name in after))];

  for (const name of names) {
    const p = [...path, name];
    const b = before[name];
    const a = after[name];
    if (deepEqual(b, a)) continue;
    const span = layout.spans.get(key(p));
    const table = layout.containers.get(key(p));

    if (isPlainObject(a) && isPlainObject(b) && table) {
      if (!diff(format, layout, b, a, p, ops, appended)) return false;
      continue;
    }
    if (a === undefined) {
      if (span) push(span.start, span.end, []);
      else if (table?.header !== undefined) push(table.header, table.after + 1, []);
      else if (b !== undefined) return false; // no line of its own (e.g. inside an inline table)
      continue;
    }
    if (span) {
      const written = writeEntry(format, span.keyText, a, span.indent, span.style, layout.seqIndent);
      if (span.tail && written.length === 1) written[0] += span.tail;
      push(span.start, span.end, written);
      continue;
    }
    if (table || layout.blocked.has(key(path))) return false;

    const parent = layout.containers.get(key(path));
    if (format === "toml" && (isPlainObject(a) || !parent)) {
      // A new table. Hugo reads tables anywhere, and appending keeps every existing line in place.
      if (!parent && layout.spans.has(key(path))) return false;
      appended.push("", ...toml.stringify(wrap(p, a) as toml.JsonMap).trimEnd().split("\n"));
      continue;
    }
    if (!parent) return false;
    push(parent.after + 1, parent.after + 1, writeEntry(format, BARE_KEY.test(name) ? name : JSON.stringify(name), a, parent.indent, {}, layout.seqIndent));
  }
  return true;
}

function wrap(path: Path, value: unknown): FrontMatter {
  return path.reduceRight<unknown>((acc, name) => ({ [name]: acc }), value) as FrontMatter;
}

/* ---------- Writing values ---------- */

function writeEntry(format: "toml" | "yaml", keyText: string, value: unknown, indent: string, style: ValueStyle, seqIndent: string): string[] {
  if (format === "toml") return [`${indent}${keyText} = ${tomlValue(value, style)}`];

  const doc = new YAML.Document(value);
  const node = doc.contents as YamlNode | null;
  if (node && isScalar(node) && typeof value === "string") {
    if (style.quote === "'") node.type = "QUOTE_SINGLE";
    else if (style.quote === '"') node.type = "QUOTE_DOUBLE";
  }
  if (node && isSeq(node)) {
    if (style.flow) node.flow = true;
    if (style.itemQuote) {
      for (const item of node.items) if (isScalar(item) && typeof item.value === "string") item.type = style.itemQuote === "'" ? "QUOTE_SINGLE" : "QUOTE_DOUBLE";
    }
  }
  const pad = style.seqIndent ?? seqIndent;
  const text = doc.toString({ lineWidth: 0, indentSeq: pad !== "", flowCollectionPadding: false }).replace(/\n$/, "");
  const block = node && (isMap(node) || isSeq(node)) && !node.flow && text !== "[]" && text !== "{}";
  if (block) {
    const inner = isSeq(node) ? pad : "  ";
    return [`${indent}${keyText}:`, ...text.split("\n").map((line) => indent + inner + line)];
  }
  const [first, ...rest] = text.split("\n");
  return [`${indent}${keyText}: ${first}`, ...rest.map((line) => indent + line)];
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?)?$/;

function tomlValue(value: unknown, style: ValueStyle): string {
  if (typeof value === "string") {
    if (style.quote === "'" && !/['\n\r]/.test(value)) return `'${value}'`;
    if (style.quote === "plain" && ISO_DATE.test(value)) return value; // keep an unquoted datetime unquoted
    return JSON.stringify(value); // JSON string escapes are valid TOML basic-string escapes
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `[${value.map((v) => tomlValue(v, { quote: style.itemQuote })).join(", ")}]`;
  if (isPlainObject(value)) {
    const inner = Object.entries(value).map(([name, v]) => `${BARE_KEY.test(name) ? name : JSON.stringify(name)} = ${tomlValue(v, {})}`);
    return inner.length ? `{ ${inner.join(", ")} }` : "{}";
  }
  return JSON.stringify(String(value));
}

/* ---------- TOML layout ---------- */

function parseKeyParts(text: string): Path | null {
  const parts: string[] = [];
  const s = text.trim();
  let i = 0;
  while (i < s.length) {
    while (s[i] === " " || s[i] === "\t") i++;
    if (s[i] === '"' || s[i] === "'") {
      const q = s[i];
      let j = i + 1;
      while (j < s.length && s[j] !== q) j += q === '"' && s[j] === "\\" ? 2 : 1;
      if (j >= s.length) return null;
      const raw = s.slice(i + 1, j);
      try {
        parts.push(q === '"' ? JSON.parse(`"${raw}"`) : raw);
      } catch {
        return null;
      }
      i = j + 1;
    } else {
      const m = s.slice(i).match(/^[A-Za-z0-9_-]+/);
      if (!m) return null;
      parts.push(m[0]);
      i += m[0].length;
    }
    while (s[i] === " " || s[i] === "\t") i++;
    if (i < s.length) {
      if (s[i] !== ".") return null;
      i++;
    }
  }
  return parts.length ? parts : null;
}

/** Split `key = value` at the first "=" outside a quoted key. */
function splitKeyLine(line: string): { keyText: string; valueAt: number } | null {
  let i = 0;
  while (i < line.length && line[i] !== "=") {
    if (line[i] === '"' || line[i] === "'") {
      const q = line[i++];
      while (i < line.length && line[i] !== q) i += q === '"' && line[i] === "\\" ? 2 : 1;
    }
    i++;
  }
  return i < line.length ? { keyText: line.slice(0, i).trim(), valueAt: i + 1 } : null;
}

/** Scan a TOML value starting at `pos` (it may span lines). Returns the offset just past it, or -1. */
function scanTomlValue(text: string, pos: number): number {
  let depth = 0;
  let started = false;
  let last = pos;
  let p = pos;
  while (p < text.length) {
    const ch = text[p];
    if (ch === "#") {
      while (p < text.length && text[p] !== "\n") p++;
      continue;
    }
    if (ch === "\n") {
      if (started && depth <= 0) return last;
      p++;
      continue;
    }
    if (ch === " " || ch === "\t") {
      p++;
      continue;
    }
    started = true;
    if (text.startsWith('"""', p) || text.startsWith("'''", p)) {
      const q = text.slice(p, p + 3);
      let j = p + 3;
      for (;;) {
        j = text.indexOf(q, j);
        if (j < 0) return -1;
        if (q === '"""' && isEscaped(text, j)) j++;
        else break;
      }
      p = j + 3;
      while (text[p] === q[0]) p++; // up to two extra quotes belong to the string
    } else if (ch === '"' || ch === "'") {
      let j = p + 1;
      while (j < text.length && text[j] !== ch && text[j] !== "\n") j += ch === '"' && text[j] === "\\" ? 2 : 1;
      if (text[j] !== ch) return -1;
      p = j + 1;
    } else {
      if (ch === "[" || ch === "{") depth++;
      else if (ch === "]" || ch === "}") depth--;
      p++;
    }
    last = p;
  }
  return started && depth <= 0 ? last : -1;
}

function isEscaped(s: string, idx: number) {
  let n = 0;
  for (let i = idx - 1; i >= 0 && s[i] === "\\"; i--) n++;
  return n % 2 === 1;
}

function tomlStyle(valueText: string): ValueStyle {
  const v = valueText.trim();
  if (v.startsWith("'")) return { quote: "'" };
  if (v.startsWith('"')) return { quote: '"' };
  if (v.startsWith("[")) {
    const m = v.match(/^\[\s*(['"])/);
    return { itemQuote: m ? (m[1] as "'" | '"') : undefined };
  }
  return { quote: "plain" };
}

function lineIndex(text: string) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === "\n") starts.push(i + 1);
  const lineOf = (offset: number) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };
  return { starts, lineOf };
}

function tomlLayout(lines: string[]): Layout | null {
  const text = lines.join("\n");
  const { starts, lineOf } = lineIndex(text);
  const spans = new Map<string, Span>();
  const containers = new Map<string, Container>([[key([]), { after: -1, indent: "" }]]);
  const blocked = new Set<string>();
  let table: Path = [];
  let inArrayTable = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const header = trimmed.match(/^(\[\[?)\s*(.+?)\s*(\]\]?)\s*(?:#.*)?$/);
    if (header && header[1].length === header[3].length) {
      const path = parseKeyParts(header[2]);
      if (!path) return null;
      table = path;
      inArrayTable = header[1] === "[[";
      if (inArrayTable) for (let n = 1; n <= path.length; n++) blocked.add(key(path.slice(0, n)));
      else containers.set(key(path), { after: i, indent: "", header: i });
      continue;
    }

    const split = splitKeyLine(line);
    const keyPath = split && parseKeyParts(split.keyText);
    if (!split || !keyPath) return null;
    const end = scanTomlValue(text, starts[i] + split.valueAt);
    if (end < 0) return null;
    const endLine = lineOf(Math.max(end - 1, starts[i]));

    if (!inArrayTable) {
      const rest = lines[endLine].slice(end - starts[endLine]);
      const indent = line.match(/^\s*/)?.[0] ?? "";
      spans.set(key([...table, ...keyPath]), {
        start: i,
        end: endLine + 1,
        indent,
        keyText: split.keyText,
        tail: endLine === i && /^\s*#/.test(rest) ? rest.replace(/\s+$/, "") : "",
        style: tomlStyle(line.slice(split.valueAt)),
      });
      // Dotted keys define their parent tables implicitly; adding siblings to those needs care we don't take.
      for (let n = 1; n < keyPath.length; n++) blocked.add(key([...table, ...keyPath.slice(0, n)]));
      const container = containers.get(key(table));
      if (container) {
        container.after = endLine;
        container.indent = indent;
      }
    }
    i = endLine;
  }
  return { spans, containers, blocked, seqIndent: "" };
}

/* ---------- YAML layout ---------- */

function yamlLayout(lines: string[]): Layout | null {
  const text = lines.join("\n");
  const doc = YAML.parseDocument(text);
  if (doc.errors.length) return null;
  if (doc.contents && !isMap(doc.contents)) return null;
  const { starts, lineOf } = lineIndex(text);

  const spans = new Map<string, Span>();
  const containers = new Map<string, Container>();
  const blocked = new Set<string>();
  let seqIndent: string | null = null;

  const walk = (node: YamlNode, path: Path) => {
    if (!isMap(node) || node.flow) return;
    const container: Container = { after: -1, indent: "" };
    containers.set(key(path), container);
    for (const pair of node.items) {
      const keyNode = pair.key as YamlNode | null;
      if (!keyNode || !isScalar(keyNode) || !keyNode.range) {
        blocked.add(key(path));
        continue;
      }
      const p = [...path, String(keyNode.value)];
      const value = pair.value as YamlNode | null;
      const start = lineOf(keyNode.range[0]);
      const valueEnd = value?.range ? value.range[1] : keyNode.range[1];
      const end = lineOf(Math.max(valueEnd - 1, keyNode.range[0])) + 1;
      const indent = lines[start].match(/^\s*/)?.[0] ?? "";

      const style: ValueStyle = {};
      if (value && isScalar(value)) {
        style.quote = value.type === "QUOTE_SINGLE" ? "'" : value.type === "QUOTE_DOUBLE" ? '"' : "plain";
      } else if (value && isSeq(value)) {
        style.flow = !!value.flow;
        const first = value.items[0] as YamlNode | undefined;
        if (first && isScalar(first)) style.itemQuote = first.type === "QUOTE_SINGLE" ? "'" : first.type === "QUOTE_DOUBLE" ? '"' : undefined;
        if (!value.flow && first?.range) {
          const rel = (lines[lineOf(first.range[0])].match(/^\s*/)?.[0] ?? "").slice(indent.length);
          style.seqIndent = rel;
          seqIndent ??= rel;
        }
      }
      const tail =
        end - 1 === start && value?.range ? (lines[start].slice(value.range[1] - starts[start]).match(/^\s+#.*$/)?.[0] ?? "") : "";
      spans.set(key(p), { start, end, indent, keyText: text.slice(keyNode.range[0], keyNode.range[1]), tail, style });
      container.after = end - 1;
      container.indent = indent;
      if (value && isMap(value) && !value.flow) walk(value, p);
    }
  };

  if (doc.contents) walk(doc.contents as YamlNode, []);
  else containers.set(key([]), { after: -1, indent: "" });
  // Without a block sequence to copy, match YAML.stringify's (and Hugo's) "  - item".
  return { spans, containers, blocked, seqIndent: seqIndent ?? "  " };
}

/* ---------- JSON ---------- */

function patchJson(prefix: string, after: FrontMatter): string | null {
  const indent = prefix.match(/^\{\s*\n([ \t]+)/)?.[1] ?? "  ";
  const end = prefix.lastIndexOf("}");
  return end < 0 ? null : JSON.stringify(after, null, indent) + prefix.slice(end + 1);
}
