import { describe, expect, it } from "vitest";
import { mergeTags } from "./tags";

describe("mergeTags", () => {
  it("keeps existing tags and appends new ones", () => {
    expect(mergeTags(["Hugo", "cms"], ["writing", "hugo"])).toEqual({ tags: ["Hugo", "cms", "writing"], added: true });
  });

  it("adds tags when the page has none", () => {
    expect(mergeTags(undefined, ["one", "two"]).added).toBe(true);
  });

  it("reports nothing new when every tag is already there", () => {
    expect(mergeTags("Hugo, CMS", ["#hugo", "cms"])).toEqual({ tags: ["Hugo", "CMS"], added: false });
  });
});
