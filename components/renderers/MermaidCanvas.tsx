"use client";

import { useEffect, useRef, useState } from "react";

type Props = { source: string };

export default function MermaidCanvas({ source }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: "dark",
          themeVariables: {
            background: "transparent",
            primaryColor: "#1f1f2c",
            primaryBorderColor: "#7c8cff",
            primaryTextColor: "#f4f4f5",
            lineColor: "#5eead4",
            tertiaryColor: "#0e0e14",
          },
          fontFamily: "var(--font-geist-sans), Inter, sans-serif",
        });
        const id = `m-${Math.random().toString(36).slice(2)}`;
        const cleaned = source.trim();
        const { svg } = await mermaid.render(id, cleaned);
        if (cancelled || !ref.current) return;
        const host = ref.current;
        while (host.firstChild) host.removeChild(host.firstChild);
        const parsed = new DOMParser().parseFromString(svg, "text/html");
        const svgEl = parsed.body.querySelector("svg");
        if (!svgEl) {
          throw new Error("mermaid produced no <svg> element");
        }
        const imported = document.importNode(svgEl, true);
        imported.removeAttribute("width");
        imported.style.maxWidth = "100%";
        imported.style.height = "auto";
        host.appendChild(imported);
        setErr(null);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [source]);

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-6">
      {err ? (
        <div className="rounded border border-[var(--missing)]/40 bg-[var(--missing)]/10 p-3 text-[12px] text-[var(--missing)]">
          Mermaid render failed: {err}
          <pre className="mt-2 whitespace-pre-wrap text-zinc-400">{source}</pre>
        </div>
      ) : (
        <div ref={ref} className="overflow-auto" />
      )}
    </div>
  );
}
