import * as toml from "@iarna/toml";
import YAML from "yaml";

export type FrontMatterFormat = "toml" | "yaml" | "json" | "none";
export type FrontMatter = Record<string, unknown>;

export interface ParsedContent {
  format: FrontMatterFormat;
  data: FrontMatter;
  body: string;
  prefix: string; // the front matter block exactly as written, including delimiters and the following blank line
}

const TOML_RE = /^\+\+\+[ \t]*\r?\n([\s\S]*?)\r?\n\+\+\+[ \t]*(?:\r?\n|$)/;
const YAML_RE = /^---[ \t]*\r?\n([\s\S]*?)\r?\n?---[ \t]*(?:\r?\n|$)/;

/** Split a Hugo content file into front matter and markdown body, keeping every field. */
export function parseContent(raw: string): ParsedContent {
  const text = raw.replace(/^\uFEFF/, "");

  const tomlMatch = text.match(TOML_RE);
  if (tomlMatch) {
    return split(text, tomlMatch[0].length, "toml", normalizeDates(toml.parse(tomlMatch[1]) as FrontMatter));
  }

  const yamlMatch = text.match(YAML_RE);
  if (yamlMatch) {
    return split(text, yamlMatch[0].length, "yaml", (YAML.parse(yamlMatch[1]) ?? {}) as FrontMatter);
  }

  if (text.startsWith("{")) {
    const end = findJsonEnd(text);
    if (end > 0) {
      try {
        return split(text, end, "json", JSON.parse(text.slice(0, end)) as FrontMatter);
      } catch {
        // Not JSON front matter, fall through.
      }
    }
  }

  return { format: "none", data: {}, body: text, prefix: "" };
}

function split(text: string, fmEnd: number, format: FrontMatterFormat, data: FrontMatter): ParsedContent {
  const rest = text.slice(fmEnd);
  const gap = rest.match(/^(?:[ \t]*\r?\n)*/)?.[0] ?? "";
  return { format, data, body: rest.slice(gap.length), prefix: text.slice(0, fmEnd) + gap };
}

/** Rebuild a content file. Only undefined/null values are dropped; the editor removes keys it wants gone. */
export function stringifyContent(format: FrontMatterFormat, data: FrontMatter, body: string): string {
  const clean = pruneEmpty(data);
  const content = body.replace(/^\n+/, "").replace(/\s*$/, "\n");
  const fm = Object.keys(clean).length === 0 && format === "none" ? null : clean;
  if (!fm) return content;

  switch (format) {
    case "yaml":
      return `---\n${YAML.stringify(fm, { lineWidth: 0 })}---\n\n${content}`;
    case "json":
      return `${JSON.stringify(fm, null, 2)}\n\n${content}`;
    default:
      return `+++\n${toml.stringify(fm as toml.JsonMap)}+++\n\n${content}`;
  }
}

/** Serialise only some keys, used for the "other fields" editor. */
export function stringifyFields(format: FrontMatterFormat, data: FrontMatter): string {
  const clean = pruneEmpty(data);
  if (Object.keys(clean).length === 0) return "";
  if (format === "yaml") return YAML.stringify(clean, { lineWidth: 0 });
  if (format === "json") return JSON.stringify(clean, null, 2);
  return toml.stringify(clean as toml.JsonMap);
}

export function parseFields(format: FrontMatterFormat, text: string): FrontMatter {
  if (!text.trim()) return {};
  if (format === "yaml") return (YAML.parse(text) ?? {}) as FrontMatter;
  if (format === "json") return JSON.parse(text) as FrontMatter;
  return normalizeDates(toml.parse(text) as FrontMatter);
}

export function asString(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

export function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(asString).filter(Boolean);
  if (typeof value === "string") return value.split(",").map((s) => s.trim()).filter(Boolean);
  return [];
}

// @iarna/toml returns special Date objects for unquoted datetimes. Keep them as ISO strings so
// they survive JSON (drafts, API responses); TOML stringify writes them back quoted, which Hugo accepts.
export function normalizeDates(data: FrontMatter): FrontMatter {
  const out: FrontMatter = {};
  for (const [k, v] of Object.entries(data)) {
    if (v instanceof Date) out[k] = isNaN(v.getTime()) ? String(v) : v.toISOString();
    else if (v && typeof v === "object" && !Array.isArray(v)) out[k] = normalizeDates(v as FrontMatter);
    else out[k] = v;
  }
  return out;
}

export function isPlainObject(value: unknown): value is FrontMatter {
  return typeof value === "object" && value !== null && !Array.isArray(value) && !(value instanceof Date);
}

/** Structural equality that ignores key order and treats undefined values as missing keys. */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) if (!deepEqual(a[k], b[k])) return false;
    return true;
  }
  return false;
}

/** Read a nested field by dotted path, e.g. "params.kind". */
export function getPath(data: FrontMatter, path: string): unknown {
  let cur: unknown = data;
  for (const part of path.split(".")) {
    if (!isPlainObject(cur)) return undefined;
    cur = cur[part];
  }
  return cur;
}

/** Return a copy with a nested field set, or removed when value is undefined. Empty parent tables are dropped. */
export function setPath(data: FrontMatter, path: string, value: unknown): FrontMatter {
  const [head, ...rest] = path.split(".");
  const next = { ...data };
  if (rest.length === 0) {
    if (value === undefined) delete next[head];
    else next[head] = value;
    return next;
  }
  const child = setPath(isPlainObject(data[head]) ? data[head] : {}, rest.join("."), value);
  if (Object.keys(child).length === 0) delete next[head];
  else next[head] = child;
  return next;
}

function pruneEmpty(data: FrontMatter): FrontMatter {
  const out: FrontMatter = {};
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined || v === null) continue;
    out[k] = v;
  }
  return out;
}

function findJsonEnd(text: string): number {
  let depth = 0;
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (c === "\\") i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return i + 1;
  }
  return -1;
}
