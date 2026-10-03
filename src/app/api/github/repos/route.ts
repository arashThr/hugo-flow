import { NextResponse } from "next/server";
import { listUserRepositories } from "@/lib/github";
import { withGitHub } from "@/lib/api";

export async function GET() {
  return withGitHub(async (token) => NextResponse.json({ repos: await listUserRepositories(token) }));
}
