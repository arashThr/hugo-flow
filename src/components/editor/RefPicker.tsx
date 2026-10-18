import { useState } from "react";
import { Badge, Icon } from "@/components/ui";
import { formatDate } from "@/lib/content";

export interface RefOption {
  baseName: string; // what gets stored
  title: string;
  date: string | null;
  draft: boolean;
}

/** Searchable multi-select of other posts. Shows titles, stores content base names (slugs). */
export function RefPicker({ value, options, onChange, placeholder }: { value: string[]; options: RefOption[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const byName = new Map(options.map((o) => [o.baseName, o]));
  const q = query.trim().toLowerCase();
  const matches = options
    .filter((o) => !value.includes(o.baseName))
    .filter((o) => !q || o.title.toLowerCase().includes(q) || o.baseName.includes(q))
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));

  const move = (i: number, dir: -1 | 1) => {
    const next = [...value];
    [next[i], next[i + dir]] = [next[i + dir], next[i]];
    onChange(next);
  };

  return (
    <div>
      {value.length > 0 && (
        <ol className="mb-2 space-y-1">
          {value.map((name, i) => {
            const o = byName.get(name);
            return (
              <li key={name} className="flex items-center gap-1 rounded-md border border-outline-variant bg-surface-container-lowest pl-2.5 pr-1 py-1">
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-sm ${o ? "text-on-surface" : "text-on-surface-variant italic"}`}>{o?.title || name}</span>
                  <span className="block truncate font-mono text-[11px] text-on-surface-variant">
                    {o ? name : `${name} · not found`}
                  </span>
                </span>
                {value.length > 1 && (
                  <span className="flex flex-col">
                    <button type="button" className="rounded hover:bg-surface-container disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">
                      <Icon name="keyboard_arrow_up" className="!text-[16px]" />
                    </button>
                    <button type="button" className="rounded hover:bg-surface-container disabled:opacity-30" disabled={i === value.length - 1} onClick={() => move(i, 1)} aria-label="Move down">
                      <Icon name="keyboard_arrow_down" className="!text-[16px]" />
                    </button>
                  </span>
                )}
                <button type="button" className="icon-btn !w-7 !h-7" onClick={() => onChange(value.filter((v) => v !== name))} aria-label={`Remove ${name}`}>
                  <Icon name="close" className="!text-[16px]" />
                </button>
              </li>
            );
          })}
        </ol>
      )}
      <div className="relative">
        <Icon name="search" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant !text-[17px]" />
        <input
          className="field !pl-8"
          value={query}
          placeholder={placeholder}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && matches[0]) {
              e.preventDefault();
              onChange([...value, matches[0].baseName]);
              setQuery("");
            } else if (e.key === "Escape") setOpen(false);
          }}
        />
        {open && (
          <ul className="absolute z-20 left-0 right-0 mt-1 max-h-64 overflow-y-auto rounded-md border border-outline-variant bg-surface-container-lowest py-1 shadow-lg">
            {matches.length === 0 ? (
              <li className="px-3 py-2 text-xs text-on-surface-variant">{options.length ? "No more matches" : "No posts to link yet"}</li>
            ) : (
              matches.map((o) => (
                <li key={o.baseName}>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      onChange([...value, o.baseName]);
                      setQuery("");
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-surface-container-high"
                  >
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-sm text-on-surface">{o.title || o.baseName}</span>
                      {o.draft && <Badge tone="draft">Draft</Badge>}
                    </span>
                    <span className="block text-[11px] text-on-surface-variant">{formatDate(o.date)}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
