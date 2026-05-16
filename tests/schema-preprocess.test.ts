import { describe, it, expect } from "vitest";
import { MathElement, ParamDef, VizNode } from "@/lib/elicit/schemas";

describe("ParamDef preprocess", () => {
  it("fills missing name from label", () => {
    const p = ParamDef.parse({
      type: "range",
      label: "Amplitude A",
      min: 0,
      max: 2,
      default: 1,
    });
    expect(p.name).toBe("amplitude_a");
  });

  it("fills missing default from min for numeric types", () => {
    const p = ParamDef.parse({
      name: "x",
      type: "range",
      min: 0.5,
      max: 5,
    });
    if (p.type !== "range") throw new Error("expected range");
    expect(p.default).toBe(0.5);
  });

  it("defaults type to range when missing", () => {
    const p = ParamDef.parse({
      name: "x",
      min: 0,
      max: 1,
      default: 0.5,
    });
    expect(p.type).toBe("range");
  });

  it("normalizes slider/float/int → range", () => {
    for (const t of ["slider", "float", "int"]) {
      const p = ParamDef.parse({ name: "x", type: t, min: 0, max: 1, default: 0.5 });
      expect(p.type).toBe("range");
    }
  });

  it("defaults boolean to false / color to #7c8cff / select to first option", () => {
    const b = ParamDef.parse({ name: "on", type: "boolean" });
    if (b.type !== "boolean") throw new Error("expected boolean");
    expect(b.default).toBe(false);
    const c = ParamDef.parse({ name: "tint", type: "color" });
    if (c.type !== "color") throw new Error("expected color");
    expect(c.default).toBe("#7c8cff");
    const s = ParamDef.parse({ name: "mode", type: "select", options: ["a", "b"] });
    if (s.type !== "select") throw new Error("expected select");
    expect(s.default).toBe("a");
  });

  it("preserves provided defaults verbatim", () => {
    const p = ParamDef.parse({
      name: "x",
      type: "range",
      min: 0,
      max: 10,
      default: 4.2,
    });
    if (p.type !== "range") throw new Error();
    expect(p.default).toBe(4.2);
  });
});

describe("MathElement preprocess", () => {
  it("aliases function/func/curve/graph/plot → functionY", () => {
    for (const alias of ["function", "func", "curve", "graph", "plot"]) {
      const el = MathElement.parse({ kind: alias, expr: "sin(x)" });
      expect(el.kind).toBe("functionY");
    }
  });

  it("aliases param/parametriccurve → parametric", () => {
    const el = MathElement.parse({
      kind: "param",
      xExpr: "cos(t)",
      yExpr: "sin(t)",
      tDomain: [0, 6.28],
    });
    expect(el.kind).toBe("parametric");
  });

  it("renames y/fn → expr on functionY", () => {
    const el = MathElement.parse({ kind: "functionY", y: "A * sin(x)" });
    if (el.kind !== "functionY") throw new Error();
    expect(el.expr).toBe("A * sin(x)");
    const el2 = MathElement.parse({ kind: "function", fn: "cos(x)" });
    if (el2.kind !== "functionY") throw new Error();
    expect(el2.expr).toBe("cos(x)");
  });

  it("passes through native kinds", () => {
    const el = MathElement.parse({
      kind: "vector",
      tail: [0, 0],
      tip: [1, 1],
    });
    expect(el.kind).toBe("vector");
  });
});

describe("VizNode preprocess", () => {
  it("aliases chart/vegalite → vega", () => {
    const n = VizNode.parse({
      id: "n",
      kind: "chart",
      spec: {},
    });
    expect(n.kind).toBe("vega");
  });

  it("aliases diagram/flowchart → mermaid", () => {
    const n = VizNode.parse({
      id: "n",
      kind: "diagram",
      spec: { source: "graph TD\nA-->B" },
    });
    expect(n.kind).toBe("mermaid");
  });

  it("aliases math/plot → mafs and equation/latex → katex", () => {
    const m = VizNode.parse({
      id: "n",
      kind: "math",
      spec: {
        scene: "plot2d",
        elements: [{ kind: "functionY", expr: "x" }],
      },
    });
    expect(m.kind).toBe("mafs");
    const k = VizNode.parse({
      id: "n",
      kind: "equation",
      spec: { tex: "x" },
    });
    expect(k.kind).toBe("katex");
  });

  it("generates an id when missing", () => {
    const n = VizNode.parse({
      kind: "markdown",
      spec: { md: "hi" },
    });
    expect(n.id).toMatch(/^n-[a-z0-9]+$/);
  });
});
