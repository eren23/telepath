// Deterministic heuristic: is the user asking about an EXTERNAL topic
// (someone else's paper / product / library) rather than their own work?
//
// Run server-side after parse-intent, independent of the LLM, so memory
// suppression doesn't depend on the model remembering to flag it.

import type { MemoryChip } from "@/lib/hermes-memory";

// Org / lab / company names that obviously imply an external topic.
const EXTERNAL_ORG_TOKENS = new Set([
  "goodfire",
  "anthropic",
  "openai",
  "deepmind",
  "google",
  "meta",
  "facebook",
  "microsoft",
  "huggingface",
  "nvidia",
  "mistral",
  "cohere",
  "amazon",
  "apple",
  "tesla",
  "stability",
  "stabilityai",
  "midjourney",
  "perplexity",
  "xai",
  "groq",
  "together",
  "fireworks",
  "moonshot",
  "kimi",
  "nous",
  "nousresearch",
]);

const URL_RE = /\bhttps?:\/\/\S+/i;
const ARXIV_RE = /\barxiv\.org\/(?:abs|pdf)\/\d/i;
const DOI_RE = /\bdoi\.org\/\S+/i;
const PAPER_TOKENS_RE = /\b(?:paper|preprint|whitepaper|publication)\b/i;
const THIS_PAPER_RE = /\b(?:this|that|the|their)\s+(?:paper|article|preprint|repo|library|model|framework|technique|approach|method)\b/i;

const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "if", "to", "of", "for", "in",
  "on", "at", "by", "with", "from", "as", "is", "are", "was", "were", "be",
  "been", "being", "do", "does", "did", "have", "has", "had", "i", "you",
  "we", "they", "he", "she", "it", "this", "that", "these", "those",
  "my", "your", "our", "their", "his", "her", "its", "me", "us", "them",
  "what", "why", "how", "when", "where", "which", "who", "whose",
  "explain", "walk", "show", "tell", "make", "create", "build", "give",
  "draw", "render", "visualize", "describe", "help", "want", "need",
  "really", "very", "just", "also", "well", "much", "more", "some",
  "any", "all", "no", "not", "only", "than", "then", "so", "such",
  "about", "into", "through", "above", "below", "between", "after",
  "before", "under", "over", "up", "down", "out", "off", "again", "once",
  "today", "tonight", "now", "later", "soon",
  "dude", "bro", "hey", "lol", "bit", "thing", "stuff",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOP_WORDS.has(t));
}

function nouny(tokens: string[]): Set<string> {
  // Keep tokens that look like distinguishing nouns (length ≥ 4 OR all-caps acronym).
  const out = new Set<string>();
  for (const t of tokens) {
    if (t.length >= 4) out.add(t);
    else if (t.length === 3 && /[A-Z]{3}/.test(t)) out.add(t);
  }
  return out;
}

export type ExternalSignal = {
  external: boolean;
  reason: string;
  overlap: number;
  promptNouns: string[];
};

/**
 * Returns whether the goal/prompt is about an external topic.
 * Triggers:
 *  - URL / arxiv / doi anywhere in the prompt
 *  - Known third-party org token (case-insensitive)
 *  - "explain this paper" / "the X technique" framing
 *  - Bag-of-words overlap with user's chips is below threshold AND the
 *    prompt has at least 3 distinctive nouns of its own.
 */
export function detectExternal(args: {
  prompt: string;
  goal?: string;
  chips: MemoryChip[];
}): ExternalSignal {
  const combined = `${args.prompt} ${args.goal ?? ""}`.trim();

  if (URL_RE.test(combined) || ARXIV_RE.test(combined) || DOI_RE.test(combined)) {
    return {
      external: true,
      reason: "URL/arxiv/doi present in prompt",
      overlap: 0,
      promptNouns: [],
    };
  }

  const tokens = tokenize(combined);
  const nouns = nouny(tokens);

  for (const t of tokens) {
    if (EXTERNAL_ORG_TOKENS.has(t)) {
      return {
        external: true,
        reason: `references third-party org "${t}"`,
        overlap: 0,
        promptNouns: [...nouns],
      };
    }
  }

  if (THIS_PAPER_RE.test(combined) || PAPER_TOKENS_RE.test(combined)) {
    return {
      external: true,
      reason: "explicit 'paper / technique / library' framing",
      overlap: 0,
      promptNouns: [...nouns],
    };
  }

  // Compare prompt nouns against memory chip nouns.
  const chipText = args.chips.map((c) => c.raw).join(" ");
  const chipNouns = nouny(tokenize(chipText));
  let overlap = 0;
  for (const n of nouns) {
    if (chipNouns.has(n)) overlap++;
  }

  // Heuristic: if the prompt has ≥3 distinctive nouns and ≤1 of them overlaps
  // with the user's memory, treat as external (user is asking about something
  // that's not in their notes).
  if (nouns.size >= 3 && overlap <= 1) {
    return {
      external: true,
      reason: `low overlap with memory (${overlap}/${nouns.size} nouns)`,
      overlap,
      promptNouns: [...nouns],
    };
  }

  return {
    external: false,
    reason: `high overlap with memory (${overlap}/${nouns.size} nouns)`,
    overlap,
    promptNouns: [...nouns],
  };
}
