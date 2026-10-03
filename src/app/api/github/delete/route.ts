import { NextRequest, NextResponse } from "next/server";
import { commitFiles } from "@/lib/github";
import { withGitHub, splitRepository, badRequest } from "@/lib/api";

interface DeleteBody {
  repository: string;
  branch?: string;
  message: string;
  files: { path: string; sha: string }[];
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as DeleteBody;
  const repo = splitRepository(body.repository);
  if (!repo) return badRequest("Missing repository");
  if (!Array.isArray(body.files) || body.files.length === 0) return badRequest("Nothing to delete");

  return withGitHub(async (token) => {
    const result = await commitFiles(
      token,
      repo[0],
      repo[1],
      body.branch || null,
      body.message,
      body.files.map((f) => ({ path: f.path, delete: true })),
      body.files
    );
    return NextResponse.json({ success: true, ...result });
  });
}
