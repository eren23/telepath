# Submission package — Telepath

> Deadline: **EOD Sunday 2026-05-03**.
> Tracks: **Main** ($15k) + **Kimi** ($5k + $5k credits) — Telepath qualifies for both because Kimi K2 powers all five reasoning steps + Hermes' own subagent.

---

## 1. Pre-flight checklist (do this 15 min before recording)

- [ ] **Disable Dark Reader on `localhost:3000`** (extension menu → site toggle off). The app already has a tuned dark theme; the auto-inversion muddies the chip palette and Vega charts.
- [ ] **Restart dev server clean**: `pnpm dev`. Confirm both pills in the header glow (Kimi K2 + ⚕ Hermes Agent).
- [ ] **Pre-warm the Hermes subprocess** so the demo doesn't pay a cold-start penalty:
  ```bash
  curl -sS -X POST -H 'content-type: application/json' \
    -d '{"prompt":"warmup","timeoutMs":40000}' \
    http://localhost:3000/api/hermes/ask | head -1
  ```
- [ ] **Memory snapshot**: open Sources drawer once, confirm `Hermes filesystem` shows ≥3 chips and `Personal context (preloaded)` shows ≥10 chips.
- [ ] **Empty the thread** (header `Clear · N` button) and **delete any prior `time-spent-breakdown-chart` skill folder** under `~/.hermes/skills/telepath/` so the distillation demo lands on a clean state.
- [ ] **Terminal pane** ready in a second window, sized to ~50% screen, font 14pt, prompt `$ `, cleared. You'll type one command on camera.
- [ ] **Recorder**: ScreenStudio or QuickTime, 1080p60 if possible, mouse highlights on, 16:9.

---

## 2. Demo script (≤ 95 seconds)

| t | Beat | What you do | What's visible | Voice-over (if any) |
|---|------|-------------|----------------|---------------------|
| 0:00 | **Title** | Static title card | "It already knew." | (silence, 6s) |
| 0:08 | **Cold-start ask** | Click header → toggle "Cold start" on. Type *"chart how my research is going"* → ⌘↵ | Empty left rail. Telepath asks 1 chip question (probably data source). Click any chip. Bar chart renders. | "Cold start. Telepath has to ask before it can render." |
| 0:24 | **Memory active** | Toggle "Cold start" off. Re-type or hit ↑ to recall. Send. | Chips on the left rail glow **one by one** as Kimi consumes them. **Zero questions.** Chart titled with your real project names (CodeWM / Diff-XYZ / Sfumato) instead of `Project A`. | "Same ask, but now Hermes' memory is on. Watch the chips light up — that's Telepath using your `USER.md` and the preloaded context." |
| 0:42 | **Live-data via Hermes** | New ask: *"slide of what's new in code-world-models research this week"* | Below the dimension strip a `⚕ Hermes web search` badge appears. ~8-12s wait, then slide renders with web-pulled facts as bullets. Click the badge to expand and show the actual snippets. | "Now I'm asking for fresh facts. Telepath spawns Hermes Agent in a subprocess, Hermes runs its own web tool, returns 3-5 snippets, Telepath weaves them into the slide." |
| 1:05 | **Distill skill** | Click "Save as skill" on the slide. Modal opens, `⚕ distilling…` for ~7s. | Modal shows generalized name, description, **3 future-phrasing patterns**, and the **slots Hermes parameterized** (`{time-metric}` → "GPU minutes", etc.). | "When you save, Hermes turns this one render into a reusable skill — abstracts away your specific projects, keeps the recipe." |
| 1:20 | **Confirm + show CLI** | Click "Save generalized". Skill appears in right rail with `$ hermes /telepath-<slug>` line. Click `weekly` schedule chip. | Toast: "scheduled weekly". Optional: switch to terminal, run `hermes cron list`, point at the new entry. | "It's a real Hermes skill now. Invocable from CLI, Telegram, Slack — and Hermes will replay it weekly." |
| 1:32 | **End card** | Static text | *"Five Kimi K2 prompts. One Hermes Agent. Zero blank canvases."* | (silence, 3s) |
| 1:35 | end | | | |

**Total budget: 95s. If running long, cut the terminal beat** (1:25-1:32) — the SkillsRail CLI hint is enough.

### Cut order if anything breaks live

