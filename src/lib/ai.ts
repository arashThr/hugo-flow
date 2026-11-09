/** Shared request shapes for the writing assistant. The browser stores the key; the server only forwards it. */

export type AiProvider = "grok" | "openai";
export type AiAction = "proofread" | "summary" | "suggest" | "image";

export const AI_PROVIDER_LABEL: Record<AiProvider, string> = {
  grok: "Grok",
  openai: "ChatGPT",
};

export interface AiModelChoice {
  id: string;
  label: string;
}

/** Models the settings screen offers. The first entry is the default. */
export const AI_MODELS: Record<AiProvider, { text: AiModelChoice[]; image: AiModelChoice[] }> = {
  grok: {
    text: [
      { id: "grok-4.7", label: "Grok 4.7" },
      { id: "grok-4.6", label: "Grok 4.6" },
      { id: "grok-4.3", label: "Grok 4.3" },
    ],
    image: [
      { id: "grok-imagine-image-2.0", label: "Grok Imagine 2.0" },
      { id: "grok-imagine-image", label: "Grok Imagine" },
    ],
  },
  openai: {
    text: [
      { id: "gpt-6.1-terra", label: "GPT-6.1 Terra" },
      { id: "gpt-6.1-sol", label: "GPT-6.1 Sol" },
      { id: "gpt-6-luna", label: "GPT-6 Luna" },
    ],
    image: [
      { id: "gpt-image-2.5-flare", label: "GPT Image 2.5 Flare" },
      { id: "gpt-image-2.6-flare", label: "GPT Image 2.6 Flare" },
      { id: "gpt-image-2.5-sunburst", label: "GPT Image 2.5 Sunburst" },
      { id: "gpt-image-2.6-sunburst", label: "GPT Image 2.6 Sunburst" },
    ],
  },
};

export function defaultTextModel(provider: AiProvider): string {
  return AI_MODELS[provider].text[0].id;
}

export function defaultImageModel(provider: AiProvider): string {
  return AI_MODELS[provider].image[0].id;
}

const MODEL_RE = /^[A-Za-z0-9._:-]{1,80}$/;

/** A model id safe to forward, or the default when the value is missing or unusable. */
export function modelId(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return MODEL_RE.test(trimmed) ? trimmed : fallback;
}

export const AI_LIMITS = {
  title: 300,
  body: 40_000,
  selection: 12_000,
  instruction: 1_000,
  prompt: 4_000,
  theme: 1_000,
  description: 2_000,
  reference: 1_200_000,
} as const;

export interface AiTextInput {
  action: Exclude<AiAction, "image">;
  title: string;
  body: string;
  selection?: string;
  instruction?: string;
}

export function aiConfigured(provider: unknown): provider is AiProvider {
  return provider === "grok" || provider === "openai";
}

/** A problem the user can fix, or null when the input can be sent. */
export function textInputError(input: AiTextInput): string | null {
  if (input.title.length > AI_LIMITS.title) return "The title is too long to send.";
  if (input.body.length > AI_LIMITS.body) return "This page is too long to send in one request.";
  if ((input.selection?.length ?? 0) > AI_LIMITS.selection) return "Select a shorter passage.";
  if ((input.instruction?.length ?? 0) > AI_LIMITS.instruction) return "That instruction is too long.";
  if (input.action === "proofread" && !input.body.trim()) return "Write something to proofread first.";
  if (input.action === "summary" && !input.body.trim() && !input.title.trim()) return "Add a title or some text before writing a summary.";
  if (input.action === "suggest" && !input.selection?.trim() && !input.body.trim() && !input.title.trim()) {
    return "Write something before asking for a suggestion.";
  }
  return null;
}

const SYSTEM: Record<AiTextInput["action"], string> = {
  proofread: [
    "You proofread the body of a Hugo blog post written in Markdown.",
    "Fix spelling, grammar, punctuation, and awkward phrasing.",
    "Keep the author's voice, meaning, headings, links, images, code fences, and Hugo shortcodes.",
    "Do not add a title or any commentary.",
    "Return only the corrected Markdown body.",
  ].join(" "),
  summary: [
    "You write the description and tags for a Hugo blog post.",
    'Return only a JSON object with two fields.',
    '"summary": one or two sentences of plain text, under 280 characters, no Markdown.',
    '"tags": an array of 3 to 6 short lowercase tags, with no hash marks.',
    "No preamble and no Markdown fence.",
  ].join(" "),
  suggest: [
    "You help write a Hugo blog post in Markdown.",
    "Follow the instruction.",
    "Return only the passage that should replace the selection, or the next passage when nothing is selected.",
    "Do not add a title, wrap the answer in quotes, or explain what you changed.",
    "Keep links, code, and Hugo shortcodes that belong in the passage.",
  ].join(" "),
};

export function systemPrompt(action: AiTextInput["action"]): string {
  return SYSTEM[action];
}

export function userPrompt(input: AiTextInput): string {
  const title = input.title.trim() || "(untitled)";
  if (input.action === "suggest") {
    const instruction = input.instruction?.trim() || (input.selection?.trim() ? "Rewrite this so it is clearer, keeping the meaning and voice." : "Continue the post with the next paragraph.");
    const parts = [`Title: ${title}`, `Instruction: ${instruction}`];
    if (input.selection?.trim()) {
      parts.push("Selection:", input.selection.trim());
      if (input.body.trim()) parts.push("The rest of the page, for context:", input.body.trim().slice(0, 8_000));
    } else {
      parts.push("The page so far:", input.body.trim() || "(empty)");
    }
    return parts.join("\n\n");
  }
  return [`Title: ${title}`, "Body:", input.body.trim() || "(empty)"].join("\n\n");
}

