// Hugo shortcodes ({{< ref "x" >}}, {{% note %}}) are not markdown, and the rich editor would escape
// them into garbage (`{{&lt; ref &gt;}}`). Before loading markdown into the editor we swap them for
// placeholders the editor understands, and swap them back when serialising.

const SHORTCODE_RE = /\{\{<[\s\S]*?>\}\}|\{\{%[\s\S]*?%\}\}/g;
const LINK_TARGET_RE = /\]\(\s*(\{\{<[\s\S]*?>\}\}|\{\{%[\s\S]*?%\}\})\s*\)/g;
const HREF_PREFIX = "#hugo-shortcode=";

export function encodeShortcode(code: string): string {
  return encodeURIComponent(code).replace(/[()'!*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
}

/** Prepare markdown for the rich editor. Code blocks and inline code are left untouched. */
export function protectShortcodes(markdown: string): string {
  return mapOutsideCode(markdown, (text) =>
    text
      .replace(LINK_TARGET_RE, (_, code: string) => `](${HREF_PREFIX}${encodeShortcode(code)})`)
      .replace(SHORTCODE_RE, (code) => `<span data-shortcode="${encodeShortcode(code)}"></span>`)
  );
}

/** Undo the link placeholders. Standalone shortcodes are serialised by the Shortcode node itself. */
export function restoreShortcodes(markdown: string): string {
  return markdown.replace(/#hugo-shortcode=([A-Za-z0-9%._~-]+)/g, (_, enc: string) => {
    try {
      return decodeURIComponent(enc);
    } catch {
      return enc;
    }
  });
}

function mapOutsideCode(markdown: string, fn: (text: string) => string): string {
  const lines = markdown.split("\n");
  const out: string[] = [];
  let buffer: string[] = [];
  let fence: string | null = null;

  const flush = () => {
    if (buffer.length) out.push(mapOutsideInlineCode(buffer.join("\n"), fn));
    buffer = [];
  };

  for (const line of lines) {
    const fenceMatch = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (fence) {
      out.push(line);
      if (fenceMatch && fenceMatch[1][0] === fence[0] && fenceMatch[1].length >= fence.length) fence = null;
    } else if (fenceMatch) {
      flush();
      fence = fenceMatch[1];
      out.push(line);
    } else {
      buffer.push(line);
    }
  }
  flush();
  return out.join("\n");
}

function mapOutsideInlineCode(text: string, fn: (text: string) => string): string {
  const parts = text.split(/(`+[^`]*?`+)/g);
  return parts.map((part, i) => (i % 2 === 1 ? part : fn(part))).join("");
}
