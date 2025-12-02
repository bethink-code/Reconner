import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Download, Zap } from "lucide-react";
import TransactionTable from "@/components/TransactionTable";
import ReconciliationSummary from "@/components/ReconciliationSummary";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Transaction } from "@shared/schema";

export default function ReconcileTransactions() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [periodId, setPeriodId] = useState<string>("");
  const [activeTab, setActiveTab] = useState("all");
  const [sourceFilter, setSourceFilter] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('periodId');
    const filter = params.get('filter');
    const source = params.get('source');
    
    if (id) {
      setPeriodId(id);
    } else {
      setLocation('/');
    }
    
    // Set initial tab based on filter param
    if (filter === 'unmatched') {
      setActiveTab('unmatched');
    }
    
    // Set source filter (bank or card)
    if (source === 'bank' || source === 'card') {
      setSourceFilter(source);
    }
  }, [setLocation]);

  const { data: transactions = [], isLoading } = useQuery<Transaction[]>({
    queryKey: ['/api/periods', periodId, 'transactions'],
    enabled: !!periodId,
  });

  const autoMatchMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/periods/${periodId}/auto-match`, {});
      return await response.json();
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['/api/periods', periodId, 'transactions'] });
      toast({
        title: "Auto-match complete",
        description: `Created ${result.matchesCreated} matches.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Auto-match failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const matchedTransactions = transactions.filter(t => t.matchStatus === "matched");
  const unmatchedTransactions = transactions.filter(t => t.matchStatus === "unmatched");
  const partialTransactions = transactions.filter(t => t.matchStatus === "partial");
  
  // Separate unmatched by source type for side-by-side view
  const unmatchedBankTransactions = unmatchedTransactions.filter(t => 
    t.sourceType?.startsWith('bank') && parseFloat(t.amount || '0') > 0
  );
  const unmatchedCardTransactions = unmatchedTransactions.filter(t => 
    t.sourceType === 'fuel' && t.isCardTransaction === 'yes' && parseFloat(t.amount || '0') > 0
  );
  
  // Apply source filter for unmatched view
  const filteredUnmatchedTransactions = sourceFilter 
    ? unmatchedTransactions.filter(t => {
        if (sourceFilter === 'bank') {
          return t.sourceType?.startsWith('bank');
        } else if (sourceFilter === 'card') {
          return t.sourceType === 'fuel' && t.isCardTransaction === 'yes';
        }
        return true;
      })
    : unmatchedTransactions;

  const clearSourceFilter = () => {
    setSourceFilter(null);
    // Update URL without source param
    const params = new URLSearchParams(window.location.search);
    params.delete('source');
    window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`);
  };

  const handleGenerateReport = () => {
    setLocation(`/report?periodId=${periodId}`);
  };

  const handleAutoMatch = () => {
    autoMatchMutation.mutate();
  };

  const totalAmount = transactions.reduce((sum, t) => sum + parseFloat(t.amount || '0'), 0);
  
  // Calculate discrepancy: fuel card total vs bank total
  const fuelCardTransactions = transactions.filter(t => 
    t.sourceType === 'fuel' && (t.isCardTransaction === 'yes' || t.isCardTransaction === 'unknown')
  );
  const bankTransactions = transactions.filter(t => t.sourceType === 'bank_account');
  
  const fuelCardTotal = fuelCardTransactions.reduce((sum, t) => sum + parseFloat(t.amount || '0'), 0);
  const bankTotal = bankTransactions.reduce((sum, t) => sum + parseFloat(t.amount || '0'), 0);
  const discrepancy = fuelCardTotal - bankTotal;

  const summary = {
    totalTransactions: transactions.length,
    matched: matchedTransactions.length,
    unmatched: unmatchedTransactions.length,
    partial: partialTransactions.length,
    totalAmount,
    discrepancy,
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center gap-4">
            <Link href={`/mapping?periodId=${periodId}`}>
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
            <Button 
              onClick={handleAutoMatch}
              disabled={autoMatchMutation.isPending || transactions.length === 0}
              variant="outline"
              data-testid="button-auto-match"
            >
              <Zap className="h-4 w-4 mr-2" />
              {autoMatchMutation.isPending ? "Matching..." : "Auto-Match"}
            </Button>
            <Button onClick={handleGenerateReport} data-testid="button-generate-report">
              <Download className="h-4 w-4 mr-2" />
              Generate Report
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="space-y-6">
          <ReconciliationSummary
            totalTransactions={summary.totalTransactions}
            matched={summary.matched}
            unmatched={summary.unmatched}
            partial={summary.partial}
            totalAmount={summary.totalAmount}
            discrepancy={summary.discrepancy}
          />

          {isLoading ? (
            <p className="text-muted-foreground">Loading transactions...</p>
          ) : transactions.length === 0 ? (
            <p className="text-muted-foreground">No transactions found. Please upload and process files first.</p>
          ) : (
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList>
                <TabsTrigger value="all" data-testid="tab-all">
                  All ({transactions.length})
                </TabsTrigger>
                <TabsTrigger value="matched" data-testid="tab-matched">
                  Matched ({matchedTransactions.length})
                </TabsTrigger>
                <TabsTrigger value="unmatched" data-testid="tab-unmatched">
                  Unmatched ({unmatchedTransactions.length})
                </TabsTrigger>
                <TabsTrigger value="partial" data-testid="tab-partial">
                  Partial ({partialTransactions.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="all" className="mt-6">
                <TransactionTable
                  title="All Transactions"
                  transactions={transactions}
                  onTransactionSelect={() => {}}
                />
              </TabsContent>

              <TabsContent value="matched" className="mt-6">
                <TransactionTable
                  title="Matched Transactions"
                  transactions={matchedTransactions}
                  onTransactionSelect={() => {}}
                />
              </TabsContent>

              <TabsContent value="unmatched" className="mt-6">
                {sourceFilter && (
                  <div className="flex items-center gap-2 mb-4 p-3 bg-muted/50 rounded-md">
                    <span className="text-sm">
                      Showing: <span className="font-medium">{sourceFilter === 'bank' ? 'Bank Transactions' : 'Card Sales'}</span>
                    </span>
                    <Button variant="ghost" size="sm" onClick={clearSourceFilter} data-testid="button-clear-filter">
                      Show All
                    </Button>
                  </div>
                )}
                <TransactionTable
                  title={sourceFilter ? `Unmatched ${sourceFilter === 'bank' ? 'Bank' : 'Card'} Transactions` : "Unmatched Transactions"}
                  transactions={sourceFilter ? filteredUnmatchedTransactions : unmatchedTransactions.filter(t => parseFloat(t.amount || '0') > 0)}
                  onTransactionSelect={() => {}}
                />
              </TabsContent>

              <TabsContent value="partial" className="mt-6">
                <TransactionTable
                  title="Partial Matches"
                  transactions={partialTransactions}
                  onTransactionSelect={() => {}}
                />
              </TabsContent>
            </Tabs>
          )}
        </div>
      </main>
    </div>
  );
}
