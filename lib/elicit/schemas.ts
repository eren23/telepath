import { z } from "zod";

export const OUTPUT_KINDS = ["chart", "diagram", "slide", "story", "math"] as const;
export type OutputKind = (typeof OUTPUT_KINDS)[number];

export const DIMENSION_CATALOG = [
  {
    id: "audience",
    label: "Audience",
    appliesTo: ["chart", "diagram", "slide"],
    impact: 0.4,
  },
  {
    id: "timeWindow",
    label: "Time window",
    appliesTo: ["chart", "slide"],
    impact: 0.9,
  },
  {
    id: "granularity",
    label: "Granularity",
    appliesTo: ["chart"],
    impact: 0.6,
  },
  {
    id: "dataSource",
    label: "Data source",
    appliesTo: ["chart", "slide"],
    impact: 1.0,
  },
  {
    id: "breakdown",
    label: "Breakdown / facet",
    appliesTo: ["chart"],
    impact: 0.7,
  },
  {
    id: "comparison",
    label: "Comparison axis",
    appliesTo: ["chart", "slide"],
    impact: 0.5,
  },
  {
    id: "palette",
    label: "Color palette",
    appliesTo: ["chart", "diagram", "slide"],
    impact: 0.2,
  },
  {
    id: "narrative",
    label: "Narrative angle",
    appliesTo: ["slide"],
    impact: 0.5,
  },
  {
    id: "scope",
    label: "Scope / subject",
    appliesTo: ["diagram", "slide"],
    impact: 0.8,
  },
  {
    id: "diagramType",
    label: "Diagram type",
    appliesTo: ["diagram"],
    impact: 0.7,
  },
] as const;

export type DimensionId = (typeof DIMENSION_CATALOG)[number]["id"];

export const SOURCES = ["memory", "asked", "default", "missing"] as const;
export type Source = (typeof SOURCES)[number];

export const Dimension = z.object({
  id: z.string(),
  label: z.string(),
  value: z.string().nullable(),
  source: z.enum(SOURCES),
  confidence: z.number().min(0).max(1),
  why: z.string().optional(),
  fromChipId: z.string().optional(),
});
export type Dimension = z.infer<typeof Dimension>;

const ParsedIntentInner = z.object({
  goal: z.string(),
  outputKind: z.enum(OUTPUT_KINDS),
  dimensions: z.array(Dimension),
  rationale: z.string().optional(),
  liveDataQuery: z.string().nullable().optional(),
  external: z.boolean().optional(),
  externalReason: z.string().optional(),
});

export const ParsedIntent = z.preprocess((v) => {
  if (!v || typeof v !== "object") return v;
  const o = { ...(v as Record<string, unknown>) };
  if (!("outputKind" in o) && "output_kind" in o) {
    o.outputKind = o.output_kind;
    delete o.output_kind;
  }
  if (Array.isArray(o.dimensions)) {
    o.dimensions = (o.dimensions as Record<string, unknown>[]).map((d) => {
      const dd = { ...d };
      if (!("fromChipId" in dd) && "from_chip_id" in dd) {
        dd.fromChipId = dd.from_chip_id;
        delete dd.from_chip_id;
      }
      return dd;
    });
  }
  return o;
}, ParsedIntentInner);
export type ParsedIntent = z.infer<typeof ParsedIntent>;

export const Question = z.object({
  skipOk: z.boolean(),
  dim: z.string().optional(),
  q: z.string().optional(),
  chips: z.array(z.string()).optional(),
  why: z.string().optional(),
});
export type Question = z.infer<typeof Question>;

const ParamDefInner = z.discriminatedUnion("type", [
  z.looseObject({
    name: z.string(),
    type: z.literal("number"),
    min: z.number(),
    max: z.number(),
    step: z.number().optional(),
    default: z.number(),
    label: z.string().optional(),
  }),
  z.looseObject({
    name: z.string(),
    type: z.literal("range"),
    min: z.number(),
    max: z.number(),
    step: z.number().optional(),
    default: z.number(),
    label: z.string().optional(),
  }),
  z.looseObject({
    name: z.string(),
    type: z.literal("boolean"),
    default: z.boolean(),
    label: z.string().optional(),
  }),
  z.looseObject({
    name: z.string(),
    type: z.literal("select"),
    options: z.array(z.string()).min(1),
    default: z.string(),
    label: z.string().optional(),
  }),
  z.looseObject({
    name: z.string(),
    type: z.literal("color"),
    default: z.string(),
    label: z.string().optional(),
  }),
]);

