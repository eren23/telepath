import { chatJSON, chatStream } from "@/lib/kimi";
import {
  MafsSpec,
  MermaidSpec,
  RenderResult,
  type ResolvedIntent,
  SlideSpec,
  StorySpec,
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

You may use any standard Vega-Lite mark and encoding. Prefer bar, line, area, point, or arc. Keep it readable.

INTERACTIVITY (Telepath extension — when natural):
- If the user would plausibly drag a parameter on this chart, add TWO top-level fields:
  - "controls": an array of param definitions. Each entry is one of:
    - {"name": "<id>", "type": "range", "min": <number>, "max": <number>, "step": <number>, "default": <number>, "label": "<human label>"}
    - {"name": "<id>", "type": "number", "min": <number>, "max": <number>, "default": <number>, "label": "<human label>"}
    - {"name": "<id>", "type": "boolean", "default": <bool>, "label": "<human label>"}
    - {"name": "<id>", "type": "select", "options": ["a","b"], "default": "a", "label": "<human label>"}
    - {"name": "<id>", "type": "color", "default": "#7c8cff", "label": "<human label>"}
  - "bindings": an object whose KEYS are control names you declared above and VALUES are JSON Pointer strings (RFC 6901) pointing to ONE place in the spec that should receive the slider's current value. Example shape:
        "bindings": { "threshold": "/encoding/y/scale/domain/1", "barColor": "/mark/color" }
    Each binding replaces a SINGLE scalar value when the slider moves. Re-embed is automatic.
- IMPORTANT — only add controls whose effect is a SINGLE-CELL replacement: color, axis-domain endpoint, threshold mark line, category sample count (truncates an array), single highlighted-row index, mark opacity, font size, etc.
- DO NOT bind a slider to dozens of individual data points (e.g. amplitude affecting every "y" — that needs a Mafs/math output kind, not a chart). If the user wants parametric data that responds to a slider, output kind should be "math" or "story", not "chart".
- "controls" and "bindings" are OPTIONAL. Only add them when an edit interaction is genuinely useful for the goal. 0–3 controls is plenty.
- Both fields are Telepath-only and will be stripped before Vega-Lite renders. Do NOT use Vega-Lite native "params" — use "controls"/"bindings" instead.`;

const MERMAID_SYSTEM = `You generate a Mermaid diagram source string that satisfies the user's resolved intent.

${MEMORY_PREAMBLE}

Rules:
- Pick the right diagram type from: flowchart, sequenceDiagram, classDiagram, stateDiagram-v2, mindmap, gantt, erDiagram. Match the user's "diagramType" dimension if set.
- Be specific. Name actual components and edges from memory when relevant (e.g. if the user has named tools or modules in their projects, use those exact names).
- Output JSON: { "source": "<mermaid source>" }. The source must start with the diagram-type keyword on its own line.
- Keep under 30 nodes/edges.`;

const MATH_SYSTEM = `You generate an interactive 2D math scene (Telepath "math" output kind) using the Mafs schema.

${MEMORY_PREAMBLE}

Schema:
{
  "scene": "plot2d" | "polar",
  "title"?: string,
  "viewbox"?: { "x": [xmin, xmax], "y": [ymin, ymax] },
  "elements": MathElement[],
  "controls"?: ParamDef[],
  "concepts"?: Concept[]
}

MathElement kinds:
- { "kind": "functionY", "expr": <mathjs string of x and named controls>, "domain"?: [xmin, xmax], "color"?: <hex>, "label"?: string }
- { "kind": "parametric", "xExpr": "...", "yExpr": "...", "tDomain": [tmin, tmax], "color"?: <hex>, "label"?: string }
- { "kind": "point", "x": <number or expr string>, "y": <number or expr>, "color"?: <hex>, "label"?: string }
- { "kind": "vector", "tail": [x,y], "tip": [x,y], "color"?: <hex>, "label"?: string }
- { "kind": "text", "at": [x,y], "text": string, "color"?: <hex> }
- { "kind": "latex", "at": [x,y], "tex": <KaTeX string>, "color"?: <hex> }

ParamDef (controls) — same shape as elsewhere:
- { "name": "amplitude", "type": "range", "min": 0, "max": 2, "step": 0.05, "default": 1, "label": "amplitude" }
- types: "range" | "number" | "boolean" | "select" (with "options") | "color"

Concept (for hover-to-explain) — encouraged for any text/latex element with named symbols:
- { "id": "omega", "anchors": ["ω", "\\\\omega"], "label": "angular frequency", "explainer": "radians per second; controls oscillation rate. Linked to wavenumber by the dispersion relation $\\\\omega = c k$." }
- "anchors" are the rendered glyphs or LaTeX commands to hover; "explainer" is markdown with $..$ math support.

Rules:
- Every "expr" / "xExpr" / "yExpr" is a mathjs expression. Use BARE functions: sin(x), cos(x), exp(x), log(x), sqrt(x), abs(x), pi, e. DO NOT use JavaScript "Math.exp", "Math.cos" — that fails. DO NOT use "**" for power; use "^" (mathjs).
- The iteration variable for "functionY" is "x" (spatial). For parametric scenes use "t" as the iteration variable.
- If your equation has a TIME variable but you only want a spatial snapshot, drop the time term (don't reference "t" inside a functionY expr). Example: for y = A·exp(-γx)·sin(kx-ωt) at t=0, write "A * exp(-gamma * x) * sin(k * x)".
- Use ASCII parameter names that match your control "name" exactly (e.g. "gamma", not "γ" — Unicode parses but is risky).
- Pick a viewbox that frames the interesting region (default y is roughly [-2, 2] when amplitude defaults to 1; size it for the actual range).
- Prefer 1-3 controls that genuinely change the picture. Don't add controls you don't reference in expressions.
- Output a single JSON object. No markdown fences.

Worked example for the 1D damped wave snapshot:
{
  "scene": "plot2d",
  "title": "Damped wave snapshot",
  "viewbox": { "x": [-1, 8], "y": [-1.5, 1.5] },
  "controls": [
    {"name": "A", "type": "range", "min": 0.1, "max": 2, "step": 0.05, "default": 1, "label": "Amplitude A"},
    {"name": "gamma", "type": "range", "min": 0, "max": 1, "step": 0.02, "default": 0.3, "label": "Damping γ"},
    {"name": "k", "type": "range", "min": 0.5, "max": 6, "step": 0.1, "default": 2, "label": "Wavenumber k"}
  ],
  "elements": [
    {"kind": "functionY", "expr": "A * exp(-gamma * x) * sin(k * x)", "color": "#7c8cff"}
  ]
}`;

const STORY_SYSTEM = `You generate a multi-node Telepath "story" — a guided walkthrough that combines explanatory text, equations, plots, and diagrams into a coherent narrative.

${MEMORY_PREAMBLE}

Schema:
{
  "title"?: string,
  "nodes": VizNode[1..8],
  "layout"?: { "flow": "stack" | "grid" | "tabs", "columns"?: 1|2|3 },
  "source"?: { "kind": "paste"|"arxiv"|"url"|"memory", "ref"?: string }
}

Each VizNode is discriminated on "kind" with required {"id": <unique>, "title"?: string, "kind": <one of>, "spec": <kind-specific>}:
- kind: "markdown", spec: { "md": <GitHub-flavored markdown, KaTeX in $$..$$ ok>, "concepts"?: Concept[] }
- kind: "katex",    spec: { "tex": <LaTeX math>, "inline"?: boolean, "concepts"?: Concept[] }
- kind: "mafs",     spec: <same MafsSpec as above>
- kind: "vega",     spec: <Vega-Lite v5 spec, may include "controls" + "bindings">
- kind: "mermaid",  spec: { "source": <mermaid source> }

Concept (HOVER-TO-EXPLAIN) — optional but strongly preferred for any markdown/katex node that mentions named symbols:
- Shape: { "id": <slug>, "label": <short human label>, "anchors": <array of strings the renderer will find in the node and wrap as hover targets>, "explainer": <2-3 sentence markdown; "$..$" for inline math> }
- For a markdown node, anchors are PLAIN TEXT substrings the reader sees (e.g. "damping", "amplitude", "wavenumber").
- For a katex node, anchors are the rendered glyphs (e.g. "γ", "ω") OR the LaTeX command (e.g. "\\gamma" — the renderer normalizes common commands to glyphs).
- The explainer is the popover body. Keep it short — 2-3 sentences. Math allowed inside "$..$" or "$$..$$".
- 1-4 concepts per node is plenty. Skip if nothing in the node deserves a hover popover.

Rules:
- 2-5 nodes is the sweet spot. First node should orient the reader; last node should land the point.
- For an arxiv-style paper-math walkthrough use: katex (the equation, with concepts on the variables) → mafs (the plot, with controls) → markdown (the explainer, with concepts on the key terms).
- Every node id is unique. Titles are optional but help.
- Inside any mafs/vega spec, prefer adding 1-3 controls so the reader can manipulate the visualization.
- Output a single JSON object. No markdown fences.`;

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

export async function synthesizeMath(intent: ResolvedIntent, chips: MemoryChip[] = []) {
  const spec = await chatJSON(MafsSpec, [
    { role: "system", content: MATH_SYSTEM },
    { role: "user", content: userBlock(intent, chips) },
  ], { temperature: 0.4 });
  return { outputKind: "math" as const, spec };
}

export async function synthesizeStory(intent: ResolvedIntent, chips: MemoryChip[] = []) {
  const spec = await chatJSON(StorySpec, [
    { role: "system", content: STORY_SYSTEM },
    { role: "user", content: userBlock(intent, chips) },
  ], { temperature: 0.5 });
  return { outputKind: "story" as const, spec };
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
      case "math":
        return synthesizeMath(intent, chips);
      case "story":
        return synthesizeStory(intent, chips);
    }
  })();
  const r = await result;
  return RenderResult.parse(r);
}

function systemFor(kind: ResolvedIntent["outputKind"]): string {
  switch (kind) {
    case "chart": return VEGA_SYSTEM;
    case "diagram": return MERMAID_SYSTEM;
    case "slide": return SLIDE_SYSTEM;
    case "math": return MATH_SYSTEM;
    case "story": return STORY_SYSTEM;
  }
}

function temperatureFor(kind: ResolvedIntent["outputKind"]): number {
  switch (kind) {
    case "slide":
    case "story":
      return 0.5;
    default:
      return 0.4;
  }
}

export type StreamSynthEvent =
  | { kind: "delta"; delta: string }
  | { kind: "result"; result: ReturnType<typeof RenderResult.parse> }
  | { kind: "stream_error"; message: string; raw: string };

export async function* streamSynth(
  intent: ResolvedIntent,
  chips: MemoryChip[] = [],
): AsyncGenerator<StreamSynthEvent> {
  const messages = [
    {
      role: "system" as const,
      content:
        "You always respond with a single JSON object that matches the requested schema exactly. No prose, no markdown fences, just JSON.",
    },
    { role: "system" as const, content: systemFor(intent.outputKind) },
    { role: "user" as const, content: userBlock(intent, chips) },
  ];

  let accumulated = "";
  for await (const chunk of chatStream(messages, {
    temperature: temperatureFor(intent.outputKind),
    responseFormat: "json_object",
  })) {
    if (chunk.delta) {
      accumulated += chunk.delta;
      yield { kind: "delta", delta: chunk.delta };
    }
    if (chunk.done) {
      try {
        const parsed = JSON.parse(accumulated);
        let candidate: { outputKind: ResolvedIntent["outputKind"]; spec: unknown };
        switch (intent.outputKind) {
          case "chart":
            candidate = { outputKind: "chart", spec: VegaSpec.parse(parsed) };
            break;
          case "diagram":
            candidate = { outputKind: "diagram", spec: MermaidSpec.parse(parsed) };
            break;
          case "slide":
            candidate = { outputKind: "slide", spec: SlideSpec.parse(parsed) };
            break;
          case "math":
            candidate = { outputKind: "math", spec: MafsSpec.parse(parsed) };
            break;
          case "story":
            candidate = { outputKind: "story", spec: StorySpec.parse(parsed) };
            break;
        }
        yield { kind: "result", result: RenderResult.parse(candidate) };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        yield {
          kind: "stream_error",
          message: msg,
          raw: accumulated.slice(0, 800),
        };
      }
    }
  }
}
