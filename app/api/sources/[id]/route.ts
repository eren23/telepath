import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteSource, loadSources, upsertSource } from "@/lib/sources";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchBody = z.object({
  enabled: z.boolean().optional(),
  name: z.string().min(1).max(80).optional(),
  content: z.string().optional(),
  url: z.url().optional(),
  authHeader: z.string().optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const all = await loadSources();
  const target = all.find((s) => s.id === id);
  if (!target) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const json = await req.json().catch(() => null);
  const parsed = PatchBody.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }
  await upsertSource({ ...target, ...parsed.data });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const ok = await deleteSource(id);
  if (!ok) {
    return NextResponse.json({ error: "not found or not removable" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
