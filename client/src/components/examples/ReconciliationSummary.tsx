import ReconciliationSummary from '../ReconciliationSummary';

export default function ReconciliationSummaryExample() {
  return (
    <div className="max-w-2xl">
      <ReconciliationSummary
        totalTransactions={150}
        matched={120}
        unmatched={20}
        partial={10}
        totalAmount={125750.50}
        discrepancy={250.00}
      />
    </div>
  );
}
