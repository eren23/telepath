import { applyPatch, deepClone, type Operation } from "fast-json-patch";
import { StorySpec as StorySpecSchema } from "@/lib/elicit/schemas";
import type { StorySpec, VizNode } from "@/lib/elicit/schemas";
import type { JsonPatchOp, PatchEnvelope } from "./patch-schema";
import { validateStorySemantics } from "./validate-semantics";

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
// resolution failure (missing target, missing path, bad op) OR if the
// post-patch StorySpec no longer validates — that catches patches that
// remove required fields or invalidate a node kind, so the tool layer can
// return a structured error back to Claude before the renderer ever sees it.
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
      return validateOrThrow(next, env);
    }
    case "add_node": {
      const at =
        typeof env.at === "number"
          ? Math.max(0, Math.min(env.at, next.nodes.length))
          : next.nodes.length;
      next.nodes.splice(at, 0, env.node);
      return validateOrThrow(next, env);
    }
    case "remove_node": {
      const before = next.nodes.length;
      next.nodes = next.nodes.filter((n) => n.id !== env.target);
      if (next.nodes.length === before) {
        throw new PatchError(`remove target ${env.target} not found`, env);
      }
      return validateOrThrow(next, env);
    }
    case "set_layout": {
      next.layout = {
        flow: env.flow ?? next.layout?.flow ?? "stack",
        ...(env.columns !== undefined ? { columns: env.columns } : {}),
      };
      return validateOrThrow(next, env);
    }
  }
}

function validateOrThrow(candidate: StorySpec, env: PatchEnvelope): StorySpec {
  const parsed = StorySpecSchema.safeParse(candidate);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path?.join(".") ?? "<root>";
    throw new PatchError(
      `post-patch validation failed at ${path}: ${issue?.message ?? "unknown"}`,
      env,
      parsed.error,
    );
  }
  const semanticReason = validateStorySemantics(parsed.data as StorySpec);
  if (semanticReason) {
    throw new PatchError(`post-patch semantics failed: ${semanticReason}`, env);
  }
  return parsed.data as StorySpec;
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
