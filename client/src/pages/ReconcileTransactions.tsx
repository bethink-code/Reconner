import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Download } from "lucide-react";
import TransactionTable from "@/components/TransactionTable";
import ReconciliationSummary from "@/components/ReconciliationSummary";
import ManualMatchPanel from "@/components/ManualMatchPanel";
import { Link } from "wouter";

export default function ReconcileTransactions() {
  const [, setLocation] = useLocation();
  const [selectedTransaction, setSelectedTransaction] = useState<any>(null);
  const [activeTab, setActiveTab] = useState("all");

  // todo: remove mock functionality
  const allTransactions = [
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
    {
      id: "TXN-004",
      date: "2024-01-18",
      amount: 1450.25,
      reference: "REF-2024-004",
      description: "Regular fuel delivery",
      source: "Bank Account 1",
      matchStatus: "matched" as const,
      confidence: 98,
    },
    {
      id: "TXN-005",
      date: "2024-01-19",
      amount: 750.00,
      reference: "REF-2024-005",
      description: "Adjustment - refund",
      source: "Fuel System",
      matchStatus: "unmatched" as const,
    },
  ];

  const matchedTransactions = allTransactions.filter(t => t.matchStatus === "matched");
  const unmatchedTransactions = allTransactions.filter(t => t.matchStatus === "unmatched");
  const partialTransactions = allTransactions.filter(t => t.matchStatus === "partial");

  const suggestedMatches = [
    {
      transaction: {
        id: "BANK-456",
        date: "2024-01-17",
        amount: 2100.75,
        reference: "REF-003",
        source: "Bank Account 1",
      },
      confidence: 88,
    },
    {
      transaction: {
        id: "BANK-457",
        date: "2024-01-18",
        amount: 2100.00,
        reference: "REF-2024-003",
        source: "Bank Account 2",
      },
      confidence: 65,
    },
  ];

  const handleGenerateReport = () => {
    console.log('Generating report');
    setLocation("/report");
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center gap-4">
            <Link href="/mapping">
              <Button variant="ghost" size="icon" data-testid="button-back">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div className="flex-1">
              <h1 className="text-2xl font-semibold">Review & Reconcile</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Review matched transactions and resolve discrepancies
              </p>
            </div>
            <Button onClick={handleGenerateReport} data-testid="button-generate-report">
              <Download className="h-4 w-4 mr-2" />
              Generate Report
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-4" data-testid="tabs-transactions">
                <TabsTrigger value="all" data-testid="tab-all">
                  All ({allTransactions.length})
                </TabsTrigger>
                <TabsTrigger value="matched" data-testid="tab-matched">
                  Matched ({matchedTransactions.length})
                </TabsTrigger>
                <TabsTrigger value="unmatched" data-testid="tab-unmatched">
                  Unmatched ({unmatchedTransactions.length})
                </TabsTrigger>
                <TabsTrigger value="partial" data-testid="tab-partial">
                  Needs Review ({partialTransactions.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="all" className="mt-6">
                <TransactionTable
                  title="All Transactions"
                  transactions={allTransactions}
                  showSelection={true}
                  onTransactionSelect={setSelectedTransaction}
                />
              </TabsContent>

              <TabsContent value="matched" className="mt-6">
                <TransactionTable
                  title="Matched Transactions"
                  transactions={matchedTransactions}
                  onTransactionSelect={setSelectedTransaction}
                />
              </TabsContent>

              <TabsContent value="unmatched" className="mt-6">
                <TransactionTable
                  title="Unmatched Transactions"
                  transactions={unmatchedTransactions}
                  onTransactionSelect={setSelectedTransaction}
                />
              </TabsContent>

              <TabsContent value="partial" className="mt-6">
                <TransactionTable
                  title="Transactions Needing Review"
                  transactions={partialTransactions}
                  onTransactionSelect={setSelectedTransaction}
                />
              </TabsContent>
            </Tabs>
          </div>

          {/* Sidebar */}
          <div>
            <ReconciliationSummary
              totalTransactions={allTransactions.length}
              matched={matchedTransactions.length}
              unmatched={unmatchedTransactions.length}
              partial={partialTransactions.length}
              totalAmount={allTransactions.reduce((sum, t) => sum + t.amount, 0)}
              discrepancy={250.00}
            />
          </div>
        </div>
      </main>

      {/* Manual Match Panel */}
      {selectedTransaction && (
        <ManualMatchPanel
          transaction={selectedTransaction}
          suggestedMatches={suggestedMatches}
          onMatch={(txnId, matchId, notes) => {
            console.log('Match confirmed:', { txnId, matchId, notes });
            setSelectedTransaction(null);
          }}
          onReject={() => {
            console.log('Match rejected');
            setSelectedTransaction(null);
          }}
          onClose={() => setSelectedTransaction(null)}
        />
      )}
    </div>
  );
}
