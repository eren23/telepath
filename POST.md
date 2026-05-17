# Telepath v2.3 — proper network viz, not mermaid crap

**TL;DR** — Telepath's `@agent` flow now has a first-class `network` node kind. Neural nets render as actual neurons + weighted edges, not Mermaid boxes-and-arrows.

---

## The problem

I asked `@agent` to walk me through Goodfire's SAE interpretability paper. It gave me:

- a clean `markdown` orientation node
- a beautiful `katex` block for the encoder/decoder equations
- a `mermaid` flowchart for the architecture (`H --> P --> E --> Z --> D`)

Then I asked **"can you visualize the network too?"** and it… emitted a `mafs` scene with three loose vector decorations and a single point at the origin. The renderer correctly refused to draw an empty math canvas. I got a "No curve in this scene" card.

Two failures stacked:

1. **mafs was the wrong tool** — Mafs is for plottable math (functions, parametrics). It can't draw an architecture.
2. **mermaid is the wrong tool too** — fine for control-flow / sequence / state machines, but a 4×8×4 autoencoder rendered as `[h1] --> [z1]` boxes-with-arrows looks like a build pipeline, not a neural net.

Neural nets want **neurons** (circles, sometimes stacked into feature-map blocks), **layered layout**, **activation labels in the gutter**, and **weighted edges** where weight controls thickness/opacity.

## The fix

A new `network` VizNode kind, dedicated to neural-net architectures. Spec:

```ts
{
  direction?: "lr" | "tb",
  layers: Array<{
    id: string,
    label?: string,
    activation?: string,  // rendered between this layer and the previous one
    nodes: Array<{
      id: string,
      label?: string,
      sublabel?: string,
      color?: string,
      shape?: "circle" | "square" | "stack",
    }>,
  }>,
  edges?: Array<{
    from: string,           // "<layer-id>.<node-id>" or bare id if unique
    to: string,
    weight?: number,        // → edge thickness + opacity
    label?: string,
    color?: string,
    style?: "solid" | "dashed",
  }>,
  connect?: "full" | "none", // default "full" when edges is omitted
  legend?: Array<{ swatch: string, label: string }>,
}
```

Renderer is pure SVG, no new deps. Layered layout, bezier edges, activation labels in the gutter between layers, optional legend, `shape: "stack"` for feature-map blocks (CNN style).

Both the Claude Agent SDK system prompt and the Kimi spec-patch prompt now have explicit kind-selection guidance:

- **network** → neural nets, MLPs, autoencoders, transformer blocks
- **mermaid** → flowcharts, sequence diagrams, state machines, build pipelines
- **mafs** → math curves (functionY, parametric) with sliders
- **katex** → a single equation
- **markdown** → prose
- **vega** → data charts

A semantic validator catches LLM emissions that pass Zod but produce dead-end UI (a mafs scene with no curve, an empty network, etc.). Bad emits bounce back to the model with an actionable retry message instead of rendering "No curve in this scene".

## Worked example — the SAE

This is the exact spec `@agent` produced when I re-ran the Goodfire prompt after v2.3:

