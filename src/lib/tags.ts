import { asStringArray } from "./frontmatter";

/** Keep tags that are already on the page, then append new ones. Comparison ignores case. */
export function mergeTags(existing: unknown, incoming: string[]): { tags: string[]; added: boolean } {
  const current = asStringArray(existing);
  const seen = new Set(current.map((tag) => tag.toLowerCase()));
  const tags = [...current];
  for (const raw of incoming) {
    const tag = raw.trim().replace(/^#/, "");
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
  }
  return { tags, added: tags.length !== current.length };
}
