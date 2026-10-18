// Hugo archetypes are Go templates. We can't run Go templates in the browser, but archetypes use
// a small, predictable set of expressions, so we substitute those and read the result as a
// normal content file. Nothing here knows about specific archetype names: whatever lives in the
// blog's archetypes/ folder is offered as "New <name>".

import { deepEqual, getPath, isPlainObject, parseContent, setPath, type FrontMatter, type FrontMatterFormat } from "./frontmatter";

export interface ArchetypeSource {
  name: string; // "til" for archetypes/til.md or archetypes/til/index.md
  path: string;
  bundle: boolean; // a directory archetype: posts become <slug>/index.md
  source: string;
}

export interface Archetype extends ArchetypeSource {
  label: string; // "TIL", "essay"
  format: FrontMatterFormat;
  prefix: string; // rendered front matter block, the formatting template for new posts
  data: FrontMatter;
  body: string;
  fields: string[]; // every leaf field path the archetype writes, e.g. "params.kind"
  literals: Record<string, unknown>; // fixed values that identify posts of this kind: { "params.kind": "til" }
  hints: Record<string, Record<string, string>>; // from {{/* hugoflow: ref=til */}} comments
  error?: string;
}

/** Fields every post has; never used to tell kinds apart. */
const COMMON = new Set(["title", "date", "publishDate", "lastmod", "expiryDate", "draft", "slug", "weight"]);
const TAXONOMIES = new Set(["tags", "categories", "keywords", "series"]);

export function archetypeLabel(name: string): string {
  return name.length <= 3 ? name.toUpperCase() : name.replace(/[-_]+/g, " ");
}

