// LLMs sometimes emit JavaScript-flavored expressions instead of mathjs.
// Normalize the common variations so safeEval doesn't silently return 0.
export function normalizeExpr(raw: string): string {
  let out = raw.trim();
  // Strip wrapping ${...} or `...` template noise (must wrap fully).
  out = out.replace(/^\$\{([\s\S]+)\}$/, "$1");
  out = out.replace(/^`([\s\S]+)`$/, "$1");
  // Remove "Math." prefix: Math.exp(x) -> exp(x).
  out = out.replace(/\bMath\./g, "");
  // ** -> ^ (mathjs uses ^ for power).
  out = out.replace(/\*\*/g, "^");
  // ln() -> log() since some users hand-type ln.
  out = out.replace(/\bln\s*\(/g, "log(");
  return out;
}
