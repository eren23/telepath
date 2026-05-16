import { describe, it, expect } from "vitest";
import {
  applyBindings,
  getPointer,
  setPointer,
} from "@/lib/viz/json-pointer";

describe("getPointer", () => {
  it("returns root for empty / '/' pointer", () => {
    const obj = { a: 1 };
    expect(getPointer(obj, "")).toBe(obj);
    expect(getPointer(obj, "/")).toBe(obj);
  });

  it("walks nested objects", () => {
    expect(getPointer({ a: { b: { c: 42 } } }, "/a/b/c")).toBe(42);
  });

  it("indexes arrays numerically", () => {
    expect(getPointer({ data: { values: [10, 20, 30] } }, "/data/values/1")).toBe(20);
  });

  it("unescapes ~1 → '/' and ~0 → '~'", () => {
    const obj = { "a/b": { "c~d": "ok" } };
    expect(getPointer(obj, "/a~1b/c~0d")).toBe("ok");
  });

  it("returns undefined for missing paths", () => {
    expect(getPointer({ a: 1 }, "/missing/path")).toBeUndefined();
    expect(getPointer({ arr: [1] }, "/arr/9")).toBeUndefined();
    expect(getPointer({ arr: [1] }, "/arr/notanum")).toBeUndefined();
  });

  it("returns undefined when traversing through null/primitive", () => {
    expect(getPointer({ a: null }, "/a/b")).toBeUndefined();
    expect(getPointer({ a: 5 }, "/a/b")).toBeUndefined();
  });

  it("throws when pointer is malformed (no leading slash)", () => {
    expect(() => getPointer({}, "no-slash")).toThrow();
  });
});

describe("setPointer", () => {
  it("mutates nested object value in place", () => {
    const obj = { a: { b: 1 } };
    expect(setPointer(obj, "/a/b", 99)).toBe(true);
    expect(obj.a.b).toBe(99);
  });

  it("replaces array element at numeric index", () => {
    const obj = { arr: [1, 2, 3] };
    expect(setPointer(obj, "/arr/1", 200)).toBe(true);
    expect(obj.arr).toEqual([1, 200, 3]);
  });

  it("supports append by setting at length index", () => {
    const obj = { arr: [1, 2] };
    expect(setPointer(obj, "/arr/2", 3)).toBe(true);
    expect(obj.arr).toEqual([1, 2, 3]);
  });

  it("returns false when intermediate path is missing", () => {
    const obj: Record<string, unknown> = { a: {} };
    expect(setPointer(obj, "/a/b/c", 1)).toBe(false);
  });

  it("returns false for empty pointer (root mutation not allowed)", () => {
    expect(setPointer({ a: 1 }, "", 2)).toBe(false);
  });

  it("returns false for invalid array index", () => {
    expect(setPointer({ arr: [1, 2] }, "/arr/notanum", 9)).toBe(false);
    expect(setPointer({ arr: [1, 2] }, "/arr/-1", 9)).toBe(false);
  });
});

describe("applyBindings", () => {
  it("returns spec unchanged when bindings is empty/undefined", () => {
    const spec = { data: { values: [1, 2] } };
    expect(applyBindings(spec, undefined, {})).toBe(spec);
    expect(applyBindings(spec, {}, {})).toBe(spec);
  });

  it("deep-clones the spec before mutating", () => {
    const spec = { data: { values: [{ y: 1 }] } };
    const out = applyBindings(spec, { amp: "/data/values/0/y" }, { amp: 99 }) as typeof spec;
    expect(out).not.toBe(spec);
    expect(out.data).not.toBe(spec.data);
    expect(out.data.values[0].y).toBe(99);
    expect(spec.data.values[0].y).toBe(1); // unchanged
  });

  it("skips bindings whose param name is absent from values", () => {
    const spec = { x: 1 };
    const out = applyBindings(spec, { missing: "/x" }, {}) as typeof spec;
    expect(out.x).toBe(1);
  });

  it("applies multiple bindings independently", () => {
    const spec = { a: 1, b: 2, c: 3 };
    const out = applyBindings(
      spec,
      { p1: "/a", p2: "/b" },
      { p1: 10, p2: 20 },
    ) as typeof spec;
    expect(out).toEqual({ a: 10, b: 20, c: 3 });
  });

  it("silently skips bindings to non-existent paths", () => {
    const spec = { a: 1 };
    const out = applyBindings(
      spec,
      { p: "/nope/here" },
      { p: 99 },
    ) as typeof spec;
    expect(out.a).toBe(1);
  });
});
