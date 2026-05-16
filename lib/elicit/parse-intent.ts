import { chatJSON } from "@/lib/kimi";
import { DIMENSION_CATALOG, ParsedIntent } from "./schemas";
import type { MemorySnapshot } from "@/lib/hermes-memory";
import { detectExternal } from "./external-detect";

const SYSTEM = `You are Telepath's intent parser. Given a user's vague visualization request and their persistent agent memory, you decide:
1. A clean restated goal in plain English. The goal SHOULD reference specific projects, tools, or topics from memory when they are relevant — don't say "the user's project" if memory tells you it is "CodeWM" or "Diff-XYZ".
2. The output kind. Pick from (HARD ROUTING RULES below — follow strictly):
   - "chart": data visualization (Vega-Lite). Best for trends, distributions, comparisons of categorical / time-series VALUES. Pick ONLY when the user is asking about data (rows, time series, comparisons), NOT equations.
   - "diagram": system/flow/mindmap (Mermaid). Best for architecture, processes, hierarchies.
   - "slide": single-screen infographic with stats/quote/bullets/chart blocks. Best for "pitch this fact" / executive-summary needs.
   - "math": single interactive math scene (Mafs) — plot of functions or parametric curves with editable parameter sliders. Pick when the prompt mentions ANY of: equation, formula, wave, oscillation, frequency, amplitude, derivative, integral, vector field, mode shape, eigen-, Bessel, harmonic, parametric, trajectory, orbit — and a single scene suffices.
   - "story": multi-node walkthrough combining markdown, KaTeX equations, Mafs plots, Vega charts, Mermaid diagrams. Pick when the prompt mentions ANY of: paper, arxiv, walk me through, explain the math of, derive, intuition behind, what is X actually doing, lecture, deep dive. Multi-faceted topic that needs equation + plot + explainer.

HARD ROUTING RULES (override anything above):
- If the prompt mentions "equation", "wave", "oscillation", "amplitude", "damping", or any named physics/math concept AND asks for a plot or visualization, output kind is "math" (single Mafs scene) OR "story" (if the user wants explanation too).
- If the user says "walk me through" / "explain" / "derive" + math content, output kind is "story".
- Vega "chart" is for DATA, not EQUATIONS. If the user wants y = f(x) with editable parameters, that is "math".
- If the user pasted a URL or asked about a third-party paper / library / model (Goodfire, OpenAI, Anthropic, DeepMind, …), output kind is "story" (multi-node walkthrough). Do NOT pick "chart" for such requests — you would have to fabricate the data and we'd rather show a "no data" card than a fake bar chart. Equations + mafs + markdown explainers are the right shape for external papers.
3. For each relevant dimension from the catalog, EITHER fill its value from memory (set source="memory" and quote the exact chipId you used in fromChipId) OR pick a sensible default (source="default") OR mark it missing (source="missing", value=null) — only mark as missing if both memory has nothing AND no reasonable default exists.

You are biased toward NOT asking the user. Use memory aggressively. When multiple chips touch the same dimension, prefer the more SPECIFIC one for the value (cite that chipId). Pick defaults whenever a reasonable one exists. Only mark "missing" for dimensions where the wrong default would seriously degrade the output (e.g. data source for a chart).

Return JSON matching this exact schema:
{
  "goal": string,
  "outputKind": "chart" | "diagram" | "slide" | "math" | "story",
  "rationale": string (1 short sentence on why you chose that output kind),
  "liveDataQuery": string | null,  // set ONLY when the request demands fresh, time-sensitive, or world-state facts the user's memory cannot provide (e.g. "latest SOTA on X", "today's weather", "current price of Y", "what's new in Z"). Otherwise null. Phrase it as a single, focused web-search query <= 18 words.
  "dimensions": [
    {
      "id": string,           // one of the dimension catalog ids
      "label": string,
      "value": string | null, // null only when source="missing"
      "source": "memory" | "default" | "missing",
      "confidence": number,   // 0..1
      "why": string,          // <= 12 words
      "fromChipId": string    // only when source="memory"; else omit
    }
  ]
}

Only include dimensions whose "appliesTo" includes the chosen outputKind. (For "math" and "story" kinds, the standard data-dimension catalog is mostly irrelevant — return an empty dimensions array unless something like audience or palette genuinely applies.)

Only set liveDataQuery when grounding the visualization on yesterday-and-newer information would meaningfully change the output. Do not set it for charts of personal data or diagrams of internal architecture — those don't need the open web.`;

function memoryBlock(snap: MemorySnapshot): string {
  if (snap.cold) {
    return `(cold start — no memory of this user yet)`;
  }
  const chipLines = snap.chips
    .map((c) => `  - id=${c.id} [${c.origin}]: ${c.raw}`)
    .join("\n");
  return [
    `USER.md:`,
    snap.user.trim() || "(empty)",
    ``,
    `Memory chips (cite chipId when used):`,
    chipLines || "  (none)",
    ``,
    `MEMORY.md:`,
    snap.memory.trim() || "(empty)",
    ``,
    `Past skills (intents already solved):`,
    snap.skills.length
      ? snap.skills.map((s) => `  - ${s.slug}: ${s.description}`).join("\n")
      : "  (none)",
  ].join("\n");
}

export async function parseIntent(text: string, snap: MemorySnapshot) {
  const dimensionCatalogText = DIMENSION_CATALOG.map(
    (d) => `  - ${d.id} ("${d.label}"), appliesTo=[${d.appliesTo.join(",")}], impact=${d.impact}`,
  ).join("\n");

  const result = await chatJSON(ParsedIntent, [
    { role: "system", content: SYSTEM },
    {
      role: "user",
      content: `Dimension catalog:\n${dimensionCatalogText}\n\nAgent memory:\n${memoryBlock(snap)}\n\nUser request: ${text}`,
    },
  ], { temperature: 0.3 });

  // Deterministic external-topic detection runs regardless of what the LLM
  // chose — overrides the model when the prompt is clearly about an outside
  // topic so memory bias doesn't crowbar in user-specific nouns.
  const signal = detectExternal({
    prompt: text,
    goal: result.goal,
    chips: snap.chips,
  });
  return {
    ...result,
    external: signal.external,
    externalReason: signal.reason,
  };
}
