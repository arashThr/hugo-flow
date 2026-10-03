"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge, Icon, Spinner } from "@/components/ui";
import { fileLabel, formatDate, sectionLabel, type ContentEntry } from "@/lib/content";
import type { Settings } from "@/components/SettingsProvider";

type Filter = "all" | "published" | "drafts";
type Sort = "newest" | "oldest" | "title";

interface Props {
  section: string; // a section path, "all" or "drafts"
  entries: ContentEntry[];
  settings: Settings;
  loading: boolean;
  repoUrl: string;
  branch: string;
}

const PAGE_SIZE = 40;

export function ContentList({ section, entries, settings, loading, repoUrl, branch }: Props) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("newest");
  const [visible, setVisible] = useState(PAGE_SIZE);

  const isSection = section !== "all" && section !== "drafts";
  const title = section === "all" ? "All content" : section === "drafts" ? "Drafts" : sectionLabel(section, settings.contentDir);
  const isPosts = section === settings.postsSection;
  const newTarget = isSection ? section : settings.postsSection;

  const scoped = useMemo(
    () =>
      entries.filter((e) => {
        if (section === "drafts") return e.draft;
        if (section === "all") return true;
        return e.section === section;
      }),
    [entries, section]
  );

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = scoped.filter((e) => {
      if (filter === "drafts" && !e.draft) return false;
      if (filter === "published" && e.draft) return false;
      if (!q) return true;
      return e.title.toLowerCase().includes(q) || e.path.toLowerCase().includes(q) || e.tags.some((t) => t.toLowerCase().includes(q));
    });
    const time = (e: ContentEntry) => (e.date ? new Date(e.date).getTime() || 0 : 0);
    return list.sort((a, b) => {
      // Section index pages (_index.md) stay on top of their section.
      if (isSection && a.isIndex !== b.isIndex) return a.isIndex ? -1 : 1;
      if (sort === "title") return (a.title || a.path).localeCompare(b.title || b.path);
      const diff = sort === "newest" ? time(b) - time(a) : time(a) - time(b);
      return diff || (a.title || a.path).localeCompare(b.title || b.path);
    });
  }, [scoped, query, filter, sort, isSection]);

  const draftCount = scoped.filter((e) => e.draft).length;

  return (
    <div className="max-w-5xl mx-auto">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
        <div className="min-w-0">
          <h1 className="font-display text-[28px] leading-tight font-bold text-on-surface tracking-tight">{title}</h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            {loading && !entries.length ? "Loading…" : `${scoped.length} ${scoped.length === 1 ? "file" : "files"}`}
            {isSection && (
              <>
                {" "}in <code className="font-mono text-[13px]">{section}/</code>
              </>
            )}
          </p>
        </div>
        {section !== "drafts" && (
          <Link href={`/editor?new=${encodeURIComponent(newTarget)}`} className="btn-primary self-start sm:self-auto">
            <Icon name="add" className="!text-[19px]" />
            {isPosts || section === "all" ? "New post" : `New in ${sectionLabel(section, settings.contentDir)}`}
          </Link>
        )}
      </header>

      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <label className="relative flex-1">
          <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant !text-[19px]" />
          <input
            className="field !pl-10 !h-10"
            placeholder="Search by title, tag or file…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setVisible(PAGE_SIZE);
            }}
          />
        </label>
        <div className="flex gap-2">
          {draftCount > 0 && section !== "drafts" && (
            <div className="flex rounded-md border border-outline-variant bg-surface-container-lowest p-0.5 h-10">
              {(["all", "published", "drafts"] as Filter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 rounded text-sm capitalize transition-colors ${
                    filter === f ? "bg-surface-container-high text-on-surface font-medium" : "text-on-surface-variant hover:text-on-surface"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          )}
          <select className="field !h-10 !w-auto pr-8" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort">
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="title">Title A–Z</option>
          </select>
        </div>
      </div>

      {loading && !entries.length ? (
        <div className="card flex items-center justify-center gap-2 py-16 text-on-surface-variant">
          <Spinner /> Loading content…
        </div>
      ) : results.length === 0 ? (
        <div className="card flex flex-col items-center justify-center text-center gap-3 py-16 px-6">
          <div className="w-12 h-12 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant">
            <Icon name={query ? "search_off" : "article"} className="!text-[26px]" />
          </div>
          <div>
            <h3 className="font-semibold text-on-surface">{query ? "No matches" : "Nothing here yet"}</h3>
            <p className="text-sm text-on-surface-variant mt-1">
              {query ? "Try a different search." : `No markdown files found under ${settings.contentDir}/. Check the content folder in Settings.`}
            </p>
          </div>
        </div>
      ) : (
        <ul className="card divide-y divide-outline-variant overflow-hidden">
          {results.slice(0, visible).map((entry) => (
            <li key={entry.path} className="group relative flex items-center gap-4 px-4 sm:px-5 py-3.5 hover:bg-surface-container-low transition-colors">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 min-w-0">
                  <Link
                    href={`/editor?path=${encodeURIComponent(entry.path)}`}
                    className="truncate font-medium text-[15px] text-on-surface group-hover:text-primary transition-colors before:absolute before:inset-0"
                  >
                    {entry.title || <span className="italic text-on-surface-variant">{fileLabel(entry.path)}</span>}
                  </Link>
                  {entry.draft && <Badge tone="draft">Draft</Badge>}
                  {entry.isIndex && <Badge>Section page</Badge>}
                </div>
                <div className="mt-1 flex items-center gap-x-2 gap-y-1 flex-wrap text-xs text-on-surface-variant">
                  {section === "all" || section === "drafts" ? (
                    <span className="font-medium">{sectionLabel(entry.section, settings.contentDir)}</span>
                  ) : null}
                  {(section === "all" || section === "drafts") && <span className="opacity-50">·</span>}
                  <span className="font-mono truncate max-w-[16rem]">{fileLabel(entry.path)}</span>
                  {entry.tags.slice(0, 4).map((t) => (
                    <span key={t} className="rounded bg-surface-container px-1.5 py-px">
                      #{t}
                    </span>
                  ))}
                </div>
              </div>
              <div className="hidden sm:block shrink-0 text-right text-[13px] tabular-nums text-on-surface-variant w-28">{formatDate(entry.date)}</div>
              <a
                href={`${repoUrl}/blob/${branch}/${entry.path}`}
                target="_blank"
                rel="noopener noreferrer"
                className="icon-btn relative z-10 opacity-0 group-hover:opacity-100 focus:opacity-100 hidden sm:inline-flex"
                title="Open on GitHub"
              >
                <Icon name="open_in_new" className="!text-[18px]" />
              </a>
            </li>
          ))}
        </ul>
      )}

      {visible < results.length && (
        <div className="flex justify-center mt-4">
          <button onClick={() => setVisible((v) => v + PAGE_SIZE)} className="btn-secondary">
            Show more ({results.length - visible} remaining)
          </button>
        </div>
      )}
    </div>
  );
}
