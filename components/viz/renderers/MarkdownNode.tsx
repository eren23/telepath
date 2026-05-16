"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef } from "react";
import "katex/dist/katex.min.css";
import type { Concept, MarkdownSpec } from "@/lib/elicit/schemas";
import { useConceptHover } from "../ConceptPopover";

const ReactMarkdown = dynamic(() => import("react-markdown"), {
  ssr: false,
  loading: () => (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-6 text-[12px] text-zinc-500">
      loading…
    </div>
  ),
});

type Props = { spec: MarkdownSpec };

export default function MarkdownNode({ spec }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const ctx = useConceptHover();

  useEffect(() => {
    if (!ref.current || !ctx || !spec.concepts || spec.concepts.length === 0) {
      return;
    }
    const cleanup = wrapConceptAnchors(ref.current, spec.concepts, ctx);
    return cleanup;
  }, [spec.md, spec.concepts, ctx]);

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--panel-2)] px-6 py-5 text-[14px] leading-relaxed text-zinc-200">
      <article ref={ref} className="prose-telepath">
        <ReactMarkdown>{spec.md}</ReactMarkdown>
      </article>
    </div>
  );
}

// Walk text nodes under `root`, find substrings matching any concept anchor,
// and wrap matches with a span that fires concept hover events. Returns a
// cleanup function that detaches event listeners.
function wrapConceptAnchors(
  root: HTMLElement,
  concepts: Concept[],
  ctx: NonNullable<ReturnType<typeof useConceptHover>>,
): () => void {
  const listeners: Array<{
    el: HTMLElement;
    enter: () => void;
    leave: () => void;
  }> = [];

  const flat: { anchor: string; concept: Concept }[] = [];
  for (const c of concepts) {
    const anchors = c.anchors && c.anchors.length > 0 ? c.anchors : [c.label];
    for (const a of anchors) {
      const trimmed = (a ?? "").trim();
      if (trimmed.length >= 2 && trimmed.length <= 40) {
        flat.push({ anchor: trimmed, concept: c });
      }
    }
  }
  if (flat.length === 0) return () => {};

  // Longest-first to avoid sub-matches stealing larger phrases.
  flat.sort((a, b) => b.anchor.length - a.anchor.length);

  const escaped = flat.map((f) => escapeRegex(f.anchor));
  const pattern = new RegExp(`(${escaped.join("|")})`, "g");

  const byAnchor = new Map<string, Concept>();
  for (const { anchor, concept } of flat) {
    if (!byAnchor.has(anchor)) byAnchor.set(anchor, concept);
  }

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let cur: Node | null = walker.nextNode();
  while (cur) {
    textNodes.push(cur as Text);
    cur = walker.nextNode();
  }

  for (const textNode of textNodes) {
    const text = textNode.nodeValue ?? "";
    if (!text) continue;
    // String.split with a capturing group returns alternating non-match / match pieces.
    const parts = text.split(pattern);
    if (parts.length <= 1) continue;
    const frag = document.createDocumentFragment();
    for (let i = 0; i < parts.length; i++) {
      const piece = parts[i];
      // Even indices are non-matches; odd indices are captured matches.
      if (i % 2 === 0) {
        if (piece) frag.appendChild(document.createTextNode(piece));
        continue;
      }
      const concept = byAnchor.get(piece);
      if (!concept) {
        frag.appendChild(document.createTextNode(piece));
        continue;
      }
      const span = document.createElement("span");
      span.textContent = piece;
      span.className = "telepath-concept-anchor";
      span.style.cursor = "help";
      span.style.borderBottom = "1px dotted var(--memory)";
      const enter = () => ctx.show(concept, span.getBoundingClientRect());
      const leave = () => ctx.hide();
      span.addEventListener("mouseenter", enter);
      span.addEventListener("mouseleave", leave);
      listeners.push({ el: span, enter, leave });
      frag.appendChild(span);
    }
    textNode.parentNode?.replaceChild(frag, textNode);
  }

  return () => {
    for (const { el, enter, leave } of listeners) {
      el.removeEventListener("mouseenter", enter);
      el.removeEventListener("mouseleave", leave);
    }
  };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
