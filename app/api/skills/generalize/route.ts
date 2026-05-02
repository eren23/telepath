import { NextResponse } from "next/server";
import { ResolvedIntent } from "@/lib/elicit/schemas";
import { z } from "zod";
import { generalizeSkill } from "@/lib/skill-generalize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  intent: ResolvedIntent,
  outputKind: z.enum(["chart", "diagram", "slide"]),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }
  try {
    const result = await generalizeSkill(parsed.data.intent, parsed.data.outputKind);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
