import { z } from "zod";
import { VizNode } from "@/lib/elicit/schemas";

export const JsonPatchOp = z.union([
  z.object({ op: z.literal("add"), path: z.string(), value: z.unknown() }),
  z.object({ op: z.literal("replace"), path: z.string(), value: z.unknown() }),
  z.object({ op: z.literal("remove"), path: z.string() }),
  z.object({ op: z.literal("move"), path: z.string(), from: z.string() }),
  z.object({ op: z.literal("copy"), path: z.string(), from: z.string() }),
  z.object({ op: z.literal("test"), path: z.string(), value: z.unknown() }),
]);
export type JsonPatchOp = z.infer<typeof JsonPatchOp>;

export const PatchEnvelope = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("patch"),
    target: z.string(),
    patches: z.array(JsonPatchOp).min(1),
  }),
  z.object({
    op: z.literal("add_node"),
    node: VizNode,
    at: z.number().int().min(0).optional(),
  }),
  z.object({ op: z.literal("remove_node"), target: z.string() }),
  z.object({
    op: z.literal("set_layout"),
    flow: z.enum(["stack", "grid", "tabs"]).optional(),
    columns: z.number().int().min(1).max(3).optional(),
  }),
]);
export type PatchEnvelope = z.infer<typeof PatchEnvelope>;

export const PatchResponse = z.object({
  envelope: z.array(PatchEnvelope).min(1).max(20),
  explanation: z.string().optional(),
});
export type PatchResponse = z.infer<typeof PatchResponse>;
