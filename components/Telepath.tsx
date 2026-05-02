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
};

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

  const submitText = async (text: string) => {
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
    updateLast({ status: "rendering", intent: { ...it, dimensions: dims } });
    try {
      const r = await fetch("/api/render", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          goal: it.goal,
          outputKind: it.outputKind,
          dimensions: dims,
        }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error?.toString() ?? `render ${r.status}`);
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
      });
      setPhase("rendered");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      updateLast({ status: "error", error: msg });
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
