import { NextResponse } from "next/server";
import { z } from "zod";
import { createSource, expandAll } from "@/lib/sources";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateBody = z.object({
  type: z.enum(["json", "http", "text", "hermes-sessions"]),
  name: z.string().min(1).max(80),
  content: z.string().optional(),
  url: z.url().optional(),
  authHeader: z.string().optional(),
  query: z.string().max(500).optional(),
});

export async function GET() {
  try {
    const { sources } = await expandAll();
    return NextResponse.json({
      sources: sources.map((s) => ({
        id: s.id,
        type: s.type,
        name: s.name,
        enabled: s.enabled,
        removable: s.removable,
        url: s.url,
        hasAuth: Boolean(s.authHeader),
        contentPreview: previewContent(s.content),
        lastFetched: s.lastFetched,
        lastError: s.lastError,
        count: s.count,
      })),
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = CreateBody.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }
  if (parsed.data.type === "http" && !parsed.data.url) {
    return NextResponse.json({ error: "http source requires url" }, { status: 400 });
  }
  if ((parsed.data.type === "json" || parsed.data.type === "text") && !parsed.data.content) {
    return NextResponse.json({ error: `${parsed.data.type} source requires content` }, { status: 400 });
  }
  if (parsed.data.type === "hermes-sessions" && !parsed.data.query) {
    return NextResponse.json({ error: "hermes-sessions source requires query" }, { status: 400 });
  }
  try {
    const cfg = await createSource(parsed.data);
    return NextResponse.json({ ok: true, source: { id: cfg.id, type: cfg.type, name: cfg.name } });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

function previewContent(c?: string): string | undefined {
  if (!c) return undefined;
  return c.length > 120 ? c.slice(0, 117) + "…" : c;
}