/** The same shape Hugo's .Date prints: local time with its UTC offset. */
export function hugoDate(d: Date = new Date()): string {
  const pad = (n: number) => String(Math.abs(n)).padStart(2, "0");
  const off = -d.getTimezoneOffset();
  const zone = `${off >= 0 ? "+" : "-"}${pad(Math.trunc(off / 60))}:${pad(off % 60)}`;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${zone}`;
}

/** Find archetypes in a repository tree: archetypes/<name>.md and archetypes/<name>/index.md. */
export function archetypePaths(paths: string[]): { name: string; path: string; bundle: boolean }[] {
  const out: { name: string; path: string; bundle: boolean }[] = [];
  for (const path of paths) {
    const file = path.match(/^archetypes\/([^/]+)\.(?:md|markdown)$/);
    const dir = path.match(/^archetypes\/([^/]+)\/index\.(?:md|markdown)$/);
    if (file) out.push({ name: file[1], path, bundle: false });
    else if (dir) out.push({ name: dir[1], path, bundle: true });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Evaluate the template expressions we understand. Dates become `date`, anything naming the
 * file or title becomes `title` (empty while the post has no title yet; the editor fills it in
 * through the front matter patcher, which takes care of quoting), everything else becomes "".
 */
export function renderTemplate(source: string, { date, title = "" }: { date: string; title?: string }): string {
  return (
    source
      // Comments: a comment alone on its line takes the line with it; an inline one takes the spaces before it.
      .replace(/^[ \t]*\{\{-?\s*\/\*[\s\S]*?\*\/\s*-?\}\}[ \t]*\n/gm, "")
      .replace(/[ \t]*\{\{-?\s*\/\*[\s\S]*?\*\/\s*-?\}\}/g, "")
      .replace(/(\s*)\{\{(-?)\s*([\s\S]*?)\s*(-?)\}\}(\s*)/g, (_m, before: string, trimLeft: string, expr: string, trimRight: string, after: string) => {
        const value = /\.Date\b|\bnow\b/.test(expr) ? date : /\.(Title|Name|File|LinkTitle)\b/.test(expr) ? title : "";
        return (trimLeft ? "" : before) + value + (trimRight ? "" : after);
      })
  );
}

// Read "hugoflow: ref=til" hints (Go template comments in the archetype) and the field each one sits on.
function readHints(source: string, format: FrontMatterFormat): Record<string, Record<string, string>> {
  const hints: Record<string, Record<string, string>> = {};
  let table: string[] = [];
  const yamlStack: { indent: number; key: string }[] = [];
  for (const line of source.split("\n")) {
    const header = format === "toml" && line.trim().match(/^\[([^[\]]+)\]/);
    if (header) {
      table = header[1].split(".").map((s) => s.trim().replace(/^["']|["']$/g, ""));
      continue;
    }
    const keyMatch = line.match(/^(\s*)["']?([A-Za-z0-9_-]+)["']?\s*[=:]/);
    let path: string[] | null = null;
    if (keyMatch) {
      if (format === "yaml") {
        const indent = keyMatch[1].length;
        while (yamlStack.length && yamlStack[yamlStack.length - 1].indent >= indent) yamlStack.pop();
        path = [...yamlStack.map((s) => s.key), keyMatch[2]];
        yamlStack.push({ indent, key: keyMatch[2] });
      } else {
        path = [...table, keyMatch[2]];
      }
    }
    const hint = line.match(/\{\{-?\s*\/\*\s*hugoflow:\s*([\s\S]*?)\s*\*\/\s*-?\}\}/);
    if (hint && path) {
      hints[path.join(".")] = Object.fromEntries(
        hint[1]
          .split(/[\s,]+/)
          .map((pair) => pair.split("="))
          .filter((kv) => kv.length === 2 && kv[0])
          .map(([k, v]) => [k, v])
      );
    }
  }
  return hints;
}

function leafPaths(data: FrontMatter, prefix = ""): string[] {
  return Object.entries(data).flatMap(([k, v]) => (isPlainObject(v) ? leafPaths(v, `${prefix}${k}.`) : [`${prefix}${k}`]));
}

export function loadArchetype(src: ArchetypeSource, date: string = hugoDate()): Archetype {
  const base: Archetype = {
    ...src,
    label: archetypeLabel(src.name),
    format: "toml",
    prefix: "",
    data: {},
    body: "",
    fields: [],
    literals: {},
    hints: {},
  };
  try {
    const parsed = parseContent(renderTemplate(src.source, { date }));
    if (parsed.format === "none") return { ...base, body: parsed.body, error: "No front matter" };
    const fields = leafPaths(parsed.data);
    const literals: Record<string, unknown> = {};
    for (const path of fields) {
      const value = getPath(parsed.data, path);
      if (COMMON.has(path) || TAXONOMIES.has(path)) continue;
      if ((typeof value === "string" && value !== "") || typeof value === "number" || typeof value === "boolean") literals[path] = value;
    }
    return {
      ...base,
      format: parsed.format,
      prefix: parsed.prefix.replace(/\n*$/, "\n\n"), // a blank line before the body, like the blog's posts
      data: parsed.data,
      body: parsed.body,
      fields,
      literals,
      hints: readHints(src.source, parsed.format),
    };
  } catch (e) {
    return { ...base, error: (e as Error).message.split("\n")[0] };
  }
}

/** The archetype a post was made from: the most specific one whose fixed values it carries. */
export function matchArchetype<T extends { literals: Record<string, unknown>; name: string }>(
  fm: FrontMatter,
  archetypes: T[]
): T | null {
  let best: T | null = null;
  for (const a of archetypes) {
    const keys = Object.keys(a.literals);
    if (!keys.length || !keys.every((path) => deepEqual(getPath(fm, path), a.literals[path]))) continue;
    if (!best || keys.length > Object.keys(best.literals).length) best = a;
  }
  return best;
}

/** Fields whose fixed value differs between archetypes (here `params.kind`): edited as a select. */
export function kindFields(archetypes: Archetype[]): { path: string; options: { value: string; archetype: string; label: string }[] }[] {
  const byPath = new Map<string, { value: string; archetype: string; label: string }[]>();
  for (const a of archetypes) {
    for (const [path, value] of Object.entries(a.literals)) {
      if (typeof value !== "string") continue;
      const list = byPath.get(path) ?? [];
      if (!list.some((o) => o.value === value)) list.push({ value, archetype: a.name, label: a.label });
      byPath.set(path, list);
    }
  }
  return [...byPath.entries()].filter(([, options]) => options.length >= 2).map(([path, options]) => ({ path, options }));
}

/** Field paths worth sending to the client for each post, so kinds and references can be worked out. */
export function trackedFields(archetypes: Archetype[]): string[] {
  const set = new Set<string>();
  for (const a of archetypes) for (const f of a.fields) if (!COMMON.has(f) && !TAXONOMIES.has(f)) set.add(f);
  return [...set];
}

/**
 * Switch a post to another archetype: take the target's fixed values, add the fields it has that
 * the post lacks, and drop the old archetype's fields that are still empty. Content stays.
 */
export function switchArchetype(fm: FrontMatter, from: Archetype | null, to: Archetype): FrontMatter {
  let next = fm;
  for (const [path, value] of Object.entries(to.literals)) next = setPath(next, path, value);
  for (const path of to.fields) {
    if (COMMON.has(path) || getPath(next, path) !== undefined) continue;
    next = setPath(next, path, structuredClone(getPath(to.data, path)));
  }
  if (from) {
    for (const path of from.fields) {
      if (to.fields.includes(path) || COMMON.has(path)) continue;
      const v = getPath(next, path);
      if (v === "" || (Array.isArray(v) && v.length === 0)) next = setPath(next, path, undefined);
    }
  }
  return next;
}

/* ---------- References between posts (builds_on) ---------- */

export interface RefEntry {
  section: string;
  baseName: string;
  archetype: string | null;
  isIndex: boolean;
  fields: Record<string, unknown>;
}

/**
 * Which list fields hold references to other posts, and which archetypes they point at.
 * A "hugoflow: ref=<archetype>" comment on the field in the archetype wins. Otherwise a list field
 * counts as a reference when every value already used in it names a post in the same section.
 */
export function referenceFields(archetypes: Archetype[], entries: RefEntry[]): Map<string, { targets: string[] }> {
  const out = new Map<string, { targets: string[] }>();
  for (const a of archetypes) {
    for (const path of a.fields) {
      if (TAXONOMIES.has(path) || COMMON.has(path) || out.has(path)) continue;
      const hint = a.hints[path]?.ref;
      if (hint) {
        out.set(path, { targets: hint.split("|") });
        continue;
      }
      if (!Array.isArray(getPath(a.data, path))) continue;
      const targets = new Set<string>();
      let used = 0;
      let allResolve = true;
      for (const e of entries) {
        const values = e.fields[path];
        if (!Array.isArray(values)) continue;
        for (const v of values) {
          used++;
          const hit = entries.find((t) => !t.isIndex && t.section === e.section && t.baseName === String(v));
          if (!hit) allResolve = false;
          else if (hit.archetype) targets.add(hit.archetype);
        }
      }
      if (used > 0 && allResolve) out.set(path, { targets: [...targets] });
    }
  }
  return out;
}

/** The section new posts of this archetype go to: wherever most existing ones live. */
export function archetypeSection(name: string, entries: { section: string; archetype: string | null; isIndex: boolean }[], fallback: string): string {
  const counts = new Map<string, number>();
  for (const e of entries) if (e.archetype === name && !e.isIndex) counts.set(e.section, (counts.get(e.section) ?? 0) + 1);
  let best = fallback;
  let max = 0;
  for (const [section, n] of counts) if (n > max) [best, max] = [section, n];
  return best;
}

/** The archetype `hugo new` uses for a plain new post in a section: one named after the section, else default. */
export function sectionArchetype<T extends { name: string }>(archetypes: T[], section: string): T | null {
  const name = section.split("/").pop();
  return archetypes.find((a) => a.name === name) ?? archetypes.find((a) => a.name === "default") ?? null;
}

/** Archetypes that stand for a kind of post (they set a fixed value like kind = "til"), as opposed to default.md. */
export function kindArchetypes<T extends { literals: Record<string, unknown> }>(archetypes: T[]): T[] {
  return archetypes.filter((a) => Object.keys(a.literals).length > 0);
}

/* ---------- Commit messages ---------- */

export type CommitAction = "add" | "update" | "rename" | "publish" | "unpublish" | "delete";

/** "aie: add TIL What a token is". Posts without an archetype keep the generic messages. */
export function archetypeCommitMessage(action: CommitAction, sectionName: string, label: string, title: string): string {
  return `${sectionName}: ${action} ${label} ${title}`.trim();
}
