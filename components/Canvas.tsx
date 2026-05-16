"use client";

import { useEffect, useRef, useState } from "react";
import type { ParsedIntent, RenderResult, Suggestion } from "@/lib/elicit/schemas";
import type { ThreadItem } from "./Telepath";
import dynamic from "next/dynamic";
import VegaCanvas from "./renderers/VegaCanvas";
import MermaidCanvas from "./renderers/MermaidCanvas";
import SlideCanvas from "./renderers/SlideCanvas";

const Story = dynamic(() => import("./viz/Story"), { ssr: false });
const MafsRenderer = dynamic(
  () => import("./viz/renderers/MafsRenderer"),
  { ssr: false },
);
import {
  downloadBlob,
  downloadJson,
  downloadText,
  exportFilename,
  htmlElementToPng,
  htmlElementToSvgString,
  svgElementToPng,
  svgElementToString,
} from "@/lib/export/download";

type Phase =
  | "idle"
  | "thinking"
  | "asking"
  | "rendering"
  | "rendered"
  | "error";

type Props = {
  phase: Phase;
  thread: ThreadItem[];
  error: string | null;
  suggestions: Suggestion[];
  onSuggestionAction: (s: Suggestion) => void;
};

export default function Canvas({
  phase,
  thread,
  error: _error,
  suggestions,
  onSuggestionAction,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [thread]);

  if (thread.length === 0) {
    return (
      <section className="flex flex-1 flex-col overflow-hidden">
        <Header phase={phase} title="Type a vague intent — Telepath fills the gaps." subtitle="Ready" />
        <div ref={scrollRef} className="thin-scroll flex-1 overflow-auto p-6">
          <Empty />
        </div>
      </section>
    );
  }

  const last = thread[thread.length - 1];

  return (
    <section className="flex flex-1 flex-col overflow-hidden">
      <Header
        phase={phase}
        title={last.intent?.goal ?? last.prompt}
        subtitle={subtitleFor(phase)}
      />
      <div ref={scrollRef} className="thin-scroll flex-1 overflow-auto px-6 py-5">
        <div className="mx-auto flex max-w-4xl flex-col gap-6">
          {thread.map((item, i) => (
            <ThreadCard
              key={item.id}
              item={item}
              isLast={i === thread.length - 1}
              suggestions={i === thread.length - 1 ? suggestions : []}
              onSuggestionAction={onSuggestionAction}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function subtitleFor(phase: Phase): string {
  switch (phase) {
    case "thinking": return "Thinking";
    case "asking": return "One quick question";
    case "rendering": return "Rendering";
    case "rendered": return "Result";
    case "error": return "Error";
    default: return "Ready";
  }
}

function Header({ phase: _p, title, subtitle }: { phase: Phase; title: string; subtitle: string }) {
  return (
    <div className="border-b border-[var(--border)] px-5 py-3">
      <div className="text-[11px] uppercase tracking-wider text-zinc-500">{subtitle}</div>
      <div className="mt-1 line-clamp-2 text-[14px] text-zinc-200">{title}</div>
    </div>
  );
}

function ThreadCard({
  item,
  isLast,
  suggestions,
  onSuggestionAction,
}: {
  item: ThreadItem;
  isLast: boolean;
  suggestions: Suggestion[];
  onSuggestionAction: (s: Suggestion) => void;
}) {
  const compact = !isLast;
  return (
    <div className={"flex flex-col gap-3 " + (compact ? "opacity-70" : "")}>
      <div className="flex items-start gap-3">
        <Bubble role={item.isRefine ? "refine" : "user"} />
        <div className="flex-1">
          <div className="text-[11px] uppercase tracking-wider text-zinc-500">
            {item.isRefine ? "refine" : "you"}
          </div>
          <div className="mt-0.5 text-[14px] text-zinc-200">{item.prompt}</div>
        </div>
      </div>

      {item.intent ? <DimensionStrip intent={item.intent} /> : null}
      {item.liveData ? <LiveDataBadge data={item.liveData} /> : null}

      <div className="flex items-start gap-3">
        <Bubble role="ai" />
        <div className="flex-1">
          <div className="text-[11px] uppercase tracking-wider text-zinc-500">telepath</div>
          <div className="mt-2">
            {item.status === "thinking" ? (
              <div className="shimmer h-[300px] rounded-xl border border-[var(--border)]" />
            ) : null}
            {item.status === "rendering" ? (
              item.streamingText && item.streamingText.length > 0 ? (
                <StreamingPanel text={item.streamingText} />
              ) : (
                <div className="shimmer h-[300px] rounded-xl border border-[var(--border)]" />
              )
            ) : null}
            {item.status === "asking" && item.question && !item.question.skipOk ? (
              <div className="rounded-xl border border-[var(--asked)]/30 bg-[var(--asked)]/5 p-4">
                <div className="text-[11px] uppercase tracking-wider text-[var(--asked)]">
                  one quick thing
                </div>
                <div className="mt-1 text-[14px] text-zinc-100">{item.question.q}</div>
                <div className="mt-2 text-[11px] text-zinc-400">
                  Tap a chip in the composer below or type your answer.
                </div>
              </div>
            ) : null}
            {item.status === "error" ? (
              <ErrorCard
                message={item.error ?? "unknown"}
                details={item.errorDetails}
              />
            ) : null}
            {item.status === "rendered" && item.result ? (
              <>
                <RenderedResult result={item.result} title={item.intent?.goal ?? item.prompt} />
                {compact ? null : suggestions.length > 0 ? (
                  <SuggestionRow suggestions={suggestions} onPick={onSuggestionAction} />
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function Bubble({ role }: { role: "user" | "refine" | "ai" }) {
  const map = {
    user: { bg: "var(--accent)", letter: "Y" },
    refine: { bg: "var(--asked)", letter: "↻" },
    ai: { bg: "var(--memory)", letter: "T" },
  } as const;
  const { bg, letter } = map[role];
  return (
    <div
      className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold text-black"
      style={{ background: bg }}
    >
      {letter}
    </div>
  );
}

function LiveDataBadge({ data }: { data: NonNullable<ThreadItem["liveData"]> }) {
  return (
    <details className="ml-9 rounded-lg border border-[var(--memory)]/30 bg-[var(--memory)]/5 px-3 py-2 text-[11px] text-[var(--memory)]">
      <summary className="cursor-pointer list-none">
        <span className="font-mono">⚕ Hermes web search</span>
        <span className="ml-2 text-zinc-400">
          {data.ok ? `${data.facts.length} facts in ${(data.durationMs / 1000).toFixed(1)}s` : `failed: ${data.error?.slice(0, 80) ?? "unknown"}`}
        </span>
      </summary>
      <div className="mt-2 space-y-1 text-[11px] text-zinc-300">
        <div className="text-[10px] uppercase tracking-wider text-zinc-500">
          query: <span className="text-zinc-300">{data.query}</span>
        </div>
        {data.facts.length > 0 ? (
          <ul className="space-y-1">
            {data.facts.map((f, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-[var(--memory)]" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </details>
  );
}

function DimensionStrip({ intent }: { intent: ParsedIntent }) {
  if (intent.dimensions.length === 0) return null;
  return (
    <div className="ml-9 flex flex-wrap gap-1.5">
      {intent.dimensions.map((d) => {
        const color =
          d.source === "memory"
            ? "border-[var(--memory)]/40 text-[var(--memory)] bg-[var(--memory)]/10"
            : d.source === "asked"
              ? "border-[var(--asked)]/40 text-[var(--asked)] bg-[var(--asked)]/10"
              : d.source === "default"
                ? "border-[var(--default)]/40 text-[var(--default)] bg-zinc-700/10"
                : "border-[var(--missing)]/40 text-[var(--missing)] bg-[var(--missing)]/10";
        return (
          <span
            key={d.id}
            className={`rounded-full border px-2 py-0.5 text-[10px] ${color}`}
            title={d.why ?? ""}
          >
            {d.label}: {d.value ?? "—"}{" "}
            <span className="opacity-60">· {d.source}</span>
          </span>
        );
      })}
    </div>
  );
}

function RenderedResult({ result, title }: { result: RenderResult; title: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  return (
    <div className="flex flex-col gap-2">
      <ExportToolbar result={result} title={title} containerRef={containerRef} />
      <div ref={containerRef}>
        {result.outputKind === "chart" ? (
          <VegaCanvas spec={result.spec} />
        ) : result.outputKind === "diagram" ? (
          <MermaidCanvas source={result.spec.source} />
        ) : result.outputKind === "slide" ? (
          <SlideCanvas spec={result.spec} />
        ) : result.outputKind === "math" ? (
          <MafsRenderer spec={result.spec} />
        ) : (
          <Story spec={result.spec} />
        )}
      </div>
    </div>
  );
}

function ExportToolbar({
  result,
  title,
  containerRef,
}: {
  result: RenderResult;
  title: string;
  containerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const findSvg = (): SVGElement | null => {
    const root = containerRef.current;
    if (!root) return null;
    return root.querySelector("svg");
  };

  const findSlideRoot = (): HTMLElement | null => {
    const root = containerRef.current;
    if (!root) return null;
    return (root.firstElementChild as HTMLElement | null) ?? null;
  };

  const run = async (label: string, fn: () => Promise<void> | void) => {
    setBusy(label);
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const onSvg = () =>
    run("svg", () => {
      if (result.outputKind === "slide") {
        const root = findSlideRoot();
        if (!root) throw new Error("slide root not in DOM");
        const rect = root.getBoundingClientRect();
        const svgString = htmlElementToSvgString(
          root,
          Math.round(rect.width),
          Math.round(rect.height),
        );
        downloadText(
          exportFilename(result.outputKind, title, "svg"),
          svgString,
          "image/svg+xml",
        );
        return;
      }
      const svg = findSvg();
      if (!svg) throw new Error("no <svg> element found yet — try again in a moment");
      downloadText(
        exportFilename(result.outputKind, title, "svg"),
        svgElementToString(svg),
        "image/svg+xml",
      );
    });

  const onPng = () =>
    run("png", async () => {
      if (result.outputKind === "slide") {
        const root = findSlideRoot();
        if (!root) throw new Error("slide root not in DOM");
        const blob = await htmlElementToPng(root, 2);
        downloadBlob(exportFilename(result.outputKind, title, "png"), blob);
        return;
      }
      const svg = findSvg();
      if (!svg) throw new Error("no <svg> element found yet — try again in a moment");
      const blob = await svgElementToPng(svg, 2);
      downloadBlob(exportFilename(result.outputKind, title, "png"), blob);
    });

  const onJson = () =>
    run("json", () => {
      downloadJson(exportFilename(result.outputKind, title, "json"), result.spec);
    });

  const onMermaidSource = () =>
    run("mmd", () => {
      if (result.outputKind !== "diagram") return;
      downloadText(
        exportFilename(result.outputKind, title, "mmd"),
        result.spec.source,
        "text/plain",
      );
    });

  return (
    <div className="flex items-center justify-end gap-1.5 text-[10px] uppercase tracking-wider text-zinc-500">
      <span className="mr-1 text-[10px] text-zinc-600">export</span>
      <ExportBtn onClick={onSvg} active={busy === "svg"}>
        svg
      </ExportBtn>
      <ExportBtn onClick={onPng} active={busy === "png"}>
        png
      </ExportBtn>
      <ExportBtn onClick={onJson} active={busy === "json"}>
        {result.outputKind === "diagram" ? "json" : result.outputKind === "chart" ? "vega" : "json"}
      </ExportBtn>
      {result.outputKind === "diagram" ? (
        <ExportBtn onClick={onMermaidSource} active={busy === "mmd"}>
          .mmd
        </ExportBtn>
      ) : null}
      {err ? (
        <span className="ml-2 normal-case text-[10px] text-[var(--missing)]" title={err}>
          export failed
        </span>
      ) : null}
    </div>
  );
}

function ExportBtn({
  onClick,
  active,
  children,
}: {
  onClick: () => void;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={active}
      className={
        "rounded-full border px-2 py-0.5 transition " +
        (active
          ? "border-[var(--accent)]/50 bg-[var(--accent)]/10 text-[var(--accent)]"
          : "border-[var(--border)] bg-[var(--panel-2)] text-zinc-400 hover:border-[var(--accent-soft)] hover:text-zinc-100")
      }
    >
      {children}
    </button>
  );
}

function StreamingPanel({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-3">
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-wider text-zinc-500">
          streaming
        </div>
        <div className="text-[10px] text-zinc-600">{text.length} chars</div>
      </div>
      <pre className="thin-scroll mt-2 max-h-[280px] overflow-auto whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed text-zinc-400">
        {text}
      </pre>
    </div>
  );
}

function ErrorCard({
  message,
  details,
}: {
  message: string;
  details?: ThreadItem["errorDetails"];
}) {
  const hint =
    details?.hint ??
    "Kimi's response didn't parse cleanly. Rephrase the ask, or just hit Send again.";
  return (
    <div className="rounded-xl border border-[var(--missing)]/40 bg-[var(--missing)]/10 p-4 text-[13px] text-[var(--missing)]">
      <div className="flex items-center justify-between">
        <div className="font-semibold">
          Render failed{details?.phase ? ` (${details.phase})` : ""}
        </div>
        <span className="text-[10px] uppercase tracking-wider opacity-60">
          type to retry
        </span>
      </div>
      <p className="mt-1 text-[12px] text-[var(--missing)]/90">{hint}</p>
      {details?.outputKind ? (
        <div className="mt-2 text-[11px] text-[var(--missing)]/80">
          requested output: <span className="font-mono">{details.outputKind}</span>
        </div>
      ) : null}
      {details?.validationError ? (
        <details className="mt-3 text-[11px] opacity-80" open>
          <summary className="cursor-pointer">why it failed</summary>
          <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all text-[10px] leading-relaxed">
            {details.validationError}
          </pre>
        </details>
      ) : null}
      {details?.rawTail ? (
        <details className="mt-2 text-[11px] opacity-70">
          <summary className="cursor-pointer">last raw response</summary>
          <pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap break-all text-[10px]">
            {details.rawTail}
          </pre>
        </details>
      ) : null}
      <details className="mt-2 text-[11px] opacity-60">
        <summary className="cursor-pointer">stack</summary>
        <pre className="mt-2 max-h-24 overflow-auto whitespace-pre-wrap break-all text-[10px]">
          {message}
        </pre>
      </details>
    </div>
  );
}

function SuggestionRow({
  suggestions,
  onPick,
}: {
  suggestions: Suggestion[];
  onPick: (s: Suggestion) => void;
}) {
  return (
    <div className="mt-5">
      <div className="mb-2 text-[10px] uppercase tracking-wider text-zinc-500">
        Try next
      </div>
      <div className="flex flex-wrap gap-2">
        {suggestions.map((s, i) => (
          <button
            key={i}
            onClick={() => onPick(s)}
            className={
              "group rounded-xl border px-3.5 py-2 text-left transition " +
              (s.kind === "save"
                ? "border-[var(--memory)]/30 bg-[var(--memory)]/5 hover:border-[var(--memory)] hover:bg-[var(--memory)]/15"
                : s.kind === "pivot"
                  ? "border-[var(--accent)]/30 bg-[var(--accent)]/5 hover:border-[var(--accent)] hover:bg-[var(--accent)]/15"
                  : "border-[var(--border)] bg-[var(--panel-2)] hover:border-[var(--accent-soft)] hover:bg-[var(--panel)]")
            }
          >
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider">
              <span
                className={
                  s.kind === "save"
                    ? "text-[var(--memory)]"
                    : s.kind === "pivot"
                      ? "text-[var(--accent)]"
                      : "text-zinc-500"
                }
              >
                {s.kind}
              </span>
              <span className="text-zinc-200">{s.label}</span>
            </div>
            <div className="mt-0.5 line-clamp-2 text-[11px] text-zinc-500 group-hover:text-zinc-400">
              {s.prompt}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function Empty() {
  return (
    <div className="grid h-full place-items-center">
      <div className="max-w-md text-center">
        <div className="mb-4 text-3xl font-semibold tracking-tight text-zinc-100">
          It already knew.
        </div>
        <div className="mb-4 flex flex-wrap justify-center gap-2 text-[11px] text-zinc-500">
          <span className="rounded-full border border-[var(--border)] bg-[var(--panel-2)] px-2 py-0.5">
            chart · diagram · slide
          </span>
          <span className="rounded-full border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-2 py-0.5 text-[var(--accent)]">
            math · story (editable)
          </span>
          <span className="rounded-full border border-[var(--memory)]/40 bg-[var(--memory)]/10 px-2 py-0.5 text-[var(--memory)]">
            @agent prefix → Claude live loop
          </span>
        </div>
        <p className="text-[14px] leading-relaxed text-zinc-400">
          Drop a vague intent — a chart you wish existed, a diagram of something fuzzy, a
          one-screen brief. Telepath checks Hermes&apos; persistent memory first and only
          asks if it has to.
        </p>
        <p className="mt-3 text-[12px] text-zinc-600">
          Refine in the same composer. Each turn stacks below the last.
        </p>
      </div>
    </div>
  );
}
