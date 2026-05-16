import { chatJSON } from "@/lib/kimi";
import { ParsedIntent, type ResolvedIntent } from "./schemas";
import type { MemorySnapshot } from "@/lib/hermes-memory";

const SYSTEM = `You are Telepath's refinement engine. The user just saw a rendered visualization and is asking for a tweak or pivot.

Your job: produce an UPDATED intent.

Output JSON shape (use these EXACT field names — camelCase, not snake_case):
{
  "goal": string,
  "outputKind": "chart" | "diagram" | "slide" | "math" | "story",
  "dimensions": [
    { "id": string, "label": string, "value": string | null,
      "source": "memory" | "asked" | "default" | "missing",
      "confidence": number, "why"?: string, "fromChipId"?: string }
  ]
}

Rules:
- KEEP every previously-resolved dimension unless the user's tweak explicitly contradicts it. Update only what the tweak demands.
- The output kind should stay the same UNLESS the user clearly asks for a different format.
- The "goal" should be a single short sentence reflecting the new combined intent, with specific subject names.
- Set source="asked" only for dimensions whose value changed because of the tweak. Otherwise preserve the previous source.
- Never invent dimension ids — only use ids that were in the previous intent or in the standard catalog.
- For "math" / "story" intents the dimensions array can stay empty if the catalog doesn't apply.`;

function memBlock(snap: MemorySnapshot): string {
  if (snap.cold) return "(cold start — no memory)";
  return [
    `User profile (USER.md):`,
    snap.user.trim() || "(empty)",
    "",
    `Memory chips:`,
    snap.chips.map((c) => `  - id=${c.id}: ${c.raw}`).join("\n") || "(none)",
  ].join("\n");
}

export async function refineIntent(
  prev: ResolvedIntent,
  tweak: string,
  snap: MemorySnapshot,
) {
  const prevBlock = [
    `Previous goal: ${prev.goal}`,
    `Previous output kind: ${prev.outputKind}`,
    `Previous dimensions:`,
    ...prev.dimensions.map(
      (d) => `  - ${d.id} ("${d.label}") = ${d.value ?? "?"} [source=${d.source}]`,
    ),
  ].join("\n");

  const result = await chatJSON(ParsedIntent, [
    { role: "system", content: SYSTEM },
    {
      role: "user",
      content: `${prevBlock}\n\nMemory:\n${memBlock(snap)}\n\nUser tweak: ${tweak}`,
    },
  ], { temperature: 0.4 });

  return result;
}
