"use client";

import { asString } from "@/lib/frontmatter";
import { readDraft, writeDraft, type StoredDraft } from "@/lib/drafts";
import { fileFromDataUrl, prepareImage, type PendingUpload } from "@/lib/editor/images";

/** Put a generated featured image on a draft without dropping the page's other pictures. */
export function withFeaturedImage(draft: StoredDraft, imageKey: string, upload: PendingUpload, replacedSitePath: string): StoredDraft {
  const current = asString(draft.fm[imageKey]);
  const drop = new Set([replacedSitePath, current, upload.sitePath].filter(Boolean));
  const uploads = (draft.uploads ?? []).filter((item) => !drop.has(item.sitePath));
  uploads.push(upload);
  return { ...draft, savedAt: Date.now(), fm: { ...draft.fm, [imageKey]: upload.sitePath }, uploads };
}

export interface ImageJobRecord {
  status: "running";
  label: string;
}

interface Handler {
  mode: () => "live" | "offer" | "away";
  apply: (upload: PendingUpload, replacedSitePath: string) => void;
  updateOffer: (draft: StoredDraft) => void;
}

export type ImageJobEvent = { type: "done"; label: string; onPage: boolean } | { type: "error"; message: string };

const EMPTY: Record<string, ImageJobRecord> = {};
let jobs: Record<string, ImageJobRecord> = EMPTY;
const listeners = new Set<() => void>();
const eventListeners = new Set<(event: ImageJobEvent) => void>();
const handlers = new Map<string, Handler>();
const tokens = new Map<string, { key: string }>();

export function subscribeImageJobs(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getImageJobs() {
  return jobs;
}

export function getEmptyImageJobs() {
  return EMPTY;
}

export function subscribeImageJobEvents(listener: (event: ImageJobEvent) => void) {
  eventListeners.add(listener);
  return () => {
    eventListeners.delete(listener);
  };
}

function publish(next: Record<string, ImageJobRecord>) {
  jobs = next;
  for (const listener of listeners) listener();
}

function emit(event: ImageJobEvent) {
  for (const listener of eventListeners) listener(event);
}

/** The open editor for this draft key. Unbind on cleanup so a finished image cannot land on another page. */
export function bindImageTarget(key: string, handler: Handler) {
  handlers.set(key, handler);
  return () => {
    if (handlers.get(key) === handler) handlers.delete(key);
  };
}

/** Saving a new page changes its draft key. A job that is still running follows the saved path. */
export function retargetImageJob(fromKey: string, toKey: string) {
  if (!fromKey || fromKey === toKey) return;
  const token = tokens.get(fromKey);
  if (token) {
    token.key = toKey;
    tokens.delete(fromKey);
    tokens.set(toKey, token);
  }
  const handler = handlers.get(fromKey);
  if (handler) {
    handlers.delete(fromKey);
    handlers.set(toKey, handler);
  }
  if (!jobs[fromKey]) return;
  const next = { ...jobs, [toKey]: jobs[fromKey] };
  delete next[fromKey];
  publish(next);
}

function patchStoredDraft(key: string, snapshot: StoredDraft, imageKey: string, upload: PendingUpload, replacedSitePath: string) {
  const latest = readDraft<StoredDraft>(key);
  const next = withFeaturedImage(latest ?? snapshot, imageKey, upload, replacedSitePath);
  writeDraft(key, next);
  return next;
}

/** Generate a featured image without tying the request to the editor screen. */
export function startFeaturedImageJob(args: {
  key: string;
  label: string;
  snapshot: StoredDraft;
  imageKey: string;
  imageDir: string;
  replacedSitePath: string;
  run: () => Promise<string>;
}) {
  if (jobs[args.key]?.status === "running") return;
  const token = { key: args.key };
  tokens.set(args.key, token);
  publish({ ...jobs, [args.key]: { status: "running", label: args.label } });
  void (async () => {
    try {
      const dataUrl = await args.run();
      const upload = await prepareImage(fileFromDataUrl(dataUrl, "featured.jpg"), 1920, args.imageDir);
      const key = token.key;
      const handler = handlers.get(key);
      const mode = handler?.mode() ?? "away";
      if (mode === "live") {
        handler?.apply(upload, args.replacedSitePath);
        emit({ type: "done", label: args.label, onPage: true });
      } else {
        const draft = patchStoredDraft(key, args.snapshot, args.imageKey, upload, args.replacedSitePath);
        if (mode === "offer") handler?.updateOffer(draft);
        emit({ type: "done", label: args.label, onPage: false });
      }
    } catch (error) {
      emit({ type: "error", message: error instanceof Error ? error.message : "The featured image could not be generated." });
    } finally {
      const key = token.key;
      tokens.delete(key);
      if (jobs[key]) {
        const next = { ...jobs };
        delete next[key];
        publish(next);
      }
    }
  })();
}
