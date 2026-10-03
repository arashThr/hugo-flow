import { NextRequest, NextResponse } from "next/server";
import { readFile } from "@/lib/github";
import { withGitHub, splitRepository, badRequest } from "@/lib/api";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const repo = splitRepository(params.get("repository"));
  const path = params.get("path");
  if (!repo || !path) return badRequest("Missing repository or path");

  return withGitHub(async (token) => NextResponse.json(await readFile(token, repo[0], repo[1], path, params.get("branch"))));
}
