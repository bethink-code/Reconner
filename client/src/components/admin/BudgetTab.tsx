// Platform-owner-only "Model 2" — the budget-envelope model. A parallel tool to
// the viability model: same economics, reframed as a monthly budget (pool =
// revenue, forced vs discretionary envelopes, cash vs loaded profit). Served
// behind the platform-owner gate at /api/admin/budget-tool and embedded in a
// same-origin iframe so the session cookie flows.
export default function BudgetTab() {
  return (
    <iframe
      src="/api/admin/budget-tool"
      title="Lekana budget model (Model 2)"
      className="block w-full h-[calc(100vh-180px)] min-h-[640px] rounded-2xl border border-border bg-[#FAF8F3] shadow-sm"
    />
  );
}
