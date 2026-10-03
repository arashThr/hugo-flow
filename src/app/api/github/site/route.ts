import { NextRequest, NextResponse } from "next/server";
import { getSiteInfo } from "@/lib/github";
import { withGitHub, splitRepository, badRequest } from "@/lib/api";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const repo = splitRepository(params.get("repository"));
  if (!repo) return badRequest("Missing repository");

  return withGitHub(async (token) => {
    const site = await getSiteInfo(
      token,
      repo[0],
      repo[1],
      params.get("branch"),
      params.get("contentDir") || "content",
      params.get("imageDir") || "static/images"
    );
    return NextResponse.json(site);
  });
}
