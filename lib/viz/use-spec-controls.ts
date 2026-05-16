"use client";

import { useMemo } from "react";
import { useControls, useCreateStore } from "leva";
import type { ParamDef } from "@/lib/elicit/schemas";

type AnySchema = Record<string, unknown>;
export type LevaStore = ReturnType<typeof useCreateStore>;

export type SpecControls = {
  values: Record<string, unknown>;
  store: LevaStore;
  isEmpty: boolean;
};

// Returns a per-instance Leva store so multiple renderers don't fight over the
// global panel. Each MafsRenderer / VegaCanvas owns its own <LevaPanel store />.
export function useSpecControls(
  params: ParamDef[] | undefined,
  groupKey?: string,
): SpecControls {
  const store = useCreateStore();

  const schema = useMemo<AnySchema>(() => {
    if (!params || params.length === 0) return {};
    const out: AnySchema = {};
    params.forEach((p, idx) => {
      // Leva throws "Keys can not be empty" if name/label is "". Synthesize a
      // safe fallback so a single bad LLM emit doesn't crash the panel.
      const name = (p.name ?? "").trim() || `p${idx}`;
      const label = (p.label ?? "").trim() || name;
      switch (p.type) {
        case "number":
        case "range":
          out[name] = {
            value: p.default,
            min: p.min,
            max: p.max,
            step: p.step ?? (p.max - p.min) / 100,
            label,
          };
          break;
        case "boolean":
          out[name] = { value: p.default, label };
          break;
        case "select":
          out[name] = { value: p.default, options: p.options, label };
          break;
        case "color":
          out[name] = { value: p.default, label };
          break;
      }
    });
    return out;
  }, [params]);

  const isEmpty = Object.keys(schema).length === 0;
  // useControls hook must run unconditionally; pass empty schema when nothing
  // to declare so React's hook order stays stable.
  const values = useControls(
    groupKey ?? "params",
    isEmpty ? {} : schema,
    [schema, groupKey],
    { store },
  );
  return {
    values: (values ?? {}) as Record<string, unknown>,
    store,
    isEmpty,
  };
}
