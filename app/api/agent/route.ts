import { NextResponse } from "next/server";
import { z } from "zod";
import {
  query,
  createSdkMcpServer,
} from "@anthropic-ai/claude-agent-sdk";
import { StorySpec } from "@/lib/elicit/schemas";
import { ensureSession, getSession, setSessionStory } from "@/lib/viz/session";
import { makeTelepathTools, type SessionEvent } from "@/lib/agent/tools";
import { kimiFallback } from "@/lib/agent/fallback";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  prompt: z.string().min(1).max(2000),
  sessionId: z.string().min(4).max(64),
  prevStory: StorySpec.optional(),
});

const SYSTEM = `You are Telepath, an in-app agent that builds interactive viz-graphs.

You have these MCP tools (and only these):
- emit_story({story}): replace the running Story with a new multi-node viz-graph.
- patch_story({envelope}): apply minimal JSON-Patch envelopes to the running Story.
- search_arxiv({query}): get 3-5 web snippets via Hermes Agent.
- eval_math({expr, scope?}): mathjs evaluate.

Hard rules:
- Every turn must end with exactly ONE structural mutation: either emit_story (first turn or hard pivot) or patch_story (any tweak).
- Prefer patch_story over emit_story whenever the existing Story is mostly correct.
- Never narrate the JSON. Tools mutate state; don't paste the story object in chat.
- After your last tool call, write 1-2 short plain-text sentences summarizing what changed.
- Patches use JSON Pointers RELATIVE TO THE NODE (not the whole spec). Example: "/spec/controls/0/default" to change a control's default value of the first control in the node.
- VizNode kinds: vega, mermaid, mafs, katex, markdown.
- Mafs MathElement kinds: functionY, parametric, point, vector, text, latex.
  - Expressions are MATHJS strings. Use BARE functions: sin, cos, exp, log, sqrt, abs, pi, e. NEVER use "Math.exp" / "Math.cos" — that's JavaScript, mathjs rejects it. Use "^" for power, NEVER "**".
  - functionY iteration variable is "x". For time-snapshot expressions, drop "t" and just write the spatial form (e.g. "A * exp(-gamma * x) * sin(k * x)" not "A * exp(-gamma * t) * cos(k*x - omega*t)").
  - Use ASCII control names (gamma, omega, alpha — not γ/ω/α).
- Keep Story under 5 nodes.
- Do NOT invent new tool names. Do NOT use file-system tools (no Read, Write, Bash, etc.) — only the MCP tools listed above.

Concepts (hover-to-explain): every markdown / katex node SHOULD include 1-4 "concepts" — { "id", "label", "anchors": [strings], "explainer": "<2-3 sentences, $..$ math ok>" }. For markdown nodes anchors are plain text substrings ("damping", "wavenumber"); for katex nodes anchors are glyphs (γ, ω) or LaTeX commands (\\\\gamma, \\\\omega) — the renderer normalizes commands to glyphs.

Good emit_story example for "explain the 1D damped wave equation":
{
  "title": "The 1D Damped Wave",
  "nodes": [
    {"id": "intro", "kind": "markdown", "spec": {
      "md": "## Setup\\nWe study a vibrating string that loses energy over time via internal **damping**. The PDE balances acceleration against the **damping** force and the restoring tension.",
      "concepts": [
        {"id": "damping", "label": "damping", "anchors": ["damping"], "explainer": "Energy-loss rate, like friction for waves. Higher damping means the oscillation dies out faster as $x$ grows. Symbol: $\\\\gamma$."}
      ]
    }},
    {"id": "eq", "kind": "katex", "spec": {
      "tex": "\\\\frac{\\\\partial^2 u}{\\\\partial t^2} + 2\\\\gamma \\\\frac{\\\\partial u}{\\\\partial t} = c^2 \\\\frac{\\\\partial^2 u}{\\\\partial x^2}",
      "concepts": [
        {"id": "gamma", "label": "damping coefficient γ", "anchors": ["γ", "\\\\gamma"], "explainer": "Controls how fast energy drains. $\\\\gamma = 0$ recovers the lossless wave equation."},
        {"id": "c", "label": "wave speed c", "anchors": ["c"], "explainer": "Propagation speed of disturbances along the string."}
      ]
    }},
    {"id": "plot", "kind": "mafs", "spec": {
      "scene": "plot2d",
      "viewbox": {"x": [-1, 8], "y": [-1.5, 1.5]},
      "controls": [
        {"name": "A", "type": "range", "min": 0.1, "max": 2, "step": 0.05, "default": 1, "label": "Amplitude"},
        {"name": "gamma", "type": "range", "min": 0, "max": 1, "step": 0.02, "default": 0.3, "label": "Damping"},
        {"name": "k", "type": "range", "min": 0.5, "max": 6, "step": 0.1, "default": 2, "label": "Wavenumber"}
      ],
      "elements": [
        {"kind": "functionY", "expr": "A * exp(-gamma * x) * sin(k * x)", "color": "#7c8cff"}
      ]
    }},
    {"id": "intuition", "kind": "markdown", "spec": {
      "md": "Drag **amplitude** to stretch vertically; **damping** kills oscillation as x grows; **wavenumber** packs more cycles into the visible range.",
      "concepts": [
        {"id": "amplitude", "label": "amplitude", "anchors": ["amplitude"], "explainer": "Peak displacement at $x=0$ — the height of the leftmost crest before damping kicks in."},
        {"id": "wavenumber", "label": "wavenumber k", "anchors": ["wavenumber"], "explainer": "Spatial frequency in radians per unit length. Higher $k$ = tighter wave packing."}
      ]
    }}
  ]
}`;

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }
  const { prompt, sessionId, prevStory } = parsed.data;

  // Seed session with the client-provided prevStory if we don't have it yet.
  const seeded = ensureSession(sessionId, prevStory);
  if (prevStory && seeded.version === 0) {
    setSessionStory(sessionId, prevStory);
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };

      const onEvent = (ev: SessionEvent) => {
        if (ev.type === "story_set" || ev.type === "story_patched") {
          send("story", { story: ev.story, version: ev.version });
        } else if (ev.type === "search_arxiv") {
          send("tool_result", { tool: "search_arxiv", query: ev.query, results: ev.results });
        } else if (ev.type === "eval_math") {
          send("tool_result", { tool: "eval_math", expr: ev.expr, result: ev.result });
        }
      };

      const hasKey =
        !!process.env.ANTHROPIC_API_KEY ||
        !!process.env.CLAUDE_CODE_OAUTH_TOKEN;

      if (!hasKey) {
        send("fallback_start", { reason: "no ANTHROPIC_API_KEY" });
        await runFallback(prompt, sessionId, send, onEvent);
        controller.close();
        return;
      }

      try {
        send("start", { sessionId });
        const mcp = createSdkMcpServer({
          name: "telepath",
          tools: makeTelepathTools(sessionId, onEvent),
          alwaysLoad: true,
        });
        const session = getSession(sessionId);
        const contextPrompt = [
          prompt,
          "",
          session?.story
            ? `Current Story (version ${session.version}):\n${JSON.stringify(session.story).slice(0, 8000)}`
            : "No Story yet — start by calling emit_story to seed one.",
        ].join("\n");

        const q = query({
          prompt: contextPrompt,
          options: {
            systemPrompt: SYSTEM,
            mcpServers: { telepath: mcp },
            // Allow only our MCP tools — explicitly disable file/bash/etc.
            allowedTools: [
              "mcp__telepath__emit_story",
              "mcp__telepath__patch_story",
              "mcp__telepath__search_arxiv",
              "mcp__telepath__eval_math",
            ],
            permissionMode: "bypassPermissions",
            model: process.env.CLAUDE_AGENT_MODEL ?? "claude-sonnet-4-6",
            maxTurns: 8,
          },
        });

        let tokenUsage = 0;
        for await (const msg of q) {
          if (msg.type === "assistant") {
            const text = extractAssistantText(msg);
            if (text) send("chunk", { delta: text });
            const toolCalls = extractToolCalls(msg);
            for (const call of toolCalls) {
              send("tool_call", { name: call.name, input: call.input });
            }
          } else if (msg.type === "result") {
            const usage = (msg as { usage?: { input_tokens?: number; output_tokens?: number } }).usage;
            tokenUsage =
              (usage?.input_tokens ?? 0) +
              (usage?.output_tokens ?? 0);
          }
        }

        const final = getSession(sessionId);
        send("done", {
          via: "claude" as const,
          story: final?.story ?? null,
          version: final?.version ?? 0,
          tokens: tokenUsage || undefined,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[agent] claude error, falling back:", err);
        send("fallback_start", { reason: msg.slice(0, 200) });
        await runFallback(prompt, sessionId, send, onEvent);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-store, no-transform",
      connection: "keep-alive",
    },
  });
}

