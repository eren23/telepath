import { StorySpec } from "@/lib/elicit/schemas";
import { synthesizeStory } from "@/lib/elicit/synthesize-spec";
import { generateStoryPatch } from "@/lib/viz/spec-patch";
import { applyEnvelopes } from "@/lib/viz/apply-patch";
import type { ResolvedIntent } from "@/lib/elicit/schemas";
import type { PatchEnvelope } from "@/lib/viz/patch-schema";

export type FallbackOutcome = {
  story: import("@/lib/elicit/schemas").StorySpec;
  via: "kimi-fallback";
  envelope?: PatchEnvelope[];
};

// Used when Claude Agent SDK is unavailable, errors, or hits a token cap.
// Always lands on a workable Story so the UI doesn't dead-end.
export async function kimiFallback(args: {
  prompt: string;
  prevStory: import("@/lib/elicit/schemas").StorySpec | null;
}): Promise<FallbackOutcome> {
  const { prompt, prevStory } = args;

  if (prevStory) {
    // Try patch first — much smaller turn.
    try {
      const r = await generateStoryPatch(prevStory, prompt);
      if (r.envelope && r.envelope.length > 0) {
        const story = applyEnvelopes(prevStory, r.envelope);
        return { story, via: "kimi-fallback", envelope: r.envelope };
      }
    } catch (e) {
      console.warn("[agent-fallback] patch failed, regenerating:", e);
    }
  }

  // Either no prior story, or patch failed — synthesize fresh.
  const intent: ResolvedIntent = {
    goal: prompt,
    outputKind: "story",
    dimensions: [],
  };
  const r = await synthesizeStory(intent);
  return { story: StorySpec.parse(r.spec), via: "kimi-fallback" };
}