```jsonc
{
  "title": "Sparse Autoencoder over the residual stream",
  "nodes": [
    {
      "id": "arch",
      "kind": "network",
      "spec": {
        "title": "h → z → ĥ",
        "direction": "lr",
        "layers": [
          { "id": "in", "label": "residual h",
            "nodes": [{"id":"h1"},{"id":"h2"},{"id":"h3"},{"id":"h4"}] },
          { "id": "feat", "label": "sparse z", "activation": "ReLU",
            "nodes": [
              {"id":"z1","color":"#5eead4"},
              {"id":"z2","color":"#3f3f55"},
              {"id":"z3","color":"#5eead4"},
              {"id":"z4","color":"#3f3f55"},
              {"id":"z5","color":"#5eead4"},
              {"id":"z6","color":"#3f3f55"},
              {"id":"z7","color":"#3f3f55"},
              {"id":"z8","color":"#5eead4"}
            ] },
          { "id": "out", "label": "reconstruction ĥ",
            "nodes": [{"id":"r1"},{"id":"r2"},{"id":"r3"},{"id":"r4"}] }
        ],
        "connect": "full",
        "legend": [
          {"swatch":"#5eead4","label":"active feature"},
          {"swatch":"#3f3f55","label":"inactive (sparse)"}
        ]
      }
    },
    {
      "id": "eq", "kind": "katex",
      "spec": {
        "tex": "z = \\mathrm{ReLU}(W_{\\text{enc}}(h - b_{\\text{pre}}) + b_{\\text{enc}})\\quad\\hat h = W_{\\text{dec}} z + b_{\\text{post}}",
        "concepts": [
          {"id":"Wenc","label":"W_enc","anchors":["W_{\\text{enc}}","W_enc"],
           "explainer":"Encoder weight matrix. Rows are feature *directions* in the residual stream's $d$-dimensional space."},
          {"id":"Wdec","label":"W_dec","anchors":["W_{\\text{dec}}","W_dec"],
           "explainer":"Decoder weight matrix. Each column is the *meaning* of one feature in the residual basis."}
        ]
      }
    },
    {
      "id": "intuition", "kind": "markdown",
      "spec": {
        "md": "The **encoder** projects the dense residual `h` onto an overcomplete dictionary of **features**. **ReLU** + an L1 penalty force most features to zero on any given token — that's the *sparse* in sparse autoencoder. The **decoder** is just the inverse projection: `ĥ = W_dec z`. When a feature fires, you can attribute the model's behaviour to whatever concept that direction represents.",
        "concepts": [
          {"id":"sparse","label":"sparsity","anchors":["sparse","sparse autoencoder"],
           "explainer":"Only a small fraction of features activate per token. Enforced by an L1 penalty on $z$ during SAE training."},
          {"id":"overcomplete","label":"overcomplete dictionary","anchors":["overcomplete dictionary","features"],
           "explainer":"The SAE has more features ($n$) than residual dimensions ($d$), so multiple features can compete for the same direction."}
        ]
      }
    }
  ]
}
```

Render result:

- **Top node**: three layered columns of neurons. 4 residual dims fan into 12 sparse features (active ones teal, inactive grey) and fan back out into 4 reconstructed dims. ReLU label sits in the gutter between layers. Edge opacity reflects weight magnitude. Legend bottom-left.
- **Middle node**: KaTeX block of the encoder/decoder equation. Hovering `W_enc` or `W_dec` pops the concept explainer.
- **Bottom node**: prose intuition. Hovering "sparse autoencoder" or "overcomplete dictionary" pops their explainers.

## How to reproduce

```bash
git pull
pnpm dev
# open localhost:3000
# in the composer:
@agent explain a sparse autoencoder visually — residual h getting encoded
to a sparse z then decoded back to ĥ. I want to SEE the network with
neurons, not just boxes.
```

If `@agent: Claude (CLI)` shows in the header you're using the Claude Agent SDK with MCP tools (`emit_story`, `patch_story`, `search_arxiv`, `eval_math`). If it says `Claude (env)` you're on `ANTHROPIC_API_KEY`. If `Kimi only`, the network kind still works — Kimi has been steered the same way via the spec-patch system prompt.

## What else shipped in v2.3

- **`@agent` auths via the local Claude Code CLI session** — no env var needed if you're already logged into Claude Code. Detection probe in `/api/skills` returns one of `claude-env` / `claude-cli` / `kimi-only`.
- **No-op refines surfaced** — if the patch engine can't map your tweak to a concrete change, you see `(no change) <reason>` instead of the same viz re-rendered.
- **Render error boundaries everywhere** — one bad node / one bad slide no longer blanks the whole app. Each viz gets a `RenderBoundary` with a per-kind error card.
- **Post-patch Zod re-validation** — JSON-patches that remove required fields now throw `PatchError` instead of silently producing a structurally-broken spec.
- **Mafs render guards** — `vector`/`text`/`latex` elements with missing `tail`/`tip`/`at` skip the element instead of crashing the scene.
- **Bigger prompt cap** — `@agent` accepts 16k chars (was 2k), with a structured per-node story summary instead of mid-JSON truncation.

---

*Built for the Hermes Creative Hackathon. Source: [github.com/erenakbulut/telepath](https://github.com/erenakbulut/telepath).*
