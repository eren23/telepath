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
    for (const p of params) {
      const label = p.label ?? p.name;
      switch (p.type) {
        case "number":
        case "range":
          out[p.name] = {
            value: p.default,
            min: p.min,
            max: p.max,
            step: p.step ?? (p.max - p.min) / 100,
            label,
          };
          break;
        case "boolean":
          out[p.name] = { value: p.default, label };
          break;
        case "select":
          out[p.name] = { value: p.default, options: p.options, label };
          break;
        case "color":
          out[p.name] = { value: p.default, label };
          break;
      }
    }
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
