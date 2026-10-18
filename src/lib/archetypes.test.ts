import { describe, expect, it } from "vitest";
import {
  archetypeLabel,
  archetypePaths,
  archetypeSection,
  hugoDate,
  kindArchetypes,
  kindFields,
  loadArchetype,
  matchArchetype,
  referenceFields,
  renderTemplate,
  sectionArchetype,
  switchArchetype,
  type RefEntry,
} from "./archetypes";
import { getPath, parseContent, setPath } from "./frontmatter";
import { patchFrontMatter } from "./fmpatch";
import { contentBaseName } from "./content";

// The blog's archetypes, verbatim.
const TIL = `+++
title = '{{ replace .File.ContentBaseName \`-\` \` \` | title }}'
date = '{{ .Date }}'
draft = true
tags = []
[params]
  kind = "til"
+++
`;

const ESSAY = `+++
title = '{{ replace .File.ContentBaseName \`-\` \` \` | title }}'
date = '{{ .Date }}'
draft = true
summary = ""
tags = []
builds_on = []
[params]
  kind = "essay"
+++
`;

const DATE = "2026-10-15T09:30:00+02:00";
const til = loadArchetype({ name: "til", path: "archetypes/til.md", bundle: false, source: TIL }, DATE);
const essay = loadArchetype({ name: "essay", path: "archetypes/essay.md", bundle: false, source: ESSAY }, DATE);

/** What the editor does when a post is created from an archetype and saved. */
function create(archetype: typeof til, edit: (fm: Record<string, unknown>) => Record<string, unknown>, body = "Body.\n") {
  const prefix = patchFrontMatter(archetype.prefix, archetype.format, archetype.data, edit(structuredClone(archetype.data)));
  if (prefix === null) throw new Error("patch fell back");
  return prefix + body;
}

describe("archetype parsing", () => {
  it("finds file and bundle archetypes, sorted by name", () => {
    expect(archetypePaths(["archetypes/til.md", "archetypes/essay.md", "archetypes/talk/index.md", "archetypes/talk/cover.png", "content/x.md"])).toEqual([
      { name: "essay", path: "archetypes/essay.md", bundle: false },
      { name: "talk", path: "archetypes/talk/index.md", bundle: true },
      { name: "til", path: "archetypes/til.md", bundle: false },
    ]);
  });

  it("renders the blog's archetypes into front matter with the date set and an empty title", () => {
    expect(til.error).toBeUndefined();
    expect(til.format).toBe("toml");
    expect(til.data).toEqual({ title: "", date: DATE, draft: true, tags: [], params: { kind: "til" } });
    expect(essay.data).toMatchObject({ summary: "", builds_on: [], params: { kind: "essay" } });
    expect(til.fields).toEqual(["title", "date", "draft", "tags", "params.kind"]);
  });

  it("reads the fixed values that identify each kind", () => {
    expect(til.literals).toEqual({ "params.kind": "til" });
    expect(essay.literals).toEqual({ "params.kind": "essay" });
    expect(kindFields([essay, til])).toEqual([
      {
        path: "params.kind",
        options: [
          { value: "essay", archetype: "essay", label: "essay" },
          { value: "til", archetype: "til", label: "TIL" },
        ],
      },
    ]);
  });

  it("labels short names as acronyms", () => {
    expect(archetypeLabel("til")).toBe("TIL");
    expect(archetypeLabel("essay")).toBe("essay");
    expect(archetypeLabel("book-review")).toBe("book review");
  });

  it("handles YAML archetypes, trim markers, comments, hints and unknown expressions", () => {
    const source = `---
title: "{{- .Name | humanize -}}"
date: {{ .Date }}
author: "{{ .Site.Params.author }}"
{{/* a note for whoever edits this file */}}
related: [] {{/* hugoflow: ref=note */}}
params:
  kind: link
---
{{ .Name }}
`;
    const a = loadArchetype({ name: "link", path: "archetypes/link.md", bundle: false, source }, DATE);
    expect(a.error).toBeUndefined();
    expect(a.data).toEqual({ title: "", date: DATE, author: "", related: [], params: { kind: "link" } });
    expect(a.hints).toEqual({ related: { ref: "note" } });
    expect(renderTemplate(source, { date: DATE })).not.toContain("{{");
  });

  it("reports archetypes it can't read instead of throwing", () => {
    const broken = loadArchetype({ name: "x", path: "archetypes/x.md", bundle: false, source: "+++\ntitle = {{ .Site.Title }}\n+++\n" });
    expect(broken.error).toBeTruthy();
  });

  it("formats dates like Hugo's .Date", () => {
    expect(hugoDate(new Date())).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
  });
});

