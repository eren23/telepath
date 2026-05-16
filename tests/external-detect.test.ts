import { describe, it, expect } from "vitest";
import { detectExternal } from "@/lib/elicit/external-detect";
import type { MemoryChip } from "@/lib/hermes-memory";

function chip(raw: string, id = "c1"): MemoryChip {
  return { id, raw, label: raw.slice(0, 30), origin: "hermes" };
}

describe("detectExternal", () => {
  it("flags URLs as external", () => {
    const sig = detectExternal({
      prompt: "https://www.goodfire.ai/research/interpreting-lm-parameters# explain me",
      chips: [chip("CodeWM 1.3M parameter VICReg model")],
    });
    expect(sig.external).toBe(true);
    expect(sig.reason).toMatch(/URL/i);
  });

  it("flags arxiv IDs as external", () => {
    const sig = detectExternal({
      prompt: "explain arxiv.org/abs/2403.12345 to me",
      chips: [chip("user works on CodeWM")],
    });
    expect(sig.external).toBe(true);
    expect(sig.reason).toMatch(/URL|arxiv/i);
  });

  it("flags known third-party orgs", () => {
    for (const org of ["goodfire", "anthropic", "openai", "deepmind"]) {
      const sig = detectExternal({
        prompt: `walk me through ${org}'s new technique for sparse autoencoders`,
        chips: [chip("CodeWM RunPod 2x RTX 4090 training pipeline")],
      });
      expect(sig.external).toBe(true);
      expect(sig.reason).toMatch(/third-party/);
    }
  });

  it("flags 'explain this paper' framing", () => {
    const sig = detectExternal({
      prompt: "explain this paper to me, i want to understand the technique",
      chips: [chip("user has projects CodeWM Sfumato Diff-XYZ")],
    });
    expect(sig.external).toBe(true);
    expect(sig.reason).toMatch(/paper|technique/);
  });

  it("treats self-topic prompts as NOT external when memory overlaps", () => {
    const sig = detectExternal({
      prompt: "chart my CodeWM GPU hours by project this month",
      chips: [
        chip("CodeWM 1.3M parameter VICReg+pred SOTA on CommitPackFT"),
        chip("uses RunPod 2x RTX 4090 trains overnight"),
        chip("active project Sfumato E2 ablation"),
      ],
    });
    expect(sig.external).toBe(false);
    expect(sig.overlap).toBeGreaterThan(0);
  });

  it("flags as external when prompt nouns don't match memory", () => {
    const sig = detectExternal({
      prompt: "show me the basics of fourier transforms with editable amplitude",
      chips: [chip("CodeWM VICReg RunPod CommitPackFT")],
    });
    expect(sig.external).toBe(true);
  });

  it("returns NOT external when there are no chips at all", () => {
    const sig = detectExternal({
      prompt: "what is a sine wave",
      chips: [],
    });
    // No chips → no bias risk. The overlap heuristic still requires ≥3 distinctive
    // nouns to flip external — short prompts stay non-external by default.
    expect(sig.external).toBe(false);
  });
});
