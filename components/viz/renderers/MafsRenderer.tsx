"use client";

import { useMemo } from "react";
import {
  Coordinates,
  LaTeX,
  Mafs,
  Plot,
  Point,
  Text,
  Vector,
  vec,
} from "mafs";
import { all, create, parse, type EvalFunction } from "mathjs";
import { LevaPanel } from "leva";
import "mafs/core.css";
import "mafs/font.css";
import type { MafsSpec, MathElement, ParamDef } from "@/lib/elicit/schemas";
import { useSpecControls } from "@/lib/viz/use-spec-controls";
import { LEVA_THEME } from "@/lib/viz/leva-theme";

import { normalizeExpr } from "@/lib/viz/normalize-expr";

const math = create(all);

const DEFAULT_COLOR = "#7c8cff";

type CompiledElement =
  | {
      kind: "functionY";
      expr: EvalFunction;
      freeVars: string[];
      compileError?: string;
    }
  | {
      kind: "parametric";
      xExpr: EvalFunction;
      yExpr: EvalFunction;
      freeVars: string[];
      compileError?: string;
    }
  | {
      kind: "point";
      x: EvalFunction | number;
      y: EvalFunction | number;
      freeVars: string[];
      compileError?: string;
    }
  | { kind: "vector" }
  | { kind: "text" }
  | { kind: "latex" }
  | { kind: "compileError"; error: string };

type Props = { spec: MafsSpec };

