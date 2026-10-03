import { NextResponse } from "next/server";
import { getAccessToken } from "./auth";
import { ConflictError } from "./github";

type Handler = (token: string) => Promise<Response>;

/** Shared auth + error handling for the GitHub API routes. */
export async function withGitHub(handler: Handler): Promise<Response> {
  const token = await getAccessToken();
  if (!token) return NextResponse.json({ error: "Your session has expired. Please sign in again." }, { status: 401 });
  try {
    return await handler(token);
  } catch (error) {
    if (error instanceof ConflictError) return NextResponse.json({ error: error.message }, { status: 409 });
    const status = (error as { status?: number }).status;
    const message = (error as Error).message || "GitHub request failed";
    console.error("GitHub API error:", error);
    return NextResponse.json({ error: message }, { status: status && status >= 400 && status < 600 ? status : 500 });
  }
}

export function splitRepository(repository: string | null | undefined): [string, string] | null {
  const parts = (repository ?? "").split("/");
  return parts.length === 2 && parts[0] && parts[1] ? [parts[0], parts[1]] : null;
}

export function badRequest(error: string) {
  return NextResponse.json({ error }, { status: 400 });
}
