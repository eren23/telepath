import { chatJSON } from "@/lib/kimi";
import { SuggestionList, type ResolvedIntent } from "./schemas";

const SYSTEM = `You suggest 3 follow-up actions a user might want immediately after a Telepath render.

Rules:
- Each suggestion has: label (≤ 5 words, casual, button-friendly), prompt (full instruction the system can execute), kind ("refine" | "pivot" | "save").
- "refine" = small tweak to current viz (change chart type, palette, granularity, add a node).
- "pivot" = related but different viz (different angle, different output kind).
- "save" = save / share. ALWAYS include exactly one "save" suggestion as the third entry, with prompt="Save as Hermes skill".
- Be concrete and reference the user's specific topic — never generic phrasing like "improve" or "explore more".
- Output JSON: { "suggestions": [{...},{...},{...}] }`;

export async function suggestFollowups(intent: ResolvedIntent, outputKind: string) {
  const dimsCompact = intent.dimensions
    .map((d) => `${d.label}=${d.value ?? "?"}`)
    .join("; ");
  const result = await chatJSON(SuggestionList, [
    { role: "system", content: SYSTEM },
    {
      role: "user",
      content: `Just rendered a ${outputKind}.\nGoal: ${intent.goal}\nResolved dims: ${dimsCompact}\n\nGive 3 follow-ups.`,
    },
  ], { temperature: 0.6 });
  return result.suggestions;
}
