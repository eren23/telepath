"use client";

import { useState, useEffect, useRef } from "react";
import type { Question } from "@/lib/elicit/schemas";

type Props = {
  phase: "idle" | "thinking" | "asking" | "rendering" | "rendered" | "error";
  question: Question | null;
  onSubmitAction: (text: string) => void;
  onAnswerChipAction: (value: string) => void;
  onSaveAction: () => void;
  canSave: boolean;
};

const SUGGESTIONS = [
  "show me how I've been spending my time",
  "diagram our auth flow",
  "infographic of this week's wins",
  "chart commit cadence by day",
  "@agent walk me through a damped harmonic oscillator",
];

export default function Composer({
  phase,
  question,
  onSubmitAction,
  onAnswerChipAction,
  onSaveAction,
  canSave,
}: Props) {
  const [text, setText] = useState("");
  const [custom, setCustom] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (phase === "idle" || phase === "rendered") setText("");
  }, [phase]);

  useEffect(() => {
    if (phase === "asking" && question) {
      setCustom("");
    }
  }, [phase, question]);

  const submit = () => {
    const t = text.trim();
    if (!t || phase === "thinking" || phase === "rendering") return;
    onSubmitAction(t);
  };

  return (
    <div className="border-t border-[var(--border)] bg-[var(--panel)] px-6 pb-5 pt-4">
      {phase === "asking" && question && !question.skipOk ? (
        <div className="mb-3 space-y-3">
          <div className="text-[12px] uppercase tracking-wider text-[var(--asked)]">
            One quick thing
          </div>
          <div className="text-[15px] text-zinc-100">{question.q}</div>
          <div className="flex flex-wrap gap-2">
            {(question.chips ?? []).map((c) => (
              <button
                key={c}
                onClick={() => onAnswerChipAction(c)}
                className="rounded-full border border-[var(--asked)]/40 bg-[var(--asked)]/10 px-3 py-1 text-[12px] text-[var(--asked)] transition hover:bg-[var(--asked)]/20"
              >
                {c}
              </button>
            ))}
            <input
              type="text"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && custom.trim()) onAnswerChipAction(custom.trim());
              }}
              placeholder="or type something else…"
              className="rounded-full border border-[var(--border)] bg-[var(--panel-2)] px-3 py-1 text-[12px] text-zinc-300 placeholder:text-zinc-600 outline-none focus:border-[var(--asked)]"
            />
          </div>
        </div>
      ) : null}

      <div className="flex items-end gap-3">
        <textarea
          ref={ref}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit();
            }
          }}
          rows={2}
          placeholder={
            phase === "rendered"
              ? "Refine this — or ask for something new.  (⌘↵ · @agent for a viz-graph)"
              : "What do you want to see?  (⌘↵ to send · prefix with @agent for a multi-node viz-graph)"
          }
          className="flex-1 resize-none rounded-xl border border-[var(--border)] bg-[var(--panel-2)] px-4 py-3 text-[14px] text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-[var(--accent-soft)]"
          disabled={phase === "thinking" || phase === "rendering"}
        />
        <div className="flex flex-col gap-2">
          <button
            onClick={submit}
            disabled={!text.trim() || phase === "thinking" || phase === "rendering"}
            className="rounded-xl bg-[var(--accent)] px-4 py-2 text-[13px] font-medium text-black transition hover:bg-[var(--accent-soft)] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {phase === "thinking" ? "Thinking…" : phase === "rendering" ? "Rendering…" : "Send"}
          </button>
          <button
            onClick={onSaveAction}
            disabled={!canSave}
            className="rounded-xl border border-[var(--border)] bg-[var(--panel-2)] px-4 py-2 text-[12px] text-zinc-300 transition hover:border-[var(--accent-soft)] hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
          >
            Save as skill
          </button>
        </div>
      </div>

      {phase === "idle" ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => onSubmitAction(s)}
              className="rounded-full border border-[var(--border)] bg-transparent px-3 py-1 text-[11px] text-zinc-500 transition hover:border-[var(--accent-soft)] hover:text-zinc-200"
            >
              {s}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