/**
 * The prompt sent for a featured image.
 * `description` is the summary (or what the author typed in its place).
 * `theme` is the reusable style from Settings. A template image, when present, is sent separately.
 */
export function featuredImagePrompt(input: { description: string; theme: string; title: string; hasTemplate: boolean }): string | null {
  const description = input.description.trim().slice(0, AI_LIMITS.description);
  const theme = input.theme.trim().slice(0, AI_LIMITS.theme);
  const title = input.title.trim().slice(0, AI_LIMITS.title);
  if (!description && !theme && !title) return null;
  const parts: string[] = [];
  if (input.hasTemplate) {
    parts.push(
      "Use the reference image only as a style template: match its palette, lighting, medium, and framing. Do not copy its subject."
    );
  }
  if (theme) parts.push(theme);
  if (description) parts.push(`The post is about: ${description}`);
  else if (title) parts.push(`Editorial featured image for a blog post titled "${title}".`);
  parts.push("Wide composition. No text, letters, logos, or watermark.");
  return parts.join(" ");
}

const REFERENCE_RE = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;

/** A problem with an optional style template, or null when it can be forwarded. An empty value is allowed. */
export function imageReferenceError(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || !REFERENCE_RE.test(value)) return "The template image could not be used.";
  if (value.length > AI_LIMITS.reference) return "The template image is too large. Choose a smaller one in Settings.";
  return null;
}

/** Refuse a reply that the provider cut off, so a partial proofread cannot replace the page. */
export function assertComplete(data: unknown) {
  if (!data || typeof data !== "object") return;
  const record = data as { status?: string; incomplete_details?: { reason?: string } | null; choices?: { finish_reason?: string }[] };
  const truncated = record.status === "incomplete" || record.choices?.[0]?.finish_reason === "length";
  if (!truncated) return;
  throw new Error(
    record.incomplete_details?.reason === "max_output_tokens" || record.choices?.[0]?.finish_reason === "length"
      ? "The page is too long for one pass."
      : "The response was cut off. Try again."
  );
}

/** Pull the visible text out of a Responses or Chat Completions payload. */
export function textFromResponse(data: unknown): string {
  if (!data || typeof data !== "object") throw new Error("The model returned an empty response.");
  assertComplete(data);
  const record = data as Record<string, unknown>;
  if (typeof record.output_text === "string" && record.output_text.trim()) return record.output_text.trim();

  if (Array.isArray(record.output)) {
    const parts: string[] = [];
    for (const item of record.output) {
      if (!item || typeof item !== "object") continue;
      const row = item as { type?: string; content?: unknown };
      if (row.type && row.type !== "message") continue;
      collectText(row.content, parts);
    }
    const joined = parts.join("").trim();
    if (joined) return joined;
  }

  const choice = (record.choices as { message?: { content?: unknown } }[] | undefined)?.[0]?.message?.content;
  if (typeof choice === "string" && choice.trim()) return choice.trim();
  throw new Error("The model returned an empty response.");
}

function collectText(content: unknown, parts: string[]) {
  if (typeof content === "string") {
    parts.push(content);
    return;
  }
  if (!Array.isArray(content)) return;
  for (const part of content) {
    if (typeof part === "string") parts.push(part);
    else if (part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string") {
      parts.push((part as { text: string }).text);
    }
  }
}

/** Drop a wrapping code fence or quotes the model sometimes adds despite the instructions. */
export function cleanModelText(text: string, action: AiTextInput["action"]): string {
  let out = text.trim();
  const fenced = out.match(/^```(?:markdown|md|text|json)?[^\n]*\n([\s\S]*?)\n```$/);
  if (fenced) out = fenced[1].trim();
  if (action === "summary") out = out.replace(/^["“”']+|["“”']+$/g, "").trim();
  if (!out) throw new Error("The model returned an empty response.");
  return out;
}

/** Split a summary response into the description and the tags. Plain text is kept as the description. */
export function parseBrief(text: string): { summary: string; tags: string[] } {
  let raw = text.trim();
  const fenced = raw.match(/^```(?:json)?[^\n]*\n([\s\S]*?)\n?```$/);
  if (fenced) raw = fenced[1].trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      const data = JSON.parse(raw.slice(start, end + 1)) as { summary?: unknown; tags?: unknown };
      const summary = typeof data.summary === "string" ? cleanSummary(data.summary) : "";
      if (summary) return { summary, tags: normalizeTags(data.tags) };
    } catch {
      // The model answered in prose. Use that as the description.
    }
  }
  return { summary: cleanSummary(raw), tags: [] };
}

function cleanSummary(text: string): string {
  return text.replace(/^["“”']+|["“”']+$/g, "").replace(/\s+/g, " ").trim().slice(0, 400);
}

function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const tag = item.trim().replace(/^#/, "").replace(/\s+/g, " ").slice(0, 40);
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
    if (tags.length >= 8) break;
  }
  return tags;
}
