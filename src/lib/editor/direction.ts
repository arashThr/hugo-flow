export type TextDirection = "ltr" | "rtl";

/** Scripts that read right to left. Arabic-Indic digits live in this range too; a page full of them is RTL. */
const RTL_CHAR = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;

const RTL_LANG = new Set(["ar", "fa", "he", "iw", "ur", "ps", "dv", "sd", "ug", "yi"]);

/**
 * Majority script of the visible writing. Code, URLs, shortcodes and markup are ignored so a
 * Persian post with English examples still counts as RTL. A tie returns null and the caller
 * falls back to the site default.
 */
export function detectDirection(text: string): TextDirection | null {
  const visible = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/~~~[\s\S]*?~~~/g, " ")
    .replace(/\{\{<[\s\S]*?>\}\}/g, " ")
    .replace(/\{\{%[\s\S]*?%\}\}/g, " ")
    .replace(/`[^`\n]*`/g, " ")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/<[^>\n]+>/g, " ")
    .replace(/https?:\/\/\S+/g, " ");

  let rtl = 0;
  let ltr = 0;
  for (const char of visible) {
    if (RTL_CHAR.test(char)) rtl++;
    else if ((char >= "A" && char <= "Z") || (char >= "a" && char <= "z")) ltr++;
  }
  if (rtl === ltr) return null;
  return rtl > ltr ? "rtl" : "ltr";
}

/** Explicit choice wins. Otherwise follow the writing, then the site default. */
export function pageDirection(sample: string, fallback: TextDirection, override: TextDirection | null): TextDirection {
  if (override === "rtl" || override === "ltr") return override;
  return detectDirection(sample) ?? fallback;
}

function stripConfigComments(configText: string): string {
  return configText
    .split(/\r?\n/)
    .map((line) => {
      let quote: '"' | "'" | null = null;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (quote) {
          if (char === quote && line[i - 1] !== "\\") quote = null;
          continue;
        }
        if (char === '"' || char === "'") {
          quote = char;
          continue;
        }
        if (char === "#") return line.slice(0, i);
      }
      return line;
    })
    .join("\n");
}

function directionNearLanguage(text: string, lang: string): TextDirection | null {
  const lines = text.split("\n");
  const tomlHeader = new RegExp(`^\\s*\\[languages\\.${lang}\\]\\s*$`, "i");
  const yamlKey = new RegExp(`^(\\s*)${lang}\\s*:\\s*$`, "i");
  for (let i = 0; i < lines.length; i++) {
    const yaml = yamlKey.exec(lines[i]);
    if (!tomlHeader.test(lines[i]) && !yaml) continue;
    const indent = yaml ? yaml[1].length : null;
    for (let j = i + 1; j < Math.min(lines.length, i + 40); j++) {
      const line = lines[j];
      if (indent === null && /^\s*\[/.test(line)) break;
      if (indent !== null && line.trim()) {
        const nextIndent = line.match(/^\s*/)?.[0].length ?? 0;
        if (nextIndent <= indent) break;
      }
      const found = line.match(/\blanguageDirection\s*[=:]\s*["']?(rtl|ltr)\b/i);
      if (found) return found[1].toLowerCase() as TextDirection;
    }
  }
  return null;
}

/**
 * Direction of a Hugo site, from `languageDirection`, then `rtl = true`, then a default
 * language code such as `fa` or `ar`. Mixed sites follow `defaultContentLanguage`.
 */
export function siteDirection(configText: string): TextDirection {
  const text = stripConfigComments(configText);
  const directions = [...text.matchAll(/\blanguageDirection\s*[=:]\s*["']?(rtl|ltr)\b/gi)].map(
    (match) => match[1].toLowerCase() as TextDirection,
  );
  const unique = new Set(directions);
  if (unique.size === 1) return [...unique][0];

  const defaultLang = text.match(/\bdefaultContentLanguage\s*[=:]\s*["']?([A-Za-z0-9_-]+)/i)?.[1];
  if (defaultLang && unique.size > 1) {
    const specific = directionNearLanguage(text, defaultLang);
    if (specific) return specific;
  }

  if (unique.size === 0 && /\brtl\s*[=:]\s*["']?true\b/i.test(text)) return "rtl";

  const lang = defaultLang ?? (unique.size === 0 ? text.match(/\blanguageCode\s*[=:]\s*["']?([A-Za-z0-9_-]+)/i)?.[1] : undefined);
  if (lang && RTL_LANG.has(lang.toLowerCase().split("-")[0])) return "rtl";
  return "ltr";
}

const STORAGE_PREFIX = "hugoflow:direction:";

function storageKey(repository: string, path: string | null): string {
  return `${STORAGE_PREFIX}${repository}:${path ?? "new"}`;
}

/** A choice the writer pinned, kept in this browser. Null means "follow the writing". */
export function readDirectionOverride(repository: string, path: string | null): TextDirection | null {
  if (!repository || typeof localStorage === "undefined") return null;
  try {
    const value = localStorage.getItem(storageKey(repository, path));
    return value === "rtl" || value === "ltr" ? value : null;
  } catch {
    return null;
  }
}

export function writeDirectionOverride(repository: string, path: string | null, direction: TextDirection | null) {
  if (!repository || typeof localStorage === "undefined") return;
  try {
    const key = storageKey(repository, path);
    if (direction) localStorage.setItem(key, direction);
    else localStorage.removeItem(key);
  } catch {
    // Private mode. The choice still applies until the page is reloaded.
  }
}

/** Keep a pinned choice when a new page gets its real path. */
export function retargetDirectionOverride(repository: string, from: string | null, to: string) {
  if ((from ?? "new") === to) return;
  const value = readDirectionOverride(repository, from);
  if (!value) return;
  writeDirectionOverride(repository, to, value);
  writeDirectionOverride(repository, from, null);
}
