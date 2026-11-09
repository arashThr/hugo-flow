"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Icon, Modal, Spinner } from "@/components/ui";
import { useToast } from "@/components/Toast";
import type { Settings } from "@/components/SettingsProvider";
import {
  AI_LIMITS,
  AI_PROVIDER_LABEL,
  featuredImagePrompt,
  textInputError,
  type AiAction,
  type AiProvider,
  type AiTextInput,
} from "@/lib/ai";
import type { StoredDraft } from "@/lib/drafts";
import { getEmptyImageJobs, getImageJobs, startFeaturedImageJob, subscribeImageJobs } from "@/lib/editor/image-job";

export interface SelectionSpan {
  text: string;
  from: number;
  to: number;
  mode: "rich" | "markdown";
}

interface Creds {
  provider: AiProvider;
  apiKey: string;
}

interface Options {
  provider: AiProvider;
  grokApiKey: string;
  openaiApiKey: string;
  ready: boolean;
  title: string;
  summary: string;
  getBody: () => string;
  captureSelection: () => SelectionSpan | null;
  applyBody: (markdown: string) => void;
  applySelection: (span: SelectionSpan, markdown: string) => void;
  applySummary: (text: string) => void;
  /** Merge generated tags into the ones already on the page. Returns whether any tag was new. */
  applyTags: (tags: string[]) => boolean;
  /** Draft key for the page this image belongs to. The request keeps running if that page unmounts. */
  imageJobKey: string;
  imageLabel: string;
  captureDraft: () => StoredDraft;
  imageDir: string;
  imageField: string;
  currentImagePath: string;
  updateSettings: (patch: Partial<Settings>) => void;
  imageTheme: string;
  imageTemplate: string;
  textModel: string;
  imageModel: string;
  onBackgroundStart?: () => void;
}

type Dialog =
  | { kind: "key"; next: AiAction; provider: AiProvider; draft: string }
  | { kind: "suggest"; phase: "ask" | "loading" | "review"; instruction: string; selection: SelectionSpan | null; text: string; error: string | null }
  | { kind: "image"; prompt: string; edited: boolean; error: string | null }
  | { kind: "review"; phase: "loading" | "review"; text: string; baseline: string; error: string | null };

const DEFAULT_REWRITE = "Rewrite this so it is clearer, keeping the meaning and voice.";
const DEFAULT_CONTINUE = "Continue the post with the next paragraph.";

