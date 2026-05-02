"use client";

import { useState } from "react";
import type { SkillRecord } from "@/lib/hermes-memory";

type Props = {
  skills: SkillRecord[];
  recentSlug: string | null;
  onReplayAction: (s: SkillRecord) => void;
};

type Cadence = "daily" | "weekly" | "off";

const KIND_GLYPH: Record<string, string> = {
  chart: "▮▮▮",
  diagram: "◆━◆",
  slide: "▭",
};

export default function SkillsRail({ skills, recentSlug, onReplayAction }: Props) {
  return (
    <aside className="flex w-[280px] shrink-0 flex-col border-l border-[var(--border)] bg-[var(--panel)]">
      <div className="border-b border-[var(--border)] px-4 py-3">
        <div className="text-[11px] uppercase tracking-wider text-zinc-500">Saved skills</div>
        <div className="mt-1 text-[12px] text-zinc-400">
          {skills.length} replayable visualizations
        </div>
      </div>
      <div className="thin-scroll flex-1 space-y-2 overflow-auto p-3">
        {skills.length === 0 ? (
          <div className="rounded border border-dashed border-[var(--border)] p-3 text-[12px] text-zinc-500">
            Nothing yet. Save a render and it shows up here — and in Hermes&apos; skills folder.
          </div>
        ) : (
          skills.map((s) => (
            <SkillCard
              key={s.slug}
              skill={s}
              isRecent={s.slug === recentSlug}
              onReplayAction={() => onReplayAction(s)}
            />
          ))
        )}
      </div>
      <div className="border-t border-[var(--border)] px-4 py-2 text-[10px] text-zinc-600">
        Persisted to ~/.hermes/skills/telepath
      </div>
    </aside>
  );
}

function SkillCard({
  skill,
  isRecent,
  onReplayAction,
}: {
  skill: SkillRecord;
  isRecent: boolean;
  onReplayAction: () => void;
}) {
  const [cadence, setCadence] = useState<Cadence | null>(null);
  const [pending, setPending] = useState<Cadence | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const setSchedule = async (c: Cadence) => {
    setPending(c);
    setMsg(null);
    setErr(null);
    try {
      const r = await fetch("/api/skills/schedule", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug: skill.slug, cadence: c }),
      });
      const data = await r.json();
      if (!r.ok || !data.ok) {
        setErr(data.message || data.error || `HTTP ${r.status}`);
      } else {
        setCadence(c);
        setMsg(data.message);
        setTimeout(() => setMsg(null), 2200);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(null);
    }
  };

  return (
    <div
      className={
        "rounded-lg border border-[var(--border)] bg-[var(--panel-2)] p-3 text-[12px] leading-snug text-zinc-300 transition " +
        (isRecent ? "skill-glow " : "")
      }
    >
      <button onClick={onReplayAction} className="block w-full text-left">
        <div className="mb-1 flex items-center gap-2 text-[10px] uppercase tracking-wider text-zinc-500">
          <span className="font-mono text-[var(--accent)]">
            {KIND_GLYPH[skill.outputKind] ?? "·"}
          </span>
          <span>{skill.outputKind}</span>
          <span className="ml-auto text-zinc-600">replay ↻</span>
        </div>
        <div className="line-clamp-2 text-zinc-200">{skill.name}</div>
      </button>
      <div
        className="mt-2 select-all rounded border border-[var(--border)] bg-[var(--panel)]/60 px-2 py-1 font-mono text-[10px] text-[var(--memory)]"
        title="Run this from any Hermes gateway: CLI, Telegram, Discord, Slack."
      >
        $ hermes /telepath-{skill.slug}
      </div>
      <div className="mt-2 flex items-center gap-1.5 text-[10px]">
        <span className="text-zinc-500">schedule:</span>
        {(["daily", "weekly", "off"] as const).map((c) => {
          const active = cadence === c;
          const isPending = pending === c;
          return (
            <button
              key={c}
              onClick={() => setSchedule(c)}
              disabled={pending !== null}
              className={
                "rounded-full border px-2 py-0.5 transition " +
                (active
                  ? "border-[var(--memory)] bg-[var(--memory)]/15 text-[var(--memory)]"
                  : "border-[var(--border)] bg-[var(--panel)] text-zinc-400 hover:border-[var(--accent-soft)] hover:text-zinc-200") +
                (isPending ? " opacity-50" : "")
              }
            >
              {isPending ? "…" : c}
            </button>
          );
        })}
      </div>
      {msg ? (
        <div className="mt-1 text-[10px] text-[var(--memory)]">{msg}</div>
      ) : null}
      {err ? (
        <div className="mt-1 line-clamp-2 text-[10px] text-[var(--missing)]">{err}</div>
      ) : null}
    </div>
  );
}
