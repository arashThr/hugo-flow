import { NextRequest } from "next/server";
import { withGitHub, splitRepository, badRequest } from "@/lib/api";

// Streams a file from the repository so the editor can preview images, including in private repos.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const repo = splitRepository(params.get("repository"));
  const path = params.get("path");
  if (!repo || !path) return badRequest("Missing repository or path");
  if (path.split("/").some((part) => part === ".." || part === ".")) return badRequest("Invalid path");

  return withGitHub(async (token) => {
    const ref = params.get("branch");
    const url = `https://api.github.com/repos/${encodeURIComponent(repo[0])}/${encodeURIComponent(repo[1])}/contents/${path
      .split("/")
      .map(encodeURIComponent)
      .join("/")}${ref ? `?ref=${encodeURIComponent(ref)}` : ""}`;
    const upstream = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github.raw", "X-GitHub-Api-Version": "2022-11-28" },
    });
    if (!upstream.ok || !upstream.body) return new Response("Not found", { status: upstream.status === 404 ? 404 : 502 });

    const ext = path.split(".").pop()?.toLowerCase() ?? "";
    const types: Record<string, string> = {
      png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
      webp: "image/webp", avif: "image/avif", svg: "image/svg+xml",
    };
    return new Response(upstream.body, {
      headers: {
        "Content-Type": types[ext] ?? "application/octet-stream",
        "Cache-Control": "private, max-age=300",
        // SVGs from a repo shouldn't be able to run script on our origin.
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        "X-Content-Type-Options": "nosniff",
      },
    });
  });
}
