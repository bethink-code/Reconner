import type { VerticalAdapter } from "./types.ts";
import { fuelAdapter } from "./fuel.ts";
import { retailAdapter } from "./retail.ts";

export * from "./types.ts";
export { fuelAdapter, retailAdapter };

export const VERTICALS: Record<string, VerticalAdapter> = {
  fuel: fuelAdapter,
  retail: retailAdapter,
};

export const DEFAULT_VERTICAL_ID = "fuel";

/** Resolve a vertical by id, falling back to fuel (the default for every existing property). */
export function getVertical(id: string | null | undefined): VerticalAdapter {
  if (id && VERTICALS[id]) return VERTICALS[id];
  return fuelAdapter;
}
