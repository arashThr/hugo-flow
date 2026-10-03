"use client";

import { useEffect, useState } from "react";
import { Icon, Spinner } from "@/components/ui";
import type { Settings } from "@/components/SettingsProvider";
import { sectionLabel } from "@/lib/content";

interface Repo {
  id: number;
  full_name: string;
  default_branch: string;
  private: boolean;
  description: string | null;
}

interface Props {
  settings: Settings;
  updateSettings: (s: Partial<Settings>) => void;
  sections: string[];
  isInitialSetup?: boolean;
}

export function SettingsView({ settings, updateSettings, sections, isInitialSetup = false }: Props) {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    fetch("/api/github/repos")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setRepos(data.repos);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = repos.filter((r) => r.full_name.toLowerCase().includes(query.toLowerCase()));

  const repoPicker = (
    <section className="card p-5">
      <h2 className="font-semibold text-on-surface">Repository</h2>
      <p className="text-sm text-on-surface-variant mt-0.5 mb-4">The GitHub repository that holds your Hugo site.</p>
      <label className="relative block mb-3">
        <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant !text-[19px]" />
        <input className="field !pl-10" placeholder="Filter repositories…" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus={isInitialSetup} />
      </label>
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-on-surface-variant">
          <Spinner /> Loading your repositories…
        </div>
      ) : error ? (
        <p className="rounded-lg bg-error-container text-on-error-container px-3 py-2 text-sm">{error}</p>
      ) : (
        <ul className="max-h-[320px] overflow-y-auto -mx-1 px-1 space-y-1">
          {filtered.map((repo) => {
            const active = settings.repository === repo.full_name;
            return (
              <li key={repo.id}>
                <button
                  className={`w-full flex items-center gap-3 text-left rounded-lg border px-3 py-2.5 transition-colors ${
                    active ? "border-primary bg-primary-container/60" : "border-transparent hover:bg-surface-container"
                  }`}
                  onClick={() => updateSettings({ repository: repo.full_name, branch: repo.default_branch })}
                >
                  <Icon name={repo.private ? "lock" : "book"} className="!text-[18px] text-on-surface-variant" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-on-surface">{repo.full_name}</div>
                    {repo.description && <div className="truncate text-xs text-on-surface-variant">{repo.description}</div>}
                  </div>
                  {active && <Icon name="check_circle" filled className="text-primary !text-[20px]" />}
                </button>
              </li>
            );
          })}
          {filtered.length === 0 && <li className="py-6 text-center text-sm text-on-surface-variant">No repositories match.</li>}
        </ul>
      )}
    </section>
  );

  if (isInitialSetup) return repoPicker;

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <header>
        <h1 className="font-display text-[28px] leading-tight font-bold text-on-surface tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-on-surface-variant">Stored in this browser only. Nothing is added to your repository.</p>
      </header>

      {repoPicker}

      <section className="card p-5 space-y-4">
        <div>
          <h2 className="font-semibold text-on-surface">Site layout</h2>
          <p className="text-sm text-on-surface-variant mt-0.5">The defaults match a standard Hugo site.</p>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <label className="block">
            <span className="field-label">Branch</span>
            <CommitInput value={settings.branch} placeholder="default branch" onCommit={(v) => updateSettings({ branch: v })} />
          </label>
          <label className="block">
            <span className="field-label">Content folder</span>
            <CommitInput value={settings.contentDir} onCommit={(v) => updateSettings({ contentDir: v || "content" })} />
          </label>
          <label className="block">
            <span className="field-label">&ldquo;New post&rdquo; goes to</span>
            {sections.length > 0 ? (
              <select className="field" value={settings.postsSection} onChange={(e) => updateSettings({ postsSection: e.target.value })}>
                {!sections.includes(settings.postsSection) && <option value={settings.postsSection}>{settings.postsSection}</option>}
                {sections.map((s) => (
                  <option key={s} value={s}>
                    {sectionLabel(s, settings.contentDir)} ({s})
                  </option>
                ))}
              </select>
            ) : (
              <CommitInput value={settings.postsSection} onCommit={(v) => updateSettings({ postsSection: v })} />
            )}
          </label>
          <label className="block">
            <span className="field-label">Image folder</span>
            <CommitInput value={settings.imagePath} onCommit={(v) => updateSettings({ imagePath: v || "static/images" })} />
            <span className="block mt-1 text-xs text-on-surface-variant">
              Under <code>static/</code>, so <code>{settings.imagePath}/a.webp</code> is served as <code>/{settings.imagePath.replace(/^static\//, "")}/a.webp</code>.
            </span>
          </label>
        </div>
      </section>
    </div>
  );
}

/** Applies the value on blur/Enter, so the repository isn't reloaded on every keystroke. */
function CommitInput(props: { value: string; onCommit: (v: string) => void; placeholder?: string }) {
  // Keyed on the value so an outside change (e.g. picking another repo) resets the local draft.
  return <CommitInputInner key={props.value} {...props} />;
}

function CommitInputInner({ value, onCommit, placeholder }: { value: string; onCommit: (v: string) => void; placeholder?: string }) {
  const [draft, setDraft] = useState(value);
  const commit = () => {
    const v = draft.trim().replace(/^\/+|\/+$/g, "");
    if (v !== value) onCommit(v);
  };
  return (
    <input
      className="field font-mono"
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && commit()}
    />
  );
}
