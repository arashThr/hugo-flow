import { NextRequest, NextResponse } from "next/server";
import { commitFiles, type FileChange } from "@/lib/github";
import { withGitHub, splitRepository, badRequest } from "@/lib/api";

interface SaveBody {
  repository: string;
  branch?: string;
  message: string;
  path: string; // where the file is saved
  content: string; // full file contents, front matter included
  originalPath?: string | null; // set when editing an existing file
  originalSha?: string | null;
  uploads?: { path: string; base64: string }[]; // only images the content still references
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as SaveBody;
  const repo = splitRepository(body.repository);
  if (!repo) return badRequest("Missing repository");
  if (!body.path || typeof body.content !== "string") return badRequest("Missing path or content");
  if (body.originalPath && !body.originalSha) return badRequest("Missing originalSha");

  return withGitHub(async (token) => {
    const changes: FileChange[] = [{ path: body.path, content: body.content, encoding: "utf-8" }];
    const expected: { path: string; sha: string | null }[] = [];

    if (body.originalPath && body.originalSha) {
      expected.push({ path: body.originalPath, sha: body.originalSha });
      if (body.originalPath !== body.path) {
        // Renamed: the new location must be free, and the old file goes away in the same commit.
        expected.push({ path: body.path, sha: null });
        changes.push({ path: body.originalPath, delete: true });
      }
    } else {
      expected.push({ path: body.path, sha: null });
    }

    for (const upload of body.uploads ?? []) {
      changes.push({ path: upload.path, content: upload.base64.replace(/^data:[^,]*,/, ""), encoding: "base64" });
    }

    const result = await commitFiles(token, repo[0], repo[1], body.branch || null, body.message, changes, expected);
    return NextResponse.json({ success: true, url: result.url, fileSha: result.blobShas[body.path] });
  });
}
