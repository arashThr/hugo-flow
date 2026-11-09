import { cleanModelText, defaultImageModel, defaultTextModel, systemPrompt, textFromResponse, userPrompt, type AiProvider, type AiTextInput } from "./ai";

const PROVIDERS = {
  grok: {
    textUrl: "https://api.x.ai/v1/responses",
    imageUrl: "https://api.x.ai/v1/images/generations",
    imageEditUrl: "https://api.x.ai/v1/images/edits",
  },
  openai: {
    textUrl: "https://api.openai.com/v1/responses",
    imageUrl: "https://api.openai.com/v1/images/generations",
    imageEditUrl: "https://api.openai.com/v1/images/edits",
  },
} as const;

const TEXT_TIMEOUT_MS = 90_000;
const IMAGE_TIMEOUT_MS = 120_000;

export async function completeText(provider: AiProvider, apiKey: string, input: AiTextInput, model = defaultTextModel(provider)): Promise<string> {
  const spec = PROVIDERS[provider];
  const body: Record<string, unknown> = {
    model,
    // Do not keep the post in the provider's stored-response history.
    store: false,
    input: [
      { role: "system", content: systemPrompt(input.action) },
      { role: "user", content: userPrompt(input) },
    ],
  };
  // These ChatGPT models reason by default. A light pass is enough for copy editing and is faster.
  if (provider === "openai") body.reasoning = { effort: "low" };

  const payload = await postJson(spec.textUrl, apiKey, body, TEXT_TIMEOUT_MS);
  return cleanModelText(textFromResponse(payload), input.action);
}

export async function generateImage(provider: AiProvider, apiKey: string, prompt: string, reference?: string, model = defaultImageModel(provider)): Promise<string> {
  const spec = PROVIDERS[provider];
  // A template is a style reference, so it goes to the edit endpoint. Text-only requests stay on generations.
  const body = reference ? editBody(provider, model, prompt, reference) : generationBody(provider, model, prompt);
  const payload = await postJson(reference ? spec.imageEditUrl : spec.imageUrl, apiKey, body, IMAGE_TIMEOUT_MS);
  const image = firstImage(payload);
  if (image.b64) return dataUrl(image.b64, image.mime);
  if (image.url) return dataUrlFromRemote(image.url);
  throw new Error("The provider did not return an image.");
}

function generationBody(provider: AiProvider, model: string, prompt: string): Record<string, unknown> {
  if (provider === "grok") {
    return { model, prompt, n: 1, aspect_ratio: "16:9", response_format: "b64_json", quality: "medium", resolution: "1k" };
  }
  return { model, prompt, n: 1, size: "1536x1024", quality: "medium", output_format: "jpeg" };
}

function editBody(provider: AiProvider, model: string, prompt: string, reference: string): Record<string, unknown> {
  if (provider === "grok") {
    return {
      model,
      prompt,
      aspect_ratio: "16:9",
      response_format: "b64_json",
      quality: "medium",
      resolution: "1k",
      image: { url: reference, type: "image_url" },
    };
  }
  return {
    model,
    prompt,
    n: 1,
    size: "1536x1024",
    quality: "medium",
    output_format: "jpeg",
    images: [{ image_url: reference }],
  };
}

async function postJson(url: string, apiKey: string, body: unknown, timeoutMs: number): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new ProviderError("The provider took too long to answer. Try again.", 504);
    }
    throw new ProviderError("Could not reach the provider. Try again.", 502);
  }

  const raw = await response.text();
  if (!response.ok) throw new ProviderError(providerMessage(response.status, raw, apiKey), response.status);
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new ProviderError("The provider returned a response that could not be read.", 502);
  }
}

export class ProviderError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function providerMessage(status: number, raw: string, apiKey: string): string {
  if (status === 401 || status === 403) return "That API key was rejected. Check the key in Settings.";
  if (status === 429) return "The provider is rate-limiting requests. Wait a moment and try again.";
  let message = raw;
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: string } | string };
    if (typeof parsed.error === "string") message = parsed.error;
    else if (parsed.error && typeof parsed.error.message === "string") message = parsed.error.message;
  } catch {
    // Keep the raw body when it is not JSON.
  }
  const cleaned = message
    .replaceAll(apiKey, "…")
    .replace(/data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=]+/gi, "[image]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 400);
  return cleaned || "The provider rejected the request.";
}

function firstImage(payload: unknown): { b64?: string; url?: string; mime?: string } {
  if (!payload || typeof payload !== "object") return {};
  const data = (payload as { data?: unknown }).data;
  const first = Array.isArray(data) ? data[0] : undefined;
  if (!first || typeof first !== "object") return {};
  const row = first as { b64_json?: unknown; url?: unknown; mime_type?: unknown };
  return {
    b64: typeof row.b64_json === "string" ? row.b64_json : undefined,
    url: typeof row.url === "string" ? row.url : undefined,
    mime: typeof row.mime_type === "string" ? row.mime_type : undefined,
  };
}

function dataUrl(b64: string, mime?: string): string {
  const payload = b64.replace(/^data:[^,]*,/, "");
  const bytes = Buffer.from(payload, "base64");
  if (!bytes.length) throw new Error("The provider returned an empty image.");
  return `data:${mime && mime.startsWith("image/") ? mime : sniffMime(bytes)};base64,${payload}`;
}

async function dataUrlFromRemote(url: string): Promise<string> {
  if (!url.startsWith("https://")) throw new Error("The provider returned an image address that could not be used.");
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error("The generated image could not be downloaded.");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length) throw new Error("The provider returned an empty image.");
  const header = response.headers.get("content-type")?.split(";")[0]?.trim();
  const mime = header && header.startsWith("image/") ? header : sniffMime(bytes);
  return `data:${mime};base64,${bytes.toString("base64")}`;
}

function sniffMime(bytes: Buffer): string {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return "image/png";
  if (bytes.length > 11 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return "image/png";
}
