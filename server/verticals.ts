import { getVertical, type VerticalAdapter, type SalesSideConfig } from "../shared/verticals/index.ts";
import { storage } from "./storage";

/** Resolve the vertical adapter for a property (falls back to fuel — the default for all properties). */
export async function resolveVertical(
  propertyId: string | null | undefined,
): Promise<VerticalAdapter> {
  if (!propertyId) return getVertical(null);
  const property = await storage.getProperty(propertyId);
  return getVertical(property?.verticalId);
}

/** The sales-side matching config the auto-match planner needs, derived from a vertical. */
export function salesSideConfig(vertical: VerticalAdapter): SalesSideConfig {
  return {
    sourceType: vertical.salesSideSourceType,
    requireCardFlag: vertical.matching.salesSideRequiresCardFlag,
    forceInvoiceGrouping: vertical.matching.requiresInvoiceGrouping,
  };
}
