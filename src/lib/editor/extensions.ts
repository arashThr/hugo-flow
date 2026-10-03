import { Node, mergeAttributes, type Extensions } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import StarterKit from "@tiptap/starter-kit";
import { ListItem } from "@tiptap/extension-list";
import Code from "@tiptap/extension-code";
import Image from "@tiptap/extension-image";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { Markdown } from "tiptap-markdown";
import taskListPlugin from "markdown-it-task-lists";
import { common, createLowlight } from "lowlight";
import { encodeShortcode } from "./shortcodes";

/**
 * Images keep the path exactly as written in markdown (e.g. "/images/a.webp") in their `src`
 * attribute. The resolver only decides what URL the browser loads to *display* them, so
 * nothing editor-specific (data URLs, proxy URLs) can leak into the saved markdown.
 */
export interface ImageResolver {
  toDisplay(src: string): string;
  fromDisplay(src: string): string;
}

// The subset of prosemirror-markdown's serializer state that tiptap-markdown hands to serialize().
interface MarkdownSerializerState {
  write(content: string): void;
  ensureNewLine(): void;
  closeBlock(node: PMNode): void;
  renderContent(node: PMNode): void;
}

const identityResolver: ImageResolver = { toDisplay: (s) => s, fromDisplay: (s) => s };

const ROW_STYLE = "display:flex;gap:0.5rem;align-items:flex-start;margin:1.5rem 0";
const ROW_IMG_STYLE = "flex:1 1 0;min-width:0;width:100%;height:auto;margin:0";

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/** The HTML a row of images is saved as. Also used when inserting a row in markdown mode. */
export function imageRowHtml(images: { src: string; alt: string }[]): string[] {
  return [
    `<div class="image-row" style="${ROW_STYLE}">`,
    ...images.map((img) => `<img src="${escapeAttr(img.src)}" alt="${escapeAttr(img.alt)}" style="${ROW_IMG_STYLE}">`),
    "</div>",
  ];
}

const ResolvedImage = Image.extend<{ resolver: ImageResolver } & Record<string, unknown>>({
  addOptions() {
    return { ...this.parent?.(), resolver: identityResolver };
  },
  addAttributes() {
    return {
      ...this.parent?.(),
      src: {
        default: null,
        parseHTML: (el) => this.options.resolver.fromDisplay(el.getAttribute("src") || ""),
        renderHTML: (attrs) => ({ src: attrs.src ? this.options.resolver.toDisplay(attrs.src) : null }),
      },
    };
  },
  parseHTML() {
    return [{ tag: "img[src]" }];
  },
});

/** A row of images shown side by side. Saved as plain HTML with inline styles so any Hugo theme renders it. */
export const ImageRow = Node.create({
  name: "imageRow",
  group: "block",
  content: "image+",
  draggable: true,
  parseHTML() {
    return [{ tag: "div.image-row" }, { tag: "div[data-image-row]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { class: "image-row" }), 0];
  },
  addKeyboardShortcuts() {
    // A row only holds images, so Enter leaves the row and starts a new paragraph below it.
    return {
      Enter: ({ editor }) => {
        const { $from } = editor.state.selection;
        for (let d = $from.depth; d > 0; d--) {
          if ($from.node(d).type.name === this.name) {
            const after = $from.after(d);
            return editor.chain().insertContentAt(after, { type: "paragraph" }).setTextSelection(after + 1).run();
          }
        }
        return false;
      },
    };
  },
  addStorage() {
    return {
      markdown: {
        serialize(state: MarkdownSerializerState, node: PMNode) {
          const images: { src: string; alt: string }[] = [];
          node.forEach((img) => images.push({ src: String(img.attrs.src || ""), alt: String(img.attrs.alt || "") }));
          imageRowHtml(images).forEach((line) => {
            state.write(line);
            state.ensureNewLine();
          });
          state.closeBlock(node);
        },
        parse: {},
      },
    };
  },
});

/** Hugo shortcodes, kept verbatim and shown as a chip. See shortcodes.ts. */
export const Shortcode = Node.create({
  name: "shortcode",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      code: {
        default: "",
        parseHTML: (el) => {
          try {
            return decodeURIComponent(el.getAttribute("data-shortcode") || "");
          } catch {
            return "";
          }
        },
        renderHTML: (attrs) => ({ "data-shortcode": encodeShortcode(attrs.code) }),
      },
    };
  },
  parseHTML() {
    return [{ tag: "span[data-shortcode]" }];
  },
  renderHTML({ node, HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { class: "shortcode-chip", title: "Hugo shortcode" }), node.attrs.code];
  },
  addStorage() {
    return {
      markdown: {
        serialize(state: MarkdownSerializerState, node: PMNode) {
          state.write(node.attrs.code);
        },
        parse: {},
      },
    };
  },
});

