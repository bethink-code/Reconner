// Platform-owner-only pricing/viability model. The tool is a self-contained
// HTML document served behind the platform-owner gate at /api/admin/pricing-tool
// (its financials must never be publicly reachable), embedded here in a
// same-origin iframe so the session cookie flows and saved scenarios sync.
export default function PricingTab() {
  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <iframe
        src="/api/admin/pricing-tool"
        title="Lekana viability model"
        className="w-full h-[calc(100vh-200px)] min-h-[600px] border-0"
      />
    </div>
  );
}
