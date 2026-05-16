"use client";

import { useCallback, useEffect, useState } from "react";
import KnowledgeRail from "./KnowledgeRail";
import SkillsRail from "./SkillsRail";
import Composer from "./Composer";
import Canvas from "./Canvas";
import Header from "./Header";
import SourcesDrawer from "./SourcesDrawer";
import DistillModal from "./DistillModal";
import type { GeneralizedSkill } from "@/lib/skill-generalize";
import { downloadText, exportFilename } from "@/lib/export/download";
import { threadToJson, threadToMarkdown } from "@/lib/export/chat";
import { readSse } from "@/lib/sse-client";
import { applyEnvelopes } from "@/lib/viz/apply-patch";
import type { PatchEnvelope } from "@/lib/viz/patch-schema";
import type {
  Dimension,
  ParsedIntent,
  Question,
  RenderResult,
  Suggestion,
} from "@/lib/elicit/schemas";
import type { MemoryChip, SkillRecord } from "@/lib/hermes-memory";

type Phase =
  | "idle"
  | "thinking"
  | "asking"
  | "rendering"
  | "rendered"
  | "error";

type Snapshot = {
  cold: boolean;
  chips: MemoryChip[];
  skills: SkillRecord[];
  sources?: { hermes: number; external: number };
};

export type LiveDataInfo = {
  query: string;
  ok: boolean;
  facts: string[];
  durationMs: number;
  error?: string;
};

export type ThreadItem = {
  id: string;
  prompt: string;
  intent: ParsedIntent | null;
  result: RenderResult | null;
  usedChipIds: string[];
  suggestions: Suggestion[];
  isRefine: boolean;
  status: "thinking" | "asking" | "rendering" | "rendered" | "error";
  error?: string;
  question?: Question | null;
  liveData?: LiveDataInfo | null;
  streamingText?: string;
  streamingVia?: "stream" | "stream-fallback";
  errorDetails?: {
    phase?: string;
    outputKind?: string;
    validationError?: string | null;
    rawTail?: string | null;
    hint?: string;
  };
};

const STREAM_DISABLED =
  typeof process !== "undefined" && process.env.NEXT_PUBLIC_STREAM === "0";

