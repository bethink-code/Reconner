export function formatRand(amount: string | number): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return "R " + num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatDate(dateStr: string | Date | null): string {
  if (!dateStr) return "";
  const date = typeof dateStr === "string" ? new Date(dateStr) : dateStr;
  return date.toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
}
