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

const MEMORY_PREAMBLE_SELF = `You have access to detailed memory snippets about the user (their projects, tools, stats, and active work). Treat these as ground truth.

CRITICAL: when generating titles, axis labels, node names, slide bullets, stats, or any content where specifics make the visualization feel personal, USE the actual nouns and numbers from the memory snippets — project names, specific tools, real metrics, and the user's own phrasing. Do NOT invent generic placeholders ("Project A", "Workstream X") when concrete names are present in memory.`;

const MEMORY_PREAMBLE_EXTERNAL = `The user is asking about an EXTERNAL topic (a paper, library, technique, or product they did not personally build). Their memory is BACKGROUND only.

CRITICAL: do NOT inject the user's own project names, tool names, internal codenames, or personal metrics into this visualization. Treat the topic as standalone. Names, examples, axis labels, and bullets MUST come from the user's prompt and the actual subject — never from the memory snippets unless the memory snippet is the EXACT topic the user asked about. No "applies to your X" / "like your Y" / "useful for your nightly Z" — just teach the topic.`;

function preambleFor(external: boolean | undefined): string {
  return external ? MEMORY_PREAMBLE_EXTERNAL : MEMORY_PREAMBLE_SELF;
}

const vegaSystem = (external: boolean | undefined): string => `You generate a Vega-Lite v5 specification (JSON) for a single chart that satisfies the user's resolved intent.

${preambleFor(external)}

Rules:
- Data policy:
${external
    ? `  - This is an EXTERNAL topic. Do NOT fabricate "data.values". If the prompt does not supply real numbers, set "data": { "values": [] } and rely on the "description" field to teach the topic. The renderer will display a "no real data — skipped" placeholder instead of a fake chart. Inventing numbers is worse than no chart.`
    : `  - Inline a small synthetic but plausible "data.values" array (8-30 rows) consistent with the user's data source and time window. If specific projects/repos/runs appear in memory, USE THEIR NAMES in the data rows.`}
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

const mermaidSystem = (external: boolean | undefined): string => `You generate a Mermaid diagram source string that satisfies the user's resolved intent.

${preambleFor(external)}

Rules:
- Pick the right diagram type from: flowchart, sequenceDiagram, classDiagram, stateDiagram-v2, mindmap, gantt, erDiagram. Match the user's "diagramType" dimension if set.
- Be specific. Name actual components and edges from memory when relevant (e.g. if the user has named tools or modules in their projects, use those exact names).
- Output JSON: { "source": "<mermaid source>" }. The source must start with the diagram-type keyword on its own line.
- Keep under 30 nodes/edges.`;

const mathSystem = (external: boolean | undefined): string => `You generate an interactive 2D math scene (Telepath "math" output kind) using the Mafs schema.

${preambleFor(external)}

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

const storySystem = (external: boolean | undefined): string => `You generate a multi-node Telepath "story" — a guided walkthrough that combines explanatory text, equations, plots, and diagrams into a coherent narrative.

${preambleFor(external)}

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
- Shape: { "id": <slug>, "label": <short human label, ≤ 4 words>, "anchors": <array of SHORT strings the renderer wraps as hover targets>, "explainer": <2-3 sentence markdown; "$..$" for inline math> }
- For a markdown node, anchors are PLAIN TEXT substrings the reader sees (e.g. "damping", "amplitude", "wavenumber").
- For a katex node, anchors are the rendered glyphs (e.g. "γ", "ω") OR the LaTeX command (e.g. "\\gamma" — the renderer normalizes common commands to glyphs).
- CRITICAL — anchors are SHORT (one to three words, or a single glyph). Maximum 30 chars per anchor. NEVER paste the entire definition into the anchors field — the explainer is the popover body, the anchor is just the trigger word.
- The explainer is the popover body. Keep it short — 2-3 sentences. Math allowed inside "$..$" or "$$..$$".
- 1-4 concepts per node is plenty. Skip if nothing in the node deserves a hover popover.

Rules:
- 2-5 nodes is the sweet spot. First node should orient the reader; last node should land the point.
- For an arxiv-style paper-math walkthrough use: katex (the equation, with concepts on the variables) → mafs (the plot, with controls) → markdown (the explainer, with concepts on the key terms).
- Every node id is unique. Titles are optional but help.
- Inside any mafs/vega spec, prefer adding 1-3 controls so the reader can manipulate the visualization.
- Output a single JSON object. No markdown fences.`;

const slideSystem = (external: boolean | undefined): string => `You generate a single-slide infographic spec.

