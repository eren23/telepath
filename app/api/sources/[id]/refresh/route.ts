import { NextResponse } from "next/server";
import { expandSource, loadSources } from "@/lib/sources";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const all = await loadSources();
  const target = all.find((s) => s.id === id);
  if (!target) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  try {
    const chips = await expandSource(target);
    return NextResponse.json({
      ok: true,
      count: chips.length,
      lastFetched: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