export function useWritingAssist(opts: Options) {
  const toast = useToast();
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [busy, setBusy] = useState(false);
  const [summaryBusy, setSummaryBusy] = useState(false);
  const imageJobs = useSyncExternalStore(subscribeImageJobs, getImageJobs, getEmptyImageJobs);
  const imageBusy = imageJobs[opts.imageJobKey]?.status === "running";
  const heldSelection = useRef<SelectionSpan | null>(null);
  const alive = useRef(true);
  const imageDraft = useRef<{ summary: string; description: string } | null>(null);
  const providerLabel = AI_PROVIDER_LABEL[opts.provider];
  const summaryText = opts.summary.trim();

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const storedKey = (provider: AiProvider) => (provider === "openai" ? opts.openaiApiKey : opts.grokApiKey).trim();

  const creds = (): Creds => ({ provider: opts.provider, apiKey: storedKey(opts.provider) });

  const requireKey = (next: AiAction): Creds | null => {
    const current = creds();
    if (current.apiKey) return current;
    setDialog({ kind: "key", next, provider: current.provider, draft: "" });
    return null;
  };

  const proofread = () => {
    if (!opts.ready || busy) return;
    const current = requireKey("proofread");
    if (current) void runProofread(current);
  };

  const summary = () => {
    if (!opts.ready || summaryBusy) return;
    const current = requireKey("summary");
    if (current) void runSummary(current);
  };

  const openSuggest = (selection: SelectionSpan | null) => {
    setDialog({
      kind: "suggest",
      phase: "ask",
      instruction: selection?.text.trim() ? DEFAULT_REWRITE : DEFAULT_CONTINUE,
      selection: selection?.text.trim() ? selection : null,
      text: "",
      error: null,
    });
  };

  const suggest = () => {
    if (!opts.ready || busy) return;
    // Read the selection before any dialog opens, so asking for an API key does not drop it.
    heldSelection.current = opts.captureSelection();
    if (!requireKey("suggest")) return;
    openSuggest(heldSelection.current);
  };

  const image = () => {
    if (!opts.ready || imageBusy) return;
    if (!requireKey("image")) return;
    const draft = imageDraft.current;
    const restore = draft && draft.summary === summaryText ? draft.description : summaryText;
    setDialog({ kind: "image", prompt: restore, edited: restore !== summaryText, error: null });
  };

  const runProofread = async (current: Creds) => {
    const input: AiTextInput = { action: "proofread", title: opts.title, body: opts.getBody() };
    const problem = textInputError(input);
    if (problem) {
      setDialog(null);
      toast(problem, "error");
      return;
    }
    setDialog({ kind: "review", phase: "loading", text: "", baseline: input.body, error: null });
    setBusy(true);
    try {
      const text = (await requestText(current, input, opts.textModel)).text;
      setDialog({ kind: "review", phase: "review", text, baseline: input.body, error: null });
    } catch (error) {
      setDialog({ kind: "review", phase: "review", text: "", baseline: input.body, error: (error as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const runSummary = async (current: Creds) => {
    const input: AiTextInput = { action: "summary", title: opts.title, body: opts.getBody() };
    const problem = textInputError(input);
    if (problem) {
      setDialog(null);
      toast(problem, "error");
      return;
    }
    setDialog(null);
    setSummaryBusy(true);
    opts.onBackgroundStart?.();
    toast("Writing the summary and tags. You can keep editing.");
    try {
      const result = await requestText(current, input, opts.textModel);
      if (!alive.current) return;
      opts.applySummary(result.text);
      const addedTags = result.tags?.length ? opts.applyTags(result.tags) : false;
      toast(addedTags ? "Summary and tags added. Save the page to keep it." : "Summary added. Save the page to keep it.");
    } catch (error) {
      if (alive.current) toast((error as Error).message, "error");
    } finally {
      if (alive.current) setSummaryBusy(false);
    }
  };

  const runSuggest = async () => {
    if (dialog?.kind !== "suggest" || busy) return;
    const current = creds();
    if (!current.apiKey) return;
    const input: AiTextInput = {
      action: "suggest",
      title: opts.title,
      body: opts.getBody(),
      selection: dialog.selection?.text,
      instruction: dialog.instruction,
    };
    const problem = textInputError(input);
    if (problem) {
      setDialog({ ...dialog, error: problem });
      return;
    }
    const selection = dialog.selection;
    const instruction = dialog.instruction;
    setDialog({ kind: "suggest", phase: "loading", instruction, selection, text: "", error: null });
    setBusy(true);
    try {
      const text = (await requestText(current, input, opts.textModel)).text;
      setDialog({ kind: "suggest", phase: "review", instruction, selection, text, error: null });
    } catch (error) {
      setDialog({ kind: "suggest", phase: "review", instruction, selection, text: "", error: (error as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const submitImage = (description: string) => {
    if (imageBusy) return;
    const current = creds();
    if (!current.apiKey) return;
    const trimmed = description.trim();
    if (trimmed.length > AI_LIMITS.description) {
      setDialog({ kind: "image", prompt: description, edited: true, error: "That description is too long." });
      return;
    }
    const hasTemplate = opts.imageTemplate.startsWith("data:image/");
    const prompt = featuredImagePrompt({ description: trimmed, theme: opts.imageTheme, title: opts.title, hasTemplate });
    if (!prompt) {
      setDialog({ kind: "image", prompt: description, edited: true, error: "Add a summary, a theme in Settings, or a description." });
      return;
    }
    if (prompt.length > AI_LIMITS.prompt) {
      setDialog({ kind: "image", prompt: description, edited: true, error: "That image description is too long." });
      return;
    }
    imageDraft.current = { summary: summaryText, description: trimmed };
    setDialog(null);
    opts.onBackgroundStart?.();
    toast("Generating the featured image. You can leave this page — it will be added to this draft.");
    startFeaturedImageJob({
      key: opts.imageJobKey,
      label: opts.imageLabel,
      snapshot: opts.captureDraft(),
      imageKey: opts.imageField,
      imageDir: opts.imageDir,
      replacedSitePath: opts.currentImagePath,
      run: () => requestImage(current, prompt, hasTemplate ? opts.imageTemplate : "", opts.imageModel),
    });
  };

  const continueWithKey = () => {
    if (dialog?.kind !== "key") return;
    const apiKey = dialog.draft.trim() || storedKey(dialog.provider);
    if (!apiKey) return;
    opts.updateSettings(
      dialog.provider === "openai" ? { aiProvider: dialog.provider, openaiApiKey: apiKey } : { aiProvider: dialog.provider, grokApiKey: apiKey }
    );
    const current = { provider: dialog.provider, apiKey };
    const next = dialog.next;
    if (next === "proofread") void runProofread(current);
    else if (next === "summary") void runSummary(current);
    else if (next === "suggest") openSuggest(heldSelection.current);
    else {
      const summaryNow = opts.summary.trim();
      const draft = imageDraft.current;
      const restore = draft && draft.summary === summaryNow ? draft.description : summaryNow;
      setDialog({ kind: "image", prompt: restore, edited: restore !== summaryNow, error: null });
    }
  };

  const applyReview = () => {
    if (dialog?.kind === "review") {
      opts.applyBody(dialog.text);
      toast("Proofread applied. Save the page to keep it.");
    } else if (dialog?.kind === "suggest") {
      if (dialog.selection) opts.applySelection(dialog.selection, dialog.text);
      else {
        const body = opts.getBody().replace(/\s*$/, "");
        opts.applyBody(body ? `${body}\n\n${dialog.text.trim()}\n` : `${dialog.text.trim()}\n`);
      }
      toast("Suggestion applied. Save the page to keep it.");
    }
    setDialog(null);
  };

  const imageNote = [
    summaryText ? "The summary is filled in as the description." : "No summary yet. What you write here is the description.",
    opts.imageTheme.trim() ? "The theme from Settings is added." : "",
    opts.imageTemplate.startsWith("data:image/") ? "The template image is used as the style." : "",
    "You can leave this page. The image is added to this draft when it is ready.",
  ]
    .filter(Boolean)
    .join(" ");

  return {
    providerLabel,
    busy,
    summaryBusy,
    imageBusy,
    proofread,
    suggest,
    summary,
    image,
    dialogs: (
      <AssistDialog
        dialog={dialog}
        busy={busy}
        imageNote={imageNote}
        summaryText={summaryText}
        storedKey={storedKey}
        onClose={() => !busy && setDialog(null)}
        onChange={setDialog}
        onContinueKey={continueWithKey}
        onSuggest={runSuggest}
        onImage={submitImage}
        onApply={applyReview}
      />
    ),
  };
}

async function requestText(current: Creds, input: AiTextInput, model: string): Promise<{ text: string; tags?: string[] }> {
  const data = await postAi({ ...current, ...input, model });
  if (typeof data.text !== "string" || !data.text.trim()) throw new Error("The model returned an empty response.");
  const tags = Array.isArray(data.tags) ? data.tags.filter((tag): tag is string => typeof tag === "string" && tag.trim().length > 0) : undefined;
  return { text: data.text, tags };
}

async function requestImage(current: Creds, prompt: string, reference: string, model: string): Promise<string> {
  const body: Record<string, unknown> = { ...current, action: "image", prompt, model };
  if (reference.startsWith("data:image/")) body.reference = reference;
  const data = await postAi(body);
  if (typeof data.dataUrl !== "string" || !data.dataUrl.startsWith("data:image/")) throw new Error("The provider did not return an image.");
  return data.dataUrl;
}

async function postAi(body: Record<string, unknown>): Promise<{ text?: string; dataUrl?: string; tags?: unknown }> {
  const res = await fetch("/api/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string; text?: string; dataUrl?: string; tags?: unknown };
  if (!res.ok) throw new Error(data.error || "The request failed.");
  return data;
}

function AssistDialog(props: {
  dialog: Dialog | null;
  busy: boolean;
  imageNote: string;
  summaryText: string;
  storedKey: (provider: AiProvider) => string;
  onClose: () => void;
  onChange: (dialog: Dialog) => void;
  onContinueKey: () => void;
  onSuggest: () => void;
  onImage: (prompt: string) => void;
  onApply: () => void;
}) {
  const { dialog } = props;
  if (!dialog) return null;

  if (dialog.kind === "key") {
    const saved = props.storedKey(dialog.provider);
    const canContinue = Boolean(dialog.draft.trim() || saved);
    return (
      <Modal
        open
        onClose={props.onClose}
        title="API key"
        size="sm"
        footer={
          <>
            <button className="btn-ghost" onClick={props.onClose}>
              Cancel
            </button>
            <button className="btn-primary" disabled={!canContinue} onClick={props.onContinueKey}>
              Continue
            </button>
          </>
        }
      >
        <p>The key stays in this browser. It is sent only to complete the request, and it is not saved on the server.</p>
        <div className="segmented mt-3">
          {(["grok", "openai"] as AiProvider[]).map((provider) => (
            <button
              key={provider}
              type="button"
              className={`segment flex-1 h-8 text-sm ${dialog.provider === provider ? "segment-on" : "segment-off"}`}
              onClick={() => props.onChange({ ...dialog, provider, draft: "" })}
            >
              {AI_PROVIDER_LABEL[provider]}
            </button>
          ))}
        </div>
        <label className="block mt-3">
          <span className="field-label">{AI_PROVIDER_LABEL[dialog.provider]} API key</span>
          <input
            className="field font-mono"
            type="password"
            autoFocus
            autoComplete="off"
            spellCheck={false}
            placeholder={saved ? "Saved in this browser" : "Paste an API key"}
            value={dialog.draft}
            onChange={(e) => props.onChange({ ...dialog, draft: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && canContinue && props.onContinueKey()}
          />
        </label>
      </Modal>
    );
  }

  if (dialog.kind === "suggest") {
    return (
      <Modal
        open
        onClose={props.onClose}
        title={dialog.selection ? "Rewrite selection" : "Suggest the next passage"}
        size="lg"
        footer={
          dialog.phase === "review" && !dialog.error ? (
            <>
              <button className="btn-ghost" onClick={props.onClose}>
                Discard
              </button>
              <button className="btn-primary" disabled={!dialog.text.trim()} onClick={props.onApply}>
                Use this
              </button>
            </>
          ) : (
            <>
              <button className="btn-ghost" onClick={props.onClose} disabled={props.busy}>
                Cancel
              </button>
              <button className="btn-primary" disabled={props.busy || !dialog.instruction.trim()} onClick={props.onSuggest}>
                {props.busy ? <Spinner /> : <Icon name="auto_awesome" className="!text-[18px]" />}
                Suggest
              </button>
            </>
          )
        }
      >
        {dialog.phase === "loading" ? (
          <Pending label="Writing a suggestion…" />
        ) : dialog.phase === "review" && !dialog.error ? (
          <ResultField value={dialog.text} onChange={(text) => props.onChange({ ...dialog, text })} />
        ) : (
          <div className="space-y-3">
            {dialog.selection && <p className="line-clamp-3 rounded-lg bg-surface-container px-3 py-2 text-on-surface">{dialog.selection.text}</p>}
            <label className="block">
              <span className="field-label">Instruction</span>
              <textarea
                className="field resize-y min-h-[72px]"
                value={dialog.instruction}
                onChange={(e) => props.onChange({ ...dialog, instruction: e.target.value, error: null })}
              />
            </label>
            {dialog.error && <p className="text-error">{dialog.error}</p>}
          </div>
        )}
      </Modal>
    );
  }

  if (dialog.kind === "image") {
    return (
      <Modal
        open
        onClose={props.onClose}
        title="Featured image"
        size="lg"
        footer={
          <>
            <button className="btn-ghost" onClick={props.onClose}>
              Cancel
            </button>
            <button className="btn-primary" onClick={() => props.onImage(dialog.edited ? dialog.prompt : props.summaryText)}>
              <Icon name="auto_awesome" className="!text-[18px]" />
              Generate
            </button>
          </>
        }
      >
        <label className="block">
          <span className="field-label">Description</span>
          <textarea
            className="field resize-y min-h-[120px] text-on-surface"
            value={dialog.edited ? dialog.prompt : props.summaryText}
            placeholder="The summary is used here"
            onChange={(e) => props.onChange({ ...dialog, prompt: e.target.value, edited: true, error: null })}
          />
        </label>
        <p className="mt-2">{props.imageNote}</p>
        {dialog.error && <p className="mt-2 text-error">{dialog.error}</p>}
      </Modal>
    );
  }

  const unchanged = dialog.phase === "review" && dialog.text.trim() === dialog.baseline.trim();
  return (
    <Modal
      open
      onClose={props.onClose}
      title="Proofread"
      size="lg"
      footer={
        dialog.phase === "review" && !dialog.error && !unchanged ? (
          <>
            <button className="btn-ghost" onClick={props.onClose}>
              Discard
            </button>
            <button className="btn-primary" disabled={!dialog.text.trim()} onClick={props.onApply}>
              Use this version
            </button>
          </>
        ) : (
          <button className="btn-ghost" onClick={props.onClose} disabled={props.busy}>
            {dialog.phase === "loading" ? "Cancel" : "Close"}
          </button>
        )
      }
    >
      {dialog.phase === "loading" ? (
        <Pending label="Reading the page…" />
      ) : dialog.error ? (
        <p className="text-error">{dialog.error}</p>
      ) : unchanged ? (
        <p>Nothing to change. The page already reads cleanly.</p>
      ) : (
        <ResultField value={dialog.text} onChange={(text) => props.onChange({ ...dialog, text })} mono />
      )}
    </Modal>
  );
}

function Pending({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 py-6 text-on-surface">
      <Spinner />
      <span>{label} This can take a little while.</span>
    </div>
  );
}

function ResultField({ value, onChange, mono = false }: { value: string; onChange: (value: string) => void; mono?: boolean }) {
  return (
    <textarea
      className={`field resize-y min-h-[200px] text-on-surface ${mono ? "font-mono !text-[13px] leading-relaxed" : ""}`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
