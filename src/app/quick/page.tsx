"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useSettings } from "@/components/SettingsProvider";
import { useSite } from "@/components/SiteProvider";
import { useToast } from "@/components/Toast";
import { useArchetypes } from "@/components/useArchetypes";
import { TagInput } from "@/components/TagInput";
import { Icon, Spinner } from "@/components/ui";
import { archetypeCommitMessage, archetypeSection, loadArchetype, switchArchetype, type Archetype } from "@/lib/archetypes";
import { sectionName, slugify } from "@/lib/content";
import { draftKey, readDraft, writeDraft } from "@/lib/drafts";
import type { FrontMatter } from "@/lib/frontmatter";
import { buildFile, saveFile } from "@/lib/save";

/** Above this many words a quick note may want to be the longer kind of post. */
const LONG_WORDS = 300;
const LAST_KEY = "hugoflow:quick:last";

interface QuickDraft {
  title: string;
  body: string;
  tags: string[];
  slug: string | null;
}

const EMPTY: QuickDraft = { title: "", body: "", tags: [], slug: null };
const quickKey = (repo: string, archetype: string) => `hugoflow:quick:${repo}:${archetype}`;
const withArticle = (label: string) => `${/^[aeiou]/i.test(label) ? "an" : "a"} ${label}`;

