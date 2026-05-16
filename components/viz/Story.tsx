"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import type { StorySpec, VizNode } from "@/lib/elicit/schemas";
import { ConceptProvider } from "./ConceptPopover";

const VegaCanvas = dynamic(
  () => import("@/components/renderers/VegaCanvas"),
  { ssr: false },
);
const MermaidCanvas = dynamic(
  () => import("@/components/renderers/MermaidCanvas"),
  { ssr: false },
);
const MafsRenderer = dynamic(
  () => import("./renderers/MafsRenderer"),
  { ssr: false },
);
const KatexNode = dynamic(() => import("./renderers/KatexNode"), {
  ssr: false,
});
const MarkdownNode = dynamic(() => import("./renderers/MarkdownNode"), {
  ssr: false,
});

type Props = { spec: StorySpec };

export default function Story(props: Props) {
  return (
    <ConceptProvider>
      <StoryInner {...props} />
    </ConceptProvider>
  );
}

function StoryInner({ spec }: Props) {
  const layout = spec.layout?.flow ?? "stack";
  const cols = spec.layout?.columns ?? 2;

  if (layout === "tabs") {
    return <TabsLayout spec={spec} />;
  }

  const gridClass =
    layout === "grid"
      ? cols >= 3
        ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
        : cols === 2
          ? "grid grid-cols-1 md:grid-cols-2 gap-4"
          : "flex flex-col gap-4"
      : "flex flex-col gap-4";

  return (
    <div className="flex flex-col gap-3">
      {spec.title ? (
        <div className="text-[12px] uppercase tracking-wider text-zinc-500">
          {spec.title}
        </div>
      ) : null}
      <div className={gridClass}>
        {spec.nodes.map((node) => (
          <NodeCard key={node.id} node={node} />
        ))}
      </div>
    </div>
  );
}

function TabsLayout({ spec }: { spec: StorySpec }) {
  const [active, setActive] = useState(0);
  const node = spec.nodes[active] ?? spec.nodes[0];
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-1">
        {spec.nodes.map((n, i) => (
          <button
            key={n.id}
            type="button"
            onClick={() => setActive(i)}
            className={
              "rounded-full border px-3 py-1 text-[11px] uppercase tracking-wider transition " +
              (i === active
                ? "border-[var(--accent)]/60 bg-[var(--accent)]/15 text-[var(--accent)]"
                : "border-[var(--border)] bg-[var(--panel-2)] text-zinc-400 hover:border-[var(--accent-soft)] hover:text-zinc-100")
            }
          >
            {n.title ?? n.kind}
          </button>
        ))}
      </div>
      <NodeCard node={node} />
    </div>
  );
}

function NodeCard({ node }: { node: VizNode }) {
  return (
    <div className="flex flex-col gap-1">
      {node.title ? (
        <div className="text-[11px] uppercase tracking-wider text-zinc-500">
          {node.title}
        </div>
      ) : null}
      <NodeRenderer node={node} />
    </div>
  );
}

function NodeRenderer({ node }: { node: VizNode }) {
  switch (node.kind) {
    case "vega":
      return <VegaCanvas spec={node.spec} />;
    case "mermaid":
      return <MermaidCanvas source={node.spec.source} />;
    case "mafs":
      return <MafsRenderer spec={node.spec} />;
    case "katex":
      return <KatexNode spec={node.spec} />;
    case "markdown":
      return <MarkdownNode spec={node.spec} />;
  }
}
