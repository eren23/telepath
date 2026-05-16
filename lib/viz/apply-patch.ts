import { applyPatch, deepClone, type Operation } from "fast-json-patch";
import type { StorySpec, VizNode } from "@/lib/elicit/schemas";
import type { JsonPatchOp, PatchEnvelope } from "./patch-schema";

export class PatchError extends Error {
  constructor(
    message: string,
    public readonly envelope: PatchEnvelope,
    public readonly cause?: unknown,
  ) {
    super(message);
  }
}

// Apply a single envelope to a deep clone of `story`. Throws PatchError on any
// resolution failure (missing target, missing path, bad op).
export function applyEnvelope(story: StorySpec, env: PatchEnvelope): StorySpec {
  const next = deepClone(story) as StorySpec;
  switch (env.op) {
    case "patch": {
      const idx = next.nodes.findIndex((n) => n.id === env.target);
      if (idx < 0) {
        throw new PatchError(`patch target ${env.target} not found`, env);
      }
      try {
        const patched = applyPatch(
          next.nodes[idx],
          env.patches as Operation[],
          true,
          false,
        );
        next.nodes[idx] = patched.newDocument as VizNode;
      } catch (e) {
        throw new PatchError(
          `patch on ${env.target} failed: ${e instanceof Error ? e.message : String(e)}`,
          env,
          e,
        );
      }
      return next;
    }
    case "add_node": {
      const at =
        typeof env.at === "number"
          ? Math.max(0, Math.min(env.at, next.nodes.length))
          : next.nodes.length;
      next.nodes.splice(at, 0, env.node);
      return next;
    }
    case "remove_node": {
      const before = next.nodes.length;
      next.nodes = next.nodes.filter((n) => n.id !== env.target);
      if (next.nodes.length === before) {
        throw new PatchError(`remove target ${env.target} not found`, env);
      }
      return next;
    }
    case "set_layout": {
      next.layout = {
        flow: env.flow ?? next.layout?.flow ?? "stack",
        ...(env.columns !== undefined ? { columns: env.columns } : {}),
      };
      return next;
    }
  }
}

// Apply a sequence of envelopes. Throws on first failure with context about
// which envelope blew up — callers should fall back to a full regen.
export function applyEnvelopes(
  story: StorySpec,
  envelopes: PatchEnvelope[],
): StorySpec {
  let current = story;
  for (const env of envelopes) {
    current = applyEnvelope(current, env);
  }
  return current;
}

// Re-export for callers that just want to mutate raw json patch ops directly.
export type { JsonPatchOp };