/**
 * List items with an optional checkbox (`checked` is null for a plain item). Markdown lists often
 * mix `- [x] done` and `- plain` items; tiptap's TaskList would split those into separate lists.
 */
export const CheckableListItem = ListItem.extend({
  addAttributes() {
    return {
      checked: {
        default: null,
        keepOnSplit: false,
        parseHTML: (el) => {
          const v = el.getAttribute("data-checked");
          return v === null ? null : v === "true";
        },
        renderHTML: (attrs) => (attrs.checked === null ? {} : { "data-checked": String(attrs.checked) }),
      },
    };
  },
  addStorage() {
    return {
      markdown: {
        serialize(state: MarkdownSerializerState, node: PMNode) {
          if (node.attrs.checked !== null) state.write(node.attrs.checked ? "[x] " : "[ ] ");
          state.renderContent(node);
        },
        parse: {
          setup(md: { use: (plugin: unknown) => void }) {
            md.use(taskListPlugin);
          },
          updateDOM(element: HTMLElement) {
            element.querySelectorAll("li.task-list-item").forEach((li) => {
              const input = li.querySelector("input.task-list-item-checkbox") as HTMLInputElement | null;
              li.setAttribute("data-checked", String(!!input?.hasAttribute("checked")));
              input?.remove();
            });
          },
        },
      },
    };
  },
  addNodeView() {
    return ({ node, getPos, editor }) => {
      let current = node;
      const li = document.createElement("li");
      const content = document.createElement("div");
      content.className = "li-content";
      let box: HTMLInputElement | null = null;

      const render = () => {
        if (current.attrs.checked === null) {
          li.removeAttribute("data-checked");
          box?.remove();
          box = null;
          return;
        }
        li.setAttribute("data-checked", String(current.attrs.checked));
        if (!box) {
          box = document.createElement("input");
          box.type = "checkbox";
          box.contentEditable = "false";
          box.className = "li-checkbox";
          box.addEventListener("mousedown", (e) => e.preventDefault());
          box.addEventListener("change", () => {
            const pos = typeof getPos === "function" ? getPos() : undefined;
            if (pos === undefined || !editor.isEditable) return;
            editor.view.dispatch(
              editor.state.tr.setNodeMarkup(pos, undefined, { ...current.attrs, checked: !current.attrs.checked })
            );
          });
          li.prepend(box);
        }
        box.checked = !!current.attrs.checked;
      };

      li.append(content);
      render();

      return {
        dom: li,
        contentDOM: content,
        update: (updated) => {
          if (updated.type !== current.type) return false;
          current = updated;
          render();
          return true;
        },
        ignoreMutation: (mutation) => mutation.type !== "selection" && mutation.target === box,
      };
    };
  },
});

const lowlight = createLowlight(common);

export function buildExtensions(resolver: ImageResolver = identityResolver): Extensions {
  return [
    StarterKit.configure({
      codeBlock: false,
      code: false,
      listItem: false,
      underline: false, // markdown has no underline; Ctrl+U would write raw HTML
      link: {
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { target: null, rel: null },
        // Keep relative and scheme-less links ("/blog/x/", "www.example.com") that the default check drops.
        isAllowedUri: (url) => !/^\s*(javascript|vbscript|data):/i.test(url),
      },
    }),
    // Markdown allows `code` inside links (e.g. [fix `resolve_globs`](url)); tiptap's default excludes every mark.
    Code.extend({ excludes: "" }),
    CheckableListItem,
    CodeBlockLowlight.configure({ lowlight }),
    ResolvedImage.configure({ inline: true, resolver }),
    ImageRow,
    Shortcode,
    Markdown.configure({
      html: true,
      tightLists: true,
      bulletListMarker: "-",
      linkify: false,
      breaks: false,
      transformPastedText: true,
    }),
  ];
}
