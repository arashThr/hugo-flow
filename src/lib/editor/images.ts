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

/** Turn a generated image into a File the existing upload path can resize. */
export function fileFromDataUrl(dataUrl: string, name: string): File {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) throw new Error("The image data was incomplete.");
  const mime = /data:([^;,]+)/.exec(dataUrl.slice(0, comma))?.[1] ?? "image/jpeg";
  const binary = atob(dataUrl.slice(comma + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], name, { type: mime });
}

/** A small data URL safe to keep in this browser as a style template. Safari may return PNG instead of WebP. */
export async function compressToDataUrl(file: File, maxWidth: number): Promise<string> {
  if (!file.type.startsWith("image/") || file.type === "image/svg+xml") {
    throw new Error("Choose a JPEG, PNG, WebP, or GIF.");
  }
  let dataUrl: string;
  try {
    dataUrl = await drawDataUrl(file, maxWidth, 0.75);
  } catch {
    throw new Error("That image could not be read.");
  }
  if (dataUrl.length > 1_000_000) {
    try {
      dataUrl = await drawDataUrl(file, Math.min(maxWidth, 480), 0.6);
    } catch {
      throw new Error("That image could not be read.");
    }
  }
  if (!dataUrl.startsWith("data:image/") || dataUrl.length > 1_000_000) {
    throw new Error("That image is too large to keep in this browser.");
  }
  return dataUrl;
}

async function drawDataUrl(file: File, maxWidth: number, quality: number): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxWidth / Math.max(bitmap.width, 1));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new Error("That image could not be read.");
  }
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const webp = canvas.toDataURL("image/webp", quality);
  return webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/png");
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
