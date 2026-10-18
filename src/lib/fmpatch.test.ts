import { describe, expect, it } from "vitest";
import { parseContent, setPath, stringifyContent, type FrontMatter } from "./frontmatter";
import { patchFrontMatter } from "./fmpatch";

// Real files from the blog: a TOML TIL with a [params] table, and an older YAML post.
const TOML_TIL = `+++
title = "What an embedding is"
date = "2026-10-14T09:00:00Z"
draft = true
tags = ["ai", "embeddings"]
[params]
  kind = "til"
+++

An embedding is a list of numbers that stands in for a piece of text.
`;

const YAML_POST = `---
date: "2012-01-29T17:01:37Z"
tags:
- p2p
- programming
- python
title: P2P in Python
---

A simple P2P program which uses multi-threading and broadcasting.
`;

// Formatting a naive re-serialiser would destroy.
const TOML_TRICKY = `+++
# Written by hand
title = 'Literal title'   # keep me
date = 2024-03-01T10:00:00+01:00
tags = [
  "go",
  "ai",
]
summary = """
Two lines
of summary."""
weight = 10

[params]
  kind = "essay"
  builds_on = ['a', 'b']

[[resources]]
  src = "x.png"
+++

Body.
`;

const YAML_TRICKY = `---
# comment at the top
title: 'Single quoted'
date: 2024-03-01T10:00:00+01:00
tags: [go, ai]   # flow list
description: >-
  Folded text
  over two lines.
params:
  kind: essay
  builds_on:
    - a
    - b
---
Body.
`;

/** Simulate the editor: open, edit the parsed data, save through the patcher. */
function save(raw: string, edit: (fm: FrontMatter) => FrontMatter = (fm) => fm): string {
  const parsed = parseContent(raw);
  const after = edit(structuredClone(parsed.data));
  const prefix = patchFrontMatter(parsed.prefix, parsed.format, parsed.data, after);
  if (prefix === null) throw new Error("patch fell back");
  return prefix + parsed.body;
}

function changedLines(a: string, b: string) {
  const A = a.split("\n");
  const B = b.split("\n");
  return { removed: A.filter((l) => !B.includes(l)), added: B.filter((l) => !A.includes(l)) };
}

describe("front matter round trip", () => {
  it.each([
    ["TOML TIL", TOML_TIL],
    ["YAML post", YAML_POST],
    ["tricky TOML", TOML_TRICKY],
    ["tricky YAML", YAML_TRICKY],
  ])("%s: open and save without edits is byte-identical", (_, raw) => {
    expect(save(raw)).toBe(raw);
  });

  it("TOML: changing one field rewrites one line", () => {
    const out = save(TOML_TIL, (fm) => ({ ...fm, draft: false }));
    expect(changedLines(TOML_TIL, out)).toEqual({ removed: ["draft = true"], added: ["draft = false"] });
  });

  it("TOML: nested [params] edit stays inside the table, indentation kept", () => {
    const out = save(TOML_TIL, (fm) => setPath(fm, "params.kind", "essay"));
    expect(changedLines(TOML_TIL, out)).toEqual({ removed: ['  kind = "til"'], added: ['  kind = "essay"'] });
  });

  it("TOML: keeps quote style, trailing comments, unquoted dates and untouched multi-line values", () => {
    const out = save(TOML_TRICKY, (fm) => ({ ...fm, title: "New title", date: "2024-03-02T09:00:00.000Z" }));
    expect(changedLines(TOML_TRICKY, out)).toEqual({
      removed: ["title = 'Literal title'   # keep me", "date = 2024-03-01T10:00:00+01:00"],
      added: ["title = 'New title'   # keep me", "date = 2024-03-02T09:00:00.000Z"],
    });
  });

  it("TOML: a title with an apostrophe leaves the literal-string style instead of breaking", () => {
    const out = save(TOML_TRICKY, (fm) => ({ ...fm, title: "Why I'm writing" }));
    expect(out).toContain(`title = "Why I'm writing"   # keep me`);
    expect(parseContent(out).data.title).toBe("Why I'm writing");
  });

  it("TOML: replaces a multi-line array as a whole", () => {
    const out = save(TOML_TRICKY, (fm) => ({ ...fm, tags: ["go"] }));
    expect(out).toContain('tags = ["go"]\nsummary = """');
    expect(out).not.toContain('  "ai",');
  });

  it("TOML: new root keys go before the first table, new table keys inside it", () => {
    const out = save(TOML_TIL, (fm) => setPath({ ...fm, summary: "Short" }, "params.series", "aie"));
    expect(out).toContain('tags = ["ai", "embeddings"]\nsummary = "Short"\n[params]\n  kind = "til"\n  series = "aie"\n+++');
  });

  it("TOML: removing a key deletes only its lines", () => {
    const out = save(TOML_TRICKY, (fm) => {
      const next = { ...fm };
      delete next.summary;
      return next;
    });
    expect(changedLines(TOML_TRICKY, out).added).toEqual([]);
    expect(out).not.toContain("summary");
    expect(out).toContain("weight = 10");
  });

  it("TOML: never touches arrays of tables", () => {
    const parsed = parseContent(TOML_TRICKY);
    const after = { ...parsed.data, resources: [{ src: "y.png" }] };
    expect(patchFrontMatter(parsed.prefix, "toml", parsed.data, after)).toBeNull();
  });

  it("YAML: changing one field rewrites one line and keeps its quote style", () => {
    const out = save(YAML_POST, (fm) => ({ ...fm, title: "P2P in Go" }));
    expect(changedLines(YAML_POST, out)).toEqual({ removed: ["title: P2P in Python"], added: ["title: P2P in Go"] });
    const quoted = save(YAML_TRICKY, (fm) => ({ ...fm, title: "Changed" }));
    expect(changedLines(YAML_TRICKY, quoted)).toEqual({ removed: ["title: 'Single quoted'"], added: ["title: 'Changed'"] });
  });

  it("YAML: block lists keep the file's indentation, flow lists stay flow with their comment", () => {
    const out = save(YAML_POST, (fm) => ({ ...fm, tags: ["p2p", "go"] }));
    expect(out).toContain("tags:\n- p2p\n- go\ntitle: P2P in Python");
    const flow = save(YAML_TRICKY, (fm) => ({ ...fm, tags: ["go"] }));
    expect(flow).toContain("tags: [go]   # flow list\n");
  });

  it("YAML: nested edits and additions stay in their map", () => {
    const out = save(YAML_TRICKY, (fm) => setPath(setPath(fm, "params.kind", "til"), "params.builds_on", ["a", "c"]));
    expect(out).toContain("params:\n  kind: til\n  builds_on:\n    - a\n    - c\n---");
    expect(out).toContain("description: >-\n  Folded text\n  over two lines.\n");
  });

  it("YAML: adding a key appends it at the end of the block", () => {
    const out = save(YAML_POST, (fm) => ({ ...fm, draft: true }));
    expect(out).toContain("title: P2P in Python\ndraft: true\n---");
  });

  it("falls back (null) rather than guess on CRLF files, and the full rewrite still works", () => {
    const crlf = TOML_TIL.replace(/\n/g, "\r\n");
    const parsed = parseContent(crlf);
    expect(patchFrontMatter(parsed.prefix, "toml", parsed.data, { ...parsed.data, draft: false })).toBeNull();
    expect(stringifyContent("toml", { ...parsed.data, draft: false }, parsed.body)).toContain("draft = false");
  });
});
