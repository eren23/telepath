"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  cold: boolean;
  onToggleColdAction: () => void;
  skillCount: number;
  threadCount: number;
  onClearThreadAction: () => void;
  onOpenSourcesAction: () => void;
  sourceCount: number;
  onExportChatAction?: (format: "json" | "markdown") => void;
  agentMode?: "claude-env" | "claude-cli" | "kimi-only" | null;
};

export default function Header({
  cold,
  onToggleColdAction,
  skillCount,
  threadCount,
  onClearThreadAction,
  onOpenSourcesAction,
  sourceCount,
  onExportChatAction,
  agentMode,
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
        {threadCount > 0 && onExportChatAction ? (
          <ExportChatMenu onExportAction={onExportChatAction} />
        ) : null}
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
        {agentMode ? (
          <span
            className={
              "rounded-full border px-2 py-0.5 text-[11px] " +
              (agentMode === "kimi-only"
                ? "border-[var(--asked)]/40 bg-[var(--asked)]/10 text-[var(--asked)]"
                : "border-[var(--accent-soft)]/40 bg-[var(--accent-soft)]/10 text-[var(--accent-soft)]")
            }
            title={
              agentMode === "claude-env"
                ? "@agent uses Claude Agent SDK authed via ANTHROPIC_API_KEY / CLAUDE_CODE_OAUTH_TOKEN. Kimi is the fallback."
                : agentMode === "claude-cli"
                  ? "@agent uses Claude Agent SDK authed via the local Claude Code CLI session. Kimi is the fallback if the SDK errors."
                  : "Neither ANTHROPIC_API_KEY nor the Claude Code CLI is available. @agent runs in Kimi-only mode (single-shot synthesis or JSON patch, no multi-turn tool use)."
            }
          >
            @agent:{" "}
            {agentMode === "claude-env"
              ? "Claude (env)"
              : agentMode === "claude-cli"
                ? "Claude (CLI)"
                : "Kimi only"}
          </span>
        ) : null}
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

function ExportChatMenu({
  onExportAction,
}: {
  onExportAction: (format: "json" | "markdown") => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const pick = (fmt: "json" | "markdown") => {
    setOpen(false);
    onExportAction(fmt);
  };

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="rounded-full border border-[var(--border)] bg-[var(--panel-2)] px-3 py-1 text-[11px] text-zinc-400 transition hover:border-[var(--accent-soft)] hover:text-zinc-200"
        title="Export this conversation"
      >
        Export ▾
      </button>
      {open ? (
        <div className="absolute right-0 top-full z-30 mt-1 w-44 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--panel)] shadow-lg">
          <button
            onClick={() => pick("json")}
            className="flex w-full items-center justify-between px-3 py-2 text-left text-[12px] text-zinc-200 hover:bg-[var(--panel-2)]"
          >
            <span>JSON</span>
            <span className="text-[10px] text-zinc-500">.json</span>
          </button>
          <button
            onClick={() => pick("markdown")}
            className="flex w-full items-center justify-between px-3 py-2 text-left text-[12px] text-zinc-200 hover:bg-[var(--panel-2)]"
          >
            <span>Markdown</span>
            <span className="text-[10px] text-zinc-500">.md</span>
          </button>
        </div>
      ) : null}
    </div>
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