export default function Telepath() {
  const [cold, setCold] = useState(false);
  const [snap, setSnap] = useState<Snapshot>({ cold: false, chips: [], skills: [] });
  const [phase, setPhase] = useState<Phase>("idle");
  const [thread, setThread] = useState<ThreadItem[]>([]);
  const [recentSkillSlug, setRecentSkillSlug] = useState<string | null>(null);
  const [usedChipIds, setUsedChipIds] = useState<string[]>([]);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [sourceCount, setSourceCount] = useState(0);
  const [distillOpen, setDistillOpen] = useState(false);
  const [generalizing, setGeneralizing] = useState(false);
  const [generalized, setGeneralized] = useState<GeneralizedSkill | null>(null);
  const [generalizeError, setGeneralizeError] = useState<string | null>(null);
  const [generalizeVia, setGeneralizeVia] = useState<"hermes" | "kimi-fallback" | null>(null);
  const [sessionId] = useState(
    () => `tp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
  );

  const lastItem = thread[thread.length - 1] ?? null;
  const intent = lastItem?.intent ?? null;
  const question = lastItem?.question ?? null;
  const result = lastItem?.result ?? null;
  const suggestions = lastItem?.suggestions ?? [];
  const error = lastItem?.error ?? null;

  const refreshSnapshot = useCallback(async (coldFlag: boolean) => {
    const [skillsR, sourcesR] = await Promise.all([
      fetch(`/api/skills?cold=${coldFlag ? "1" : "0"}`, { cache: "no-store" }),
      fetch(`/api/sources`, { cache: "no-store" }),
    ]);
    if (skillsR.ok) {
      const data = await skillsR.json();
      setSnap(data);
    }
    if (sourcesR.ok) {
      const data = await sourcesR.json();
      setSourceCount(data.sources?.length ?? 0);
    }
  }, []);

  useEffect(() => {
    refreshSnapshot(cold);
  }, [cold, refreshSnapshot]);

  const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

  const updateLast = useCallback((patch: Partial<ThreadItem>) => {
    setThread((prev) => {
      if (prev.length === 0) return prev;
      const next = [...prev];
      next[next.length - 1] = { ...next[next.length - 1], ...patch };
      return next;
    });
  }, []);

  const clearThread = () => {
    setThread([]);
    setUsedChipIds([]);
    setPhase("idle");
  };

  const exportChat = (format: "json" | "markdown") => {
    if (thread.length === 0) return;
    const firstGoal = thread[0].intent?.goal ?? thread[0].prompt ?? "chat";
    if (format === "json") {
      downloadText(
        exportFilename("chat", firstGoal, "json"),
        threadToJson(thread),
        "application/json",
      );
    } else {
      downloadText(
        exportFilename("chat", firstGoal, "md"),
        threadToMarkdown(thread),
        "text/markdown",
      );
    }
  };

  const submitText = async (text: string) => {
    const trimmed = text.trim();
    if (trimmed.startsWith("@agent ")) {
      return submitToAgent(trimmed.slice(7).trim());
    }
    const canRefine =
      phase === "rendered" && lastItem?.intent && lastItem?.result;
    if (canRefine) {
      return refineWith(text);
    }
    const item: ThreadItem = {
      id: newId(),
      prompt: text,
      intent: null,
      result: null,
      usedChipIds: [],
      suggestions: [],
      isRefine: false,
      status: "thinking",
    };
    setThread((prev) => [...prev, item]);
    setPhase("thinking");
    try {
      const r = await fetch("/api/elicit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, cold }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error?.toString() ?? `elicit ${r.status}`);
      }
      const data = await r.json();
      const it = data.intent as ParsedIntent;
      const q = data.question as Question;

      const chipsUsed = it.dimensions
        .map((d) => d.fromChipId)
        .filter((x): x is string => Boolean(x));
      setUsedChipIds(chipsUsed);
      updateLast({
        intent: it,
        question: q,
        usedChipIds: chipsUsed,
        status: q.skipOk ? "rendering" : "asking",
      });

      if (q.skipOk) {
        await renderResolved(it.dimensions, it);
      } else {
        setPhase("asking");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      updateLast({ status: "error", error: msg });
      setPhase("error");
    }
  };

  const refineWith = async (tweak: string) => {
    if (!intent) return;
    const item: ThreadItem = {
      id: newId(),
      prompt: tweak,
      intent: null,
      result: null,
      usedChipIds: [],
      suggestions: [],
      isRefine: true,
      status: "thinking",
    };
    setThread((prev) => [...prev, item]);
    setPhase("thinking");

    const prevResult = lastItem?.result;
    if (prevResult && prevResult.outputKind === "story") {
      const patched = await tryStoryPatch(prevResult.spec, tweak);
      if (patched) {
        updateLast({
          intent: {
            ...intent,
            goal: intent.goal,
            dimensions: intent.dimensions,
          },
          result: { outputKind: "story", spec: patched.story },
          suggestions: [],
          status: "rendered",
          streamingText: "",
        });
        setPhase("rendered");
        return;
      }
    }

    try {
      const r = await fetch("/api/refine", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prev: {
            goal: intent.goal,
            outputKind: intent.outputKind,
            dimensions: intent.dimensions,
          },
          tweak,
          cold,
        }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error?.toString() ?? `refine ${r.status}`);
      }
      const { intent: nextIntent } = await r.json();
      const askedIds = nextIntent.dimensions
        .filter((d: Dimension) => d.source === "asked")
        .map((d: Dimension) => d.id);
      const chipsUsed = nextIntent.dimensions
        .map((d: Dimension) => d.fromChipId)
        .filter((x: string | undefined): x is string => Boolean(x));
      setUsedChipIds([...askedIds, ...chipsUsed]);
      updateLast({
        intent: nextIntent,
        usedChipIds: [...askedIds, ...chipsUsed],
        status: "rendering",
      });
      await renderResolved(nextIntent.dimensions, nextIntent);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      updateLast({ status: "error", error: msg });
      setPhase("error");
    }
  };

  const submitToAgent = async (cleanText: string) => {
    if (cleanText.length === 0) return;
    const wasRendered = phase === "rendered" && lastItem?.result;
    const prevStory =
      lastItem?.result?.outputKind === "story" ? lastItem.result.spec : undefined;
    const item: ThreadItem = {
      id: newId(),
      prompt: `@agent ${cleanText}`,
      intent: null,
      result: null,
      usedChipIds: [],
      suggestions: [],
      isRefine: !!wasRendered,
      status: "rendering",
      streamingText: "",
    };
    setThread((prev) => [...prev, item]);
    setPhase("rendering");

    try {
      const r = await fetch("/api/agent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt: cleanText,
          sessionId,
          prevStory,
        }),
      });
      if (!r.ok || !r.body) {
        const errBody = await r.text().catch(() => "");
        throw new Error(`agent ${r.status}${errBody ? `: ${errBody.slice(0, 200)}` : ""}`);
      }

      let acc = "";
      let finalStory: import("@/lib/elicit/schemas").StorySpec | null = null;
      let finalVia: "claude" | "kimi-fallback" | null = null;
      let fellBack = false;

      for await (const { event, data } of readSse(r)) {
        if (event === "chunk") {
          const d = (data as { delta?: string } | null)?.delta ?? "";
          if (d) {
            acc += d;
            updateLast({ streamingText: acc });
          }
        } else if (event === "story") {
          const s = (data as { story?: import("@/lib/elicit/schemas").StorySpec } | null)?.story;
          if (s) {
            finalStory = s;
            updateLast({
              intent: {
                goal: cleanText,
                outputKind: "story",
                dimensions: [],
              },
              result: { outputKind: "story", spec: s } as RenderResult,
            });
          }
        } else if (event === "fallback_start") {
          fellBack = true;
          acc += "\n— claude unavailable, falling back to Kimi —\n";
          updateLast({ streamingText: acc });
        } else if (event === "done") {
          const d = data as {
            via?: "claude" | "kimi-fallback";
            story?: import("@/lib/elicit/schemas").StorySpec;
          } | null;
          finalVia = d?.via ?? null;
          if (d?.story) finalStory = d.story;
        } else if (event === "error") {
          const msg = (data as { error?: string } | null)?.error ?? "agent error";
          throw new Error(msg);
        }
      }

      if (!finalStory) {
        throw new Error("agent ended without a story");
      }

      updateLast({
        intent: {
          goal: cleanText,
          outputKind: "story",
          dimensions: [],
        },
        result: { outputKind: "story", spec: finalStory } as RenderResult,
        suggestions: [],
        status: "rendered",
        streamingText: "",
        streamingVia:
          finalVia === "claude" && !fellBack ? "stream" : "stream-fallback",
      });
      setPhase("rendered");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      updateLast({ status: "error", error: msg, streamingText: "" });
      setPhase("error");
    }
  };

  const tryStoryPatch = async (
    prevStory: Extract<RenderResult, { outputKind: "story" }>["spec"],
    tweak: string,
  ) => {
    try {
      const r = await fetch("/api/refine?mode=patch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prevStory, tweak }),
      });
      if (!r.ok) return null;
      const data = (await r.json()) as {
        envelope?: PatchEnvelope[];
        explanation?: string;
        error?: unknown;
      };
      if (!data.envelope || data.envelope.length === 0) return null;
      const story = applyEnvelopes(prevStory, data.envelope);
      return { story, explanation: data.explanation };
    } catch (e) {
      console.warn("[telepath] story-patch fallback:", e);
      return null;
    }
  };

  const onSuggestion = (s: Suggestion) => {
    if (s.kind === "save") {
      saveSkill();
      return;
    }
    submitText(s.prompt);
  };

  const answerChip = async (value: string) => {
    if (!intent || !question?.dim) return;
    const dim = question.dim;
    const patched: Dimension[] = intent.dimensions.map((d) =>
      d.id === dim
        ? { ...d, value, source: "asked", confidence: 0.95, why: "user answered" }
        : d,
    );
    await renderResolved(patched, intent);
  };

  const renderResolved = async (dims: Dimension[], it: ParsedIntent) => {
    setPhase("rendering");
    updateLast({
      status: "rendering",
      intent: { ...it, dimensions: dims },
      streamingText: "",
    });
    const body = JSON.stringify({
      goal: it.goal,
      outputKind: it.outputKind,
      dimensions: dims,
      external: it.external,
      externalReason: it.externalReason,
    });
    try {
      if (STREAM_DISABLED) {
        const r = await fetch("/api/render", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body,
        });
        if (!r.ok) {
          const errBody = await r.json().catch(() => ({}));
          throw new Error(errBody.error?.toString() ?? `render ${r.status}`);
        }
        const data = (await r.json()) as RenderResult & {
          suggestions?: Suggestion[];
          liveData?: LiveDataInfo | null;
        };
        updateLast({
          intent: { ...it, dimensions: dims },
          result: { outputKind: data.outputKind, spec: data.spec } as RenderResult,
          suggestions: data.suggestions ?? [],
          liveData: data.liveData ?? null,
          status: "rendered",
          streamingText: "",
        });
        setPhase("rendered");
        return;
      }

      const r = await fetch("/api/render?stream=1", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      });
      if (!r.ok || !r.body) {
        const errBody = await r.text().catch(() => "");
        throw new Error(`render ${r.status}${errBody ? `: ${errBody.slice(0, 200)}` : ""}`);
      }

      type StreamDone = {
        outputKind: RenderResult["outputKind"];
        spec: unknown;
        suggestions?: Suggestion[];
        liveData?: LiveDataInfo | null;
        via?: "stream" | "stream-fallback";
      };

      let acc = "";
      let final: StreamDone | null = null;
      let streamErr: string | null = null;

      for await (const { event, data } of readSse(r)) {
        if (event === "chunk") {
          const d = (data as { delta?: string } | null)?.delta ?? "";
          if (d) {
            acc += d;
            updateLast({ streamingText: acc });
          }
        } else if (event === "done") {
          final = data as StreamDone;
        } else if (event === "stream_error") {
          streamErr = (data as { message?: string } | null)?.message ?? "stream parse failed";
        } else if (event === "error") {
          const d = data as {
            error?: string;
            phase?: string;
            outputKind?: string;
            validationError?: string | null;
            rawTail?: string | null;
            hint?: string;
          } | null;
          updateLast({
            status: "error",
            error: d?.error ?? "render error",
            streamingText: "",
            errorDetails: {
              phase: d?.phase,
              outputKind: d?.outputKind,
              validationError: d?.validationError,
              rawTail: d?.rawTail,
              hint: d?.hint,
            },
          });
          setPhase("error");
          return;
        }
      }

      if (!final) {
        throw new Error(streamErr ?? "stream ended without result");
      }

      updateLast({
        intent: { ...it, dimensions: dims },
        result: { outputKind: final.outputKind, spec: final.spec } as RenderResult,
        suggestions: final.suggestions ?? [],
        liveData: final.liveData ?? null,
        status: "rendered",
        streamingText: "",
        streamingVia: final.via,
      });
      setPhase("rendered");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      updateLast({ status: "error", error: msg, streamingText: "" });
      setPhase("error");
    }
  };

  const saveSkill = async () => {
    if (!intent || !result) return;
    setDistillOpen(true);
    setGeneralizing(true);
    setGeneralized(null);
    setGeneralizeError(null);
    setGeneralizeVia(null);
    try {
      const r = await fetch("/api/skills/generalize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          intent: {
            goal: intent.goal,
            outputKind: intent.outputKind,
            dimensions: intent.dimensions,
          },
          outputKind: result.outputKind,
        }),
      });
      const data = await r.json();
      if (data.ok) {
        setGeneralized(data.skill);
        setGeneralizeVia(data.via ?? "hermes");
        if (data.hermesError) {
          // Soft note that we used the fallback — not a blocking error.
          console.warn("[telepath] hermes distill fallback:", data.hermesError);
        }
      } else {
        setGeneralizeError(data.error ?? "unknown");
      }
    } catch (e) {
      setGeneralizeError(e instanceof Error ? e.message : String(e));
    } finally {
      setGeneralizing(false);
    }
  };

  const persistSkill = async (payload: {
    slug: string;
    name: string;
    description: string;
    whenToUse: string[];
    tags: string[];
  }) => {
    if (!intent || !result) return;
    const r = await fetch("/api/save-skill", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        slug: payload.slug,
        name: payload.name,
        description: payload.description,
        outputKind: result.outputKind,
        spec: result.spec,
        dimensions: intent.dimensions,
        whenToUse: payload.whenToUse,
        tags: payload.tags,
      }),
    });
    if (r.ok) {
      setRecentSkillSlug(payload.slug);
      setDistillOpen(false);
      await refreshSnapshot(cold);
      setTimeout(() => setRecentSkillSlug(null), 2200);
    }
  };

  const replaySkill = (s: SkillRecord) => {
    const item: ThreadItem = {
      id: newId(),
      prompt: `(replay) ${s.name}`,
      intent: {
        goal: s.name,
        outputKind: s.outputKind,
        dimensions: (s.dimensions as Dimension[]) ?? [],
      },
      result: { outputKind: s.outputKind, spec: s.spec } as RenderResult,
      usedChipIds: [],
      suggestions: [],
      isRefine: false,
      status: "rendered",
      question: { skipOk: true },
    };
    setThread((prev) => [...prev, item]);
    setUsedChipIds([]);
    setPhase("rendered");
  };

  return (
    <div className="flex h-screen w-screen flex-col">
      <Header
        cold={cold}
        onToggleColdAction={() => setCold((v) => !v)}
        skillCount={snap.skills.length}
        threadCount={thread.length}
        onClearThreadAction={clearThread}
        onOpenSourcesAction={() => setSourcesOpen(true)}
        sourceCount={sourceCount}
        onExportChatAction={exportChat}
      />
      <div className="flex flex-1 overflow-hidden">
        <KnowledgeRail
          chips={snap.chips}
          usedChipIds={usedChipIds}
          cold={cold}
        />
        <main className="flex flex-1 flex-col overflow-hidden">
          <Canvas
            phase={phase}
            thread={thread}
            error={error}
            suggestions={suggestions}
            onSuggestionAction={onSuggestion}
          />
          <Composer
            phase={phase}
            question={question}
            onSubmitAction={submitText}
            onAnswerChipAction={answerChip}
            onSaveAction={saveSkill}
            canSave={phase === "rendered" && !!result}
          />
        </main>
        <SkillsRail
          skills={snap.skills}
          recentSlug={recentSkillSlug}
          onReplayAction={replaySkill}
        />
      </div>
      <SourcesDrawer
        open={sourcesOpen}
        onCloseAction={() => setSourcesOpen(false)}
        onChangedAction={() => refreshSnapshot(cold)}
      />
      <DistillModal
        open={distillOpen}
        initialSlug={intent ? slugify(intent.goal).slice(0, 48) : "skill"}
        initialName={
          intent
            ? intent.goal.length > 100
              ? intent.goal.slice(0, 97) + "…"
              : intent.goal
            : ""
        }
        initialDescription={
          intent
            ? intent.goal.length > 250
              ? intent.goal.slice(0, 247) + "…"
              : intent.goal
            : ""
        }
        generalizing={generalizing}
        generalized={generalized}
        generalizeError={generalizeError}
        via={generalizeVia}
        onCloseAction={() => setDistillOpen(false)}
        onSaveAction={persistSkill}
      />
    </div>
  );
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "viz";
}
