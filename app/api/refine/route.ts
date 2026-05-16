import { NextResponse } from "next/server";
import { z } from "zod";
import { ResolvedIntent, StorySpec } from "@/lib/elicit/schemas";
import { refineIntent } from "@/lib/elicit/refine";
import { generateStoryPatch } from "@/lib/viz/spec-patch";
import { snapshotMemory } from "@/lib/hermes-memory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IntentBody = z.object({
  prev: ResolvedIntent,
  tweak: z.string().min(1),
  cold: z.boolean().optional(),
});

const PatchBody = z.object({
  prevStory: StorySpec,
  tweak: z.string().min(1),
});

export async function POST(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("mode") ?? "intent";
  const json = await req.json();

  if (mode === "patch") {
    const parsed = PatchBody.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
    }
    try {
      const result = await generateStoryPatch(parsed.data.prevStory, parsed.data.tweak);
      return NextResponse.json(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[refine:patch] error:", err);
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  const parsed = IntentBody.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }
  const { prev, tweak, cold } = parsed.data;
  if (cold) process.env.TELEPATH_COLD = "1";
  else delete process.env.TELEPATH_COLD;

  try {
    const snap = await snapshotMemory();
    const intent = await refineIntent(prev, tweak, snap);
    return NextResponse.json({ intent });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[refine] error:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
