"use client";

import { useMemo } from "react";
import type { NetworkSpec } from "@/lib/elicit/schemas";

type Props = { spec: NetworkSpec };

const NEURON_R = 14;
const NEURON_GAP = 14;
const LAYER_GAP = 140;
const PAD_X = 60;
const PAD_Y = 40;
const LABEL_GAP = 26;
const NODE_FILL = "#7c8cff";
const EDGE_COLOR = "#3f3f55";
const ACTIVATION_COLOR = "#9aa0c2";

type Positioned = {
  layerIdx: number;
  layer: NetworkSpec["layers"][number];
  nodes: Array<{
    id: string;
    qid: string;
    label?: string;
    sublabel?: string;
    color?: string;
    shape: "circle" | "square" | "stack";
    cx: number;
    cy: number;
  }>;
};

export default function NetworkRenderer({ spec }: Props) {
  const horizontal = (spec.direction ?? "lr") === "lr";
  const layout = useMemo(() => layoutNetwork(spec, horizontal), [spec, horizontal]);
  const edges = useMemo(
    () => computeEdges(spec, layout, horizontal),
    [spec, layout, horizontal],
  );

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-6">
      {spec.title ? (
        <div className="mb-3 text-[13px] uppercase tracking-wider text-zinc-400">
          {spec.title}
        </div>
      ) : null}
      <div className="overflow-auto">
        <svg
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          width="100%"
          style={{ maxHeight: 480 }}
          role="img"
        >
          <defs>
            <marker
              id="net-arrow"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto"
            >
              <path d="M0,0 L10,5 L0,10 Z" fill={EDGE_COLOR} />
            </marker>
          </defs>

          {edges.map((e, i) => (
            <path
              key={`edge-${i}`}
              d={e.d}
              stroke={e.color}
              strokeWidth={e.thickness}
              strokeOpacity={e.opacity}
              strokeDasharray={e.dashed ? "4 3" : undefined}
              fill="none"
            />
          ))}

          {layout.layers.map((l) => (
            <g key={`layer-${l.layer.id}`}>
              {l.layer.label ? (
                <text
                  x={horizontal ? l.nodes[0].cx : layout.width / 2}
                  y={horizontal ? PAD_Y - 18 : l.nodes[0].cy - 2}
                  fill="#d4d4d8"
                  fontSize={12}
                  textAnchor={horizontal ? "middle" : "start"}
                  fontFamily="ui-sans-serif, system-ui"
                >
                  {l.layer.label}
                </text>
              ) : null}
              {l.nodes.map((n) => (
                <g key={n.qid}>
                  {renderShape(n)}
                  {n.label ? (
                    <text
                      x={n.cx}
                      y={n.cy + 4}
                      fill="#0b0b14"
                      fontSize={10}
                      textAnchor="middle"
                      fontFamily="ui-monospace, monospace"
                      pointerEvents="none"
                    >
                      {clip(n.label, 4)}
                    </text>
                  ) : null}
                  {n.sublabel ? (
                    <text
                      x={n.cx}
                      y={n.cy + NEURON_R + 12}
                      fill="#a1a1aa"
                      fontSize={10}
                      textAnchor="middle"
                      fontFamily="ui-sans-serif, system-ui"
                    >
                      {clip(n.sublabel, 22)}
                    </text>
                  ) : null}
                </g>
              ))}
            </g>
          ))}

          {layout.activations.map((a, i) => (
            <text
              key={`act-${i}`}
              x={a.x}
              y={a.y}
              fill={ACTIVATION_COLOR}
              fontSize={11}
              textAnchor="middle"
              fontFamily="ui-monospace, monospace"
            >
              {a.text}
            </text>
          ))}
        </svg>
      </div>

      {spec.legend && spec.legend.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-zinc-400">
          {spec.legend.map((l, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <span
                className="inline-block h-3 w-3 rounded-sm"
                style={{ background: l.swatch }}
              />
              <span>{l.label}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function renderShape(n: Positioned["nodes"][number]) {
  const fill = n.color ?? NODE_FILL;
  if (n.shape === "square") {
    const s = NEURON_R * 1.7;
    return (
      <rect
        x={n.cx - s / 2}
        y={n.cy - s / 2}
        width={s}
        height={s}
        rx={3}
        fill={fill}
        stroke="#0b0b14"
        strokeWidth={1}
      />
    );
  }
  if (n.shape === "stack") {
    const s = NEURON_R * 1.6;
    return (
      <g>
        {[2, 1, 0].map((k) => (
          <rect
            key={k}
            x={n.cx - s / 2 + k * 3}
            y={n.cy - s / 2 - k * 3}
            width={s}
            height={s}
            rx={2}
            fill={fill}
            fillOpacity={1 - k * 0.18}
            stroke="#0b0b14"
            strokeWidth={1}
          />
        ))}
      </g>
    );
  }
  return (
    <circle
      cx={n.cx}
      cy={n.cy}
      r={NEURON_R}
      fill={fill}
      stroke="#0b0b14"
      strokeWidth={1}
    />
  );
}

function layoutNetwork(
  spec: NetworkSpec,
  horizontal: boolean,
): {
  layers: Positioned[];
  activations: Array<{ x: number; y: number; text: string }>;
  width: number;
  height: number;
} {
  const maxLayerSize = Math.max(...spec.layers.map((l) => l.nodes.length));
  const nodeStride = NEURON_R * 2 + NEURON_GAP;
  const crossSpan = maxLayerSize * nodeStride;

  const layers: Positioned[] = spec.layers.map((layer, layerIdx) => {
    const positionedNodes = layer.nodes.map((node, nodeIdx) => {
      const offset =
        ((nodeIdx - (layer.nodes.length - 1) / 2) * nodeStride);
      const cross = crossSpan / 2 + offset;
      const along = layerIdx * LAYER_GAP;
      const cx = horizontal ? PAD_X + along : PAD_X + cross;
      const cy = horizontal ? PAD_Y + LABEL_GAP + cross : PAD_Y + LABEL_GAP + along;
      return {
        id: node.id,
        qid: `${layer.id}.${node.id}`,
        label: node.label,
        sublabel: node.sublabel,
        color: node.color,
        shape: node.shape ?? "circle",
        cx,
        cy,
      };
    });
    return { layerIdx, layer, nodes: positionedNodes };
  });

  const activations: Array<{ x: number; y: number; text: string }> = [];
  for (let i = 0; i < spec.layers.length - 1; i++) {
    const act = spec.layers[i + 1].activation;
    if (!act) continue;
    const a = layers[i].nodes[0];
    const b = layers[i + 1].nodes[0];
    activations.push({
      x: (a.cx + b.cx) / 2,
      y: horizontal ? PAD_Y + LABEL_GAP + crossSpan / 2 - 4 : (a.cy + b.cy) / 2,
      text: act,
    });
  }

  const width = horizontal
    ? PAD_X * 2 + (spec.layers.length - 1) * LAYER_GAP
    : PAD_X * 2 + crossSpan;
  const height = horizontal
    ? PAD_Y * 2 + LABEL_GAP + crossSpan
    : PAD_Y * 2 + LABEL_GAP + (spec.layers.length - 1) * LAYER_GAP;
  return { layers, activations, width, height };
}

function computeEdges(
  spec: NetworkSpec,
  layout: ReturnType<typeof layoutNetwork>,
  horizontal: boolean,
): Array<{
  d: string;
  thickness: number;
  opacity: number;
  color: string;
  dashed: boolean;
}> {
  const nodeMap = new Map<string, { cx: number; cy: number }>();
  for (const l of layout.layers) {
    for (const n of l.nodes) {
      nodeMap.set(n.qid, { cx: n.cx, cy: n.cy });
      // Also accept bare id when globally unique.
      if (!nodeMap.has(n.id)) nodeMap.set(n.id, { cx: n.cx, cy: n.cy });
    }
  }

  const explicit = spec.edges ?? [];
  let pairs: Array<{
    a: { cx: number; cy: number };
    b: { cx: number; cy: number };
    weight: number;
    color: string;
    dashed: boolean;
  }> = [];

  if (explicit.length > 0) {
    for (const e of explicit) {
      const a = nodeMap.get(e.from);
      const b = nodeMap.get(e.to);
      if (!a || !b) continue;
      pairs.push({
        a,
        b,
        weight: typeof e.weight === "number" ? e.weight : 1,
        color: e.color ?? EDGE_COLOR,
        dashed: e.style === "dashed",
      });
    }
  } else if ((spec.connect ?? "full") === "full") {
    for (let i = 0; i < layout.layers.length - 1; i++) {
      for (const a of layout.layers[i].nodes) {
        for (const b of layout.layers[i + 1].nodes) {
          pairs.push({ a, b, weight: 1, color: EDGE_COLOR, dashed: false });
        }
      }
    }
  }

  const maxW = Math.max(1, ...pairs.map((p) => Math.abs(p.weight)));
  return pairs.map(({ a, b, weight, color, dashed }) => {
    const t = Math.abs(weight) / maxW;
    return {
      d: bezier(a, b, horizontal),
      thickness: Math.max(0.6, t * 2.2),
      opacity: 0.25 + 0.6 * t,
      color,
      dashed,
    };
  });
}

function bezier(
  a: { cx: number; cy: number },
  b: { cx: number; cy: number },
  horizontal: boolean,
): string {
  if (horizontal) {
    const mx = (a.cx + b.cx) / 2;
    return `M ${a.cx + NEURON_R} ${a.cy} C ${mx} ${a.cy} ${mx} ${b.cy} ${b.cx - NEURON_R} ${b.cy}`;
  }
  const my = (a.cy + b.cy) / 2;
  return `M ${a.cx} ${a.cy + NEURON_R} C ${a.cx} ${my} ${b.cx} ${my} ${b.cx} ${b.cy - NEURON_R}`;
}

function clip(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}
