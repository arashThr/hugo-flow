import { describe, expect, it } from "vitest";
import { detectDirection, pageDirection, siteDirection } from "./direction";

describe("detectDirection", () => {
  it("reads Persian and Hebrew as right to left", () => {
    expect(detectDirection("این یک نوشتهٔ فارسی است")).toBe("rtl");
    expect(detectDirection("זה טקסט בעברית")).toBe("rtl");
  });

  it("reads English as left to right", () => {
    expect(detectDirection("A short English paragraph.")).toBe("ltr");
  });

  it("returns null when there is no strong letter, or the two scripts tie", () => {
    expect(detectDirection("")).toBeNull();
    expect(detectDirection("2024 — (1)")).toBeNull();
    expect(detectDirection("aس")).toBeNull();
  });

  it("ignores code, links and shortcodes when the prose is Persian", () => {
    const post = [
      "این متن فارسی است و باید راست‌چین بماند.",
      "",
      "```js",
      "function reallyLongEnglishIdentifierName() { return true }",
      "```",
      "",
      "See `AnotherEnglishName` and [docs](https://example.com/a-very-long-english-path).",
      "{{< figure src=\"/images/a.webp\" >}}",
    ].join("\n");
    expect(detectDirection(post)).toBe("rtl");
  });
});

describe("pageDirection", () => {
  it("lets an explicit choice beat the writing and the site default", () => {
    expect(pageDirection("Hello", "rtl", "ltr")).toBe("ltr");
    expect(pageDirection("سلام", "ltr", null)).toBe("rtl");
    expect(pageDirection("", "rtl", null)).toBe("rtl");
  });
});

describe("siteDirection", () => {
  it("uses a single languageDirection", () => {
    expect(siteDirection('languageCode = "fa"\nlanguageDirection = "rtl"\n')).toBe("rtl");
    expect(siteDirection("languageDirection: ltr\n")).toBe("ltr");
  });

  it("follows the default language when the site is mixed", () => {
    const config = `
defaultContentLanguage = "fa"
[languages.en]
languageDirection = "ltr"
[languages.fa]
languageDirection = "rtl"
`;
    expect(siteDirection(config)).toBe("rtl");
    expect(siteDirection(config.replace('"fa"', '"en"'))).toBe("ltr");
  });

  it("reads a YAML language block", () => {
    const config = `
defaultContentLanguage: en
languages:
  fa:
    languageDirection: rtl
  en:
    languageDirection: ltr
`;
    expect(siteDirection(config)).toBe("ltr");
  });

  it("treats a Persian or Arabic language code as RTL when direction is unset", () => {
    expect(siteDirection('languageCode = "fa-ir"\n')).toBe("rtl");
    expect(siteDirection('defaultContentLanguage = "ar"\n')).toBe("rtl");
    expect(siteDirection('languageCode = "en-us"\n')).toBe("ltr");
  });

  it("honours a theme rtl flag and ignores comments", () => {
    expect(siteDirection("rtl = true\n")).toBe("rtl");
    expect(siteDirection('# languageDirection = "rtl"\nlanguageCode = "en"\n')).toBe("ltr");
  });
});
