import { NextResponse } from "next/server";
import { ResolvedIntent } from "@/lib/elicit/schemas";
import { synthesizeSpec } from "@/lib/elicit/synthesize-spec";
import { suggestFollowups } from "@/lib/elicit/suggest";
import { snapshotMemory } from "@/lib/hermes-memory";
import { askHermes, isHermesAvailable } from "@/lib/hermes-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIVE_TIMEOUT_MS = 45_000;

async function fetchLiveFacts(query: string): Promise<{
  facts: string[];
  ok: boolean;
  durationMs: number;
  error?: string;
  command?: string[];
}> {
  if (!(await isHermesAvailable())) {
    return { facts: [], ok: false, durationMs: 0, error: "hermes binary not found" };
  }
  const r = await askHermes(
    [
      `Web search task: ${query}`,
      ``,
      `Output rules (STRICT):`,
      `- Output 3-5 concise factual snippets, one per line.`,
      `- Each snippet is a complete fact, ≤ 25 words.`,
      `- NO preamble like "I'll search" or "Here are…".`,
      `- NO meta narration about tools or session_search.`,
      `- NO numbered or bulleted markers.`,
      `- Just the facts, one per line. Stop after the last fact.`,
    ].join("\n"),
    { toolsets: ["web"], timeoutMs: LIVE_TIMEOUT_MS },
  );
  if (!r.ok) {
    return { facts: [], ok: false, durationMs: r.durationMs, error: r.error, command: r.command };
  }
  const META_PATTERNS = [
    /^(I'll|I will|I'm going|I am going|Let me|Here are|Sure[,!]|Of course[,!])/i,
    /^(preparing|searching|running|querying|fetching|loading)/i,
    /session[_ ]search/i,
    /^I (don['’]t|do not) have/i,
    /^Based on/i,
    /^(Got it|Done|Okay)[,.!]/i,
  ];
  const facts = r.text
    .split(/\n+/)
    .map((l) => l.replace(/^[\s•\-\*\d.\)]+/, "").trim())
    .filter((l) => l.length > 0 && l.length < 280 && l.split(/\s+/).length >= 4)
    .filter((l) => !META_PATTERNS.some((p) => p.test(l)))
    .slice(0, 5);
  return { facts, ok: true, durationMs: r.durationMs, command: r.command };
}

export async function POST(req: Request) {
  const json = await req.json();
  const parsed = ResolvedIntent.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }
  try {
    const snap = await snapshotMemory();
    let liveBundle: Awaited<ReturnType<typeof fetchLiveFacts>> | null = null;
    let intentForSynth = parsed.data;

    if (parsed.data.liveDataQuery && parsed.data.liveDataQuery.trim().length > 0) {
      liveBundle = await fetchLiveFacts(parsed.data.liveDataQuery.trim());
      if (liveBundle.ok && liveBundle.facts.length > 0) {
        intentForSynth = {
          ...parsed.data,
          liveFacts: liveBundle.facts,
        };
      }
    }

    const result = await synthesizeSpec(intentForSynth, snap.chips);
    let suggestions: Awaited<ReturnType<typeof suggestFollowups>> = [];
    try {
      suggestions = await suggestFollowups(intentForSynth, result.outputKind);
    } catch (suggestErr) {
      console.warn("[render] suggestion fetch failed:", suggestErr);
    }

    return NextResponse.json({
      ...result,
      suggestions,
      sourcesUsed: {
        hermes: snap.sources.hermes,
        external: snap.sources.external,
      },
      liveData: liveBundle
        ? {
            query: parsed.data.liveDataQuery,
            ok: liveBundle.ok,
            facts: liveBundle.facts,
            durationMs: liveBundle.durationMs,
            error: liveBundle.error,
          }
        : null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[render] error:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
