import { askHermes } from "@/lib/hermes-runtime";
import { chatJSON } from "@/lib/kimi";
import { z } from "zod";
import type { ResolvedIntent, OutputKind } from "@/lib/elicit/schemas";

export type GeneralizedSkill = {
  slug: string;
  name: string;
  description: string;
  whenToUse: string[];
  tags: string[];
  slots: { id: string; label: string; example: string }[];
  rawHermesAnswer?: string;
  source: "hermes" | "kimi-fallback";
};

const SYSTEM_INSTR = (intent: ResolvedIntent, outputKind: OutputKind) => `You are a "skill distiller". You receive ONE concrete visualization a user just rendered, and produce a GENERIC, REUSABLE skill template that captures the underlying pattern.

Your job:
1. Figure out what's the SPECIFIC instance (named projects, dates, numbers) vs. the ABSTRACT recipe.
2. Extract the abstract recipe.
3. Identify the user-specific "slots" that should be parameters next time.

Rules:
- The skill must work for many similar future asks, not just this one.
- Name + description should NOT contain proper nouns from the concrete instance unless the user's whole role IS that one project.
- Slots: parameters that vary instance to instance. Each: id (kebab), label (human), example (value seen this time).
- whenToUse: 3 concrete future-phrasing patterns the user might type.
- Tags: 3-5, lowercase, kebab.

Input:
Output kind: ${outputKind}
Concrete intent: ${intent.goal}
Resolved dimensions:
${intent.dimensions.map((d) => `- ${d.label}: ${d.value ?? "(none)"} [${d.source}]`).join("\n")}

CRITICAL: respond with a single raw JSON object. NO markdown code fences. NO preamble. NO explanation. JUST the JSON object, starting with { and ending with }.

{
  "slug": "kebab-case ≤ 4 words",
  "name": "Title Case ≤ 6 words",
  "description": "abstract one-line ≤ 22 words",
  "whenToUse": ["pattern 1", "pattern 2", "pattern 3"],
  "tags": ["tag1","tag2","tag3"],
  "slots": [{"id": "slug-id", "label": "Human Label", "example": "value-from-this-render"}]
}`;

function intoSkill(parsed: Record<string, unknown>, source: GeneralizedSkill["source"], rawAnswer?: string): GeneralizedSkill {
  return {
    slug: sanitizeSlug(String(parsed.slug ?? parsed.name ?? "skill")),
    name: typeof parsed.name === "string" ? parsed.name : "Generalized skill",
    description: typeof parsed.description === "string" ? parsed.description : "",
    whenToUse: Array.isArray(parsed.whenToUse) ? (parsed.whenToUse as unknown[]).slice(0, 6).map(String) : [],
    tags: Array.isArray(parsed.tags) ? (parsed.tags as unknown[]).slice(0, 6).map(String) : [],
    slots: Array.isArray(parsed.slots)
      ? (parsed.slots as Record<string, unknown>[]).map((s) => ({
          id: sanitizeSlug(String(s.id ?? "slot")),
          label: String(s.label ?? s.id ?? "Slot"),
          example: String(s.example ?? ""),
        })).slice(0, 8)
      : [],
    rawHermesAnswer: rawAnswer?.slice(0, 1200),
    source,
  };
}

const KimiSkillSchema = z.object({
  slug: z.string(),
  name: z.string(),
  description: z.string(),
  whenToUse: z.array(z.string()),
  tags: z.array(z.string()),
  slots: z.array(z.object({
    id: z.string(),
    label: z.string(),
    example: z.string(),
  })),
});

async function distillViaKimi(intent: ResolvedIntent, outputKind: OutputKind): Promise<GeneralizedSkill> {
  const parsed = await chatJSON(KimiSkillSchema, [
    { role: "system", content: SYSTEM_INSTR(intent, outputKind) },
    { role: "user", content: "Distill this." },
  ], { temperature: 0.3 });
  return intoSkill(parsed as unknown as Record<string, unknown>, "kimi-fallback");
}

export async function generalizeSkill(
  intent: ResolvedIntent,
  outputKind: OutputKind,
): Promise<{ ok: true; skill: GeneralizedSkill; via: "hermes" | "kimi-fallback"; hermesError?: string } | { ok: false; error: string; raw?: string }> {
  // Try Hermes first — that's the demo narrative.
  const r = await askHermes(SYSTEM_INSTR(intent, outputKind), { timeoutMs: 60_000 });
  if (r.ok) {
    const text = r.text.trim();
    const jsonStr = extractJson(text);
    if (jsonStr) {
      try {
        const parsed = JSON.parse(jsonStr);
        return { ok: true, skill: intoSkill(parsed, "hermes", text), via: "hermes" };
      } catch {
        // fall through to Kimi
      }
    }
  }

  // Hermes failed or unparseable — try Kimi K2 directly via JSON-mode (much more reliable).
  try {
    const skill = await distillViaKimi(intent, outputKind);
    return {
      ok: true,
      skill,
      via: "kimi-fallback",
      hermesError: r.ok ? "Hermes returned unparseable JSON" : (r.error ?? "Hermes call failed"),
    };
  } catch (e) {
    return {
      ok: false,
      error: `Hermes failed (${r.error ?? "unparseable"}); Kimi fallback also failed: ${e instanceof Error ? e.message : String(e)}`,
      raw: r.text,
    };
  }
}

function sanitizeSlug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "skill";
}

function extractJson(text: string): string | null {
  // 1. Fenced code block (```json ... ``` or ``` ... ```)
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced && fenced[1].trim().startsWith("{")) {
    const candidate = balancedFrom(fenced[1].trim());
    if (candidate) return candidate;
  }
  // 2. First balanced { ... } in the raw text
  return balancedFrom(text);
}

function balancedFrom(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inStr = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (escape) { escape = false; continue; }
    if (c === "\\") { escape = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}
