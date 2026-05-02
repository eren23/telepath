"use client";

import { useEffect, useState } from "react";
import type { MemoryChip } from "@/lib/hermes-memory";

type Props = {
  chips: MemoryChip[];
  usedChipIds: string[];
  cold: boolean;
};

export default function KnowledgeRail({ chips, usedChipIds, cold }: Props) {
  const [pulseTarget, setPulseTarget] = useState<string[]>([]);
  const [permanentlyUsed, setPermanentlyUsed] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (usedChipIds.length === 0) {
      setPulseTarget([]);
      return;
    }
    const timeouts: ReturnType<typeof setTimeout>[] = [];
    setPulseTarget([]);
    usedChipIds.forEach((id, idx) => {
      const t = setTimeout(() => {
        setPulseTarget((prev) => [...prev, id]);
        setPermanentlyUsed((prev) => {
          const next = new Set(prev);
          next.add(id);
          return next;
        });
      }, idx * 380);
      timeouts.push(t);
    });
    const clear = setTimeout(() => setPulseTarget([]), usedChipIds.length * 380 + 1700);
    timeouts.push(clear);
    return () => timeouts.forEach(clearTimeout);
  }, [usedChipIds]);

  return (
    <aside className="flex w-[280px] shrink-0 flex-col border-r border-[var(--border)] bg-[var(--panel)]">
      <div className="border-b border-[var(--border)] px-4 py-3">
        <div className="text-[11px] uppercase tracking-wider text-zinc-500">What I know about you</div>
        <div className="mt-1 text-[12px] text-zinc-400">
          {cold ? "Pretending we just met." : "Hermes + external memory"}
        </div>
      </div>
      <div className="thin-scroll flex-1 space-y-2 overflow-auto p-3">
        {cold || chips.length === 0 ? (
          <ReferenceChips reason={cold ? "cold" : "empty"} />
        ) : (
          chips.map((c) => {
            const pulsing = pulseTarget.includes(c.id);
            const used = permanentlyUsed.has(c.id);
            return (
              <div
                key={c.id}
                className={
                  "rounded-lg border px-3 py-2 text-[12px] leading-snug transition " +
                  (pulsing
                    ? "chip-glow text-zinc-100 "
                    : used
                      ? "border-[var(--memory)]/30 bg-[var(--memory)]/5 text-zinc-300 "
                      : "border-[var(--border)] bg-[var(--panel-2)] text-zinc-300 ")
                }
                title={c.raw}
              >
                <div className="mb-1 flex items-center gap-1.5 text-[9px] uppercase tracking-wider text-zinc-500">
                  <span
                    className={
                      "inline-block h-1.5 w-1.5 rounded-full " +
                      (c.origin === "external" ? "bg-[var(--accent)]" : "bg-[var(--memory)]")
                    }
                  />
                  {c.origin === "external" ? "external" : "hermes"}
                  {used ? <span className="ml-auto text-[var(--memory)]">used</span> : null}
                </div>
                {c.label}
              </div>
            );
          })
        )}
      </div>
      <div className="border-t border-[var(--border)] px-4 py-2 text-[10px] text-zinc-600">
        Hermes Agent persistent memory
      </div>
    </aside>
  );
}

const REFERENCE_LAYERS = [
  {
    layer: "Identity",
    file: "USER.md",
    examples: [
      "Role / team",
      "Preferred palette & granularity",
      "Default audience",
    ],
  },
  {
    layer: "Episodic",
    file: "MEMORY.md",
    examples: [
      "Recent decisions",
      "Active project names",
      "Tools you mentioned today",
    ],
  },
  {
    layer: "Procedural",
    file: "skills/",
    examples: [
      "Past renders saved as skills",
      "Replayable from any gateway",
    ],
  },
  {
    layer: "External",
    file: "JSON / HTTP / Claude traces",
    examples: [
      "Spider Chat notes",
      "Linear / Notion exports",
      "Conversation history",
    ],
  },
];

function ReferenceChips({ reason }: { reason: "cold" | "empty" }) {
  const headline =
    reason === "cold"
      ? "Pretending we just met. These are the layers Hermes would normally surface:"
      : "No sources connected yet. Hermes pulls memory from these layers — add a source from the header.";
  return (
    <div className="space-y-3">
      <div className="rounded border border-dashed border-[var(--border)] p-3 text-[11px] leading-relaxed text-zinc-400">
        {headline}
      </div>
      {REFERENCE_LAYERS.map((l) => (
        <div
          key={l.layer}
          className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)]/40 px-3 py-2 text-[11px] text-zinc-400"
        >
          <div className="mb-1 flex items-center gap-1.5 text-[9px] uppercase tracking-wider text-zinc-500">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-zinc-600" />
            {l.layer}
            <span className="ml-auto font-mono text-zinc-600">{l.file}</span>
          </div>
          <ul className="space-y-0.5 pl-2 text-zinc-500">
            {l.examples.map((e, i) => (
              <li key={i} className="before:mr-1 before:content-['—']">
                {e}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
