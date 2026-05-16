import { describe, it, expect } from "vitest";
import {
  applyEnvelope,
  applyEnvelopes,
  PatchError,
} from "@/lib/viz/apply-patch";
import type { StorySpec, VizNode } from "@/lib/elicit/schemas";
import type { PatchEnvelope } from "@/lib/viz/patch-schema";

function story(...nodes: VizNode[]): StorySpec {
  return {
    title: "test",
    nodes,
    layout: { flow: "stack" },
  };
}

const mdNode = (id: string, md: string): VizNode => ({
  id,
  kind: "markdown",
  spec: { md },
});

const mafsNode = (id: string, defaultAmp = 1): VizNode => ({
  id,
  kind: "mafs",
  spec: {
    scene: "plot2d",
    elements: [{ kind: "functionY", expr: "A * sin(x)" }],
    controls: [
      {
        name: "A",
        type: "range",
        min: 0,
        max: 2,
        step: 0.1,
        default: defaultAmp,
      },
    ],
  },
});

describe("applyEnvelope", () => {
  it("applies a JSON patch op against the target node", () => {
    const s = story(mafsNode("plot"));
    const env: PatchEnvelope = {
      op: "patch",
      target: "plot",
      patches: [{ op: "replace", path: "/spec/controls/0/default", value: 0.5 }],
    };
    const out = applyEnvelope(s, env);
    expect(out).not.toBe(s);
    const node = out.nodes[0];
    if (node.kind !== "mafs") throw new Error("expected mafs node");
    expect(node.spec.controls?.[0].default).toBe(0.5);
    // Original untouched
    expect((s.nodes[0] as { spec: { controls?: { default: number }[] } }).spec.controls?.[0].default).toBe(1);
  });

  it("throws PatchError when patch target id is missing", () => {
    const s = story(mafsNode("plot"));
    const env: PatchEnvelope = {
      op: "patch",
      target: "ghost",
      patches: [{ op: "replace", path: "/spec/x", value: 1 }],
    };
    expect(() => applyEnvelope(s, env)).toThrow(PatchError);
  });

  it("throws PatchError when patch op targets a missing path", () => {
    const s = story(mafsNode("plot"));
    const env: PatchEnvelope = {
      op: "patch",
      target: "plot",
      patches: [{ op: "replace", path: "/spec/nope/deeply/missing", value: 1 }],
    };
    expect(() => applyEnvelope(s, env)).toThrow(PatchError);
  });

  it("inserts add_node at the given index, defaulting to end", () => {
    const s = story(mdNode("a", "A"), mdNode("c", "C"));
    const env: PatchEnvelope = {
      op: "add_node",
      at: 1,
      node: mdNode("b", "B"),
    };
    const out = applyEnvelope(s, env);
    expect(out.nodes.map((n) => n.id)).toEqual(["a", "b", "c"]);

    const out2 = applyEnvelope(s, { op: "add_node", node: mdNode("z", "Z") });
    expect(out2.nodes.map((n) => n.id)).toEqual(["a", "c", "z"]);
  });

  it("clamps add_node insertion index into [0, length]", () => {
    const s = story(mdNode("a", "A"));
    const farTooBig = applyEnvelope(s, { op: "add_node", at: 99, node: mdNode("b", "B") });
    expect(farTooBig.nodes.map((n) => n.id)).toEqual(["a", "b"]);
    const farTooSmall = applyEnvelope(s, { op: "add_node", at: -99, node: mdNode("c", "C") });
    expect(farTooSmall.nodes.map((n) => n.id)).toEqual(["c", "a"]);
  });

  it("remove_node deletes by id and throws on missing", () => {
    const s = story(mdNode("a", "A"), mdNode("b", "B"));
    const out = applyEnvelope(s, { op: "remove_node", target: "b" });
    expect(out.nodes.map((n) => n.id)).toEqual(["a"]);
    expect(() => applyEnvelope(s, { op: "remove_node", target: "nope" })).toThrow(PatchError);
  });

  it("set_layout merges flow + columns with existing layout", () => {
    const s = story(mdNode("a", "A"));
    s.layout = { flow: "stack" };
    const out = applyEnvelope(s, { op: "set_layout", flow: "grid", columns: 2 });
    expect(out.layout).toEqual({ flow: "grid", columns: 2 });
    // Without flow specified, prior flow persists
    const out2 = applyEnvelope(out, { op: "set_layout", columns: 3 });
    expect(out2.layout).toEqual({ flow: "grid", columns: 3 });
  });
});

describe("applyEnvelopes", () => {
  it("applies a sequence in order", () => {
    const s = story(mdNode("a", "A"));
    const envs: PatchEnvelope[] = [
      { op: "add_node", node: mdNode("b", "B") },
      { op: "remove_node", target: "a" },
      { op: "set_layout", flow: "grid", columns: 2 },
    ];
    const out = applyEnvelopes(s, envs);
    expect(out.nodes.map((n) => n.id)).toEqual(["b"]);
    expect(out.layout).toEqual({ flow: "grid", columns: 2 });
  });

  it("aborts on the first failing envelope", () => {
    const s = story(mdNode("a", "A"));
    const envs: PatchEnvelope[] = [
      { op: "add_node", node: mdNode("b", "B") },
      { op: "remove_node", target: "ghost" },
    ];
    expect(() => applyEnvelopes(s, envs)).toThrow(PatchError);
  });
});