${preambleFor(external)}

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

// Cheap noun overlap so we can keep chips whose raw text actually relates to
// the user's prompt, even on external requests.
function nounySet(text: string): Set<string> {
  const out = new Set<string>();
  for (const t of text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/)) {
    if (t.length >= 4) out.add(t);
  }
  return out;
}

function filterChipsForIntent(intent: ResolvedIntent, chips: MemoryChip[]): MemoryChip[] {
  if (!intent.external) return chips;
  if (chips.length === 0) return chips;
  // For external prompts, keep ONLY chips whose nouns overlap the goal.
  const goalNouns = nounySet(intent.goal);
  if (goalNouns.size === 0) return [];
  return chips.filter((c) => {
    const chipNouns = nounySet(c.raw);
    for (const n of chipNouns) {
      if (goalNouns.has(n)) return true;
    }
    return false;
  });
}

function userBlock(intent: ResolvedIntent, chips: MemoryChip[]) {
  const dims = intent.dimensions
    .map(
      (d) =>
        `- ${d.label} (${d.id}): ${d.value ?? "(unset)"} [source=${d.source}, conf=${d.confidence.toFixed(2)}]`,
    )
    .join("\n");
  const filtered = filterChipsForIntent(intent, chips);
  const memBlock = filtered.length
    ? (intent.external
        ? "\n\nUser memory snippets (BACKGROUND CONTEXT only — do NOT inject these names into the visualization unless the snippet IS the topic):\n"
        : "\n\nUser memory snippets (use these as ground truth):\n") +
      filtered.map((c) => `- [${c.origin}] ${c.raw}`).join("\n")
    : "";
  const liveBlock = intent.liveFacts && intent.liveFacts.length > 0
    ? "\n\nLive facts fetched from Hermes Agent's web search just now (must use these — do not invent alternatives):\n" +
      intent.liveFacts.map((f) => `- ${f}`).join("\n")
    : "";
  const externalNote = intent.external
    ? `\n\nTopic mode: EXTERNAL (${intent.externalReason ?? "external topic"}). Do not crowbar in the user's personal projects.`
    : "";
  return `Goal: ${intent.goal}\nOutput kind: ${intent.outputKind}\nResolved dimensions:\n${dims}${memBlock}${liveBlock}${externalNote}`;
}

export async function synthesizeChart(intent: ResolvedIntent, chips: MemoryChip[] = []) {
  const spec = await chatJSON(VegaSpec, [
    { role: "system", content: vegaSystem(intent.external) },
    { role: "user", content: userBlock(intent, chips) },
  ], { temperature: 0.4 });
  return { outputKind: "chart" as const, spec };
}

export async function synthesizeDiagram(intent: ResolvedIntent, chips: MemoryChip[] = []) {
  const spec = await chatJSON(MermaidSpec, [
    { role: "system", content: mermaidSystem(intent.external) },
    { role: "user", content: userBlock(intent, chips) },
  ], { temperature: 0.4 });
  return { outputKind: "diagram" as const, spec };
}

export async function synthesizeSlide(intent: ResolvedIntent, chips: MemoryChip[] = []) {
  const spec = await chatJSON(SlideSpec, [
    { role: "system", content: slideSystem(intent.external) },
    { role: "user", content: userBlock(intent, chips) },
  ], { temperature: 0.5 });
  return { outputKind: "slide" as const, spec };
}

export async function synthesizeMath(intent: ResolvedIntent, chips: MemoryChip[] = []) {
  const spec = await chatJSON(MafsSpec, [
    { role: "system", content: mathSystem(intent.external) },
    { role: "user", content: userBlock(intent, chips) },
  ], { temperature: 0.4 });
  return { outputKind: "math" as const, spec };
}

export async function synthesizeStory(intent: ResolvedIntent, chips: MemoryChip[] = []) {
  const spec = await chatJSON(StorySpec, [
    { role: "system", content: storySystem(intent.external) },
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

function systemFor(intent: ResolvedIntent): string {
  switch (intent.outputKind) {
    case "chart": return vegaSystem(intent.external);
    case "diagram": return mermaidSystem(intent.external);
    case "slide": return slideSystem(intent.external);
    case "math": return mathSystem(intent.external);
    case "story": return storySystem(intent.external);
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
    { role: "system" as const, content: systemFor(intent) },
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
