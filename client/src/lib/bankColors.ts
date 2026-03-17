/** Bank-branded colours — matched to SA bank identity */
const BANK_COLOR_MAP: Record<string, string> = {
  fnb: "#007C7F",             // FNB teal
  "first national bank": "#007C7F",
  absa: "#C0334E",            // ABSA red
  nedbank: "#2E8A5A",         // Nedbank green
  "standard bank": "#1A4B9C", // Standard Bank navy
  capitec: "#7B4FA0",         // Deep violet
};

/** Fallback palette for unknown banks */
const FALLBACK_COLORS = [
  "#C47A1E",  // Warm gold
  "#1E6B8C",  // Steel blue
  "#8C3A3A",  // Burgundy
  "#2E7A6B",  // Forest teal
  "#A05030",  // Rust
  "#4A6FA0",  // Slate blue
  "#7A3A6B",  // Berry
  "#5A7A2E",  // Olive
  "#A04A1E",  // Burnt amber
  "#2E4A8C",  // Ink blue
];

const fallbackIndex = new Map<string, number>();

/**
 * Get the branded colour for a bank name.
 * Known SA banks get their identity colour; unknown banks get a stable fallback.
 */
export function getBankColor(bankName: string): string {
  const lower = bankName.toLowerCase().trim();

  // Check known banks
  for (const [key, color] of Object.entries(BANK_COLOR_MAP)) {
    if (lower.includes(key)) return color;
  }

  // Stable fallback — same name always gets the same colour
  if (!fallbackIndex.has(lower)) {
    fallbackIndex.set(lower, fallbackIndex.size);
  }
  return FALLBACK_COLORS[fallbackIndex.get(lower)! % FALLBACK_COLORS.length];
}

export const FUEL_COLOR = "#C05A2A";