async function runFallback(
  prompt: string,
  sessionId: string,
  send: (event: string, data: unknown) => void,
  onEvent: (ev: SessionEvent) => void,
) {
  try {
    const prevStory = getSession(sessionId)?.story ?? null;
    const r = await kimiFallback({ prompt, prevStory });
    const entry = setSessionStory(sessionId, r.story);
    onEvent({
      type: r.envelope ? "story_patched" : "story_set",
      story: r.story,
      version: entry.version,
      ...(r.envelope ? { envelope: r.envelope } : {}),
    } as SessionEvent);
    send("done", {
      via: r.via,
      story: r.story,
      version: entry.version,
      envelope: r.envelope ?? null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    send("error", { error: msg });
  }
}

type LooseBlock = { type: string; text?: string; name?: string; input?: unknown };
type LooseAssistant = { message?: { content?: LooseBlock[] } };

function extractAssistantText(msg: LooseAssistant): string {
  const blocks = msg.message?.content ?? [];
  return blocks
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text ?? "")
    .join("");
}

function extractToolCalls(
  msg: LooseAssistant,
): Array<{ name: string; input: Record<string, unknown> }> {
  const blocks = msg.message?.content ?? [];
  return blocks
    .filter((b) => b.type === "tool_use" && typeof b.name === "string")
    .map((b) => ({
      name: b.name ?? "",
      input:
        b.input && typeof b.input === "object"
          ? (b.input as Record<string, unknown>)
          : {},
    }));
}
