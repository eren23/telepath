"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { LevaPanel } from "leva";
import type { VegaSpec } from "@/lib/elicit/schemas";
import { applyBindings } from "@/lib/viz/json-pointer";
import { useSpecControls } from "@/lib/viz/use-spec-controls";
import { LEVA_THEME } from "@/lib/viz/leva-theme";

type Props = { spec: VegaSpec };

function inspectData(spec: VegaSpec): {
  empty: boolean;
  nanCount: number;
  rowCount: number;
} {
  const data = (spec as { data?: { values?: unknown[] } }).data;
  const values = Array.isArray(data?.values) ? data.values : null;
  if (!values || values.length === 0) {
    return { empty: true, nanCount: 0, rowCount: 0 };
  }
  let nanCount = 0;
  for (const row of values) {
    if (row && typeof row === "object") {
      for (const v of Object.values(row as Record<string, unknown>)) {
        if (typeof v === "number" && !Number.isFinite(v)) nanCount++;
      }
    }
  }
  return { empty: false, nanCount, rowCount: values.length };
}

export default function VegaCanvas({ spec }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const [warn, setWarn] = useState<string | null>(null);

  const { values: controlValues, store, isEmpty } = useSpecControls(
    spec.controls,
    "chart",
  );

  const liveSpec = useMemo(() => {
    if (!spec.controls || spec.controls.length === 0) return spec;
    return applyBindings(spec, spec.bindings, controlValues) as VegaSpec;
  }, [spec, controlValues]);

  const dataState = useMemo(() => inspectData(liveSpec), [liveSpec]);

  useEffect(() => {
    setErr(null);
    setWarn(null);
    if (dataState.empty) return;

    let view: { finalize?: () => void } | undefined;
    let cancelled = false;

    // Intercept vega-embed's console warnings (Infinite extent / Empty domain
    // / NaN encoding) so they don't render an invisibly broken chart.
    const trippedWarnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      const msg = args.map((a) => (typeof a === "string" ? a : "")).join(" ");
      if (
        /infinite extent|empty domain|nan|invalid|cannot parse/i.test(msg) &&
        !/Tap|brushing/i.test(msg)
      ) {
        trippedWarnings.push(msg);
      }
      originalWarn(...(args as []));
    };

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
          if (trippedWarnings.length > 0) {
            setWarn(trippedWarnings[0].slice(0, 200));
          }
        } catch (e) {
          if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
        } finally {
          console.warn = originalWarn;
        }
      })();
    }, 30);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      console.warn = originalWarn;
      view?.finalize?.();
    };
  }, [liveSpec, dataState.empty]);

  const hasControls = (spec.controls?.length ?? 0) > 0;

  if (dataState.empty) {
    return (
      <div className="relative flex flex-col gap-2 rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-6">
        <div className="rounded border border-[var(--default)]/30 bg-[var(--panel)] p-4 text-[12px] text-zinc-400">
          <div className="text-[11px] uppercase tracking-wider text-zinc-500">
            no real data
          </div>
          <div className="mt-1 text-zinc-300">
            Chart skipped — the model wasn&apos;t given concrete data for this topic.
            Try a refine like &ldquo;fill in plausible numbers&rdquo; if you want a stub chart,
            or paste real rows.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col gap-2 rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-6">
      {err ? (
        <div className="rounded border border-[var(--missing)]/40 bg-[var(--missing)]/10 p-3 text-[12px] text-[var(--missing)]">
          Vega-Lite render failed: {err}
        </div>
      ) : (
        <>
          {warn ? (
            <div className="rounded border border-[var(--asked)]/40 bg-[var(--asked)]/10 p-2 text-[11px] text-[var(--asked)]">
              chart rendered with a warning: {warn}
            </div>
          ) : null}
          {dataState.nanCount > 0 ? (
            <div className="rounded border border-[var(--asked)]/40 bg-[var(--asked)]/10 p-2 text-[11px] text-[var(--asked)]">
              {dataState.nanCount} non-finite value{dataState.nanCount === 1 ? "" : "s"} in data — chart may be incomplete
            </div>
          ) : null}
          <div ref={ref} className="vega-host w-full min-h-[400px]" />
        </>
      )}
      {!isEmpty && hasControls ? (
        <div className="leva-host pointer-events-auto mt-2">
          <LevaPanel
            store={store}
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
