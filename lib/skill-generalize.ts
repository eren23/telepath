import { askHermes } from "@/lib/hermes-runtime";
import type { ResolvedIntent, OutputKind } from "@/lib/elicit/schemas";

export type GeneralizedSkill = {
  slug: string;
  name: string;
  description: string;
  whenToUse: string[];
  tags: string[];
  slots: { id: string; label: string; example: string }[];
  rawHermesAnswer?: string;
};

const SYSTEM_INSTR = (intent: ResolvedIntent, outputKind: OutputKind) => `
You are a "skill distiller". You receive ONE concrete visualization a user just rendered, and produce a GENERIC, REUSABLE skill template that captures the underlying pattern.

Your job:
1. Look at the concrete intent and figure out what's the SPECIFIC instance (named projects, dates, numbers) vs. the ABSTRACT recipe (chart-of-X-by-Y).
2. Extract the abstract recipe as a reusable Hermes skill.
3. Identify the user-specific "slots" that should be parameters next time.

Rules:
- The skill must be USEFUL across many similar future asks, not just this one.
- Name + description should NOT contain proper nouns from the concrete instance (no "CodeWM", no "Sfumato", no specific dates) UNLESS the user's whole role is about that one project — in which case keep the most stable noun.
- Slots are the parameters that vary instance to instance. Each slot has: id (kebab), label (human), example (the value seen this time).
- "whenToUse" lists 3 patterns of future user requests this skill matches. Be concrete: phrasings the user might type.
- Tags: 3-5, lowercase, kebab.

Input:
Output kind: ${outputKind}
Concrete intent: ${intent.goal}
Resolved dimensions:
${intent.dimensions.map((d) => `- ${d.label}: ${d.value ?? "(none)"} [${d.source}]`).join("\n")}

Output STRICT JSON:
{
  "slug": "kebab-case ≤ 4 words",
  "name": "Title Case ≤ 6 words",
  "description": "abstract one-line ≤ 22 words",
  "whenToUse": ["pattern 1", "pattern 2", "pattern 3"],
  "tags": ["tag1","tag2","tag3"],
  "slots": [{"id": "slug-id", "label": "Human Label", "example": "value-from-this-render"}]
}

No prose, no markdown fences. JSON only.`;

export async function generalizeSkill(
  intent: ResolvedIntent,
  outputKind: OutputKind,
): Promise<{ ok: true; skill: GeneralizedSkill } | { ok: false; error: string; raw?: string }> {
  const r = await askHermes(SYSTEM_INSTR(intent, outputKind), {
    timeoutMs: 35_000,
  });
  if (!r.ok) {
    return { ok: false, error: r.error ?? "hermes call failed", raw: r.text };
  }
  const text = r.text.trim();
  const jsonStr = extractJson(text);
  if (!jsonStr) {
    return { ok: false, error: "no JSON object found in Hermes answer", raw: text };
  }
  try {
    const parsed = JSON.parse(jsonStr);
    const skill: GeneralizedSkill = {
      slug: sanitizeSlug(parsed.slug ?? parsed.name ?? "skill"),
      name: typeof parsed.name === "string" ? parsed.name : "Generalized skill",
      description: typeof parsed.description === "string" ? parsed.description : "",
      whenToUse: Array.isArray(parsed.whenToUse) ? parsed.whenToUse.slice(0, 6).map(String) : [],
      tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 6).map(String) : [],
      slots: Array.isArray(parsed.slots)
        ? parsed.slots.map((s: Record<string, unknown>) => ({
            id: sanitizeSlug(String(s.id ?? "slot")),
            label: String(s.label ?? s.id ?? "Slot"),
            example: String(s.example ?? ""),
          })).slice(0, 8)
        : [],
      rawHermesAnswer: text.slice(0, 1200),
    };
    return { ok: true, skill };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e), raw: text };
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
