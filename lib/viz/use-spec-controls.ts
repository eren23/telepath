"use client";

import { useMemo } from "react";
import { useControls } from "leva";
import type { ParamDef } from "@/lib/elicit/schemas";

type AnySchema = Record<string, unknown>;

export function useSpecControls(
  params: ParamDef[] | undefined,
  groupKey?: string,
): Record<string, unknown> {
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
  // useControls must always be called (hook rules); when empty, pass an empty schema.
  const values = useControls(
    groupKey ?? "params",
    isEmpty ? {} : schema,
    [schema, groupKey],
  );
  return (values ?? {}) as Record<string, unknown>;
}
