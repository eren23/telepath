import { z } from "zod";
import { tool, type SdkMcpToolDefinition } from "@anthropic-ai/claude-agent-sdk";
import { create, all } from "mathjs";
import { askHermes, isHermesAvailable } from "@/lib/hermes-runtime";
import { StorySpec } from "@/lib/elicit/schemas";
import { PatchEnvelope } from "@/lib/viz/patch-schema";
import { applyEnvelopes, PatchError } from "@/lib/viz/apply-patch";
import { getSession, setSessionStory } from "@/lib/viz/session";

const math = create(all);

export type SessionEvent =
  | { type: "story_set"; story: z.infer<typeof StorySpec>; version: number }
  | { type: "story_patched"; story: z.infer<typeof StorySpec>; version: number; envelope: z.infer<typeof PatchEnvelope>[] }
  | { type: "search_arxiv"; query: string; results: string[] }
  | { type: "eval_math"; expr: string; result: number | string };

export type AgentSink = (ev: SessionEvent) => void;

const EMIT_STORY_SCHEMA = {
  story: StorySpec,
};

const PATCH_STORY_SCHEMA = {
  envelope: z.array(PatchEnvelope).min(1).max(20),
};

const SEARCH_ARXIV_SCHEMA = {
  query: z.string().min(2).max(200),
};

const EVAL_MATH_SCHEMA = {
  expr: z.string().min(1).max(400),
  scope: z.record(z.string(), z.number()).optional(),
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function makeTelepathTools(sessionId: string, sink: AgentSink): SdkMcpToolDefinition<any>[] {
  return [
    tool(
      "emit_story",
      "Replace the running Telepath Story with a new multi-node viz-graph. Use ONLY at the start of a turn when the previous Story is missing or the user pivoted hard. Prefer patch_story for incremental changes.",
      EMIT_STORY_SCHEMA,
      async ({ story }) => {
        const parsed = StorySpec.parse(story);
        const entry = setSessionStory(sessionId, parsed);
        sink({ type: "story_set", story: parsed, version: entry.version });
        return {
          content: [
            {
              type: "text",
              text: `Story emitted: ${parsed.nodes.length} nodes (${parsed.nodes.map((n) => `${n.kind}#${n.id}`).join(", ")}). version=${entry.version}.`,
            },
          ],
        };
      },
    ),
    tool(
      "patch_story",
      "Apply minimal JSON-Patch envelopes to the running Story. Prefer this over emit_story for any non-structural tweak.",
      PATCH_STORY_SCHEMA,
      async ({ envelope }) => {
        const current = getSession(sessionId)?.story;
        if (!current) {
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: "No Story in session yet — call emit_story first, then patch_story on the next turn.",
              },
            ],
          };
        }
        try {
          const next = applyEnvelopes(current, envelope);
          const entry = setSessionStory(sessionId, next);
          sink({
            type: "story_patched",
            story: next,
            version: entry.version,
            envelope,
          });
          return {
            content: [
              {
                type: "text",
                text: `Patched. ${envelope.length} envelope op(s) applied. version=${entry.version}.`,
              },
            ],
          };
        } catch (e) {
          const msg =
            e instanceof PatchError
              ? `${e.message} (envelope op=${e.envelope.op})`
              : e instanceof Error
                ? e.message
                : String(e);
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: `Patch rejected: ${msg}`,
              },
            ],
          };
        }
      },
    ),
    tool(
      "search_arxiv",
      "Search the open web (via Hermes Agent) for short factual snippets. Useful for grounding a Story node in current literature or benchmarks.",
      SEARCH_ARXIV_SCHEMA,
      async ({ query }) => {
        if (!(await isHermesAvailable())) {
          return {
            isError: true,
            content: [
              { type: "text", text: "Hermes web search unavailable in this environment." },
            ],
          };
        }
        const r = await askHermes(`Web search task: ${query}\n\nReturn 3-5 factual snippets, one per line, each ≤ 25 words.`, {
          toolsets: ["web"],
          timeoutMs: 45_000,
        });
        if (!r.ok) {
          return {
            isError: true,
            content: [{ type: "text", text: `Hermes error: ${r.error ?? "unknown"}` }],
          };
        }
        const lines = r.text
          .split(/\n+/)
          .map((l) => l.replace(/^[\s•\-\*\d.\)]+/, "").trim())
          .filter((l) => l.length > 0 && l.length < 280 && l.split(/\s+/).length >= 4)
          .slice(0, 5);
        sink({ type: "search_arxiv", query, results: lines });
        return {
          content: [
            {
              type: "text",
              text: lines.length
                ? `Snippets:\n${lines.map((l) => `- ${l}`).join("\n")}`
                : "Search returned no usable snippets.",
            },
          ],
        };
      },
    ),
    tool(
      "eval_math",
      "Evaluate a mathjs expression (e.g. integral approximations, parameter sweeps) and return the numeric result. Use to ground claims in concrete numbers.",
      EVAL_MATH_SCHEMA,
      async ({ expr, scope }) => {
        try {
          const value = math.evaluate(expr, scope ?? {});
          const text = typeof value === "object" ? math.format(value) : String(value);
          sink({
            type: "eval_math",
            expr,
            result: typeof value === "number" ? value : text,
          });
          return { content: [{ type: "text", text: `${expr} = ${text}` }] };
        } catch (e) {
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: `eval_math failed: ${e instanceof Error ? e.message : String(e)}`,
              },
            ],
          };
        }
      },
    ),
  ];
}
