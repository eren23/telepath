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
import { all, create, type EvalFunction } from "mathjs";
import "mafs/core.css";
import "mafs/font.css";
import type { MafsSpec, MathElement, ParamDef } from "@/lib/elicit/schemas";
import { useSpecControls } from "@/lib/viz/use-spec-controls";

import { normalizeExpr } from "@/lib/viz/normalize-expr";

const math = create(all);

type CompiledElement =
  | { kind: "functionY"; expr: EvalFunction }
  | { kind: "parametric"; xExpr: EvalFunction; yExpr: EvalFunction }
  | {
      kind: "point";
      x: EvalFunction | number;
      y: EvalFunction | number;
    }
  | { kind: "vector" }
  | { kind: "text" }
  | { kind: "latex" };

type Props = { spec: MafsSpec };

export default function MafsRenderer({ spec }: Props) {
  const values = useSpecControls(spec.controls, spec.title ?? "math");

  const compiled = useMemo<CompiledElement[]>(
    () => spec.elements.map(compileElement),
    [spec.elements],
  );

  const viewBox = spec.viewbox ?? { x: [-5, 5], y: [-3, 3] };

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-6">
      {spec.title ? (
        <div className="mb-3 text-[13px] uppercase tracking-wider text-zinc-400">
          {spec.title}
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
    </div>
  );
}

function compileElement(el: MathElement): CompiledElement {
  switch (el.kind) {
    case "functionY":
      return { kind: "functionY", expr: math.compile(normalizeExpr(el.expr)) };
    case "parametric":
      return {
        kind: "parametric",
        xExpr: math.compile(normalizeExpr(el.xExpr)),
        yExpr: math.compile(normalizeExpr(el.yExpr)),
      };
    case "point":
      return {
        kind: "point",
        x: typeof el.x === "string" ? math.compile(normalizeExpr(el.x)) : el.x,
        y: typeof el.y === "string" ? math.compile(normalizeExpr(el.y)) : el.y,
      };
    case "vector":
      return { kind: "vector" };
    case "text":
      return { kind: "text" };
    case "latex":
      return { kind: "latex" };
  }
}

function safeEval(
  fn: EvalFunction,
  scope: Record<string, unknown>,
  fallback = 0,
): number {
  try {
    const v = fn.evaluate(scope);
    return typeof v === "number" && Number.isFinite(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

function renderElement(
  el: MathElement,
  c: CompiledElement,
  values: Record<string, unknown>,
  key: string,
) {
  const color = "color" in el ? el.color : undefined;
  switch (el.kind) {
    case "functionY": {
      const compiled = c as Extract<CompiledElement, { kind: "functionY" }>;
      const tDefault = typeof values.t === "number" ? values.t : 0;
      return (
        <Plot.OfX
          key={key}
          y={(x) =>
            safeEval(compiled.expr, { ...values, x, t: tDefault })
          }
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
            safeEval(compiled.xExpr, { ...values, t, x: xDefault }),
            safeEval(compiled.yExpr, { ...values, t, x: xDefault }),
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
          : safeEval(compiled.x, values);
      const y =
        typeof compiled.y === "number"
          ? compiled.y
          : safeEval(compiled.y, values);
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
