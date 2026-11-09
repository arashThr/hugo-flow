import { describe, expect, it } from "vitest";
import type { StoredDraft } from "@/lib/drafts";
import { withFeaturedImage } from "./image-job";

function draft(image = "", uploads: StoredDraft["uploads"] = []): StoredDraft {
  return {
    savedAt: 1,
    baseSha: "abc",
    format: "toml",
    fm: image ? { title: "Post", image } : { title: "Post" },
    folder: "content/blog",
    fileName: "post",
    body: "Hello",
    uploads,
  };
}

describe("withFeaturedImage", () => {
  it("sets the featured image and keeps inline uploads", () => {
    const inline = { sitePath: "/images/inline.webp", repoPath: "static/images/inline.webp", dataUrl: "data:image/webp,a" };
    const featured = { sitePath: "/images/old.webp", repoPath: "static/images/old.webp", dataUrl: "data:image/webp,b" };
    const next = { sitePath: "/images/new.webp", repoPath: "static/images/new.webp", dataUrl: "data:image/webp,c" };
    const updated = withFeaturedImage(draft("/images/old.webp", [inline, featured]), "image", next, "/images/old.webp");
    expect(updated.fm.image).toBe("/images/new.webp");
    expect(updated.body).toBe("Hello");
    expect(updated.uploads.map((item) => item.sitePath)).toEqual(["/images/inline.webp", "/images/new.webp"]);
  });
});
