import { chatJSON } from "@/lib/kimi";
import {
  MermaidSpec,
  RenderResult,
  type ResolvedIntent,
  SlideSpec,
  VegaSpec,
} from "./schemas";
import type { MemoryChip } from "@/lib/hermes-memory";

const MEMORY_PREAMBLE = `You have access to detailed memory snippets about the user (their projects, tools, stats, and active work). Treat these as ground truth.

CRITICAL: when generating titles, axis labels, node names, slide bullets, stats, or any content where specifics make the visualization feel personal, USE the actual nouns and numbers from the memory snippets — project names, specific tools, real metrics, and the user's own phrasing. Do NOT invent generic placeholders ("Project A", "Workstream X") when concrete names are present in memory.`;

const VEGA_SYSTEM = `You generate a Vega-Lite v5 specification (JSON) for a single chart that satisfies the user's resolved intent.

${MEMORY_PREAMBLE}

Rules:
- Inline a small synthetic but plausible "data.values" array (8-30 rows) consistent with the user's data source and time window. If specific projects/repos/runs appear in memory, USE THEIR NAMES in the data rows.
- Use a colorblind-safe scheme. Default to "tableau10" unless the user specified otherwise.
- Set "width": "container", "height": 380.
- Always include a "title" field with a short, human title that references the user's actual subject.
- Do NOT wrap in markdown fences. Return ONLY the JSON object.

You may use any standard Vega-Lite mark and encoding. Prefer bar, line, area, point, or arc. Keep it readable.`;

const MERMAID_SYSTEM = `You generate a Mermaid diagram source string that satisfies the user's resolved intent.

${MEMORY_PREAMBLE}

Rules:
- Pick the right diagram type from: flowchart, sequenceDiagram, classDiagram, stateDiagram-v2, mindmap, gantt, erDiagram. Match the user's "diagramType" dimension if set.
- Be specific. Name actual components and edges from memory when relevant (e.g. if the user has named tools or modules in their projects, use those exact names).
- Output JSON: { "source": "<mermaid source>" }. The source must start with the diagram-type keyword on its own line.
- Keep under 30 nodes/edges.`;

const SLIDE_SYSTEM = `You generate a single-slide infographic spec.

${MEMORY_PREAMBLE}

Schema (strict — only these fields per block):
- hero:    { "type": "hero",    "title": string, "subtitle"?: string }
- stat:    { "type": "stat",    "label": string, "value": string, "delta"?: string }
- quote:   { "type": "quote",   "text": string,  "attribution"?: string }
- bullets: { "type": "bullets", "heading"?: string, "items": string[] }
- chart:   { "type": "chart",   "spec": <inline Vega-Lite spec> }

Top-level: { "title": string, "accent"?: string, "blocks": Block[] }

Rules:
- 2 to 4 blocks. The first MUST be a "hero".
- A "stat" value is a STRING (e.g. "7", "1.3M", "98%"). Never include a "unit" or any other extra field.
- A "chart" block embeds an inline Vega-Lite spec — include one when the goal is data-driven; otherwise skip charts.
- "accent" is a hex string or one of: indigo, emerald, amber, rose, sky.
- Title is short and punchy (≤ 8 words).
- Output a single JSON object. No markdown fences, no commentary.`;

function userBlock(intent: ResolvedIntent, chips: MemoryChip[]) {
  const dims = intent.dimensions
    .map(
      (d) =>
        `- ${d.label} (${d.id}): ${d.value ?? "(unset)"} [source=${d.source}, conf=${d.confidence.toFixed(2)}]`,
    )
    .join("\n");
  const memBlock = chips.length
    ? "\n\nUser memory snippets (use these as ground truth):\n" +
      chips.map((c) => `- [${c.origin}] ${c.raw}`).join("\n")
    : "";
  const liveBlock = intent.liveFacts && intent.liveFacts.length > 0
    ? "\n\nLive facts fetched from Hermes Agent's web search just now (must use these — do not invent alternatives):\n" +
      intent.liveFacts.map((f) => `- ${f}`).join("\n")
    : "";
  return `Goal: ${intent.goal}\nOutput kind: ${intent.outputKind}\nResolved dimensions:\n${dims}${memBlock}${liveBlock}`;
}

export async function synthesizeChart(intent: ResolvedIntent, chips: MemoryChip[] = []) {
  const spec = await chatJSON(VegaSpec, [
    { role: "system", content: VEGA_SYSTEM },
    { role: "user", content: userBlock(intent, chips) },
  ], { temperature: 0.4 });
  return { outputKind: "chart" as const, spec };
}

export async function synthesizeDiagram(intent: ResolvedIntent, chips: MemoryChip[] = []) {
  const spec = await chatJSON(MermaidSpec, [
    { role: "system", content: MERMAID_SYSTEM },
    { role: "user", content: userBlock(intent, chips) },
  ], { temperature: 0.4 });
  return { outputKind: "diagram" as const, spec };
}

export async function synthesizeSlide(intent: ResolvedIntent, chips: MemoryChip[] = []) {
  const spec = await chatJSON(SlideSpec, [
    { role: "system", content: SLIDE_SYSTEM },
    { role: "user", content: userBlock(intent, chips) },
  ], { temperature: 0.5 });
  return { outputKind: "slide" as const, spec };
}

export async function synthesizeSpec(intent: ResolvedIntent, chips: MemoryChip[] = []) {
  const result = (() => {
    switch (intent.outputKind) {
      case "chart":
        return synthesizeChart(intent, chips);
      case "diagram":
        return synthesizeDiagram(intent, chips);
      case "slide":
        return synthesizeSlide(intent, chips);
    }
  })();
  const r = await result;
  return RenderResult.parse(r);
}
