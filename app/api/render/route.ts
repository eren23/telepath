import { NextResponse } from "next/server";
import { ResolvedIntent } from "@/lib/elicit/schemas";
import { streamSynth, synthesizeSpec } from "@/lib/elicit/synthesize-spec";
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
  const url = new URL(req.url);
  const wantsStream = url.searchParams.get("stream") === "1";
  const json = await req.json();
  const parsed = ResolvedIntent.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }

  if (wantsStream) {
    return streamingResponse(parsed.data);
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

function streamingResponse(intent: ResolvedIntent) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };
      try {
        send("start", { outputKind: intent.outputKind });
        const snap = await snapshotMemory();
        let liveBundle: Awaited<ReturnType<typeof fetchLiveFacts>> | null = null;
        let intentForSynth = intent;
        if (intent.liveDataQuery && intent.liveDataQuery.trim().length > 0) {
          liveBundle = await fetchLiveFacts(intent.liveDataQuery.trim());
          if (liveBundle.ok && liveBundle.facts.length > 0) {
            intentForSynth = { ...intent, liveFacts: liveBundle.facts };
            send("live", {
              ok: true,
              facts: liveBundle.facts,
              durationMs: liveBundle.durationMs,
            });
          }
        }

        let result: Awaited<ReturnType<typeof synthesizeSpec>> | null = null;
        let streamErrored = false;
        for await (const ev of streamSynth(intentForSynth, snap.chips)) {
          if (ev.kind === "delta") {
            send("chunk", { delta: ev.delta });
          } else if (ev.kind === "result") {
            result = ev.result;
          } else {
            streamErrored = true;
            send("stream_error", { message: ev.message });
          }
        }

        if (!result) {
          // Fallback to the batched, retry-equipped synthesizer.
          result = await synthesizeSpec(intentForSynth, snap.chips);
        }

        let suggestions: Awaited<ReturnType<typeof suggestFollowups>> = [];
        try {
          suggestions = await suggestFollowups(intentForSynth, result.outputKind);
        } catch (suggestErr) {
          console.warn("[render] suggestion fetch failed:", suggestErr);
        }

        send("done", {
          ...result,
          suggestions,
          sourcesUsed: {
            hermes: snap.sources.hermes,
            external: snap.sources.external,
          },
          liveData: liveBundle
            ? {
                query: intent.liveDataQuery,
                ok: liveBundle.ok,
                facts: liveBundle.facts,
                durationMs: liveBundle.durationMs,
                error: liveBundle.error,
              }
            : null,
          via: streamErrored ? "stream-fallback" : "stream",
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[render-stream] error:", err);
        send("error", { error: msg });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-store, no-transform",
      connection: "keep-alive",
    },
  });
}
