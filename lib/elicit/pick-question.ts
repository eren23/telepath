import { chatJSON } from "@/lib/kimi";
import { DIMENSION_CATALOG, Question, type ParsedIntent } from "./schemas";
import type { MemorySnapshot } from "@/lib/hermes-memory";

const SYSTEM = `You are Telepath's question selector. Given a parsed intent, decide if there is a single high-leverage question worth asking the user.

Rules:
- If every dimension marked "missing" has impact <= 0.5, return {"skipOk": true} — the renderer can proceed with sensible inference.
- Otherwise pick the SINGLE most impactful "missing" dimension and phrase it as a casual, one-line question. Provide 3 chip options the user can tap (plus they can always type custom). Chips must be concrete and short (1-4 words each).
- Never ask about more than one thing. Never ask about anything resolved from memory.
- Question should sound like a friend, not a form. ≤ 14 words.

Return JSON: { "skipOk": boolean, "dim"?: string, "q"?: string, "chips"?: string[], "why"?: string }`;

export type RankedDim = {
  id: string;
  label: string;
  impact: number;
  confidence: number;
};

export function rankMissing(parsed: ParsedIntent): RankedDim[] {
  const catalog = new Map(DIMENSION_CATALOG.map((d) => [d.id as string, d]));
  return parsed.dimensions
    .filter((d) => d.source === "missing")
    .map((d) => {
      const cat = catalog.get(d.id);
      return {
        id: d.id,
        label: d.label,
        impact: cat?.impact ?? 0.5,
        confidence: d.confidence,
      };
    })
    .sort((a, b) => b.impact * (1 - b.confidence) - a.impact * (1 - a.confidence));
}

export async function pickQuestion(parsed: ParsedIntent, snap: MemorySnapshot) {
  const ranked = rankMissing(parsed);
  if (ranked.length === 0) {
    return { skipOk: true } satisfies ReturnType<typeof Question.parse>;
  }
  const top = ranked[0];
  if (top.impact * (1 - top.confidence) < 0.4) {
    return { skipOk: true };
  }

  const compact = {
    goal: parsed.goal,
    outputKind: parsed.outputKind,
    missing: ranked.slice(0, 3),
    knownFromMemory: parsed.dimensions
      .filter((d) => d.source === "memory")
      .map((d) => ({ id: d.id, value: d.value })),
  };

  const result = await chatJSON(Question, [
    { role: "system", content: SYSTEM },
    {
      role: "user",
      content: `Cold start: ${snap.cold}\nIntent: ${JSON.stringify(compact)}\n\nDecide.`,
    },
  ], { temperature: 0.5 });

  return result;
}
