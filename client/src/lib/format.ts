export function formatRand(amount: string | number): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return "R " + num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatDate(dateStr: string | Date | null): string {
  if (!dateStr) return "";
  const date = typeof dateStr === "string" ? new Date(dateStr) : dateStr;
  return date.toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
}

export function formatPeriodRange(startDate: string | null | undefined, endDate: string | null | undefined): string {
  if (!startDate || !endDate) return "";
  if (startDate === endDate) return formatDate(startDate);
  const s = new Date(startDate);
  const e = new Date(endDate);
  const sameYear = s.getFullYear() === e.getFullYear();
  const sameMonth = sameYear && s.getMonth() === e.getMonth();
  if (sameMonth) {
    return `${s.getDate()} – ${e.getDate()} ${s.toLocaleDateString("en-ZA", { month: "short", year: "numeric" })}`;
  }
  if (sameYear) {
    return `${s.toLocaleDateString("en-ZA", { day: "numeric", month: "short" })} – ${formatDate(endDate)}`;
  }
  return `${formatDate(startDate)} – ${formatDate(endDate)}`;
}
