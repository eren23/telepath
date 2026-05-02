import { NextResponse } from "next/server";
import { z } from "zod";
import { ResolvedIntent } from "@/lib/elicit/schemas";
import { refineIntent } from "@/lib/elicit/refine";
import { snapshotMemory } from "@/lib/hermes-memory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  prev: ResolvedIntent,
  tweak: z.string().min(1),
  cold: z.boolean().optional(),
});

export async function POST(req: Request) {
  const json = await req.json();
  const parsed = Body.safeParse(json);
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
