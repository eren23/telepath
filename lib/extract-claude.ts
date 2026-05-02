import { chatJSON } from "@/lib/kimi";
import { z } from "zod";
import {
  buildTranscript,
  listProjects,
  readProjectTurns,
  type ProjectSummary,
} from "./claude-traces";

const SYSTEM = `You scan a Claude Code session transcript and extract DURABLE FACTS about the user — facts that would still be true a month from now and are useful for grounding future visualizations or assistants.

Rules:
- Focus on: projects the user is building, tools / stacks they prefer, recurring themes, decisions they've made, constraints they've stated, goals, hard preferences ("I always...", "I never...").
- Skip: ephemeral chat ("let me try this"), one-off mistakes, failed attempts, anything not character-defining.
- Never invent facts. If the transcript doesn't say it, don't claim it.
- Output 5–15 chips. Each chip:
  - "label": ≤ 6 words, headline form
  - "raw": one full sentence with the fact, ≤ 200 chars
  - "id": short kebab-case (e.g. "claude-codewm")
- Return JSON: { "chips": [{ "id": "...", "label": "...", "raw": "..." }, ...] }`;

const ChipSchema = z.object({
  id: z.string(),
  label: z.string(),
  raw: z.string(),
});

const OutSchema = z.object({
  chips: z.array(ChipSchema).min(1).max(20),
});

export type ExtractedChips = z.infer<typeof OutSchema>;

export async function extractFromProject(
  projectId: string,
  opts: { maxChars?: number } = {},
): Promise<ExtractedChips> {
  const turns = await readProjectTurns(projectId, opts);
  if (turns.length === 0) return { chips: [] };
  const transcript = buildTranscript(turns);
  const result = await chatJSON(OutSchema, [
    { role: "system", content: SYSTEM },
    {
      role: "user",
      content: `Project id: ${projectId}\n\nTranscript (most recent first):\n\n${transcript.slice(-50000)}`,
    },
  ], { temperature: 0.3 });
  return result;
}

export async function projectsSummary(): Promise<ProjectSummary[]> {
  return listProjects();
}
