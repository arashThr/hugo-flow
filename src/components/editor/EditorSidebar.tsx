"use client";

import { useState, type ReactNode } from "react";
import { Icon } from "@/components/ui";
import { asString, asStringArray, type FrontMatter, type FrontMatterFormat } from "@/lib/frontmatter";
import { fromLocalInput, toLocalInput } from "@/lib/content";

interface Props {
  open: boolean;
  onClose: () => void;
  isNew: boolean;
  format: FrontMatterFormat;
  fm: FrontMatter;
  setField: (key: string, value: unknown) => void;
  descriptionKey: string;
  imageKey: string;
  showDate: boolean;
  showImage: boolean;
  tagSuggestions: string[];
  featuredSrc: string | null;
  onFeaturedPick: () => void;
  onFeaturedRemove: () => void;
  folder: string;
  folders: string[];
  onFolder: (folder: string) => void;
  fileName: string;
  onFileName: (name: string) => void;
  fileNameLocked: boolean;
  otherText: string;
  onOtherText: (text: string) => void;
  otherError: string | null;
  onDelete?: () => void;
  githubUrl?: string;
}

function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="px-5 py-4 border-b border-outline-variant last:border-b-0">
      <div className="flex items-center justify-between mb-2.5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant/80">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

export function EditorSidebar(props: Props) {
  const { fm, setField, open, onClose } = props;
  const draft = fm.draft === true;
  const date = asString(fm.date);
  const tags = asStringArray(fm.tags);
  const [showOther, setShowOther] = useState(!!props.otherError);
  const formatLabel = props.format === "none" ? "TOML" : props.format.toUpperCase();

  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-black/30 lg:hidden animate-[fadeIn_120ms_ease-out]" onClick={onClose} />}
      <aside
        className={`fixed lg:static inset-y-0 right-0 z-40 w-[22rem] max-w-[92vw] lg:w-80 shrink-0 flex flex-col bg-surface-container-lowest lg:bg-surface-container-low border-l border-outline-variant transition-transform lg:transition-none ${
          open ? "translate-x-0 shadow-2xl lg:shadow-none" : "translate-x-full lg:hidden"
        }`}
        aria-label="Page settings"
      >
        <div className="flex items-center justify-between px-5 h-14 shrink-0 border-b border-outline-variant">
          <h2 className="font-semibold text-on-surface">Page settings</h2>
          <button className="icon-btn -mr-2" onClick={onClose} aria-label="Close settings">
            <Icon name="close" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <Section title="Visibility">
            <button
              type="button"
              onClick={() => setField("draft", !draft)}
              className="w-full flex items-center gap-3 rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2.5 text-left"
              role="switch"
              aria-checked={draft}
            >
              <span className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${draft ? "bg-tertiary" : "bg-primary"}`}>
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${draft ? "left-0.5" : "left-[18px]"}`} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-on-surface">{draft ? "Draft" : "Published"}</span>
                <span className="block text-xs text-on-surface-variant">{draft ? "Hidden from your live site" : "Visible on your site after Hugo builds"}</span>
              </span>
            </button>
          </Section>

          <Section title="Details">
            <div className="space-y-4">
              {props.showDate || fm.date !== undefined ? (
                <label className="block">
                  <span className="field-label">Date</span>
                  <div className="flex gap-2">
                    <input
                      type="datetime-local"
                      className="field"
                      value={toLocalInput(date || null)}
                      onChange={(e) => setField("date", e.target.value ? fromLocalInput(e.target.value) : undefined)}
                    />
                    <button type="button" className="btn-secondary !px-2.5 shrink-0" onClick={() => setField("date", new Date().toISOString())} title="Set to now">
                      Now
                    </button>
                  </div>
                </label>
              ) : (
                <button type="button" className="text-sm text-primary hover:underline" onClick={() => setField("date", new Date().toISOString())}>
                  + Add a date
                </button>
              )}

              <div>
                <span className="field-label">Tags</span>
                <TagInput tags={tags} suggestions={props.tagSuggestions} onChange={(t) => setField("tags", t)} />
              </div>

              <label className="block">
                <span className="field-label capitalize">{props.descriptionKey}</span>
                <textarea
                  className="field resize-y min-h-[72px]"
                  rows={3}
                  placeholder="Shown in previews and search results"
                  value={asString(fm[props.descriptionKey])}
                  onChange={(e) => setField(props.descriptionKey, e.target.value)}
                />
              </label>
            </div>
          </Section>

          {(props.showImage || fm[props.imageKey] !== undefined) && (
            <Section
              title="Featured image"
              action={
                props.featuredSrc && (
                  <button type="button" className="text-xs text-on-surface-variant hover:text-error" onClick={props.onFeaturedRemove}>
                    Remove
                  </button>
                )
              }
            >
              <button
                type="button"
                onClick={props.onFeaturedPick}
                className="group w-full overflow-hidden rounded-lg border-2 border-dashed border-outline-variant hover:border-primary/60 bg-surface-container-lowest transition-colors"
              >
                {props.featuredSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={props.featuredSrc} alt="Featured" className="w-full aspect-video object-cover" />
                ) : (
                  <span className="flex flex-col items-center gap-1.5 py-6 text-on-surface-variant group-hover:text-primary">
                    <Icon name="add_photo_alternate" className="!text-[26px]" />
                    <span className="text-xs">Choose image</span>
                  </span>
                )}
              </button>
            </Section>
          )}

          <Section title="File">
            <div className="space-y-3">
              {props.isNew && props.folders.length > 0 && (
                <label className="block">
                  <span className="field-label">Folder</span>
                  <select className="field font-mono !text-[13px]" value={props.folder} onChange={(e) => props.onFolder(e.target.value)}>
                    {props.folders.map((f) => (
                      <option key={f} value={f}>
                        {f}/
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="block">
                <span className="field-label">File name</span>
                <div className="flex items-center rounded-md border border-outline-variant bg-surface-container-lowest focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
                  <input
                    className="flex-1 min-w-0 bg-transparent px-3 py-2 font-mono text-[13px] text-on-surface outline-none disabled:opacity-60"
                    value={props.fileName}
                    onChange={(e) => props.onFileName(e.target.value.replace(/[^\w.-]+/g, "-"))}
                    disabled={props.fileNameLocked}
                    spellCheck={false}
                  />
                  <span className="pr-3 font-mono text-[13px] text-on-surface-variant">.md</span>
                </div>
                <span className="block mt-1 text-xs text-on-surface-variant break-all">
                  {props.folder}/{props.fileName || "…"}.md
                </span>
              </label>
              {props.githubUrl && (
                <a href={props.githubUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                  <Icon name="open_in_new" className="!text-[14px]" /> View on GitHub
                </a>
              )}
            </div>
          </Section>

          <Section
            title="Other front matter"
            action={
              <button type="button" className="text-xs text-primary hover:underline" onClick={() => setShowOther((s) => !s)}>
                {showOther ? "Hide" : props.otherText.trim() ? "Edit" : "Add"}
              </button>
            }
          >
            {showOther ? (
              <>
                <textarea
                  className={`field font-mono !text-[12px] leading-relaxed min-h-[120px] resize-y ${props.otherError ? "!border-error focus:!ring-error/20" : ""}`}
                  value={props.otherText}
                  onChange={(e) => props.onOtherText(e.target.value)}
                  spellCheck={false}
                  placeholder={props.format === "yaml" ? "weight: 10\nslug: my-page" : 'weight = 10\nslug = "my-page"'}
                />
                {props.otherError ? (
                  <p className="mt-1 text-xs text-error">{props.otherError}</p>
                ) : (
                  <p className="mt-1 text-xs text-on-surface-variant">{formatLabel}. Any fields your theme uses: weight, slug, aliases…</p>
                )}
              </>
            ) : (
              <p className="text-xs text-on-surface-variant font-mono truncate">
                {props.otherText.trim() ? props.otherText.trim().split("\n").map((l) => l.split(/\s*[=:]/)[0]).join(", ") : "None"}
              </p>
            )}
          </Section>

          {props.onDelete && (
            <Section title="Danger zone">
              <button type="button" className="btn-secondary w-full !text-error hover:!bg-error-container" onClick={props.onDelete}>
                <Icon name="delete" className="!text-[18px]" /> Delete this file
              </button>
            </Section>
          )}
        </div>
      </aside>
    </>
  );
}

function TagInput({ tags, suggestions, onChange }: { tags: string[]; suggestions: string[]; onChange: (tags: string[]) => void }) {
  const [input, setInput] = useState("");
  const add = (raw: string) => {
    const next = raw
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t && !tags.includes(t));
    if (next.length) onChange([...tags, ...next]);
    setInput("");
  };
  const listId = "tag-suggestions";
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-outline-variant bg-surface-container-lowest px-2 py-1.5 min-h-[40px] focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
      {tags.map((t) => (
        <span key={t} className="inline-flex items-center gap-0.5 rounded bg-surface-container-high pl-2 pr-0.5 py-0.5 text-xs text-on-surface">
          {t}
          <button type="button" className="rounded hover:bg-surface-container-highest p-0.5" onClick={() => onChange(tags.filter((x) => x !== t))} aria-label={`Remove ${t}`}>
            <Icon name="close" className="!text-[13px]" />
          </button>
        </span>
      ))}
      <input
        className="flex-1 min-w-[80px] bg-transparent text-sm outline-none py-0.5 text-on-surface placeholder:text-on-surface-variant/60"
        value={input}
        list={listId}
        placeholder={tags.length ? "" : "Add tags…"}
        onChange={(e) => (e.target.value.endsWith(",") ? add(e.target.value) : setInput(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add(input);
          } else if (e.key === "Backspace" && !input && tags.length) {
            onChange(tags.slice(0, -1));
          }
        }}
        onBlur={() => input && add(input)}
      />
      <datalist id={listId}>
        {suggestions
          .filter((s) => !tags.includes(s))
          .map((s) => (
            <option key={s} value={s} />
          ))}
      </datalist>
    </div>
  );
}