describe("creating posts from archetypes", () => {
  it("a TIL keeps the archetype's layout and quoting, with the title filled in", () => {
    const out = create(til, (fm) => ({ ...fm, title: "What a token is", tags: ["ai", "tokens"], draft: false }));
    expect(out).toBe(`+++
title = 'What a token is'
date = '${DATE}'
draft = false
tags = ["ai", "tokens"]
[params]
  kind = "til"
+++

Body.
`);
  });

  it("a title with an apostrophe still produces valid TOML", () => {
    const out = create(essay, (fm) => ({ ...fm, title: "Why I'm writing this series" }));
    expect(out).toContain(`title = "Why I'm writing this series"`);
    expect(parseContent(out).data.title).toBe("Why I'm writing this series");
  });

  it("matches existing posts to their archetype", () => {
    expect(matchArchetype({ title: "x", params: { kind: "til" } }, [til, essay])?.name).toBe("til");
    expect(matchArchetype({ title: "x", params: { kind: "essay" } }, [til, essay])?.name).toBe("essay");
    expect(matchArchetype({ title: "an old blog post", tags: ["go"] }, [til, essay])).toBeNull();
  });

  it("switching a TIL to an essay adds the essay fields; switching back drops them while empty", () => {
    const asTil = { ...til.data, title: "Long one", tags: ["ai"] };
    const asEssay = switchArchetype(asTil, til, essay);
    expect(asEssay).toMatchObject({ title: "Long one", tags: ["ai"], summary: "", builds_on: [], params: { kind: "essay" } });
    expect(switchArchetype(asEssay, essay, til)).toEqual(asTil);
    const kept = switchArchetype({ ...asEssay, summary: "Written" }, essay, til);
    expect(kept.summary).toBe("Written");
  });

  it("a plain new post uses the section's archetype, else default, like hugo new", () => {
    const list = [{ name: "default" }, { name: "blog" }, { name: "til" }];
    expect(sectionArchetype(list, "content/blog")?.name).toBe("blog");
    expect(sectionArchetype(list, "content/aie")?.name).toBe("default");
    expect(sectionArchetype([{ name: "til" }], "content/aie")).toBeNull();
    expect(kindArchetypes([til, essay, loadArchetype({ name: "default", path: "archetypes/default.md", bundle: false, source: "+++\ntitle = ''\ndraft = true\n+++\n" })]).map((a) => a.name)).toEqual(["til", "essay"]);
  });

  it("new posts go where most posts of that kind already live", () => {
    const entries = [
      { section: "content/aie", archetype: "til", isIndex: false },
      { section: "content/aie", archetype: "til", isIndex: false },
      { section: "content/blog", archetype: null, isIndex: false },
    ];
    expect(archetypeSection("til", entries, "content/blog")).toBe("content/aie");
    expect(archetypeSection("essay", entries, "content/blog")).toBe("content/blog");
  });
});

describe("builds_on references", () => {
  const entry = (baseName: string, archetype: string | null, fields: Record<string, unknown> = {}, section = "content/aie"): RefEntry => ({
    section,
    baseName,
    archetype,
    isIndex: false,
    fields,
  });
  const entries = [
    entry("what-an-embedding-is", "til"),
    entry("chunk-size-is-part-of-the-pointer", "til"),
    entry("retrieval-is-a-query-planner", "essay", { builds_on: ["what-an-embedding-is", "chunk-size-is-part-of-the-pointer"] }),
    entry("why-this-series", "essay", { builds_on: ["what-an-embedding-is"] }),
  ];

  it("detects builds_on as a reference to TILs from the posts that already use it", () => {
    expect([...referenceFields([til, essay], entries)]).toEqual([["builds_on", { targets: ["til"] }]]);
  });

  it("is not a reference when a value doesn't name a post in the same section", () => {
    const stray = [...entries, entry("odd", "essay", { builds_on: ["some-other-thing"] })];
    expect(referenceFields([til, essay], stray).has("builds_on")).toBe(false);
    const elsewhere = [entry("what-an-embedding-is", "til", {}, "content/blog"), entry("e", "essay", { builds_on: ["what-an-embedding-is"] })];
    expect(referenceFields([til, essay], elsewhere).has("builds_on")).toBe(false);
  });

  it("a hint in the archetype works before any post uses the field", () => {
    const hinted = loadArchetype({ name: "essay", path: "archetypes/essay.md", bundle: false, source: ESSAY.replace("builds_on = []", "builds_on = [] {{/* hugoflow: ref=til */}}") }, DATE);
    expect(hinted.data.builds_on).toEqual([]);
    expect([...referenceFields([til, hinted], [])]).toEqual([["builds_on", { targets: ["til"] }]]);
  });

  it("slugs are content base names: file names, or the folder for bundles", () => {
    expect(contentBaseName("content/aie/what-an-embedding-is.md")).toBe("what-an-embedding-is");
    expect(contentBaseName("content/aie/a-bundle/index.md")).toBe("a-bundle");
  });

  it("writes the chosen slugs into builds_on, in order, without touching other lines", () => {
    const out = create(essay, (fm) => ({ ...fm, title: "Evals", builds_on: ["temperature-does-not-replay", "a-context-window-is-a-budget"] }));
    expect(out).toContain('builds_on = ["temperature-does-not-replay", "a-context-window-is-a-budget"]\n[params]');
    expect(parseContent(out).data.builds_on).toEqual(["temperature-does-not-replay", "a-context-window-is-a-budget"]);

    // And on an existing essay: one line changes.
    const existing = out;
    const parsed = parseContent(existing);
    const next = setPath(parsed.data, "builds_on", [...(getPath(parsed.data, "builds_on") as string[]), "what-a-token-is"]);
    const patched = patchFrontMatter(parsed.prefix, "toml", parsed.data, next)! + parsed.body;
    const changed = patched.split("\n").filter((l, i) => l !== existing.split("\n")[i]);
    expect(changed).toEqual(['builds_on = ["temperature-does-not-replay", "a-context-window-is-a-budget", "what-a-token-is"]']);
  });
});
