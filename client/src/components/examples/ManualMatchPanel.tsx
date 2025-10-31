import ManualMatchPanel from '../ManualMatchPanel';

export default function ManualMatchPanelExample() {
  const transaction = {
    id: "TXN-001",
    date: "2024-01-15",
    amount: 1250.50,
    reference: "REF-2024-001",
    description: "Fuel delivery - Premium unleaded",
    source: "Fuel System",
  };

  const suggestedMatches = [
    {
      transaction: {
        id: "BANK-456",
        date: "2024-01-15",
        amount: 1250.50,
        reference: "REF-001",
        source: "Bank Account 1",
      },
      confidence: 95,
    },
    {
      transaction: {
        id: "BANK-457",
        date: "2024-01-16",
        amount: 1250.00,
        reference: "REF-2024-001",
        source: "Bank Account 2",
      },
      confidence: 78,
    },
  ];

  return (
    <div className="relative h-screen">
      <ManualMatchPanel
        transaction={transaction}
        suggestedMatches={suggestedMatches}
        onMatch={(txnId, matchId, notes) => console.log('Matched:', { txnId, matchId, notes })}
        onReject={() => console.log('Rejected')}
        onClose={() => console.log('Closed')}
      />
    </div>
  );
}
