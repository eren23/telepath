"use client";

import { useEffect, useRef, useState } from "react";
import "katex/dist/katex.min.css";
import type { Concept, KatexSpec } from "@/lib/elicit/schemas";
import { useConceptHover } from "../ConceptPopover";

type Props = { spec: KatexSpec };

export default function KatexNode({ spec }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const ctx = useConceptHover();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!hostRef.current) return;
      try {
        const katex = (await import("katex")).default;
        if (cancelled || !hostRef.current) return;
        katex.render(spec.tex, hostRef.current, {
          throwOnError: false,
          displayMode: !spec.inline,
          output: "html",
        });
        setErr(null);
        if (ctx && spec.concepts && spec.concepts.length > 0) {
          wrapKatexConcepts(hostRef.current, spec.concepts, ctx);
        }
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [spec.tex, spec.inline, spec.concepts, ctx]);

  if (err) {
    return (
      <div className="rounded-xl border border-[var(--missing)]/40 bg-[var(--missing)]/10 p-4 text-[12px] text-[var(--missing)]">
        KaTeX render failed: {err}
      </div>
    );
  }

  return (
    <div
      className={
        "rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-6 text-zinc-100 " +
        (spec.inline ? "" : "overflow-x-auto")
      }
    >
      <div ref={hostRef} className="katex-host" />
    </div>
  );
}

// KaTeX HTML output renders math symbols as nested spans with class names like
// `mord mathnormal`. Identifier text (e.g. "γ", "ω", "A") sits in leaf spans.
// We walk text nodes, match anchors as exact text, and wrap them.
function wrapKatexConcepts(
  root: HTMLElement,
  concepts: Concept[],
  ctx: NonNullable<ReturnType<typeof useConceptHover>>,
) {
  const byText = new Map<string, Concept>();
  for (const c of concepts) {
    const anchors = c.anchors && c.anchors.length > 0 ? c.anchors : [c.label];
    for (const a of anchors) {
      const trimmed = (a ?? "").trim();
      if (!trimmed) continue;
      // Normalize common LaTeX command anchors to their rendered glyph.
      const glyph = normalizeKatexAnchor(trimmed);
      if (!byText.has(glyph)) byText.set(glyph, c);
    }
  }
  if (byText.size === 0) return;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let cur: Node | null = walker.nextNode();
  while (cur) {
    textNodes.push(cur as Text);
    cur = walker.nextNode();
  }

  for (const textNode of textNodes) {
    const value = (textNode.nodeValue ?? "").trim();
    if (!value) continue;
    const concept = byText.get(value);
    if (!concept) continue;
    // Wrap the closest .mord/.mathnormal ancestor so we hover the whole glyph.
    let target: HTMLElement | null = textNode.parentElement;
    while (target && !target.classList.contains("mord") && target.parentElement) {
      // walk up at most 2 levels
      const p = target.parentElement;
      if (p.classList.contains("mord")) {
        target = p;
        break;
      }
      target = p;
      if (target === root) break;
    }
    if (!target) continue;
    target.style.cursor = "help";
    target.style.borderBottom = "1px dotted var(--memory)";
    const enter = () => ctx.show(concept, target!.getBoundingClientRect());
    const leave = () => ctx.hide();
    target.addEventListener("mouseenter", enter);
    target.addEventListener("mouseleave", leave);
  }
}

function normalizeKatexAnchor(raw: string): string {
  // Map common LaTeX commands to their rendered glyphs so the LLM can use either.
  const map: Record<string, string> = {
    "\\gamma": "γ",
    "\\omega": "ω",
    "\\alpha": "α",
    "\\beta": "β",
    "\\delta": "δ",
    "\\epsilon": "ϵ",
    "\\theta": "θ",
    "\\lambda": "λ",
    "\\mu": "μ",
    "\\nu": "ν",
    "\\phi": "ϕ",
    "\\pi": "π",
    "\\sigma": "σ",
    "\\tau": "τ",
    "\\psi": "ψ",
    "\\chi": "χ",
    "\\Gamma": "Γ",
    "\\Omega": "Ω",
    "\\Phi": "Φ",
    "\\Psi": "Ψ",
    "\\partial": "∂",
    "\\infty": "∞",
  };
  return map[raw] ?? raw;
}
