import type { FrontMatterFormat } from "./frontmatter";

/** A markdown file under the content directory, with the front matter fields the dashboard shows. */
export interface ContentEntry {
  path: string;
  sha: string;
  section: string; // e.g. "content/blog", or the content root for top-level pages
  title: string;
  date: string | null;
  draft: boolean;
  tags: string[];
  format: FrontMatterFormat;
  isIndex: boolean; // _index.md / index.md
}

export interface MediaEntry {
  path: string;
  sha: string;
  size: number;
  usedBy: string[]; // content/config paths that mention the file name
}

export interface SiteInfo {
  branch: string;
  baseURL: string | null;
  allowsRawHtml: boolean;
  configPath: string | null;
  entries: ContentEntry[];
  media: MediaEntry[];
}

export const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|svg)$/i;

export function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

export function sectionOf(path: string, contentDir: string): string {
  const rel = path.slice(contentDir.length + 1);
  const parts = rel.split("/");
  return parts.length > 1 ? `${contentDir}/${parts[0]}` : contentDir;
}

export function sectionLabel(section: string, contentDir: string): string {
  if (section === contentDir) return "Pages";
  const name = section.split("/").pop() || section;
  return name.charAt(0).toUpperCase() + name.slice(1).replace(/[-_]/g, " ");
}

export function fileLabel(path: string): string {
  const parts = path.split("/");
  const name = parts.pop() || path;
  if (name === "index.md" || name === "_index.md") return `${parts.pop()}/${name}`;
  return name;
}

/** "static/images/a.png" -> "/images/a.png" */
export function repoPathToSitePath(repoPath: string): string {
  return "/" + repoPath.replace(/^static\//, "");
}

/** Where a site-absolute path ("/images/a.png") lives in the repo. */
export function sitePathToRepoPath(sitePath: string): string {
  return "static/" + sitePath.replace(/^\/+/, "");
}

// datetime-local inputs work in local time; Hugo dates are absolute. Convert carefully so
// a load/save cycle never shifts a post's date by the user's UTC offset.
export function toLocalInput(value: string | null | undefined): string {
  const d = value ? new Date(value) : new Date();
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInput(local: string): string {
  const d = new Date(local);
  return isNaN(d.getTime()) ? local : d.toISOString();
}

export function formatDate(value: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