// Repair common LLM emission quirks before strict validation.
function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);
}

export const ParamDef = z.preprocess((v) => {
  if (!v || typeof v !== "object") return v;
  const o = { ...(v as Record<string, unknown>) };
  // Default type to "range" if missing.
  if (!("type" in o)) o.type = "range";
  // Normalize "slider" / "float" / "int" / "number" → range.
  if (o.type === "slider" || o.type === "float" || o.type === "int") {
    o.type = "range";
  }
  // Fill missing `name` from label or id.
  if (!o.name) {
    const fallback = (o.label as string | undefined) ?? (o.id as string | undefined) ?? "p";
    o.name = slugify(String(fallback));
  }
  // Fill missing default from min (or 0 for booleans).
  if (o.type === "range" || o.type === "number") {
    if (o.default === undefined || o.default === null) {
      o.default = typeof o.min === "number" ? o.min : 0;
    }
    if (typeof o.min !== "number") o.min = 0;
    if (typeof o.max !== "number") o.max = 1;
  }
  if (o.type === "boolean" && (o.default === undefined || o.default === null)) {
    o.default = false;
  }
  if (o.type === "select" && (o.default === undefined || o.default === null) && Array.isArray(o.options) && (o.options as unknown[]).length > 0) {
    o.default = (o.options as string[])[0];
  }
  if (o.type === "color" && (o.default === undefined || o.default === null)) {
    o.default = "#7c8cff";
  }
  return o;
}, ParamDefInner);
export type ParamDef = z.infer<typeof ParamDef>;

export const Concept = z.object({
  id: z.string(),
  anchors: z.array(z.string()).default([]),
  label: z.string(),
  explainer: z.string(),
  related: z.array(z.string()).optional(),
});
export type Concept = z.infer<typeof Concept>;

export const VegaSpec = z.looseObject({
  $schema: z.string().optional(),
  description: z.string().optional(),
  // Telepath extensions (not part of Vega-Lite). Stripped before passing to vega-embed.
  controls: z.array(ParamDef).optional(),
  bindings: z.record(z.string(), z.string()).optional(),
  concepts: z.array(Concept).optional(),
});
export type VegaSpec = z.infer<typeof VegaSpec>;

export const MermaidSpec = z.object({
  source: z.string(),
});
export type MermaidSpec = z.infer<typeof MermaidSpec>;

const valueLike = z.union([z.string(), z.number()]).transform((v) => String(v));

export const SlideBlock = z.discriminatedUnion("type", [
  z.looseObject({ type: z.literal("hero"), title: z.string(), subtitle: z.string().optional() }),
  z.looseObject({
    type: z.literal("stat"),
    label: z.string(),
    value: valueLike,
    delta: z.string().optional(),
  }),
  z.looseObject({ type: z.literal("quote"), text: z.string(), attribution: z.string().optional() }),
  z.looseObject({
    type: z.literal("bullets"),
    heading: z.string().optional(),
    items: z.array(z.string()),
  }),
  z.looseObject({ type: z.literal("chart"), spec: VegaSpec }),
]);
export type SlideBlock = z.infer<typeof SlideBlock>;

export const SlideSpec = z.looseObject({
  title: z.string().default("Slide"),
  blocks: z.array(SlideBlock).min(1).max(6),
  accent: z.string().optional(),
});
export type SlideSpec = z.infer<typeof SlideSpec>;

// Math (Mafs) spec — interactive 2D math scene.
const Tuple2 = z.tuple([z.number(), z.number()]);

