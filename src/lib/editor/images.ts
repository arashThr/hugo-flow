import { slugify } from "../content";

export interface PendingUpload {
  sitePath: string; // what goes in markdown, e.g. "/images/1712345-cat.webp"
  repoPath: string; // where it is committed, e.g. "static/images/1712345-cat.webp"
  dataUrl: string;
}

export const IMAGE_SIZES = [
  { label: "Small", width: 640, hint: "Inline illustrations, side-by-side rows" },
  { label: "Medium", width: 1200, hint: "Most photos" },
  { label: "Large", width: 1920, hint: "Full-width hero shots" },
];

/** Downscale and convert to WebP. GIFs and SVGs are kept as-is so animation and vectors survive. */
export async function prepareImage(file: File, maxWidth: number, imageDir: string, index = 0): Promise<PendingUpload> {
  const base = slugify(file.name.replace(/\.[^.]+$/, "")) || "image";
  const keepOriginal = /^image\/(gif|svg\+xml)$/.test(file.type);
  const ext = keepOriginal ? (file.type === "image/gif" ? "gif" : "svg") : "webp";
  const dataUrl = keepOriginal ? await readAsDataUrl(file) : await resize(file, maxWidth);
  const name = `${Date.now() + index}-${base}.${dataUrl.startsWith("data:image/webp") || keepOriginal ? ext : "png"}`;
  const repoPath = `${imageDir.replace(/\/+$/, "")}/${name}`;
  return { repoPath, sitePath: "/" + repoPath.replace(/^static\//, ""), dataUrl };
}

export function altFromFile(file: File) {
  return file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim();
}

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function resize(file: File, maxWidth: number): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxWidth / bitmap.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return readAsDataUrl(file);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  // Safari can't encode WebP and silently returns PNG; prepareImage names the file accordingly.
  return canvas.toDataURL("image/webp", 0.82);
}