1. Live-data beat (Hermes can be slow some days). Substitute: just do beat 5 (distill) instead.
2. Schedule chip click. Save is enough.
3. Terminal pane.

### One-take vs. assembled

Single-take is cleaner for judges. Assembled with cuts is OK if Hermes is slow — just trim wait-times to 1-2 seconds with a "(snip)" marker overlay.

---

## 3. Tweet thread (paste-ready)

### Tweet 1 (hook + video)

```
"It already knew." 🧠

Telepath — a memory-aware visualizer for the Hermes Agent Creative Hackathon.

Vague intent in → polished chart, diagram, or slide out.
Reads your Hermes Agent's persistent memory first, only asks if it has to.

Built with @Kimi_Moonshot K2 + @NousResearch Hermes Agent.

[video, 95s]
```

### Tweet 2 (architecture, reply)

```
Five Kimi K2 prompts run the kernel:
parse_intent → pick_question → synthesize_spec → suggest_followups → refine_intent

Hermes Agent provides four memory layers:
SOUL.md (persona) · USER.md (identity) · MEMORY.md (episodic) · skills/ (procedural)

[architecture diagram, from PITCH.md]
```

### Tweet 3 (Hermes-as-runtime, reply)

```
Telepath isn't just *reading* Hermes — it spawns Hermes as a subprocess for live web search, queries the FTS5 session DB for cross-conversation recall, and uses Hermes itself to *distill* every saved render into a reusable skill the agent can replay from any gateway.

[screenshot of distill modal showing slots]
```

### Tweet 4 (repo + thanks, reply)

```
Repo: github.com/[your-handle]/telepath  (MIT)
Stack: Next.js 16, React 19, Tailwind 4, Vega-Lite v5, Mermaid v11.
Powered by Kimi K2 (`moonshotai/kimi-k2-0905`) via OpenRouter.

Thanks @NousResearch and @Kimi_Moonshot for the hackathon.
```

### Where to post

- Tweet thread → `@NousResearch` mentioned in tweet 1
- Drop the tweet 1 URL into the `#creative-hackathon-submissions` Discord channel
- For Kimi-track eligibility: tweet 1 includes the Kimi mention + the demo video shows the "Kimi K2" header pill on screen

---

## 4. Writeup gist (long-form, link from tweet 4)

Paste this into a public GitHub gist or the repo README's top section:

