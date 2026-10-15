import { useId, useState } from "react";
import { Icon } from "@/components/ui";

/** Tag chips with suggestions from tags already used across the blog. */
export function TagInput({
  tags,
  suggestions,
  onChange,
  large = false,
}: {
  tags: string[];
  suggestions: string[];
  onChange: (tags: string[]) => void;
  large?: boolean; // 16px text so phones don't zoom in on focus
}) {
  const [input, setInput] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();

  const q = input.trim().toLowerCase();
  const matches = q
    ? suggestions
        .filter((s) => !tags.includes(s) && s.toLowerCase().includes(q))
        .sort((a, b) => Number(!a.toLowerCase().startsWith(q)) - Number(!b.toLowerCase().startsWith(q)))
        .slice(0, 8)
    : [];
  const showMenu = open && matches.length > 0;

  const add = (raw: string) => {
    const next = raw
      .split(",")
      .map((t) => t.trim())
      .filter((t, i, all) => t && !tags.includes(t) && all.indexOf(t) === i);
    if (next.length) onChange([...tags, ...next]);
    setInput("");
    setActive(0);
  };

  return (
    <div className="relative">
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
          className={`flex-1 min-w-[80px] bg-transparent outline-none py-0.5 text-on-surface placeholder:text-on-surface-variant/60 ${large ? "text-base" : "text-sm"}`}
          value={input}
          placeholder={tags.length ? "" : "Add tags…"}
          role="combobox"
          aria-expanded={showMenu}
          aria-controls={listId}
          aria-autocomplete="list"
          autoCapitalize="none"
          autoCorrect="off"
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setOpen(true);
            setActive(0);
            if (e.target.value.endsWith(",")) add(e.target.value);
            else setInput(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" && showMenu) {
              e.preventDefault();
              setActive((a) => (a + 1) % matches.length);
            } else if (e.key === "ArrowUp" && showMenu) {
              e.preventDefault();
              setActive((a) => (a - 1 + matches.length) % matches.length);
            } else if (e.key === "Enter" || e.key === "Tab") {
              if (!input.trim()) return;
              e.preventDefault();
              add(showMenu ? matches[active] : input);
            } else if (e.key === "Escape") {
              setOpen(false);
            } else if (e.key === "Backspace" && !input && tags.length) {
              onChange(tags.slice(0, -1));
            }
          }}
          onBlur={() => {
            setOpen(false);
            if (input.trim()) add(input);
          }}
        />
      </div>
      {showMenu && (
        <ul id={listId} role="listbox" className="absolute z-20 left-0 right-0 mt-1 max-h-56 overflow-y-auto rounded-md border border-outline-variant bg-surface-container-lowest py-1 shadow-lg">
          {matches.map((s, i) => (
            <li key={s} role="option" aria-selected={i === active}>
              <button
                type="button"
                // mousedown, not click: the input's blur would otherwise add the half-typed text first.
                onMouseDown={(e) => {
                  e.preventDefault();
                  add(s);
                }}
                className={`w-full text-left px-3 py-1.5 text-sm ${i === active ? "bg-surface-container-high text-on-surface" : "text-on-surface-variant"}`}
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