const MathElementInner = z.discriminatedUnion("kind", [
  z.looseObject({
    kind: z.literal("functionY"),
    expr: z.string(),
    domain: Tuple2.optional(),
    color: z.string().optional(),
    label: z.string().optional(),
  }),
  z.looseObject({
    kind: z.literal("parametric"),
    xExpr: z.string(),
    yExpr: z.string(),
    tDomain: Tuple2,
    color: z.string().optional(),
    label: z.string().optional(),
  }),
  z.looseObject({
    kind: z.literal("point"),
    x: z.union([z.number(), z.string()]),
    y: z.union([z.number(), z.string()]),
    color: z.string().optional(),
    label: z.string().optional(),
  }),
  z.looseObject({
    kind: z.literal("vector"),
    tail: Tuple2,
    tip: Tuple2,
    color: z.string().optional(),
    label: z.string().optional(),
  }),
  z.looseObject({
    kind: z.literal("text"),
    at: Tuple2,
    text: z.string(),
    color: z.string().optional(),
  }),
  z.looseObject({
    kind: z.literal("latex"),
    at: Tuple2,
    tex: z.string(),
    color: z.string().optional(),
  }),
]);

const KIND_ALIASES: Record<string, string> = {
  function: "functionY",
  func: "functionY",
  curve: "functionY",
  graph: "functionY",
  plot: "functionY",
  line: "functionY",
  polyline: "functionY",
  wave: "functionY",
  sin: "functionY",
  cos: "functionY",
  sinusoid: "functionY",
  expr: "functionY",
  formula: "functionY",
  functionx: "functionY",
  parametriccurve: "parametric",
  param: "parametric",
  parametriccurves: "parametric",
  arrow: "vector",
  vec: "vector",
  label: "text",
  annotation: "text",
  caption: "text",
  equation: "latex",
  tex: "latex",
  math: "latex",
};

export const MathElement = z.preprocess((v) => {
  if (!v || typeof v !== "object") return v;
  const o = { ...(v as Record<string, unknown>) };
  if (typeof o.kind === "string") {
    const key = o.kind.toLowerCase().replace(/[^a-z]/g, "");
    if (KIND_ALIASES[key]) o.kind = KIND_ALIASES[key];
  }
  // Normalize "fn" / "y" field to "expr".
  if ("y" in o && typeof o.y === "string" && !("expr" in o)) {
    o.expr = o.y;
    delete o.y;
  }
  if ("fn" in o && !("expr" in o)) {
    o.expr = o.fn;
    delete o.fn;
  }
  // Fallback: if no kind is set OR it's still unknown but we have expression-y
  // fields, infer the kind from the shape so a single dumb LLM emit doesn't
  // dead-end the whole render.
  const VALID = new Set([
    "functionY",
    "parametric",
    "point",
    "vector",
    "text",
    "latex",
  ]);
  if (typeof o.kind !== "string" || !VALID.has(o.kind as string)) {
    if (typeof o.expr === "string") o.kind = "functionY";
    else if (typeof o.xExpr === "string" && typeof o.yExpr === "string") {
      o.kind = "parametric";
      if (!Array.isArray(o.tDomain)) o.tDomain = [0, 2 * Math.PI];
    } else if (typeof o.tex === "string") o.kind = "latex";
    else if (typeof o.text === "string") o.kind = "text";
    else if (Array.isArray(o.tail) && Array.isArray(o.tip)) o.kind = "vector";
    else if ("x" in o && "y" in o) o.kind = "point";
    // No silent functionY fallback — let validation fail loudly so the route
    // returns an error the user can see instead of a flat invisible line.
  }
  // If text/latex but missing "at", default to origin (harmless placement).
  if ((o.kind === "text" || o.kind === "latex") && !Array.isArray(o.at)) {
    o.at = [0, 0];
  }
  return o;
}, MathElementInner);
export type MathElement = z.infer<typeof MathElement>;

const MafsSpecInner = z.looseObject({
  scene: z.enum(["plot2d", "polar"]).default("plot2d"),
  elements: z.array(MathElement).min(1),
  viewbox: z.looseObject({ x: Tuple2, y: Tuple2 }).optional(),
  controls: z.array(ParamDef).optional(),
  concepts: z.array(Concept).optional(),
  title: z.string().optional(),
});

// Don't silently swap in an invisible flat-line placeholder when the LLM forgets
// elements — let the schema fail and the renderer surface a real error.
export const MafsSpec = MafsSpecInner;
export type MafsSpec = z.infer<typeof MafsSpec>;

export const KatexSpec = z.looseObject({
  tex: z.string(),
  inline: z.boolean().optional(),
  concepts: z.array(Concept).optional(),
});
export type KatexSpec = z.infer<typeof KatexSpec>;

