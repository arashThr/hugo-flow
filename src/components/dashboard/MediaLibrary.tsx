"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge, Icon, Modal, Spinner } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { repoPathToSitePath, type MediaEntry } from "@/lib/content";
import type { Settings } from "@/components/SettingsProvider";

interface Props {
  media: MediaEntry[];
  settings: Settings;
  branch: string;
  loading: boolean;
  onChanged: () => Promise<void>;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function MediaLibrary({ media, settings, branch, loading, onChanged }: Props) {
  const toast = useToast();
  const [showUnused, setShowUnused] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [detail, setDetail] = useState<MediaEntry | null>(null);

  const unused = media.filter((m) => m.usedBy.length === 0);
  const list = useMemo(
    () => (showUnused ? unused : media).slice().sort((a, b) => b.path.localeCompare(a.path)),
    [media, unused, showUnused]
  );
  const toDelete = media.filter((m) => selected.has(m.path));
  const selectedInUse = toDelete.filter((m) => m.usedBy.length > 0);

  const preview = (path: string) =>
    `/api/github/raw?${new URLSearchParams({ repository: settings.repository, branch, path })}`;

  const toggle = (path: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const remove = async () => {
    setDeleting(true);
    try {
      const res = await fetch("/api/github/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repository: settings.repository,
          branch,
          message: toDelete.length === 1 ? `Delete ${toDelete[0].path}` : `Delete ${toDelete.length} images`,
          files: toDelete.map((m) => ({ path: m.path, sha: m.sha })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast(`Deleted ${toDelete.length} ${toDelete.length === 1 ? "image" : "images"}`);
      setSelected(new Set());
      setConfirming(false);
      await onChanged();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setDeleting(false);
    }
  };

  const copyPath = async (m: MediaEntry) => {
    try {
      await navigator.clipboard.writeText(repoPathToSitePath(m.path));
      toast("Path copied");
    } catch {
      toast(repoPathToSitePath(m.path), "info");
    }
  };

  return (
    <div className="max-w-5xl mx-auto">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display text-[28px] leading-tight font-bold text-on-surface tracking-tight">Media</h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            {media.length} images in <code className="font-mono text-[13px]">{settings.imagePath}/</code>
            {unused.length > 0 && ` · ${unused.length} not used by any page`}
          </p>
        </div>
        <div className="flex gap-2">
          {unused.length > 0 && (
            <button className="btn-secondary" onClick={() => setSelected(new Set(unused.map((m) => m.path)))}>
              <Icon name="select_all" className="!text-[18px]" /> Select unused
            </button>
          )}
          {selected.size > 0 && (
            <button className="btn-danger" onClick={() => setConfirming(true)}>
              <Icon name="delete" className="!text-[18px]" /> Delete {selected.size}
            </button>
          )}
        </div>
      </header>

      <div className="flex items-center gap-2 mb-4">
        <div className="flex rounded-md border border-outline-variant bg-surface-container-lowest p-0.5 h-9">
          {[false, true].map((u) => (
            <button
              key={String(u)}
              onClick={() => setShowUnused(u)}
              className={`px-3 rounded text-sm transition-colors ${
                showUnused === u ? "bg-surface-container-high text-on-surface font-medium" : "text-on-surface-variant hover:text-on-surface"
              }`}
            >
              {u ? `Unused (${unused.length})` : `All (${media.length})`}
            </button>
          ))}
        </div>
        {selected.size > 0 && (
          <button className="btn-ghost !h-9" onClick={() => setSelected(new Set())}>
            Clear selection
          </button>
        )}
      </div>

      {loading && !media.length ? (
        <div className="card flex items-center justify-center gap-2 py-16 text-on-surface-variant">
          <Spinner /> Loading media…
        </div>
      ) : list.length === 0 ? (
        <div className="card py-16 text-center text-on-surface-variant">
          {showUnused ? "Every image is used somewhere. Nice and tidy." : "No images yet. Images you add to posts are stored here."}
        </div>
      ) : (
        <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {list.map((m) => {
            const isSelected = selected.has(m.path);
            const name = m.path.split("/").pop();
            return (
              <li
                key={m.path}
                className={`group relative card overflow-hidden transition-shadow ${isSelected ? "ring-2 ring-primary border-primary" : "hover:shadow-md"}`}
              >
                <button className="block w-full aspect-[4/3] bg-surface-container" onClick={() => setDetail(m)} title={name}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={preview(m.path)} alt={name} loading="lazy" className="w-full h-full object-cover" />
                </button>
                <label
                  className={`absolute top-2 left-2 w-6 h-6 rounded-md flex items-center justify-center cursor-pointer border transition-opacity ${
                    isSelected ? "bg-primary border-primary text-on-primary opacity-100" : "bg-surface-container-lowest/90 border-outline-variant opacity-0 group-hover:opacity-100"
                  }`}
                >
                  <input type="checkbox" className="sr-only" checked={isSelected} onChange={() => toggle(m.path)} aria-label={`Select ${name}`} />
                  {isSelected && <Icon name="check" className="!text-[16px]" />}
                </label>
                <div className="px-2.5 py-2">
                  <div className="truncate text-xs font-medium text-on-surface" title={name}>
                    {name}
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-1">
                    <span className="text-[11px] text-on-surface-variant">{formatSize(m.size)}</span>
                    {m.usedBy.length === 0 ? <Badge tone="draft">Unused</Badge> : <Badge>{m.usedBy.length === 1 ? "1 page" : `${m.usedBy.length} pages`}</Badge>}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.path.split("/").pop()}
        size="lg"
        footer={
          detail && (
            <>
              <button className="btn-secondary" onClick={() => copyPath(detail)}>
                <Icon name="content_copy" className="!text-[17px]" /> Copy path
              </button>
              <button
                className="btn-secondary"
                onClick={() => {
                  setSelected(new Set([detail.path]));
                  setDetail(null);
                  setConfirming(true);
                }}
              >
                <Icon name="delete" className="!text-[17px]" /> Delete
              </button>
            </>
          )
        }
      >
        {detail && (
          <div className="space-y-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview(detail.path)} alt="" className="w-full max-h-[50vh] object-contain rounded-lg bg-surface-container" />
            <div className="font-mono text-xs break-all">{repoPathToSitePath(detail.path)}</div>
            <div>
              <div className="field-label">Used by</div>
              {detail.usedBy.length === 0 ? (
                <p>Not referenced by any content, layout or config file.</p>
              ) : (
                <ul className="space-y-1">
                  {detail.usedBy.map((p) => (
                    <li key={p}>
                      {p.endsWith(".md") ? (
                        <Link href={`/editor?path=${encodeURIComponent(p)}`} className="text-primary hover:underline font-mono text-xs">
                          {p}
                        </Link>
                      ) : (
                        <span className="font-mono text-xs">{p}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={confirming}
        onClose={() => !deleting && setConfirming(false)}
        title={`Delete ${toDelete.length} ${toDelete.length === 1 ? "image" : "images"}?`}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setConfirming(false)} disabled={deleting}>
              Cancel
            </button>
            <button className="btn-danger" onClick={remove} disabled={deleting}>
              {deleting ? <Spinner /> : <Icon name="delete" className="!text-[17px]" />} Delete
            </button>
          </>
        }
      >
        <p>This creates one commit removing these files from {settings.repository}. They stay in the git history.</p>
        {selectedInUse.length > 0 && (
          <p className="mt-3 rounded-lg bg-error-container text-on-error-container px-3 py-2">
            {selectedInUse.length} of these {selectedInUse.length === 1 ? "is" : "are"} still referenced and will show as broken images.
          </p>
        )}
        <ul className="mt-3 max-h-40 overflow-y-auto font-mono text-xs space-y-0.5">
          {toDelete.map((m) => (
            <li key={m.path} className="truncate">
              {m.path}
            </li>
          ))}
        </ul>
      </Modal>
    </div>
  );
}
