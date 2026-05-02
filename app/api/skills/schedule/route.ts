import { NextResponse } from "next/server";
import { z } from "zod";
import { setSchedule } from "@/lib/hermes-cron";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/).min(1).max(80),
  cadence: z.enum(["daily", "weekly", "off"]),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }
  try {
    const r = await setSchedule(parsed.data.slug, parsed.data.cadence);
    return NextResponse.json(r);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
