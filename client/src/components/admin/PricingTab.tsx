// Platform-owner-only pricing/viability model. The tool is a self-contained
// HTML document served behind the platform-owner gate at /api/admin/pricing-tool
// (its financials must never be publicly reachable), embedded here in a
// same-origin iframe so the session cookie flows and saved scenarios sync.
//
// It's a full workspace, not a widget: it fills the viewport height and centers
// its own content (cream canvas), so we frame it lightly rather than boxing it
// inside the narrow admin column.
export default function PricingTab() {
  return (
    <iframe
      src="/api/admin/pricing-tool"
      title="Lekana viability model"
      className="block w-full h-[calc(100vh-180px)] min-h-[640px] rounded-2xl border border-border bg-[#FAF8F3] shadow-sm"
    />
  );
}
