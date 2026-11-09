"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon, Spinner } from "@/components/ui";
import type { AiProvider, Settings } from "@/components/SettingsProvider";
import { sectionLabel } from "@/lib/content";
import { compressToDataUrl } from "@/lib/editor/images";
import { AI_LIMITS, AI_MODELS, type AiModelChoice } from "@/lib/ai";

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
  imageTemplate?: string;
  saveImageTemplate?: (dataUrl: string) => boolean;
}

export function SettingsView({ settings, updateSettings, sections, isInitialSetup = false, imageTemplate = "", saveImageTemplate }: Props) {
  const needsList = isInitialSetup || !settings.repository;
  const [repos, setRepos] = useState<Repo[]>([]);
  const [picking, setPicking] = useState(needsList);
  const [loading, setLoading] = useState(needsList);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!picking) return;
    let cancelled = false;
    fetch("/api/github/repos")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        if (!cancelled) setRepos(data.repos);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [picking]);

  const openPicker = () => {
    setQuery("");
    setError(null);
    setLoading(true);
    setPicking(true);
  };

  const filtered = repos.filter((r) => r.full_name.toLowerCase().includes(query.toLowerCase()));

  const repoPicker = !picking && settings.repository ? (
    <section className="card p-5">
      <h2 className="font-semibold text-on-surface">Repository</h2>
      <p className="text-sm text-on-surface-variant mt-0.5 mb-4">The GitHub repository that holds your Hugo site.</p>
      <div className="flex items-center gap-3 rounded-lg border border-outline-variant px-3 py-2.5">
        <Icon name="book" className="!text-[18px] text-on-surface-variant" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-on-surface">{settings.repository}</div>
          <div className="truncate text-xs text-on-surface-variant">{settings.branch || "default branch"}</div>
        </div>
        <button type="button" className="btn-secondary !h-8" onClick={openPicker}>
          Change
        </button>
      </div>
    </section>
  ) : (
    <section className="card p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="font-semibold text-on-surface">Repository</h2>
          <p className="text-sm text-on-surface-variant mt-0.5">The GitHub repository that holds your Hugo site.</p>
        </div>
        {!isInitialSetup && settings.repository && (
          <button
            type="button"
            className="btn-ghost !h-8 shrink-0"
            onClick={() => {
              setPicking(false);
              setQuery("");
            }}
          >
            Cancel
          </button>
        )}
      </div>
      <label className="relative block mb-3">
        <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant !text-[19px]" />
        <input className="field !pl-10" placeholder="Filter repositories…" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
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
                  onClick={() => {
                    updateSettings({ repository: repo.full_name, branch: repo.default_branch });
                    if (!isInitialSetup) setPicking(false);
                  }}
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

      <section className="card p-5 space-y-4">
        <div>
          <h2 className="font-semibold text-on-surface">Writing assistant</h2>
          <p className="text-sm text-on-surface-variant mt-0.5">
            Proofread a page, write its summary and tags, suggest the next passage, or generate a featured image. The key stays in this browser.
            Each request is forwarded and then forgotten.
          </p>
        </div>
        <div>
          <span className="field-label">Use</span>
          <div className="segmented">
            {(
              [
                ["grok", "Grok"],
                ["openai", "ChatGPT"],
              ] as [AiProvider, string][]
            ).map(([provider, label]) => (
              <button
                key={provider}
                type="button"
                className={`segment flex-1 h-9 text-sm ${settings.aiProvider === provider ? "segment-on" : "segment-off"}`}
                onClick={() => updateSettings({ aiProvider: provider })}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {settings.aiProvider === "openai" ? (
          <KeyField
            key="openai"
            label="ChatGPT API key"
            value={settings.openaiApiKey}
            onChange={(openaiApiKey) => updateSettings({ openaiApiKey })}
            hint={
              <>
                From{" "}
                <a className="text-primary hover:underline" href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer">
                  platform.openai.com
                </a>
                . Used for text and featured images.
              </>
            }
          />
        ) : (
          <KeyField
            key="grok"
            label="Grok API key"
            value={settings.grokApiKey}
            onChange={(grokApiKey) => updateSettings({ grokApiKey })}
            hint={
              <>
                From{" "}
                <a className="text-primary hover:underline" href="https://console.x.ai/team/default/api-keys" target="_blank" rel="noopener noreferrer">
                  console.x.ai
                </a>
                . Used for text and featured images.
              </>
            }
          />
        )}
        <div className="grid sm:grid-cols-2 gap-4">
          <ModelSelect
            label="Writing model"
            hint="Proofreading, summaries, tags, and suggestions."
            value={settings.aiProvider === "openai" ? settings.openaiTextModel : settings.grokTextModel}
            choices={AI_MODELS[settings.aiProvider].text}
            onChange={(id) => updateSettings(settings.aiProvider === "openai" ? { openaiTextModel: id } : { grokTextModel: id })}
          />
          <ModelSelect
            label="Image model"
            hint="Featured images."
            value={settings.aiProvider === "openai" ? settings.openaiImageModel : settings.grokImageModel}
            choices={AI_MODELS[settings.aiProvider].image}
            onChange={(id) => updateSettings(settings.aiProvider === "openai" ? { openaiImageModel: id } : { grokImageModel: id })}
          />
        </div>
      </section>

      <PhotoSettings
        theme={settings.imageTheme}
        onTheme={(imageTheme) => updateSettings({ imageTheme })}
        template={imageTemplate}
        onTemplate={saveImageTemplate}
      />
    </div>
  );
}

function PhotoSettings({
  theme,
  onTheme,
  template,
  onTemplate,
}: {
  theme: string;
  onTheme: (theme: string) => void;
  template: string;
  onTemplate?: (dataUrl: string) => boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);

  const choose = async (file: File | undefined) => {
    if (!file || !onTemplate) return;
    setError(null);
    setReading(true);
    try {
      const dataUrl = await compressToDataUrl(file, 768);
      if (!onTemplate(dataUrl)) setError("This browser could not store that image. Try a smaller one.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setReading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <section className="card p-5 space-y-4">
      <div>
        <h2 className="font-semibold text-on-surface">Photo generation</h2>
        <p className="text-sm text-on-surface-variant mt-0.5">
          The theme and template apply to every featured image. The post summary is filled in as the description.
        </p>
      </div>
      <label className="block">
        <span className="field-label">Theme</span>
        <textarea
          className="field resize-y min-h-[88px]"
          maxLength={AI_LIMITS.theme}
          placeholder="Muted film colors, soft daylight, simple backgrounds"
          value={theme}
          onChange={(e) => onTheme(e.target.value)}
        />
        <span className="block mt-1 text-xs text-on-surface-variant">The look of the images. It stays in this browser.</span>
      </label>
      <div>
        <span className="field-label">Template image</span>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={(e) => void choose(e.target.files?.[0])}
        />
        {template ? (
          <div className="flex items-center gap-3">
            <span className="h-16 w-28 shrink-0 overflow-hidden rounded-lg border border-outline-variant bg-surface-container">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={template} alt="" className="h-full w-full object-cover" />
            </span>
            <span className="flex flex-col items-start gap-1">
              <button type="button" className="btn-secondary !h-8" disabled={reading} onClick={() => fileRef.current?.click()}>
                {reading ? "Reading…" : "Replace"}
              </button>
              <button
                type="button"
                className="text-xs text-on-surface-variant hover:text-error"
                onClick={() => {
                  setError(onTemplate?.("") === false ? "This browser could not update the template." : null);
                }}
              >
                Remove
              </button>
            </span>
          </div>
        ) : (
          <button type="button" className="btn-secondary" disabled={reading || !onTemplate} onClick={() => fileRef.current?.click()}>
            <Icon name="add_photo_alternate" className="!text-[18px]" />
            {reading ? "Reading…" : "Choose a template"}
          </button>
        )}
        <span className="block mt-1 text-xs text-on-surface-variant">
          Optional. Used as the visual style, not as the subject of the post. It stays in this browser.
        </span>
        {error && <p className="mt-2 text-sm text-error">{error}</p>}
      </div>
    </section>
  );
}

function ModelSelect({
  label,
  hint,
  value,
  choices,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  choices: AiModelChoice[];
  onChange: (id: string) => void;
}) {
  const known = choices.some((choice) => choice.id === value);
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      <select className="field" value={value} onChange={(e) => onChange(e.target.value)}>
        {!known && <option value={value}>{value}</option>}
        {choices.map((choice) => (
          <option key={choice.id} value={choice.id}>
            {choice.label}
          </option>
        ))}
      </select>
      <span className="block mt-1 text-xs text-on-surface-variant">{hint}</span>
    </label>
  );
}

function KeyField({ label, value, onChange, hint }: { label: string; value: string; onChange: (value: string) => void; hint: ReactNode }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="block">
      <span className="field-label">{label}</span>
      <span className="flex gap-2">
        <input
          className="field font-mono"
          type={visible ? "text" : "password"}
          autoComplete="off"
          spellCheck={false}
          value={value}
          placeholder="Paste an API key"
          onChange={(e) => onChange(e.target.value)}
        />
        <button type="button" className="btn-secondary shrink-0 !px-2.5" onClick={() => setVisible((v) => !v)} aria-label={visible ? "Hide key" : "Show key"}>
          <Icon name={visible ? "visibility_off" : "visibility"} className="!text-[18px]" />
        </button>
      </span>
      <span className="block mt-1 text-xs text-on-surface-variant">{value.trim() ? "Saved in this browser. " : "No key yet. "}{hint}</span>
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
