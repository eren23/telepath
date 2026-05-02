import { z } from "zod";

export const OUTPUT_KINDS = ["chart", "diagram", "slide"] as const;
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

export const VegaSpec = z.looseObject({
  $schema: z.string().optional(),
  description: z.string().optional(),
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

export const ResolvedIntent = z.object({
  goal: z.string(),
  outputKind: z.enum(OUTPUT_KINDS),
  dimensions: z.array(Dimension),
  liveDataQuery: z.string().nullable().optional(),
  liveFacts: z.array(z.string()).optional(),
});
export type ResolvedIntent = z.infer<typeof ResolvedIntent>;

export const RenderResult = z.discriminatedUnion("outputKind", [
  z.object({ outputKind: z.literal("chart"), spec: VegaSpec }),
  z.object({ outputKind: z.literal("diagram"), spec: MermaidSpec }),
  z.object({ outputKind: z.literal("slide"), spec: SlideSpec }),
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
