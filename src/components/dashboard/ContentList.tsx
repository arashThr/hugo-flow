"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge, Icon, Spinner } from "@/components/ui";
import { fileLabel, formatDate, sectionLabel, sectionName, type ContentEntry } from "@/lib/content";
import type { Settings } from "@/components/SettingsProvider";
import { useToast } from "@/components/Toast";
import { useArchetypes } from "@/components/useArchetypes";
import { archetypeCommitMessage, archetypeSection, kindArchetypes, sectionArchetype } from "@/lib/archetypes";
import { NewMenu, type NewMenuItem } from "@/components/dashboard/NewMenu";
import { toggleDraft } from "@/lib/save";

type Filter = "all" | "published" | "drafts";
type Sort = "newest" | "oldest" | "title";

interface Props {
  section: string; // a section path, "all" or "drafts"
  entries: ContentEntry[];
  settings: Settings;
  loading: boolean;
  repoUrl: string;
  branch: string;
  onChanged: () => Promise<void>;
}

const PAGE_SIZE = 40;

export function ContentList({ section, entries, settings, loading, repoUrl, branch, onChanged }: Props) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [kind, setKind] = useState<string>("all");
  const [sort, setSort] = useState<Sort>("newest");
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [toggling, setToggling] = useState<string | null>(null);
  const { archetypes, byName } = useArchetypes();
  const toast = useToast();

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

  // Kinds (archetypes) present here. The filter only appears when there's more than one to choose from.
  const kinds = useMemo(() => {
    const names = new Set(scoped.map((e) => e.archetype).filter((a): a is string => !!a));
    return archetypes.filter((a) => names.has(a.name));
  }, [scoped, archetypes]);
  const showKinds = kinds.length >= 2;

  // "New post" uses the archetype `hugo new` would; the menu offers the kinds whose posts live here
  // (or all of them on the overview), plus quick capture.
  const baseArchetype = sectionArchetype(archetypes, newTarget);
  const newPostHref = `/editor?new=${encodeURIComponent(newTarget)}${baseArchetype ? `&archetype=${encodeURIComponent(baseArchetype.name)}` : ""}`;
  const creatable = kindArchetypes(archetypes).filter((a) => section === "all" || archetypeSection(a.name, entries, settings.postsSection) === section);
  const menuItems: NewMenuItem[] = [
    ...(creatable.length
      ? [{ href: `/quick?archetype=${encodeURIComponent(creatable[0].name)}`, label: "Quick capture", hint: "Title, body and tags, then publish", icon: "bolt" }]
      : []),
    ...creatable.map((a) => ({
      href: `/editor?new=${encodeURIComponent(archetypeSection(a.name, entries, isSection ? section : settings.postsSection))}&archetype=${encodeURIComponent(a.name)}`,
      label: `New ${a.label}`,
      hint: `From archetypes/${a.path.split("/").slice(1).join("/")}`,
      icon: "add",
    })),
  ];

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = scoped.filter((e) => {
      if (filter === "drafts" && !e.draft) return false;
      if (filter === "published" && e.draft) return false;
      if (showKinds && kind !== "all" && e.archetype !== kind) return false;
      if (!q) return true;
      return e.title.toLowerCase().includes(q) || e.path.toLowerCase().includes(q) || e.tags.some((t) => t.toLowerCase().includes(q));
    });
    const time = (e: ContentEntry) => (e.date ? new Date(e.date).getTime() || 0 : 0);
    // The section's own page stays on top; other section pages (sub-sections, or all of them on the
    // overview) have no date and go last, so posts lead. Leaf bundles (index.md) are ordinary posts.
    const rank = (e: ContentEntry) => (isSection && e.path === `${section}/_index.md` ? 0 : e.path.endsWith("/_index.md") ? 2 : 1);
    return list.sort((a, b) => {
      if (rank(a) !== rank(b) && (sort !== "title" || rank(a) === 0 || rank(b) === 0)) return rank(a) - rank(b);
      if (sort === "title") return (a.title || a.path).localeCompare(b.title || b.path);
      const diff = sort === "newest" ? time(b) - time(a) : time(a) - time(b);
      return diff || (a.title || a.path).localeCompare(b.title || b.path);
    });
  }, [scoped, query, filter, sort, isSection, section, showKinds, kind]);

  const flipDraft = async (entry: ContentEntry) => {
    setToggling(entry.path);
    const label = byName(entry.archetype)?.label;
    const title = entry.title || fileLabel(entry.path);
    try {
      await toggleDraft({
        repository: settings.repository,
        branch,
        path: entry.path,
        message: (draft) =>
          label
            ? archetypeCommitMessage(draft ? "unpublish" : "publish", sectionName(entry.section, settings.contentDir), label, title)
            : draft
              ? `Mark "${title}" as draft`
              : `Publish "${title}"`,
      });
      await onChanged();
      toast(entry.draft ? `Published "${title}"` : `"${title}" is now a draft`);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setToggling(null);
    }
  };

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
          <div className="self-start sm:self-auto">
            <NewMenu href={newPostHref} label={isPosts || section === "all" ? "New post" : `New in ${sectionLabel(section, settings.contentDir)}`} items={menuItems} />
          </div>
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
        <div className="flex flex-wrap gap-2">
          {showKinds && (
            <div className="flex rounded-md border border-outline-variant bg-surface-container-lowest p-0.5 h-10" role="group" aria-label="Kind">
              {[{ name: "all", label: "All kinds" }, ...kinds].map((k) => (
                <button
                  key={k.name}
                  onClick={() => {
                    setKind(k.name);
                    setVisible(PAGE_SIZE);
                  }}
                  aria-pressed={kind === k.name}
                  className={`px-3 rounded text-sm transition-colors ${
                    kind === k.name ? "bg-surface-container-high text-on-surface font-medium" : "text-on-surface-variant hover:text-on-surface"
                  }`}
                >
                  {k.label}
                </button>
              ))}
            </div>
          )}
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
                  {entry.archetype && <Badge tone="primary">{byName(entry.archetype)?.label ?? entry.archetype}</Badge>}
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
              {!entry.path.endsWith("/_index.md") && (
                <button
                  type="button"
                  onClick={() => flipDraft(entry)}
                  disabled={toggling !== null}
                  className={`icon-btn relative z-10 shrink-0 ${entry.draft ? "text-tertiary" : ""}`}
                  title={entry.draft ? "Publish" : "Mark as draft"}
                  aria-label={entry.draft ? `Publish ${entry.title}` : `Mark ${entry.title} as draft`}
                >
                  {toggling === entry.path ? <Spinner /> : <Icon name={entry.draft ? "visibility_off" : "visibility"} className="!text-[19px]" />}
                </button>
              )}
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
