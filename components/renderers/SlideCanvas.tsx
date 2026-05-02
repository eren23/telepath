"use client";

import type { SlideBlock, SlideSpec } from "@/lib/elicit/schemas";
import VegaCanvas from "./VegaCanvas";

type Props = { spec: SlideSpec };

const ACCENT_MAP: Record<string, string> = {
  indigo: "#7c8cff",
  emerald: "#5eead4",
  amber: "#fbbf24",
  rose: "#fb7185",
  sky: "#60a5fa",
};

export default function SlideCanvas({ spec }: Props) {
  const accent = ACCENT_MAP[spec.accent ?? ""] ?? spec.accent ?? "#7c8cff";
  return (
    <div
      className="aspect-[16/9] overflow-hidden rounded-2xl border border-[var(--border)] p-10"
      style={{
        background: `radial-gradient(circle at 20% 0%, ${accent}22, transparent 50%), var(--panel-2)`,
        boxShadow: `inset 0 0 0 1px ${accent}33`,
      }}
    >
      <div className="flex h-full flex-col justify-between gap-6">
        <div className="text-[11px] uppercase tracking-[0.25em]" style={{ color: accent }}>
          {spec.title}
        </div>
        <div className="grid flex-1 grid-cols-2 gap-6">
          {spec.blocks.map((b, i) => (
            <Block key={i} b={b} accent={accent} span={spec.blocks.length === 1 ? 2 : 1} />
          ))}
        </div>
      </div>
    </div>
  );
}

function Block({ b, accent, span }: { b: SlideBlock; accent: string; span: number }) {
  const cls = span === 2 ? "col-span-2" : "col-span-1";
  switch (b.type) {
    case "hero":
      return (
        <div className={`${cls} flex flex-col justify-end`}>
          <div className="text-[44px] font-semibold leading-tight tracking-tight text-zinc-50">
            {b.title}
          </div>
          {b.subtitle ? (
            <div className="mt-2 text-[16px] text-zinc-400">{b.subtitle}</div>
          ) : null}
        </div>
      );
    case "stat":
      return (
        <div className={`${cls} flex flex-col justify-center rounded-xl border border-[var(--border)] bg-[var(--panel)]/60 p-5`}>
          <div className="text-[11px] uppercase tracking-wider text-zinc-500">{b.label}</div>
          <div className="mt-1 text-[40px] font-semibold leading-none tracking-tight" style={{ color: accent }}>
            {b.value}
          </div>
          {b.delta ? (
            <div className="mt-1 text-[12px] text-zinc-400">{b.delta}</div>
          ) : null}
        </div>
      );
    case "quote":
      return (
        <div className={`${cls} flex flex-col justify-center`}>
          <div className="border-l-2 pl-4 text-[18px] italic leading-snug text-zinc-200" style={{ borderColor: accent }}>
            “{b.text}”
          </div>
          {b.attribution ? (
            <div className="mt-2 pl-4 text-[12px] text-zinc-500">— {b.attribution}</div>
          ) : null}
        </div>
      );
    case "bullets":
      return (
        <div className={`${cls} flex flex-col justify-center`}>
          {b.heading ? (
            <div className="mb-2 text-[12px] uppercase tracking-wider text-zinc-500">
              {b.heading}
            </div>
          ) : null}
          <ul className="space-y-2">
            {b.items.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-[14px] text-zinc-300">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: accent }} />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      );
    case "chart":
      return (
        <div className={`${cls} h-full overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--panel)]/60 p-2`}>
          <VegaCanvas spec={b.spec} />
        </div>
      );
  }
}
