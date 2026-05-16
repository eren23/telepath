import { describe, it, expect } from "vitest";
import { normalizeExpr } from "@/lib/viz/normalize-expr";

describe("normalizeExpr", () => {
  it("strips Math. prefix from common functions", () => {
    expect(normalizeExpr("Math.exp(-x)")).toBe("exp(-x)");
    expect(normalizeExpr("Math.sin(k*x) + Math.cos(x)")).toBe("sin(k*x) + cos(x)");
    expect(normalizeExpr("Math.sqrt(k*k - g*g)")).toBe("sqrt(k*k - g*g)");
  });

  it("converts JS ** to mathjs ^ for power", () => {
    expect(normalizeExpr("x ** 2")).toBe("x ^ 2");
    expect(normalizeExpr("(a + b) ** n")).toBe("(a + b) ^ n");
  });

  it("rewrites ln() to log()", () => {
    expect(normalizeExpr("ln(x + 1)")).toBe("log(x + 1)");
    expect(normalizeExpr("ln (x)")).toBe("log(x)");
  });

  it("strips wrapping backtick / dollar noise", () => {
    expect(normalizeExpr("`sin(x)`")).toBe("sin(x)");
    expect(normalizeExpr("${cos(x)}")).toBe("cos(x)");
  });

  it("leaves clean mathjs expressions untouched", () => {
    expect(normalizeExpr("A * exp(-gamma * x) * sin(k * x)")).toBe(
      "A * exp(-gamma * x) * sin(k * x)",
    );
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeExpr("   x + 1   ")).toBe("x + 1");
  });

  it("does not eat Math. that's actually a variable named Math (edge case)", () => {
    // We intentionally use word boundary; `MathsClass.exp` is left alone.
    expect(normalizeExpr("MathsClass.exp(x)")).toBe("MathsClass.exp(x)");
  });
});
