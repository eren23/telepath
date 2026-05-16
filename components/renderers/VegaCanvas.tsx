"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Leva } from "leva";
import type { VegaSpec } from "@/lib/elicit/schemas";
import { applyBindings } from "@/lib/viz/json-pointer";
import { useSpecControls } from "@/lib/viz/use-spec-controls";

type Props = { spec: VegaSpec };

export default function VegaCanvas({ spec }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState<string | null>(null);

  const controlValues = useSpecControls(spec.controls, "chart");

  const liveSpec = useMemo(() => {
    if (!spec.controls || spec.controls.length === 0) return spec;
    return applyBindings(spec, spec.bindings, controlValues) as VegaSpec;
  }, [spec, controlValues]);

  useEffect(() => {
    let view: { finalize?: () => void } | undefined;
    let cancelled = false;
    const timer = setTimeout(() => {
      (async () => {
        if (!ref.current) return;
        const embedMod = await import("vega-embed");
        const embed = embedMod.default;
        const safeSpec = sanitizeForV5(liveSpec);
        const fullSpec = {
          $schema: "https://vega.github.io/schema/vega-lite/v5.json",
          background: "transparent",
          config: vegaTheme(),
          width: "container",
          height: 380,
          ...safeSpec,
        };
        try {
          const result = await embed(ref.current, fullSpec as object, {
            actions: false,
            renderer: "svg",
          });
          if (cancelled) {
            result.finalize();
            return;
          }
          view = result;
          setErr(null);
        } catch (e) {
          if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
        }
      })();
    }, 30);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      view?.finalize?.();
    };
  }, [liveSpec]);

  const hasControls = (spec.controls?.length ?? 0) > 0;

  return (
    <div className="relative flex flex-col gap-2 rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-6">
      {err ? (
        <div className="rounded border border-[var(--missing)]/40 bg-[var(--missing)]/10 p-3 text-[12px] text-[var(--missing)]">
          Vega-Lite render failed: {err}
        </div>
      ) : (
        <div ref={ref} className="vega-host w-full min-h-[400px]" />
      )}
      {hasControls ? (
        <div className="leva-host pointer-events-auto mt-2">
          <Leva
            fill
            flat
            collapsed={false}
            hideCopyButton
            titleBar={{ title: "controls", drag: false, filter: false }}
            theme={LEVA_THEME}
          />
        </div>
      ) : null}
    </div>
  );
}

const LEVA_THEME = {
  colors: {
    elevation1: "var(--panel)",
    elevation2: "var(--panel-2)",
    elevation3: "var(--panel-2)",
    accent1: "var(--accent)",
    accent2: "var(--accent)",
    accent3: "var(--accent)",
    highlight1: "var(--memory)",
    highlight2: "var(--memory)",
    highlight3: "var(--memory)",
    folderTextColor: "#a1a1aa",
  },
  sizes: { rootWidth: "100%", controlWidth: "60%" },
  fontSizes: { root: "11px" },
};

function sanitizeForV5(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object") return {};
  const out = JSON.parse(JSON.stringify(input)) as Record<string, unknown>;
  walk(out);
  // Strip Telepath-only extension keys so Vega-Lite doesn't complain.
  delete out.controls;
  delete out.bindings;
  delete out.concepts;
  return out;

  function walk(node: unknown) {
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (!node || typeof node !== "object") return;
    const obj = node as Record<string, unknown>;
    if ("cornerRadiusEnd" in obj) {
      const r = obj.cornerRadiusEnd;
      delete obj.cornerRadiusEnd;
      if (typeof r === "number") {
        obj.cornerRadius = r;
      }
    }
    for (const v of Object.values(obj)) walk(v);
  }
}

function vegaTheme() {
  return {
    background: "transparent",
    axis: {
      domainColor: "#3f3f55",
      gridColor: "#2a2a3a",
      labelColor: "#a1a1aa",
      tickColor: "#3f3f55",
      titleColor: "#e4e4e7",
    },
    legend: {
      labelColor: "#a1a1aa",
      titleColor: "#e4e4e7",
    },
    title: {
      color: "#f4f4f5",
      fontSize: 16,
    },
    range: {
      category: ["#7c8cff", "#5eead4", "#fbbf24", "#f87171", "#a78bfa", "#34d399", "#fb7185", "#60a5fa"],
    },
    view: { stroke: "transparent" },
  };
}
