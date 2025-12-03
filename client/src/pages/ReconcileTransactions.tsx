import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ArrowLeft, Download, Zap, ChevronLeft, ChevronRight, Settings, ChevronDown } from "lucide-react";
import TransactionTable from "@/components/TransactionTable";
import MatchingRulesPanel from "@/components/MatchingRulesPanel";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Transaction } from "@shared/schema";

interface PeriodSummary {
  totalTransactions: number;
  matchedTransactions: number;
  matchedPairs: number;
  unmatchedTransactions: number;
  matchRate: number;
  totalFuelAmount: number;
  totalBankAmount: number;
  discrepancy: number;
  fuelTransactions: number;
  bankTransactions: number;
  cardFuelTransactions: number;
  unmatchedBankTransactions: number;
  unmatchedCardTransactions: number;
}

interface PaginatedResponse {
  transactions: Transaction[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export default function ReconcileTransactions() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [periodId, setPeriodId] = useState<string>("");
  const [activeTab, setActiveTab] = useState("all");
  const [sourceFilter, setSourceFilter] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [rulesOpen, setRulesOpen] = useState(false);
  const ITEMS_PER_PAGE = 50;

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
    
    if (filter === 'unmatched') {
      setActiveTab('unmatched');
    }
    
    if (source === 'bank' || source === 'card') {
      setSourceFilter(source);
    }
  }, [setLocation]);

  const { data: summary, isLoading: summaryLoading } = useQuery<PeriodSummary>({
    queryKey: ['/api/periods', periodId, 'summary'],
    enabled: !!periodId,
  });

  const buildQueryParams = (page: number) => {
    const params = new URLSearchParams();
    params.set('page', page.toString());
    params.set('limit', ITEMS_PER_PAGE.toString());
    
    if (activeTab === 'matched') {
      params.set('matchStatus', 'matched');
    } else if (activeTab === 'unmatched') {
      params.set('matchStatus', 'unmatched');
      if (sourceFilter === 'bank') {
        params.set('sourceType', 'bank');
      } else if (sourceFilter === 'card') {
        params.set('sourceType', 'fuel');
        params.set('isCardTransaction', 'yes');
      }
    } else if (activeTab === 'partial') {
      params.set('matchStatus', 'partial');
    }
    
    return params.toString();
  };

  const effectivePage = currentPage;

  const { data: paginatedData, isLoading: transactionsLoading } = useQuery<PaginatedResponse>({
    queryKey: ['/api/periods', periodId, 'transactions', activeTab, sourceFilter, effectivePage],
    queryFn: async () => {
      const response = await fetch(`/api/periods/${periodId}/transactions?${buildQueryParams(effectivePage)}`);
      if (!response.ok) throw new Error('Failed to fetch transactions');
      return response.json();
    },
    enabled: !!periodId,
  });

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, sourceFilter]);

  const autoMatchMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/periods/${periodId}/auto-match`, {});
      return await response.json();
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['/api/periods', periodId, 'summary'] });
      queryClient.invalidateQueries({ queryKey: ['/api/periods', periodId, 'transactions'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['/api/periods'] });
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

  const clearSourceFilter = () => {
    setSourceFilter(null);
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

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-ZA', {
      style: 'currency',
      currency: 'ZAR',
    }).format(amount);
  };

  const getTabCount = (tab: string): number => {
    if (!summary) return 0;
    switch (tab) {
      case 'all': return summary.totalTransactions;
      case 'matched': return summary.matchedTransactions;
      case 'unmatched': return summary.unmatchedTransactions;
      case 'partial': return 0;
      default: return 0;
    }
  };

  const transactions = paginatedData?.transactions || [];
  const totalPages = paginatedData?.totalPages || 1;
  const total = paginatedData?.total || 0;

  if (summaryLoading || !summary) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b bg-card">
          <div className="max-w-7xl mx-auto px-6 py-4">
            <div className="flex items-center gap-4">
              <Skeleton className="h-9 w-9 rounded-md" />
              <div className="flex-1">
                <Skeleton className="h-8 w-64 mb-2" />
                <Skeleton className="h-4 w-48" />
              </div>
              <Skeleton className="h-9 w-32" />
              <Skeleton className="h-9 w-36" />
            </div>
          </div>
        </header>
        <main className="max-w-7xl mx-auto px-6 py-8">
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <Card key={i}>
                  <CardContent className="pt-6">
                    <Skeleton className="h-4 w-24 mb-2" />
                    <Skeleton className="h-8 w-16" />
                  </CardContent>
                </Card>
              ))}
            </div>
            <Card>
              <CardContent className="pt-6">
                <Skeleton className="h-64 w-full" />
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    );
  }

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
              disabled={autoMatchMutation.isPending || summary.totalTransactions === 0}
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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Total Transactions</p>
                <p className="text-2xl font-bold" data-testid="text-total">{summary.totalTransactions}</p>
              </CardContent>
            </Card>
            <Card className="bg-chart-2/10 border-chart-2/30">
              <CardContent className="pt-6">
                <p className="text-sm font-medium">Matched</p>
                <p className="text-2xl font-bold text-chart-2" data-testid="text-matched">{summary.matchedPairs}</p>
              </CardContent>
            </Card>
            <Card className="bg-chart-1/10 border-chart-1/30">
              <CardContent className="pt-6">
                <p className="text-sm font-medium">Unmatched</p>
                <p className="text-2xl font-bold text-chart-1" data-testid="text-unmatched">{summary.unmatchedTransactions}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Discrepancy</p>
                <p className={`text-2xl font-bold font-mono ${summary.discrepancy > 0 ? 'text-chart-1' : 'text-chart-2'}`} data-testid="text-discrepancy">
                  {formatCurrency(summary.discrepancy)}
                </p>
              </CardContent>
            </Card>
          </div>

          <Collapsible open={rulesOpen} onOpenChange={setRulesOpen}>
            <CollapsibleTrigger asChild>
              <Button 
                variant="outline" 
                className="w-full justify-between"
                data-testid="button-toggle-rules"
              >
                <span className="flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  Matching Rules
                </span>
                <ChevronDown className={`h-4 w-4 transition-transform ${rulesOpen ? 'rotate-180' : ''}`} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-4">
              <MatchingRulesPanel 
                periodId={periodId} 
                onRulesChanged={() => {
                  queryClient.invalidateQueries({ queryKey: ['/api/periods', periodId, 'matching-rules'] });
                }}
              />
            </CollapsibleContent>
          </Collapsible>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="all" data-testid="tab-all">
                All ({getTabCount('all')})
              </TabsTrigger>
              <TabsTrigger value="matched" data-testid="tab-matched">
                Matched ({summary.matchedTransactions})
              </TabsTrigger>
              <TabsTrigger value="unmatched" data-testid="tab-unmatched">
                Unmatched ({summary.unmatchedTransactions})
              </TabsTrigger>
              <TabsTrigger value="partial" data-testid="tab-partial">
                Partial (0)
              </TabsTrigger>
            </TabsList>

            <TabsContent value="all" className="mt-6">
              {transactionsLoading ? (
                <Card>
                  <CardContent className="pt-6">
                    <Skeleton className="h-64 w-full" />
                  </CardContent>
                </Card>
              ) : (
                <>
                  <TransactionTable
                    title="All Transactions"
                    transactions={transactions}
                    onTransactionSelect={() => {}}
                  />
                  <PaginationControls
                    currentPage={currentPage}
                    totalPages={totalPages}
                    total={total}
                    itemsPerPage={ITEMS_PER_PAGE}
                    onPageChange={setCurrentPage}
                  />
                </>
              )}
            </TabsContent>

            <TabsContent value="matched" className="mt-6">
              {transactionsLoading ? (
                <Card>
                  <CardContent className="pt-6">
                    <Skeleton className="h-64 w-full" />
                  </CardContent>
                </Card>
              ) : (
                <>
                  <TransactionTable
                    title="Matched Transactions"
                    transactions={transactions}
                    onTransactionSelect={() => {}}
                  />
                  <PaginationControls
                    currentPage={currentPage}
                    totalPages={totalPages}
                    total={total}
                    itemsPerPage={ITEMS_PER_PAGE}
                    onPageChange={setCurrentPage}
                  />
                </>
              )}
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
              {transactionsLoading ? (
                <Card>
                  <CardContent className="pt-6">
                    <Skeleton className="h-64 w-full" />
                  </CardContent>
                </Card>
              ) : (
                <>
                  <TransactionTable
                    title={sourceFilter ? `Unmatched ${sourceFilter === 'bank' ? 'Bank' : 'Card'} Transactions` : "Unmatched Transactions"}
                    transactions={transactions}
                    onTransactionSelect={() => {}}
                  />
                  <PaginationControls
                    currentPage={currentPage}
                    totalPages={totalPages}
                    total={total}
                    itemsPerPage={ITEMS_PER_PAGE}
                    onPageChange={setCurrentPage}
                  />
                </>
              )}
            </TabsContent>

            <TabsContent value="partial" className="mt-6">
              {transactionsLoading ? (
                <Card>
                  <CardContent className="pt-6">
                    <Skeleton className="h-64 w-full" />
                  </CardContent>
                </Card>
              ) : (
                <>
                  <TransactionTable
                    title="Partial Matches"
                    transactions={transactions}
                    onTransactionSelect={() => {}}
                  />
                  <PaginationControls
                    currentPage={currentPage}
                    totalPages={totalPages}
                    total={total}
                    itemsPerPage={ITEMS_PER_PAGE}
                    onPageChange={setCurrentPage}
                  />
                </>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}

interface PaginationControlsProps {
  currentPage: number;
  totalPages: number;
  total: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
}

function PaginationControls({ currentPage, totalPages, total, itemsPerPage, onPageChange }: PaginationControlsProps) {
  if (totalPages <= 1) return null;
  
  const startItem = (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, total);

  return (
    <div className="flex items-center justify-between mt-4 p-4 bg-muted/30 rounded-md">
      <p className="text-sm text-muted-foreground">
        Showing {startItem} to {endItem} of {total} transactions
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          data-testid="button-prev-page"
        >
          <ChevronLeft className="h-4 w-4" />
          Previous
        </Button>
        <span className="text-sm px-2">
          Page {currentPage} of {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          data-testid="button-next-page"
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
