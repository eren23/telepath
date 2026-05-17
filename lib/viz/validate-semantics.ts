import type { StorySpec, VizNode } from "@/lib/elicit/schemas";

// Checks that a structurally-valid Story is also renderable in the ways the
// user expects. Catches LLM emissions that pass Zod but produce useless UI
// (e.g. a Mafs scene with only labels — the renderer dead-ends on a banner).
// Returns null when the story is fine, or a human-readable reason string.
export function validateStorySemantics(story: StorySpec): string | null {
  for (let i = 0; i < story.nodes.length; i++) {
    const reason = validateNodeSemantics(story.nodes[i], i);
    if (reason) return reason;
  }
  return null;
}

function validateNodeSemantics(node: VizNode, idx: number): string | null {
  switch (node.kind) {
    case "mafs": {
      const hasCurve = node.spec.elements.some(
        (el) => el.kind === "functionY" || el.kind === "parametric",
      );
      if (!hasCurve) {
        return `nodes[${idx}] (${node.id}) is a mafs scene with no functionY/parametric — Mafs cannot render an architecture/network diagram. Use kind="mermaid" for diagrams, or add a functionY element.`;
      }
      return null;
    }
    case "mermaid": {
      const src = (node.spec.source ?? "").trim();
      if (!src) {
        return `nodes[${idx}] (${node.id}) is a mermaid node with empty source.`;
      }
      return null;
    }
    case "markdown": {
      if (!(node.spec.md ?? "").trim()) {
        return `nodes[${idx}] (${node.id}) is a markdown node with empty md.`;
      }
      return null;
    }
    case "katex": {
      if (!(node.spec.tex ?? "").trim()) {
        return `nodes[${idx}] (${node.id}) is a katex node with empty tex.`;
      }
      return null;
    }
    case "network": {
      if (!node.spec.layers || node.spec.layers.length === 0) {
        return `nodes[${idx}] (${node.id}) is a network node with no layers.`;
      }
      const empty = node.spec.layers.find((l) => !l.nodes || l.nodes.length === 0);
      if (empty) {
        return `nodes[${idx}] (${node.id}) has an empty layer "${empty.id}".`;
      }
      return null;
    }
    case "vega":
      return null;
  }
}
