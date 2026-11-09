import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth";
import { AI_LIMITS, aiConfigured, defaultImageModel, defaultTextModel, imageReferenceError, modelId, parseBrief, textInputError, type AiAction, type AiTextInput } from "@/lib/ai";
import { completeText, generateImage, ProviderError } from "@/lib/ai-provider";

export const maxDuration = 120;

const ACTIONS: AiAction[] = ["proofread", "summary", "suggest", "image"];

/** Forward one writing-assistant request. The key and the post are not stored. */
export async function POST(request: NextRequest) {
  const session = await getAccessToken();
  if (!session) return NextResponse.json({ error: "Your session has expired. Please sign in again." }, { status: 401 });

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "The request body was not valid JSON." }, { status: 400 });
  }
  if (!payload || typeof payload !== "object") return NextResponse.json({ error: "The request body was empty." }, { status: 400 });

  const body = payload as Record<string, unknown>;
  const provider = body.provider;
  const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  const action = body.action;
  if (!aiConfigured(provider)) return NextResponse.json({ error: "Choose Grok or ChatGPT." }, { status: 400 });
  if (!apiKey) return NextResponse.json({ error: "Add an API key in Settings." }, { status: 400 });
  if (typeof action !== "string" || !ACTIONS.includes(action as AiAction)) {
    return NextResponse.json({ error: "That writing action is not available." }, { status: 400 });
  }
  const task = action as AiAction;

  try {
    if (task === "image") {
      const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
      if (!prompt) return NextResponse.json({ error: "Describe the image first." }, { status: 400 });
      if (prompt.length > AI_LIMITS.prompt) return NextResponse.json({ error: "That image description is too long." }, { status: 400 });
      const referenceProblem = imageReferenceError(body.reference);
      if (referenceProblem) return NextResponse.json({ error: referenceProblem }, { status: 400 });
      const reference = typeof body.reference === "string" && body.reference ? body.reference : undefined;
      const dataUrl = await generateImage(provider, apiKey, prompt, reference, modelId(body.model, defaultImageModel(provider)));
      return NextResponse.json({ dataUrl });
    }

    const input: AiTextInput = {
      action: task,
      title: stringField(body.title).slice(0, AI_LIMITS.title + 1),
      body: stringField(body.body),
      selection: stringField(body.selection),
      instruction: stringField(body.instruction),
    };
    const problem = textInputError(input);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
    const text = await completeText(provider, apiKey, input, modelId(body.model, defaultTextModel(provider)));
    if (task === "summary") {
      const brief = parseBrief(text);
      if (!brief.summary) return NextResponse.json({ error: "The model returned an empty response." }, { status: 502 });
      return NextResponse.json({ text: brief.summary, tags: brief.tags });
    }
    return NextResponse.json({ text });
  } catch (error) {
    if (error instanceof ProviderError) return NextResponse.json({ error: error.message }, { status: error.status });
    const message = error instanceof Error ? error.message : "The writing assistant failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value : "";
}
