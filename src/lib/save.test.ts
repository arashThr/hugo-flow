import { describe, expect, it } from "vitest";
import { parseContent } from "./frontmatter";
import { buildFile } from "./save";

const SAMPLE_POST = `+++
title = "Why I'm writing this series"
date = "2026-10-15T00:00:00Z"
draft = true
summary = "I'm writing down the path from Go services to AI engineering."
tags = ["ai", "learning"]
related = ["one", "two"]
[params]
  category = "writing"
+++

I have spent years writing Go services.
`;

describe("buildFile (what editor and the draft toggle save)", () => {
  it("no edits: identical file", () => {
    const p = parseContent(SAMPLE_POST);
    expect(buildFile(p.format, p.data, p.body, p)).toBe(SAMPLE_POST);
  });

  it("publishing from the list flips one line", () => {
    const p = parseContent(SAMPLE_POST);
    expect(buildFile(p.format, { ...p.data, draft: false }, p.body, p)).toBe(SAMPLE_POST.replace("draft = true", "draft = false"));
  });

  it("files without front matter, or no base, still get a full front matter block", () => {
    expect(buildFile("toml", { title: "New" }, "Body", null)).toBe('+++\ntitle = "New"\n+++\n\nBody\n');
  });

});
