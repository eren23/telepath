import { NextResponse } from "next/server";
import { z } from "zod";
import { writeSkill } from "@/lib/hermes-memory";
import { OUTPUT_KINDS, Dimension } from "@/lib/elicit/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/).min(1).max(80),
  name: z.string().min(1).max(160),
  description: z.string().max(400),
  outputKind: z.enum(OUTPUT_KINDS),
  spec: z.unknown(),
  dimensions: z.array(Dimension).optional(),
  whenToUse: z.array(z.string().max(280)).max(8).optional(),
  tags: z.array(z.string().max(40)).max(10).optional(),
});

export async function POST(req: Request) {
  const json = await req.json();
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }
  try {
    const path = await writeSkill({
      ...parsed.data,
      createdAt: new Date().toISOString(),
    });
    return NextResponse.json({ ok: true, path });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