function autoGrow(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

function QuickCapture() {
  const { status } = useSession();
  const { settings, isLoaded } = useSettings();
  const { site, refresh, error: siteError } = useSite();
  const { archetypes, byName } = useArchetypes();
  const toast = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [picked, setPicked] = useState<string | null>(searchParams.get("archetype"));
  const [draft, setDraft] = useState<QuickDraft>(EMPTY);
  const [restoredFor, setRestoredFor] = useState<string | null>(null);
  const [editingSlug, setEditingSlug] = useState(false);
  const [saving, setSaving] = useState<"publish" | "draft" | null>(null);
  const [done, setDone] = useState<{ url?: string; path: string; draft: boolean; title: string } | null>(null);

  useEffect(() => {
    if (status === "unauthenticated" || (isLoaded && !settings.repository)) router.replace("/");
  }, [status, isLoaded, settings.repository, router]);

  // Without ?archetype=, reopen the kind used last time, else the one with the fewest fields.
  useEffect(() => {
    if (picked || !archetypes.length) return;
    let last: string | null = null;
    try {
      last = localStorage.getItem(LAST_KEY);
    } catch {
      // storage unavailable
    }
    const fallback = [...archetypes].sort((a, b) => a.fields.length - b.fields.length)[0];
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading browser-only storage after mount
    setPicked(byName(last)?.name ?? fallback.name);
  }, [picked, archetypes, byName]);

  const archetype = byName(picked);
  const entries = useMemo(() => site?.entries ?? [], [site]);
  const section = archetype ? archetypeSection(archetype.name, entries, settings.postsSection) : settings.postsSection;
  const storageKey = archetype ? quickKey(settings.repository, archetype.name) : null;

  // Bring back what was being typed for this kind, then keep saving it locally as it changes.
  useEffect(() => {
    if (!storageKey || restoredFor === storageKey) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring browser-only storage
    setDraft(readDraft<QuickDraft>(storageKey) ?? EMPTY);
    setRestoredFor(storageKey);
    try {
      localStorage.setItem(LAST_KEY, archetype!.name);
    } catch {
      // storage unavailable
    }
  }, [storageKey, restoredFor, archetype]);

  const hasText = !!(draft.title.trim() || draft.body.trim() || draft.tags.length);
  useEffect(() => {
    if (!storageKey || restoredFor !== storageKey || done) return;
    const timer = setTimeout(() => writeDraft(storageKey, hasText ? draft : null), 400);
    return () => clearTimeout(timer);
  }, [draft, storageKey, restoredFor, hasText, done]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (saving) e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [saving]);

  const tagSuggestions = useMemo(() => Array.from(new Set(entries.flatMap((e) => e.tags))).sort(), [entries]);
  const slug = draft.slug ?? slugify(draft.title);
  const words = draft.body.trim() ? draft.body.trim().split(/\s+/).length : 0;
  // The longer kinds that live in the same section, richest first: the essay to a TIL.
  const longer = archetypes
    .filter((a) => archetype && a.name !== archetype.name && archetypeSection(a.name, entries, settings.postsSection) === section)
    .sort((a, b) => b.fields.length - a.fields.length);
  const taken = !!slug && entries.some((e) => e.section === section && e.baseName === slug);

  const update = (patch: Partial<QuickDraft>) => setDraft((d) => ({ ...d, ...patch }));

  /** Front matter for this note, fresh from the archetype (so the date is now). */
  const frontMatter = (a: Archetype, asDraft: boolean) => {
    const fm: FrontMatter = { ...a.data, title: draft.title.trim(), tags: draft.tags };
    if (asDraft) fm.draft = true;
    else if ("draft" in fm) fm.draft = false;
    return fm;
  };

  const save = async (asDraft: boolean) => {
    if (!archetype || saving) return;
    if (!draft.title.trim()) return toast("Add a title first.", "error");
    if (!slug) return toast("The file name can't be empty.", "error");
    const fresh = loadArchetype(archetype);
    const path = fresh.bundle ? `${section}/${slug}/index.md` : `${section}/${slug}.md`;
    setSaving(asDraft ? "draft" : "publish");
    try {
      const data = await saveFile({
        repository: settings.repository,
        branch: site?.branch ?? settings.branch,
        message: archetypeCommitMessage("add", sectionName(section, settings.contentDir), fresh.label, draft.title.trim()),
        path,
        content: buildFile(fresh.format, frontMatter(fresh, asDraft), draft.body, fresh),
        originalPath: null,
        originalSha: null,
      });
      if (storageKey) writeDraft(storageKey, null);
      setDone({ url: data.url, path, draft: asDraft, title: draft.title.trim() });
      refresh();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setSaving(null);
    }
  };

  /** Hand the note to the full editor, optionally as another kind (a TIL that grew into an essay). */
  const openInEditor = (target: Archetype) => {
    if (!archetype) return;
    const current = loadArchetype(archetype);
    const fm = switchArchetype(frontMatter(current, current.data.draft === true), current, target);
    writeDraft(draftKey(settings.repository, null), {
      savedAt: Date.now(),
      baseSha: null,
      format: current.format,
      fm,
      folder: section,
      fileName: draft.slug,
      body: draft.body,
      uploads: [],
      archetype: target.name,
    });
    if (storageKey) writeDraft(storageKey, null);
    router.push(`/editor?new=${encodeURIComponent(section)}&archetype=${encodeURIComponent(target.name)}&restore=1`);
  };

  const writeAnother = () => {
    setDraft(EMPTY);
    setDone(null);
    setEditingSlug(false);
  };

  const backHref = `/?section=${encodeURIComponent(section)}`;

  if (!site || !archetype) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center p-6 text-center">
        {siteError ? (
          <p className="text-sm text-error">{siteError}</p>
        ) : site && !archetypes.length ? (
          <div className="card max-w-sm p-6">
            <Icon name="bolt" className="!text-[28px] text-on-surface-variant" />
            <h1 className="mt-2 font-semibold text-on-surface">No archetypes found</h1>
            <p className="mt-1 text-sm text-on-surface-variant">
              Quick capture uses the files in your repository&apos;s <code className="font-mono text-xs">archetypes/</code> folder.
            </p>
            <Link href="/" className="btn-secondary mt-4">
              Back to dashboard
            </Link>
          </div>
        ) : (
          <span className="flex items-center gap-2 text-on-surface-variant">
            <Spinner /> Loading…
          </span>
        )}
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center p-4">
        <div className="card w-full max-w-md p-6 text-center">
          <div className="mx-auto w-11 h-11 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center">
            <Icon name={done.draft ? "edit_document" : "check"} />
          </div>
          <h1 className="mt-3 font-display text-xl font-bold text-on-surface">{done.draft ? "Saved as draft" : "Published"}</h1>
          <p className="mt-1 text-sm text-on-surface-variant">{done.title}</p>
          <p className="mt-1 font-mono text-xs text-on-surface-variant break-all">{done.path}</p>
          {done.url && (
            <a href={done.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-sm text-primary hover:underline">
              <Icon name="open_in_new" className="!text-[15px]" /> View commit
            </a>
          )}
          <div className="mt-5 grid gap-2">
            <button className="btn-primary !h-11" onClick={writeAnother}>
              <Icon name="bolt" className="!text-[18px]" /> Write another {archetype.label}
            </button>
            <Link href={`/editor?path=${encodeURIComponent(done.path)}`} className="btn-secondary !h-11">
              Open in editor
            </Link>
            <Link href={backHref} className="btn-ghost !h-11">
              Back to list
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] flex flex-col">
      <header className="sticky top-0 z-30 flex items-center gap-2 h-14 px-2 sm:px-4 border-b border-outline-variant bg-surface-container-lowest/95 backdrop-blur">
        <Link href={backHref} className="icon-btn" aria-label="Back">
          <Icon name="arrow_back" />
        </Link>
        <div className="min-w-0 flex-1 flex items-center gap-1.5">
          <Icon name="bolt" className="!text-[18px] text-primary shrink-0" />
          {archetypes.length > 1 ? (
            <select
              className="min-w-0 bg-transparent font-semibold text-on-surface outline-none rounded focus-visible:ring-2"
              value={archetype.name}
              onChange={(e) => setPicked(e.target.value)}
              aria-label="Kind"
            >
              {archetypes.map((a) => (
                <option key={a.name} value={a.name}>
                  Quick {a.label}
                </option>
              ))}
            </select>
          ) : (
            <span className="font-semibold text-on-surface truncate">Quick {archetype.label}</span>
          )}
        </div>
        <button className="btn-primary !h-10" onClick={() => save(false)} disabled={!!saving || !draft.title.trim()}>
          {saving === "publish" ? <Spinner /> : <Icon name="publish" className="!text-[18px]" />} Publish
        </button>
      </header>

      <main className="flex-1 w-full max-w-[640px] mx-auto px-4 pt-5 pb-10">
        <input
          className="w-full bg-transparent font-display text-[26px] font-bold leading-tight tracking-tight text-on-surface placeholder:text-on-surface-variant/40 outline-none"
          placeholder="Title"
          value={draft.title}
          onChange={(e) => update({ title: e.target.value })}
          enterKeyHint="next"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              document.getElementById("quick-body")?.focus();
            }
          }}
          aria-label="Title"
        />

        <div className="mt-1.5 flex items-center gap-1 min-h-[28px] text-xs text-on-surface-variant">
          <span className="font-mono shrink-0">{sectionName(section, settings.contentDir)}/</span>
          {editingSlug ? (
            <input
              className="flex-1 min-w-0 rounded border border-outline-variant bg-surface-container-lowest px-1.5 py-0.5 font-mono text-base sm:text-xs text-on-surface outline-none focus:border-primary"
              value={slug}
              autoFocus
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              onChange={(e) => update({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, "-") })}
              onBlur={() => setEditingSlug(false)}
              onKeyDown={(e) => e.key === "Enter" && setEditingSlug(false)}
              aria-label="File name"
            />
          ) : (
            <button type="button" className="min-w-0 inline-flex items-center gap-1 font-mono hover:text-on-surface" onClick={() => setEditingSlug(true)} title="Edit file name">
              <span className="truncate">{slug || "…"}</span>
              <Icon name="edit" className="!text-[13px] shrink-0" />
            </button>
          )}
          {draft.slug !== null && !editingSlug && (
            <button type="button" className="ml-1 underline shrink-0" onClick={() => update({ slug: null })}>
              From title
            </button>
          )}
        </div>
        {taken && <p className="mt-1 text-xs text-error">A post with this file name already exists here.</p>}

        <textarea
          id="quick-body"
          className="mt-5 w-full min-h-[40vh] resize-none bg-transparent font-serif text-[17px] leading-[1.7] text-on-surface placeholder:text-on-surface-variant/50 outline-none"
          placeholder="What did you learn? Markdown works."
          value={draft.body}
          onChange={(e) => {
            update({ body: e.target.value });
            autoGrow(e.currentTarget);
          }}
          ref={autoGrow}
          spellCheck
          aria-label="Body"
        />

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-on-surface-variant">
          <span className={`tabular-nums ${words > LONG_WORDS ? "text-tertiary font-medium" : ""}`}>
            {words} {words === 1 ? "word" : "words"}
          </span>
          {words > LONG_WORDS && longer[0] && (
            <span>
              This may be {withArticle(longer[0].label)} instead.{" "}
              <button type="button" className="text-primary underline" onClick={() => openInEditor(longer[0])}>
                Continue as {longer[0].label}
              </button>
            </span>
          )}
        </div>

        <div className="mt-6">
          <span className="field-label">Tags</span>
          <TagInput tags={draft.tags} suggestions={tagSuggestions} onChange={(tags) => update({ tags })} large />
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-2">
          <button className="btn-secondary !h-10" onClick={() => save(true)} disabled={!!saving || !draft.title.trim()}>
            {saving === "draft" ? <Spinner /> : <Icon name="edit_document" className="!text-[18px]" />} Save as draft
          </button>
          <button className="btn-ghost !h-10" onClick={() => openInEditor(archetype)}>
            <Icon name="open_in_full" className="!text-[18px]" /> Full editor
          </button>
          {hasText && (
            <button className="btn-ghost !h-10 ml-auto hover:!text-error" onClick={writeAnother}>
              Clear
            </button>
          )}
        </div>
        <p className="mt-3 text-xs text-on-surface-variant">Kept on this device until you publish.</p>
      </main>
    </div>
  );
}

export default function QuickPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen w-full items-center justify-center gap-2 text-on-surface-variant">
          <Spinner /> Loading…
        </div>
      }
    >
      <QuickCapture />
    </Suspense>
  );
}
