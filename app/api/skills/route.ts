import { NextResponse } from "next/server";
import { snapshotMemory } from "@/lib/hermes-memory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const cold = url.searchParams.get("cold") === "1";
  if (cold) process.env.TELEPATH_COLD = "1";
  else delete process.env.TELEPATH_COLD;
  const snap = await snapshotMemory();
  return NextResponse.json({
    cold: snap.cold,
    chips: snap.chips,
    skills: snap.skills,
    paths: snap.paths,
  });
}