export const MarkdownSpec = z.looseObject({
  md: z.string(),
  concepts: z.array(Concept).optional(),
});
export type MarkdownSpec = z.infer<typeof MarkdownSpec>;

// Multi-node Story — a viz-graph the LLM can compose for richer walkthroughs.
const NodeCommon = {
  id: z.string(),
  title: z.string().optional(),
};

const VizNodeInner = z.discriminatedUnion("kind", [
  z.looseObject({ ...NodeCommon, kind: z.literal("vega"), spec: VegaSpec }),
  z.looseObject({ ...NodeCommon, kind: z.literal("mermaid"), spec: MermaidSpec }),
  z.looseObject({ ...NodeCommon, kind: z.literal("mafs"), spec: MafsSpec }),
  z.looseObject({ ...NodeCommon, kind: z.literal("katex"), spec: KatexSpec }),
  z.looseObject({ ...NodeCommon, kind: z.literal("markdown"), spec: MarkdownSpec }),
]);

const NODE_KIND_ALIASES: Record<string, string> = {
  chart: "vega",
  "vega-lite": "vega",
  vegalite: "vega",
  diagram: "mermaid",
  flowchart: "mermaid",
  math: "mafs",
  plot: "mafs",
  equation: "katex",
  latex: "katex",
  text: "markdown",
  md: "markdown",
  prose: "markdown",
};

export const VizNode = z.preprocess((v) => {
  if (!v || typeof v !== "object") return v;
  const o = { ...(v as Record<string, unknown>) };
  if (typeof o.kind === "string") {
    const key = o.kind.toLowerCase().replace(/[^a-z]/g, "");
    if (NODE_KIND_ALIASES[key]) o.kind = NODE_KIND_ALIASES[key];
  }
  if (!o.id || typeof o.id !== "string") {
    o.id = `n-${Math.random().toString(36).slice(2, 8)}`;
  }
  return o;
}, VizNodeInner);
export type VizNode = z.infer<typeof VizNode>;

export const StorySpec = z.looseObject({
  title: z.string().optional(),
  nodes: z.array(VizNode).min(1).max(8),
  layout: z
    .looseObject({
      flow: z.enum(["stack", "grid", "tabs"]).default("stack"),
      columns: z.number().int().min(1).max(3).optional(),
    })
    .optional(),
  source: z
    .looseObject({
      kind: z.enum(["paste", "arxiv", "url", "memory"]),
      ref: z.string().optional(),
    })
    .optional(),
});
export type StorySpec = z.infer<typeof StorySpec>;

export const ResolvedIntent = z.object({
  goal: z.string(),
  outputKind: z.enum(OUTPUT_KINDS),
  dimensions: z.array(Dimension),
  liveDataQuery: z.string().nullable().optional(),
  liveFacts: z.array(z.string()).optional(),
  external: z.boolean().optional(),
  externalReason: z.string().optional(),
});
export type ResolvedIntent = z.infer<typeof ResolvedIntent>;

export const RenderResult = z.discriminatedUnion("outputKind", [
  z.object({ outputKind: z.literal("chart"), spec: VegaSpec }),
  z.object({ outputKind: z.literal("diagram"), spec: MermaidSpec }),
  z.object({ outputKind: z.literal("slide"), spec: SlideSpec }),
  z.object({ outputKind: z.literal("story"), spec: StorySpec }),
  z.object({ outputKind: z.literal("math"), spec: MafsSpec }),
]);
export type RenderResult = z.infer<typeof RenderResult>;

export const Suggestion = z.object({
  label: z.string(),
  prompt: z.string(),
  kind: z.enum(["refine", "pivot", "save"]).default("refine"),
});
export type Suggestion = z.infer<typeof Suggestion>;

export const SuggestionList = z.object({
  suggestions: z.array(Suggestion).max(4),
});
export type SuggestionList = z.infer<typeof SuggestionList>;

export const RenderResponse = z.object({
  outputKind: z.enum(OUTPUT_KINDS),
  spec: z.unknown(),
  suggestions: z.array(Suggestion).optional(),
});
export type RenderResponse = z.infer<typeof RenderResponse>;
