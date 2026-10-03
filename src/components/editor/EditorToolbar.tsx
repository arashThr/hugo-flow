"use client";

import { useEditorState, type Editor } from "@tiptap/react";
import { Icon } from "@/components/ui";

export type ViewMode = "rich" | "markdown";

interface Props {
  editor: Editor | null;
  viewMode: ViewMode;
  onViewMode: (mode: ViewMode) => void;
  onImage: () => void;
  onImageRow: () => void;
  onLink: () => void;
}

/** Toggle a checkbox on the list item(s) in the selection, turning the block into a list if needed. */
export function toggleChecklist(editor: Editor) {
  if (!editor.isActive("bulletList") && !editor.isActive("orderedList")) {
    editor.chain().focus().toggleBulletList().run();
  }
  const { state } = editor;
  const { from, to, $from, empty } = state.selection;
  const items: { pos: number; checked: boolean | null }[] = [];

  if (empty) {
    for (let d = $from.depth; d > 0; d--) {
      const node = $from.node(d);
      if (node.type.name === "listItem") {
        items.push({ pos: $from.before(d), checked: node.attrs.checked });
        break;
      }
    }
  } else {
    state.doc.nodesBetween(from, to, (node, pos) => {
      if (node.type.name === "listItem") items.push({ pos, checked: node.attrs.checked });
    });
  }
  if (!items.length) return;
  const makeChecklist = items.some((i) => i.checked === null);
  const tr = state.tr;
  for (const item of items) {
    const node = tr.doc.nodeAt(item.pos);
    if (node) tr.setNodeMarkup(item.pos, undefined, { ...node.attrs, checked: makeChecklist ? false : null });
  }
  editor.view.dispatch(tr);
  editor.commands.focus();
}

function isChecklist(editor: Editor) {
  const { $from } = editor.state.selection;
  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d);
    if (node.type.name === "listItem") return node.attrs.checked !== null;
  }
  return false;
}

function Btn({ icon, label, onClick, active, disabled, text }: { icon?: string; label: string; onClick: () => void; active?: boolean; disabled?: boolean; text?: string }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={`inline-flex items-center justify-center h-8 min-w-8 px-1.5 rounded-md text-sm transition-colors shrink-0 disabled:opacity-35 ${
        active ? "bg-primary-container text-on-primary-container" : "text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
      }`}
    >
      {icon ? <Icon name={icon} /> : <span className="font-semibold text-[13px]">{text}</span>}
    </button>
  );
}

const Sep = () => <div className="w-px h-5 bg-outline-variant mx-1 shrink-0" />;

export function EditorToolbar({ editor, viewMode, onViewMode, onImage, onImageRow, onLink }: Props) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      e
        ? {
            bold: e.isActive("bold"),
            italic: e.isActive("italic"),
            strike: e.isActive("strike"),
            code: e.isActive("code"),
            link: e.isActive("link"),
            h2: e.isActive("heading", { level: 2 }),
            h3: e.isActive("heading", { level: 3 }),
            bullet: e.isActive("bulletList") && !isChecklist(e),
            ordered: e.isActive("orderedList"),
            checklist: isChecklist(e),
            quote: e.isActive("blockquote"),
            codeBlock: e.isActive("codeBlock"),
            canUndo: e.can().undo(),
            canRedo: e.can().redo(),
          }
        : null,
  });

  const rich = viewMode === "rich" && editor && state;
  const chain = () => editor!.chain().focus();

  return (
    <div className="sticky top-0 z-20 -mx-2 px-2 py-2 bg-background/85 backdrop-blur-md">
      <div className="flex items-start gap-0.5 rounded-xl border border-outline-variant bg-surface-container-lowest p-1 shadow-sm">
        <div className="flex items-center gap-0.5 overflow-x-auto hide-scrollbar min-w-0 flex-1 sm:flex-wrap sm:overflow-visible">
          {rich ? (
            <>
              <Btn icon="undo" label="Undo (Ctrl+Z)" onClick={() => chain().undo().run()} disabled={!state.canUndo} />
              <Btn icon="redo" label="Redo (Ctrl+Shift+Z)" onClick={() => chain().redo().run()} disabled={!state.canRedo} />
              <Sep />
              <Btn text="H2" label="Heading" onClick={() => chain().toggleHeading({ level: 2 }).run()} active={state.h2} />
              <Btn text="H3" label="Subheading" onClick={() => chain().toggleHeading({ level: 3 }).run()} active={state.h3} />
              <Sep />
              <Btn icon="format_bold" label="Bold (Ctrl+B)" onClick={() => chain().toggleBold().run()} active={state.bold} />
              <Btn icon="format_italic" label="Italic (Ctrl+I)" onClick={() => chain().toggleItalic().run()} active={state.italic} />
              <Btn icon="strikethrough_s" label="Strikethrough" onClick={() => chain().toggleStrike().run()} active={state.strike} />
              <Btn icon="code" label="Inline code" onClick={() => chain().toggleCode().run()} active={state.code} />
              <Btn icon="link" label="Link (Ctrl+K)" onClick={onLink} active={state.link} />
              <Sep />
              <Btn icon="format_list_bulleted" label="Bulleted list" onClick={() => chain().toggleBulletList().run()} active={state.bullet} />
              <Btn icon="format_list_numbered" label="Numbered list" onClick={() => chain().toggleOrderedList().run()} active={state.ordered} />
              <Btn icon="checklist" label="Checklist" onClick={() => toggleChecklist(editor!)} active={state.checklist} />
              <Sep />
              <Btn icon="format_quote" label="Quote" onClick={() => chain().toggleBlockquote().run()} active={state.quote} />
              <Btn icon="data_object" label="Code block" onClick={() => chain().toggleCodeBlock().run()} active={state.codeBlock} />
              <Btn icon="horizontal_rule" label="Divider" onClick={() => chain().setHorizontalRule().run()} />
              <Sep />
            </>
          ) : (
            <span className="px-2 text-xs text-on-surface-variant shrink-0">Markdown</span>
          )}
          <Btn icon="image" label="Insert image" onClick={onImage} />
          <Btn icon="view_column" label="Insert a row of images" onClick={onImageRow} />
        </div>

        <div className="flex items-center rounded-lg bg-surface-container p-0.5 shrink-0 ml-1">
          {(["rich", "markdown"] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => onViewMode(mode)}
              className={`h-7 px-2.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1 ${
                viewMode === mode ? "bg-surface-container-lowest text-on-surface shadow-sm" : "text-on-surface-variant hover:text-on-surface"
              }`}
              title={mode === "rich" ? "Visual editor" : "Edit raw markdown"}
            >
              <Icon name={mode === "rich" ? "edit" : "code"} className="!text-[15px]" />
              <span className="hidden sm:inline">{mode === "rich" ? "Visual" : "Markdown"}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