export default function MafsRenderer({ spec }: Props) {
  const { values, store, isEmpty } = useSpecControls(
    spec.controls,
    spec.title ?? "math",
  );

  const compiled = useMemo<CompiledElement[]>(
    () => spec.elements.map(compileElement),
    [spec.elements],
  );

  // Build the available scope keys: control names + the iteration vars x/t.
  const scopeKeys = useMemo(() => {
    const keys = new Set<string>(["x", "t", "pi", "e"]);
    for (const c of spec.controls ?? []) keys.add(c.name);
    return keys;
  }, [spec.controls]);

  // Preflight: find any element whose expression refers to a free variable not
  // in the scope. Surface as a banner BEFORE we render anything.
  const variableErrors = useMemo(() => {
    const errs: string[] = [];
    compiled.forEach((c, i) => {
      if (c.kind === "compileError") {
        errs.push(`element ${i} (${spec.elements[i].kind}): ${c.error}`);
        return;
      }
      if ("freeVars" in c) {
        const missing = c.freeVars.filter((v) => !scopeKeys.has(v));
        if (missing.length) {
          const have = [...scopeKeys].filter((k) => k !== "pi" && k !== "e").join(", ");
          errs.push(
            `element ${i} references "${missing.join(", ")}" but available: ${have || "(none)"}`,
          );
        }
      }
    });
    return errs;
  }, [compiled, scopeKeys, spec.elements]);

  // Auto-fit viewbox if function values blow past the requested y range.
  const viewBox = useMemo(() => {
    const requested = spec.viewbox ?? { x: [-5, 5] as [number, number], y: [-3, 3] as [number, number] };
    if (variableErrors.length > 0) return requested;
    const [xMin, xMax] = requested.x;
    const [yMin, yMax] = requested.y;
    let observedMin = Infinity;
    let observedMax = -Infinity;
    const samples = 20;
    compiled.forEach((c, i) => {
      const el = spec.elements[i];
      if (c.kind !== "functionY") return;
      const tDefault = typeof values.t === "number" ? values.t : 0;
      for (let s = 0; s <= samples; s++) {
        const xVal = xMin + ((xMax - xMin) * s) / samples;
        const yVal = safeEval(c.expr, { ...values, x: xVal, t: tDefault }).value;
        if (yVal === null) continue;
        if (yVal < observedMin) observedMin = yVal;
        if (yVal > observedMax) observedMax = yVal;
      }
      // Domain override if element specifies its own.
      if (el && el.kind === "functionY" && el.domain) {
        // (rough — already covered by sampling against requested.x; skip)
      }
    });
    if (!Number.isFinite(observedMin) || !Number.isFinite(observedMax)) {
      return requested;
    }
    const observedSpan = observedMax - observedMin;
    const requestedSpan = yMax - yMin;
    if (observedSpan > requestedSpan * 5 || observedMax > yMax * 5 || observedMin < yMin * 5) {
      // Expand y range with a 15% margin.
      const pad = Math.max(observedSpan * 0.15, 0.1);
      return {
        x: requested.x,
        y: [observedMin - pad, observedMax + pad] as [number, number],
      };
    }
    return requested;
  }, [compiled, spec.viewbox, spec.elements, values]);

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-6">
      {spec.title ? (
        <div className="mb-3 text-[13px] uppercase tracking-wider text-zinc-400">
          {spec.title}
        </div>
      ) : null}
      {variableErrors.length > 0 ? (
        <div className="mb-3 rounded-lg border border-[var(--missing)]/40 bg-[var(--missing)]/10 p-3 text-[12px] text-[var(--missing)]">
          <div className="font-semibold">Expression issue</div>
          <ul className="mt-1 space-y-0.5">
            {variableErrors.map((e, i) => (
              <li key={i}>· {e}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="mafs-host">
        <Mafs
          height={420}
          viewBox={{
            x: viewBox.x as unknown as vec.Vector2,
            y: viewBox.y as unknown as vec.Vector2,
          }}
        >
          <Coordinates.Cartesian />
          {spec.elements.map((el, i) =>
            renderElement(el, compiled[i], values, `el-${i}`),
          )}
        </Mafs>
      </div>
      {!isEmpty ? (
        <div className="leva-host pointer-events-auto mt-3">
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

function collectFreeVars(expr: string): string[] {
  try {
    const node = parse(expr);
    const seen = new Set<string>();
    node.traverse((n) => {
      if (n.type === "SymbolNode") {
        const name = (n as unknown as { name?: string }).name;
        if (typeof name === "string") {
          // mathjs treats sin/cos/etc. as FunctionNode parents; SymbolNodes
          // inside arg lists are variable refs we care about.
          seen.add(name);
        }
      }
    });
    // Drop mathjs builtin names so we don't report them as missing.
    for (const builtin of [
      "sin", "cos", "tan", "asin", "acos", "atan", "atan2",
      "exp", "log", "log2", "log10", "sqrt", "abs",
      "floor", "ceil", "round", "sign",
      "min", "max", "pow",
      "pi", "e", "PI", "E", "tau",
    ]) seen.delete(builtin);
    return [...seen];
  } catch {
    return [];
  }
}

function compileElement(el: MathElement): CompiledElement {
  try {
    switch (el.kind) {
      case "functionY": {
        const norm = normalizeExpr(el.expr);
        return {
          kind: "functionY",
          expr: math.compile(norm),
          freeVars: collectFreeVars(norm),
        };
      }
      case "parametric": {
        const x = normalizeExpr(el.xExpr);
        const y = normalizeExpr(el.yExpr);
        return {
          kind: "parametric",
          xExpr: math.compile(x),
          yExpr: math.compile(y),
          freeVars: [...new Set([...collectFreeVars(x), ...collectFreeVars(y)])],
        };
      }
      case "point": {
        const xIsExpr = typeof el.x === "string";
        const yIsExpr = typeof el.y === "string";
        const xNorm = xIsExpr ? normalizeExpr(el.x as string) : "";
        const yNorm = yIsExpr ? normalizeExpr(el.y as string) : "";
        return {
          kind: "point",
          x: xIsExpr ? math.compile(xNorm) : (el.x as number),
          y: yIsExpr ? math.compile(yNorm) : (el.y as number),
          freeVars: [
            ...new Set([
              ...(xIsExpr ? collectFreeVars(xNorm) : []),
              ...(yIsExpr ? collectFreeVars(yNorm) : []),
            ]),
          ],
        };
      }
      case "vector":
        return { kind: "vector" };
      case "text":
        return { kind: "text" };
      case "latex":
        return { kind: "latex" };
    }
  } catch (err) {
    return {
      kind: "compileError",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

type EvalResult = { value: number | null; error: string | null };

function safeEval(
  fn: EvalFunction,
  scope: Record<string, unknown>,
): EvalResult {
  try {
    const v = fn.evaluate(scope);
    if (typeof v !== "number" || !Number.isFinite(v)) {
      return { value: null, error: `evaluated to ${String(v)}` };
    }
    return { value: v, error: null };
  } catch (e) {
    return { value: null, error: e instanceof Error ? e.message : String(e) };
  }
}

function renderElement(
  el: MathElement,
  c: CompiledElement,
  values: Record<string, unknown>,
  key: string,
) {
  if (c.kind === "compileError") return null;
  const color = ("color" in el && el.color) || DEFAULT_COLOR;
  switch (el.kind) {
    case "functionY": {
      const compiled = c as Extract<CompiledElement, { kind: "functionY" }>;
      const tDefault = typeof values.t === "number" ? values.t : 0;
      return (
        <Plot.OfX
          key={key}
          y={(x) => {
            const r = safeEval(compiled.expr, { ...values, x, t: tDefault });
            // Returning NaN signals Mafs to break the path — better than y=0.
            return r.value ?? Number.NaN;
          }}
          domain={
            el.domain
              ? (el.domain as unknown as vec.Vector2)
              : undefined
          }
          color={color}
        />
      );
    }
    case "parametric": {
      const compiled = c as Extract<CompiledElement, { kind: "parametric" }>;
      const xDefault = typeof values.x === "number" ? values.x : 0;
      return (
        <Plot.Parametric
          key={key}
          xy={(t) => [
            safeEval(compiled.xExpr, { ...values, t, x: xDefault }).value ?? Number.NaN,
            safeEval(compiled.yExpr, { ...values, t, x: xDefault }).value ?? Number.NaN,
          ]}
          domain={el.tDomain as unknown as vec.Vector2}
          color={color}
        />
      );
    }
    case "point": {
      const compiled = c as Extract<CompiledElement, { kind: "point" }>;
      const x =
        typeof compiled.x === "number"
          ? compiled.x
          : safeEval(compiled.x, values).value ?? 0;
      const y =
        typeof compiled.y === "number"
          ? compiled.y
          : safeEval(compiled.y, values).value ?? 0;
      return <Point key={key} x={x} y={y} color={color} />;
    }
    case "vector":
      return (
        <Vector
          key={key}
          tail={el.tail as unknown as vec.Vector2}
          tip={el.tip as unknown as vec.Vector2}
          color={color}
        />
      );
    case "text":
      return (
        <Text key={key} x={el.at[0]} y={el.at[1]} color={color}>
          {el.text}
        </Text>
      );
    case "latex":
      return (
        <LaTeX
          key={key}
          at={el.at as unknown as vec.Vector2}
          tex={el.tex}
          color={color}
        />
      );
  }
}

// Re-export helper type so callers don't need to dig in.
export type { ParamDef };
