import { chatJSON } from "@/lib/kimi";
import type { StorySpec } from "@/lib/elicit/schemas";
import { PatchResponse } from "./patch-schema";

const SYSTEM = `You are Telepath's spec-patch engine. The user has a multi-node Story rendered in front of them and wants a TWEAK.

Output ONLY a JSON object matching this shape:
{
  "envelope": PatchEnvelope[],
  "explanation"?: string
}

PatchEnvelope is one of:
- { "op": "patch", "target": "<node id>", "patches": JsonPatchOp[] }
  - JsonPatchOp is RFC 6902: {"op":"add"|"replace"|"remove"|"move"|"copy"|"test","path":"<json pointer into the NODE (not the whole story)>","value":<any if needed>,"from":<pointer if move/copy>}
  - Path is relative to the NODE object, NOT the whole spec. So to change a Mafs control's default, the path is "/spec/controls/0/default", not "/nodes/0/spec/controls/0/default".
- { "op": "add_node", "node": <full VizNode>, "at"?: <index> }
- { "op": "remove_node", "target": "<node id>" }
- { "op": "set_layout", "flow"?: "stack"|"grid"|"tabs", "columns"?: 1|2|3 }

Hard rules:
- PREFER mutating spec.controls[].default and existing fields over restructuring.
- Use add_node / remove_node ONLY when the tweak structurally changes what the user sees.
- Every JSON pointer MUST resolve in the current node. If you are not sure the path exists, do NOT emit it.
- Keep the envelope minimal — usually 1-5 ops.
- Preserve node ids that already exist.
- KIND SELECTION when adding a node:
  - Neural network / MLP / autoencoder / transformer block → kind="network". Spec: {direction?, layers:[{id, label?, activation?, nodes:[{id, label?, color?, shape?}]}], edges?, connect?, legend?}.
  - Generic flowchart / sequence diagram / state machine / pipeline → kind="mermaid". (NOT neural nets.)
  - Plottable math function or parametric curve → kind="mafs" with at least one functionY or parametric element. A mafs node with only points/vectors/labels CANNOT render — pick network/mermaid/katex instead.
  - Single equation → kind="katex". Prose → kind="markdown". Data chart → kind="vega".
- If the tweak is already satisfied or you cannot map it to a concrete change, return {"envelope": [], "explanation": "<reason>"} — the caller will surface that to the user. Do NOT invent no-op patches.`;

function summarizeNode(node: StorySpec["nodes"][number]): string {
  switch (node.kind) {
    case "vega":
      return JSON.stringify({
        id: node.id,
        kind: node.kind,
        title: node.title,
        spec: {
          description: node.spec.description,
          controls: node.spec.controls,
          bindings: node.spec.bindings,
        },
      });
    case "mafs":
      return JSON.stringify({
        id: node.id,
        kind: node.kind,
        title: node.title,
        spec: {
          scene: node.spec.scene,
          title: node.spec.title,
          viewbox: node.spec.viewbox,
          elements: node.spec.elements,
          controls: node.spec.controls,
        },
      });
    case "katex":
      return JSON.stringify({
        id: node.id,
        kind: node.kind,
        title: node.title,
        spec: node.spec,
      });
    case "markdown":
      return JSON.stringify({
        id: node.id,
        kind: node.kind,
        title: node.title,
        spec: { mdPreview: node.spec.md.slice(0, 200) },
      });
    case "mermaid":
      return JSON.stringify({
        id: node.id,
        kind: node.kind,
        title: node.title,
        spec: node.spec,
      });
    case "network":
      return JSON.stringify({
        id: node.id,
        kind: node.kind,
        title: node.title,
        spec: {
          direction: node.spec.direction,
          layers: node.spec.layers.map((l) => ({
            id: l.id,
            label: l.label,
            activation: l.activation,
            nodeCount: l.nodes.length,
            nodeIds: l.nodes.map((n) => n.id),
          })),
          edgeCount: (node.spec.edges ?? []).length,
        },
      });
  }
}

export async function generateStoryPatch(prevStory: StorySpec, tweak: string) {
  const compact = {
    title: prevStory.title,
    layout: prevStory.layout,
    nodes: prevStory.nodes.map((n) => JSON.parse(summarizeNode(n))),
  };
  const result = await chatJSON(
    PatchResponse,
    [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: `Current Story (id+spec summary):\n${JSON.stringify(compact)}\n\nUser tweak: ${tweak}\n\nReturn the minimal patch envelope.`,
      },
    ],
    { temperature: 0.3 },
  );
  return result;
}
