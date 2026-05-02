"use client";

type Props = {
  cold: boolean;
  onToggleColdAction: () => void;
  skillCount: number;
  threadCount: number;
  onClearThreadAction: () => void;
  onOpenSourcesAction: () => void;
  sourceCount: number;
};

export default function Header({
  cold,
  onToggleColdAction,
  skillCount,
  threadCount,
  onClearThreadAction,
  onOpenSourcesAction,
  sourceCount,
}: Props) {
  return (
    <header className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3">
      <div className="flex items-center gap-3">
        <Logo />
        <div>
          <div className="text-[15px] font-semibold tracking-tight">Telepath</div>
          <div className="text-[11px] text-zinc-500">the visualizer that already knows you</div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {threadCount > 0 ? (
          <button
            onClick={onClearThreadAction}
            className="rounded-full border border-[var(--border)] bg-[var(--panel-2)] px-3 py-1 text-[11px] text-zinc-400 transition hover:border-[var(--missing)]/40 hover:text-[var(--missing)]"
            title="Clear conversation"
          >
            Clear · {threadCount}
          </button>
        ) : null}
        <button
          onClick={onOpenSourcesAction}
          className="rounded-full border border-[var(--border)] bg-[var(--panel-2)] px-3 py-1 text-[11px] text-zinc-400 transition hover:border-[var(--accent-soft)] hover:text-zinc-200"
          title="Manage memory sources"
        >
          Sources · {sourceCount}
        </button>
        <span className="text-[11px] text-zinc-500">
          {skillCount} saved skill{skillCount === 1 ? "" : "s"}
        </span>
        <span
          className="rounded-full border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-2 py-0.5 text-[11px] text-[var(--accent)]"
          title="Kimi K2 (moonshotai/kimi-k2-0905) powers intent parsing, question selection, spec synthesis, follow-up suggestions, and refinement."
        >
          Kimi K2
        </span>
        <span
          className="rounded-full border border-[var(--memory)]/30 bg-[var(--memory)]/10 px-2 py-0.5 text-[11px] text-[var(--memory)]"
          title="Hermes Agent provides persistent memory, skill registration, web-search via subagent, FTS5 session memory, and cron scheduling."
        >
          ⚕ Hermes Agent
        </span>
        <button
          onClick={onToggleColdAction}
          aria-pressed={cold}
          className={
            "flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] transition " +
            (cold
              ? "border-[var(--missing)] bg-[var(--missing)]/10 text-[var(--missing)]"
              : "border-[var(--memory)]/40 bg-[var(--memory)]/10 text-[var(--memory)]")
          }
          title={cold ? "Pretending Hermes doesn't know you" : "Hermes memory active"}
        >
          <span
            className={
              "inline-block h-2 w-2 rounded-full " +
              (cold ? "bg-[var(--missing)]" : "bg-[var(--memory)]")
            }
          />
          {cold ? "Cold start" : "Memory active"}
        </button>
      </div>
    </header>
  );
}

function Logo() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 28 28"
      fill="none"
      aria-hidden
      suppressHydrationWarning
    >
      <defs suppressHydrationWarning>
        <radialGradient id="g" cx="50%" cy="50%" r="50%" suppressHydrationWarning>
          <stop offset="0%" stopColor="#7c8cff" suppressHydrationWarning />
          <stop offset="100%" stopColor="#5eead4" suppressHydrationWarning />
        </radialGradient>
      </defs>
      <circle cx="14" cy="14" r="12" stroke="url(#g)" strokeWidth="1.4" />
      <circle cx="14" cy="14" r="6" stroke="url(#g)" strokeWidth="1.4" />
      <circle cx="14" cy="14" r="1.6" fill="url(#g)" />
    </svg>
  );
}