```markdown
# Telepath

> The visualizer that already knows you.

Built for the **Hermes Agent Creative Hackathon** (Nous Research × Kimi/Moonshot, May 2026).

## The problem

Every text-to-viz tool starts cold: a blank canvas, then a series of forms — what data? what time window? which palette? Your Hermes Agent already knows the answers to most of these, sitting in `USER.md`, `MEMORY.md`, and a year of session history. Why ask?

## What Telepath does

You drop a vague intent. Telepath:

1. **Reads** your Hermes filesystem + any sources you've added (free text, JSON paste, HTTP API, Claude Code traces, FTS5 session search).
2. **Parses** the intent with Kimi K2, scoring an ambiguity profile across renderer dimensions (audience, time window, palette, breakdown, …).
3. **Asks at most one** chip-style question — the one with highest expected information gain.
4. **Calls Hermes Agent** as a subprocess if the intent demands fresh world-state (latest research, current SOTA, today's stats). Hermes runs its `web` tool, returns snippets.
5. **Synthesizes** a Vega-Lite chart, Mermaid diagram, or single-slide infographic — weaving in your real project names, palette, and the live facts.
6. **Distills the render into a Hermes skill** — Hermes itself proposes the abstract recipe + parameterized slots so the saved skill works for many future asks.
7. Optionally **schedules** the skill via `hermes cron` so it refreshes itself on a cadence.

## The five Kimi K2 prompts

| Step | Role |
|---|---|
| `parse_intent` | Reframe goal, ground dimensions from memory, flag if web search is needed |
| `pick_question` | Rank unresolved dimensions by impact, ask one chip-question or skip |
| `synthesize_spec` | Emit a Vega-Lite / Mermaid / slide JSON spec |
| `suggest_followups` | Three contextual chips: refine, pivot, save |
| `refine_intent` | Diff the previous resolved intent against a tweak; preserve memory choices |

## How Hermes Agent participates

Not just as a filesystem to read.

- **`hermes chat -q "<query>" -t web`** — subprocess for live data inside the render pipeline. The subagent answer comes back, gets injected into the slide as bullets/stats.
- **`~/.hermes/state.db` FTS5** — a new source type queries Hermes' indexed past sessions, returning matching snippets as memory chips.
- **`hermes cron create`** — scheduling chips on every saved skill.
- **`~/.hermes/skills/telepath/<slug>/SKILL.md`** — saved renders are written as Hermes-canonical skill files, replayable via `hermes /telepath-<slug>` from CLI / Telegram / Discord / Slack.
- **Skill distillation via Hermes** — when you click Save, Hermes generates the abstract recipe + slots, so the skill matches future similar asks.

## Why Kimi K2 for both

Kimi K2 (`moonshotai/kimi-k2-0905` via OpenRouter) powers Telepath's five reasoning steps **and** Hermes' own provider — the same model thinks at both layers. The model name is shown in the header pill throughout the demo, satisfying the Kimi Track requirement.

## What we explicitly didn't do

- No DB. The Hermes filesystem is the database.
- No auth. Local-first single-user.
- No `hermes mcp serve` integration. Subprocess + filesystem is enough for 90s of demo.
- No multi-slide decks. One slide, but with charts, stats, quotes, and bullets.

## Stack

- **Next.js 16** (App Router) + React 19 + Tailwind 4
- **Vega-Lite v5** (chart) + **Mermaid v11** (diagram) + custom slide primitives
- **Kimi K2** via Moonshot OpenAI-compatible API (Telepath kernel) and via OpenRouter (Hermes' own backend)
- **Hermes Agent v0.6.0** (`hermes` CLI + `~/.hermes/state.db` SQLite via `node:sqlite`)
- **No backend DB.**

## Run it

```bash
pnpm install
cp .env.local.example .env.local        # add OPENROUTER_API_KEY
pnpm dev
```

Visit `http://localhost:3000`. Optional but recommended: have Hermes Agent installed at `~/.local/bin/hermes` for the live-data + skill-distillation beats. Without it, Telepath gracefully falls back to Kimi-only.

## License

MIT. Built by Eren Akbulut. May 2026.
```

---

## 5. Repo hygiene before submitting

- [ ] `git init` if not already, `git add -A`, commit `feat: telepath v1 — hermes creative hackathon submission`
- [ ] Add `LICENSE` file (MIT)
- [ ] Verify `.env.local` is in `.gitignore` (it should be — `.env*` is in Next.js default gitignore)
- [ ] Verify `data/spiderchat-memories.json` and `data/sources.json` — these contain personal-ish context. Either commit them (fine, the Spider Chat data is mild) or add to `.gitignore` and ship a `.example` of each. Recommended: gitignore both and commit `data/sources.json.example` with just the Hermes filesystem entry.
- [ ] Push to GitHub: `gh repo create telepath --public --source=. --push`
- [ ] In `package.json`, set `"name": "telepath"` and add `"description"` matching the writeup tagline

---

## 6. Submission acceptance criteria (re-read before posting)

- [ ] Tweet 1 mentions `@NousResearch` (verified visually before posting)
- [ ] Demo video duration ≤ 90s ideally, ≤ 120s acceptable
- [ ] Demo video shows the "Kimi K2" pill on screen at least once (Kimi Track eligibility — already satisfied by the header throughout the recording)
- [ ] Public GitHub repo URL in tweet 4
- [ ] Tweet 1 URL dropped in `#creative-hackathon-submissions`
- [ ] Submitted before EOD Sunday 2026-05-03 in Eren's local time

---

## 7. If you'd rather record a slightly different cut

**Quieter / no-narration version** (lets the UI speak):
- Slow down beats by ~20%, run total ~110s
- Add captions burned in for each beat ("0 questions", "Hermes web search · 8s", "Saved as Hermes skill")
- Use a single ambient track (CC0 — `Hyperion` or similar from Pixabay)

**Founder-y narration version**:
- Cut to ~80s
- Voice-over: "Every text-to-viz tool starts cold. Mine starts warm…" — full pitch in 4 lines
- End on a CTA: "Open source. Try it tonight."

I lean to the **quieter version** — the UX is the pitch.
