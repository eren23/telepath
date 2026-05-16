// RFC 6901 JSON Pointer — just enough for live param mutation.
// Paths look like "/data/values/0/y". "" or "/" refers to the root.

function unescape(seg: string): string {
  return seg.replace(/~1/g, "/").replace(/~0/g, "~");
}

function segments(pointer: string): string[] {
  if (pointer === "" || pointer === "/") return [];
  if (!pointer.startsWith("/")) {
    throw new Error(`json pointer must start with "/": ${pointer}`);
  }
  return pointer.split("/").slice(1).map(unescape);
}

export function getPointer(root: unknown, pointer: string): unknown {
  let cur: unknown = root;
  for (const seg of segments(pointer)) {
    if (cur == null) return undefined;
    if (Array.isArray(cur)) {
      const idx = Number(seg);
      if (Number.isNaN(idx)) return undefined;
      cur = cur[idx];
    } else if (typeof cur === "object") {
      cur = (cur as Record<string, unknown>)[seg];
    } else {
      return undefined;
    }
  }
  return cur;
}

// Mutates `root` in place. Returns true if the parent path resolved, false otherwise.
// Refuses to write NaN, Infinity, or undefined — those silently break Vega scales.
export function setPointer(
  root: unknown,
  pointer: string,
  value: unknown,
): boolean {
  if (value === undefined) return false;
  if (typeof value === "number" && !Number.isFinite(value)) return false;
  const segs = segments(pointer);
  if (segs.length === 0) return false;
  let cur: unknown = root;
  for (let i = 0; i < segs.length - 1; i++) {
    const seg = segs[i];
    if (cur == null) return false;
    if (Array.isArray(cur)) {
      const idx = Number(seg);
      if (Number.isNaN(idx)) return false;
      cur = cur[idx];
    } else if (typeof cur === "object") {
      cur = (cur as Record<string, unknown>)[seg];
    } else {
      return false;
    }
  }
  const last = segs[segs.length - 1];
  if (cur == null) return false;
  if (Array.isArray(cur)) {
    const idx = Number(last);
    if (Number.isNaN(idx)) return false;
    if (idx < 0 || idx > cur.length) return false;
    cur[idx] = value;
    return true;
  }
  if (typeof cur === "object") {
    (cur as Record<string, unknown>)[last] = value;
    return true;
  }
  return false;
}

// Apply every binding param→pointer against a deep clone of `spec`.
// Returns the mutated clone; unresolvable bindings are skipped.
export function applyBindings(
  spec: unknown,
  bindings: Record<string, string> | undefined,
  values: Record<string, unknown>,
): unknown {
  if (!bindings || Object.keys(bindings).length === 0) return spec;
  const out = structuredClone(spec);
  for (const [name, pointer] of Object.entries(bindings)) {
    if (!(name in values)) continue;
    setPointer(out, pointer, values[name]);
  }
  return out;
}
