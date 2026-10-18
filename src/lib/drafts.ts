import type { FrontMatter, FrontMatterFormat } from "./frontmatter";
import type { PendingUpload } from "./editor/images";

/** Unsaved work kept in the browser so a closed tab or crash never loses it. */
export interface StoredDraft {
  savedAt: number;
  baseSha: string | null;
  format: FrontMatterFormat;
  fm: FrontMatter;
  folder: string;
  fileName: string | null;
  body: string;
  uploads: PendingUpload[];
  archetype?: string; // new posts started from an archetype
}

export const draftKey = (repo: string, path: string | null) => `hugoflow:draft:${repo}:${path ?? "new"}`;

export function readDraft<T = StoredDraft>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeDraft<T = StoredDraft>(key: string, draft: T | null) {
  try {
    if (draft) localStorage.setItem(key, JSON.stringify(draft));
    else localStorage.removeItem(key);
  } catch (e) {
    // Usually the storage quota (large images). The editor still works; only crash recovery is lost.
    console.warn("Could not store local draft", e);
  }
}
