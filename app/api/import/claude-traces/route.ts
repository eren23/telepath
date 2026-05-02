import { NextResponse } from "next/server";
import { z } from "zod";
import { extractFromProject } from "@/lib/extract-claude";
import { createSource } from "@/lib/sources";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  projectId: z.string().min(1),
  name: z.string().min(1).max(80).optional(),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }
  const { projectId, name } = parsed.data;
  try {
    const extracted = await extractFromProject(projectId);
    if (extracted.chips.length === 0) {
      return NextResponse.json(
        { error: "no extractable content in this project" },
        { status: 400 },
      );
    }
    const sourceName = name ?? `Claude Code: ${decodeProject(projectId)}`;
    const cfg = await createSource({
      type: "json",
      name: sourceName,
      content: JSON.stringify({
        source: "claude-code",
        projectId,
        fetchedAt: new Date().toISOString(),
        chips: extracted.chips,
      }, null, 2),
    });
    return NextResponse.json({
      ok: true,
      source: { id: cfg.id, name: cfg.name, count: extracted.chips.length },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

function decodeProject(slug: string): string {
  if (!slug.startsWith("-")) return slug;
  const decoded = slug.replace(/^-/, "/").replace(/-/g, "/");
  const parts = decoded.split("/");
  return parts.slice(-2).join("/");
}
