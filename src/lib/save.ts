import { parseContent, stringifyContent, type FrontMatter, type FrontMatterFormat } from "./frontmatter";
import { patchFrontMatter } from "./fmpatch";

export interface SaveRequest {
  repository: string;
  branch: string;
  message: string;
  path: string;
  content: string;
  originalPath?: string | null;
  originalSha?: string | null;
  uploads?: { path: string; base64: string }[];
}

/** Commit one file (plus images) through /api/github/save. Throws with the server's message. */
export async function saveFile(req: SaveRequest): Promise<{ url?: string; fileSha: string }> {
  const res = await fetch("/api/github/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Save failed");
  return data;
}

/**
 * The full file: front matter written on top of `base` (the block as it is in the file, or the
 * archetype's) so only changed lines differ, falling back to a full rewrite if patching isn't safe.
 */
export function buildFile(format: FrontMatterFormat, data: FrontMatter, body: string, base: { prefix: string; data: FrontMatter } | null): string {
  const content = body.replace(/^\n+/, "").replace(/\s*$/, "\n");
  const block = base ? patchFrontMatter(base.prefix, format, base.data, data) : null;
  return block !== null ? block + content : stringifyContent(format, data, content);
}

/** Flip a post's draft flag, changing only that line. */
export async function toggleDraft(opts: { repository: string; branch: string; path: string; message: (draft: boolean) => string }) {
  const params = new URLSearchParams({ repository: opts.repository, branch: opts.branch, path: opts.path });
  const res = await fetch(`/api/github/file?${params}`);
  const file = await res.json();
  if (!res.ok) throw new Error(file.error || "Could not load the file");

  const parsed = parseContent(file.content);
  const format = parsed.format === "none" ? "toml" : parsed.format;
  const draft = !(parsed.data.draft === true || parsed.data.draft === "true");
  const next = { ...parsed.data, draft };
  const content = buildFile(format, next, parsed.body, parsed.format === "none" ? null : parsed);
  return saveFile({
    repository: opts.repository,
    branch: opts.branch,
    message: opts.message(draft),
    path: opts.path,
    content,
    originalPath: opts.path,
    originalSha: file.sha,
  });
}
