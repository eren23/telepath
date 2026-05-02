# Telepath

> The visualizer that already knows you.

Telepath is a memory-aware visualizer built for the **Hermes Agent Creative Hackathon** (Nous Research × Kimi/Moonshot, May 2026). You drop in a vague intent — *"show me how I've been spending my time"* — and it produces a polished chart, diagram, or single-screen infographic. The trick: it reads your **Hermes Agent's persistent memory** first (`~/.hermes/memories/`) and only asks if it really has to. The more Hermes knows you, the quieter Telepath gets.

Tagline: *"It already knew."*

## How it works

Three structured prompts driven by **Kimi K2** via the Moonshot OpenAI-compatible API:

1. **`parse_intent`** — restates the user's goal, picks the output kind (chart / diagram / slide), and grounds each renderer dimension (audience, time window, data source, breakdown, palette, etc.) using the user's `USER.md` and `MEMORY.md`. Dimensions are tagged with their **source**: `memory`, `default`, `asked`, or `missing`.
2. **`pick_question`** — ranks unresolved dimensions by *(impact × (1 − default-confidence))*. Asks **at most one** question, with chip suggestions. Skips entirely if nothing is high-impact.
3. **`synthesize_spec`** — emits a Vega-Lite v5 JSON, a Mermaid source, or a single-slide layout JSON depending on the chosen output kind.

Resolved (intent → spec) pairs persist back to `~/.hermes/skills/telepath/<slug>/DESCRIPTION.md` so Hermes can replay them next time, with zero questions.

## Stack

- Next.js 16 (App Router) + React 19 + Tailwind 4
- Kimi K2 (Moonshot OpenAI-compat API) — qualifies for both Main and Kimi tracks
- Vega-Lite, Mermaid, custom slide primitives
- No DB. The Hermes filesystem is the memory.

## Run it

```bash
pnpm install
cp .env.local.example .env.local
# add your MOONSHOT_API_KEY
pnpm dev
```

Visit `http://localhost:3000`.

If you don't have Hermes installed, Telepath falls back to a synthetic user profile so you can still try it.

## Demo flow (the one in the submission video)

1. **Cold start.** Toggle the header switch to "Cold start". Ask: *"chart how I've been spending my time."* Telepath asks 1–2 chip questions in sequence (data source, breakdown). Renders.
2. **Memory active.** Toggle off. Same ask. Telepath pulls answers from your `USER.md`, glows the chips it used in the left rail, asks **zero** questions. Renders.
3. **Replay.** Click a saved skill in the right rail — instant re-render, no LLM round-trip.

## Hermes integration

- Reads `~/.hermes/memories/USER.md` and `~/.hermes/memories/MEMORY.md` for grounding.
- Writes back to `~/.hermes/skills/telepath/<slug>/DESCRIPTION.md` with frontmatter — discoverable to the agent's own skill runner.
- Cold-start mode is a per-request env flag (`TELEPATH_COLD=1`), not a destructive toggle.

## License

MIT.
