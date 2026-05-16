"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import "katex/dist/katex.min.css";
import type { Concept } from "@/lib/elicit/schemas";

type HoverState = {
  concept: Concept;
  x: number;
  y: number;
};

type Ctx = {
  show: (concept: Concept, anchorRect: DOMRect) => void;
  hide: () => void;
};

const ConceptCtx = createContext<Ctx | null>(null);

export function useConceptHover(): Ctx | null {
  return useContext(ConceptCtx);
}

export function ConceptProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<HoverState | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const ctx = useMemo<Ctx>(
    () => ({
      show: (concept, rect) => {
        if (hideTimer.current) {
          clearTimeout(hideTimer.current);
          hideTimer.current = null;
        }
        const x = rect.left + rect.width / 2;
        const y = rect.bottom + 8;
        setState({ concept, x, y });
      },
      hide: () => {
        hideTimer.current = setTimeout(() => setState(null), 120);
      },
    }),
    [],
  );

  return (
    <ConceptCtx.Provider value={ctx}>
      {children}
      {state ? <Popover state={state} onClose={() => setState(null)} /> : null}
    </ConceptCtx.Provider>
  );
}

function Popover({ state, onClose }: { state: HoverState; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    let cancelled = false;
    (async () => {
      const katex = (await import("katex")).default;
      if (cancelled || !ref.current) return;
      const node = ref.current;
      // Clear children safely.
      while (node.firstChild) node.removeChild(node.firstChild);
      buildExplainerInto(node, state.concept.explainer, katex);
    })();
    return () => {
      cancelled = true;
    };
  }, [state.concept.explainer]);

  const maxLeft = typeof window !== "undefined" ? window.innerWidth - 320 : 800;
  const left = Math.min(Math.max(8, state.x - 160), maxLeft);
  const top = Math.min(
    state.y,
    typeof window !== "undefined" ? window.innerHeight - 200 : 600,
  );

  return (
    <div
      role="tooltip"
      onMouseEnter={() => {
        /* swallow — provider's hide timer is the gate */
      }}
      onMouseLeave={onClose}
      style={{
        position: "fixed",
        left,
        top,
        zIndex: 60,
        maxWidth: 320,
      }}
      className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-3 shadow-xl"
    >
      <div className="mb-1 text-[11px] uppercase tracking-wider text-[var(--memory)]">
        {state.concept.label}
      </div>
      <div ref={ref} className="text-[12px] leading-relaxed text-zinc-200" />
    </div>
  );
}

// Build the explainer body using safe DOM construction. KaTeX is rendered into
// freshly created nodes via katex.render() (DOM mode, no string injection).
// Plain text segments are appended as text nodes only — no HTML parsing.
function buildExplainerInto(
  root: HTMLElement,
  raw: string,
  katex: typeof import("katex").default,
): void {
  let i = 0;
  while (i < raw.length) {
    if (raw.slice(i, i + 2) === "$$") {
      const end = raw.indexOf("$$", i + 2);
      if (end < 0) {
        appendText(root, raw.slice(i));
        return;
      }
      const span = document.createElement("span");
      span.className = "telepath-katex-block";
      try {
        katex.render(raw.slice(i + 2, end), span, {
          throwOnError: false,
          displayMode: true,
        });
      } catch {
        span.textContent = raw.slice(i, end + 2);
      }
      root.appendChild(span);
      i = end + 2;
    } else if (raw[i] === "$") {
      const end = raw.indexOf("$", i + 1);
      if (end < 0) {
        appendText(root, raw.slice(i));
        return;
      }
      const span = document.createElement("span");
      span.className = "telepath-katex-inline";
      try {
        katex.render(raw.slice(i + 1, end), span, {
          throwOnError: false,
          displayMode: false,
        });
      } catch {
        span.textContent = raw.slice(i, end + 1);
      }
      root.appendChild(span);
      i = end + 1;
    } else {
      const next = raw.indexOf("$", i);
      const chunk = next < 0 ? raw.slice(i) : raw.slice(i, next);
      appendText(root, chunk);
      i = next < 0 ? raw.length : next;
    }
  }
}

function appendText(root: HTMLElement, chunk: string) {
  // Preserve paragraph breaks as <br/><br/>; single newlines collapse to space.
  const parts = chunk.split(/\n\n+/);
  parts.forEach((part, idx) => {
    if (part) {
      const text = document.createTextNode(part.replace(/\n/g, " "));
      root.appendChild(text);
    }
    if (idx < parts.length - 1) {
      root.appendChild(document.createElement("br"));
      root.appendChild(document.createElement("br"));
    }
  });
}
