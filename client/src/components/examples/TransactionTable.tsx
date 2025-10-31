import TransactionTable from '../TransactionTable';

export default function TransactionTableExample() {
  const mockTransactions = [
    {
      id: "TXN-001",
      date: "2024-01-15",
      amount: 1250.50,
      reference: "REF-2024-001",
      description: "Fuel delivery - Premium unleaded",
      source: "Fuel System",
      matchStatus: "matched" as const,
      confidence: 95,
    },
    {
      id: "TXN-002",
      date: "2024-01-16",
      amount: 890.00,
      reference: "REF-2024-002",
      description: "Diesel fuel purchase",
      source: "Bank Account 1",
      matchStatus: "partial" as const,
      confidence: 75,
    },
    {
      id: "TXN-003",
      date: "2024-01-17",
      amount: 2100.75,
      reference: "REF-2024-003",
      description: "Monthly fuel supply",
      source: "Fuel System",
      matchStatus: "unmatched" as const,
    },
  ];

  return (
    <div className="max-w-6xl">
      <TransactionTable
        title="All Transactions"
        transactions={mockTransactions}
        showSelection={true}
        onTransactionSelect={(txn) => console.log('Transaction selected:', txn)}
      />
    </div>
  );
}
