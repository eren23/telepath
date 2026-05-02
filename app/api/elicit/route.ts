import { NextResponse } from "next/server";
import { z } from "zod";
import { snapshotMemory } from "@/lib/hermes-memory";
import { parseIntent } from "@/lib/elicit/parse-intent";
import { pickQuestion } from "@/lib/elicit/pick-question";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  text: z.string().min(1),
  cold: z.boolean().optional(),
});

export async function POST(req: Request) {
  const json = await req.json();
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }
  const { text, cold } = parsed.data;
  if (cold) process.env.TELEPATH_COLD = "1";
  else delete process.env.TELEPATH_COLD;

  try {
    const snap = await snapshotMemory();
    const intent = await parseIntent(text, snap);
    const question = await pickQuestion(intent, snap);

    return NextResponse.json({
      intent,
      question,
      memory: {
        cold: snap.cold,
        chips: snap.chips,
        skillCount: snap.skills.length,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[elicit] error:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
