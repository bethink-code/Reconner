import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Download, CreditCard, Banknote, HelpCircle, AlertTriangle } from "lucide-react";
import StatusBadge from "@/components/StatusBadge";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import type { ReconciliationPeriod, Transaction } from "@shared/schema";

type ReportSummary = {
  totalTransactions: number;
  fuelTransactions: number;
  bankTransactions: number;
  matchedTransactions: number;
  matchedPairs: number;
  unmatchedTransactions: number;
  matchRate: number;
  totalFuelAmount: number;
  totalBankAmount: number;
  discrepancy: number;
  cardFuelTransactions: number;
  cashFuelTransactions: number;
  unknownFuelTransactions: number;
  cardFuelAmount: number;
  cashFuelAmount: number;
  unknownFuelAmount: number;
  bankMatchRate: number;
  cardMatchRate: number;
  matchesSameDay: number;
  matches1Day: number;
  matches2Day: number;
  matches3Day: number;
  unmatchedBankTransactions: number;
  unmatchedBankAmount: number;
  unmatchedCardTransactions: number;
  unmatchedCardAmount: number;
};

export default function ReportView() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [periodId, setPeriodId] = useState<string>("");
  const [exportFormat, setExportFormat] = useState("pdf");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('periodId');
    if (id) {
      setPeriodId(id);
    } else {
      setLocation('/');
    }
  }, [setLocation]);

  const { data: period } = useQuery<ReconciliationPeriod>({
    queryKey: ['/api/periods', periodId],
    enabled: !!periodId,
  });

  const { data: transactions = [] } = useQuery<Transaction[]>({
    queryKey: ['/api/periods', periodId, 'transactions'],
    enabled: !!periodId,
  });

  const { data: summary } = useQuery<ReportSummary>({
    queryKey: ['/api/periods', periodId, 'summary'],
    enabled: !!periodId,
  });

  const handleExport = () => {
    const url = `/api/periods/${periodId}/report/${exportFormat}`;
    window.open(url, '_blank');
    
    toast({
      title: "Downloading report",
      description: `Your ${exportFormat.toUpperCase()} report is being downloaded.`,
    });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-ZA', {
      style: 'currency',
      currency: 'ZAR',
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  if (!period) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading report...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center gap-4">
            <Link href={`/reconcile?periodId=${periodId}`}>
              <Button variant="ghost" size="icon" data-testid="button-back">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div className="flex-1">
              <h1 className="text-2xl font-semibold">Reconciliation Report</h1>
              <p className="text-sm text-muted-foreground mt-1">
                {period.name}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Select value={exportFormat} onValueChange={setExportFormat}>
                <SelectTrigger className="w-32" data-testid="select-export-format">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pdf">PDF</SelectItem>
                  <SelectItem value="excel">Excel</SelectItem>
                  <SelectItem value="csv">CSV</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={handleExport} data-testid="button-export">
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-xl">{period.name}</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    Period: {formatDate(period.startDate)} - {formatDate(period.endDate)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Generated: {new Date().toLocaleString()}
                  </p>
                </div>
                <StatusBadge status={period.status as "draft" | "in_progress" | "complete"} />
              </div>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Transaction Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Total Transactions</p>
                  <p className="text-2xl font-bold" data-testid="text-total-transactions">{summary?.totalTransactions ?? transactions.length}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Fuel Transactions</p>
                  <p className="text-2xl font-bold" data-testid="text-fuel-transactions">{summary?.fuelTransactions ?? 0}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Bank Transactions</p>
                  <p className="text-2xl font-bold" data-testid="text-bank-transactions">{summary?.bankTransactions ?? 0}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Matched Pairs</p>
                  <p className="text-2xl font-bold text-chart-2" data-testid="text-matched-pairs">{summary?.matchedPairs ?? 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Match Processing Breakdown</CardTitle>
              <p className="text-sm text-muted-foreground">How long after fuel purchase did bank show the transaction?</p>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 bg-chart-2/10 border border-chart-2/30 rounded-md">
                  <p className="text-sm font-medium text-chart-2">Same Day</p>
                  <p className="text-2xl font-bold" data-testid="text-matches-same-day">{summary?.matchesSameDay ?? 0}</p>
                </div>
                <div className="p-4 bg-chart-4/10 border border-chart-4/30 rounded-md">
                  <p className="text-sm font-medium text-chart-4">1 Day Later</p>
                  <p className="text-2xl font-bold" data-testid="text-matches-1day">{summary?.matches1Day ?? 0}</p>
                </div>
                <div className="p-4 bg-chart-5/10 border border-chart-5/30 rounded-md">
                  <p className="text-sm font-medium text-chart-5">2 Days Later</p>
                  <p className="text-2xl font-bold" data-testid="text-matches-2day">{summary?.matches2Day ?? 0}</p>
                </div>
                <div className="p-4 bg-chart-1/10 border border-chart-1/30 rounded-md">
                  <p className="text-sm font-medium text-chart-1">3 Days Later</p>
                  <p className="text-2xl font-bold" data-testid="text-matches-3day">{summary?.matches3Day ?? 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Fuel Transaction Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                <div className="p-4 bg-chart-4/10 border border-chart-4/30 rounded-md">
                  <div className="flex items-center gap-2 mb-2">
                    <CreditCard className="h-4 w-4 text-chart-4" />
                    <p className="text-sm font-medium">Card Transactions</p>
                  </div>
                  <p className="text-2xl font-bold" data-testid="text-card-transactions">{summary?.cardFuelTransactions ?? 0}</p>
                  <p className="text-sm text-muted-foreground font-mono">{formatCurrency(summary?.cardFuelAmount ?? 0)}</p>
                </div>
                <div className="p-4 bg-chart-5/10 border border-chart-5/30 rounded-md">
                  <div className="flex items-center gap-2 mb-2">
                    <Banknote className="h-4 w-4 text-chart-5" />
                    <p className="text-sm font-medium">Cash Transactions</p>
                  </div>
                  <p className="text-2xl font-bold" data-testid="text-cash-transactions">{summary?.cashFuelTransactions ?? 0}</p>
                  <p className="text-sm text-muted-foreground font-mono">{formatCurrency(summary?.cashFuelAmount ?? 0)}</p>
                </div>
                <div className="p-4 bg-muted/30 rounded-md">
                  <div className="flex items-center gap-2 mb-2">
                    <HelpCircle className="h-4 w-4 text-muted-foreground" />
                    <p className="text-sm font-medium">Unknown Type</p>
                  </div>
                  <p className="text-2xl font-bold" data-testid="text-unknown-transactions">{summary?.unknownFuelTransactions ?? 0}</p>
                  <p className="text-sm text-muted-foreground font-mono">{formatCurrency(summary?.unknownFuelAmount ?? 0)}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-muted/30 rounded-md">
                  <p className="text-sm font-medium mb-2">Bank Account Total</p>
                  <p className="text-2xl font-bold" data-testid="text-bank-total">{summary?.bankTransactions ?? 0}</p>
                  <p className="text-sm text-muted-foreground font-mono">{formatCurrency(summary?.totalBankAmount ?? 0)}</p>
                </div>
                <div className="p-4 bg-muted/30 rounded-md">
                  <p className="text-sm font-medium mb-2">Discrepancy (Card vs Bank)</p>
                  <p className={`text-2xl font-bold font-mono ${(summary?.discrepancy ?? 0) > 0 ? 'text-chart-1' : 'text-chart-2'}`} data-testid="text-discrepancy">
                    {formatCurrency(summary?.discrepancy ?? 0)}
                  </p>
                  <p className="text-xs text-muted-foreground">Only card transactions are matched</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Reconciliation Rates</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <p className="text-sm font-medium mb-2">Bank Match Rate (Source of Truth)</p>
                  <div className="flex items-center gap-4">
                    <div className="text-3xl font-bold text-chart-2" data-testid="text-bank-match-rate">{Math.round(summary?.bankMatchRate ?? 0)}%</div>
                    <div className="flex-1">
                      <div className="h-3 bg-muted rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-chart-2 transition-all"
                          style={{ width: `${Math.round(summary?.bankMatchRate ?? 0)}%` }}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {summary?.matchedPairs ?? 0} of {summary?.bankTransactions ?? 0} bank transactions matched
                      </p>
                    </div>
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium mb-2">Card Match Rate (Fuel Side)</p>
                  <div className="flex items-center gap-4">
                    <div className="text-3xl font-bold text-chart-4" data-testid="text-card-match-rate">{Math.round(summary?.cardMatchRate ?? 0)}%</div>
                    <div className="flex-1">
                      <div className="h-3 bg-muted rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-chart-4 transition-all"
                          style={{ width: `${Math.round(summary?.cardMatchRate ?? 0)}%` }}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {summary?.matchedPairs ?? 0} of {summary?.cardFuelTransactions ?? 0} fuel card transactions matched
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-chart-1" />
                Unmatched Transactions
              </CardTitle>
              <p className="text-sm text-muted-foreground">Click to view and investigate these transactions</p>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Link href={`/reconcile?periodId=${periodId}&filter=unmatched&source=bank`}>
                  <div className="p-4 bg-chart-1/10 border border-chart-1/30 rounded-md cursor-pointer hover-elevate" data-testid="link-unmatched-bank">
                    <p className="text-sm font-medium mb-2">Unmatched Bank Transactions</p>
                    <p className="text-2xl font-bold text-chart-1" data-testid="text-unmatched-bank">{summary?.unmatchedBankTransactions ?? 0}</p>
                    <p className="text-sm text-muted-foreground font-mono">{formatCurrency(summary?.unmatchedBankAmount ?? 0)}</p>
                    <p className="text-xs text-muted-foreground mt-2">Bank received payment but no matching fuel sale found</p>
                  </div>
                </Link>
                <Link href={`/reconcile?periodId=${periodId}&filter=unmatched&source=card`}>
                  <div className="p-4 bg-chart-1/10 border border-chart-1/30 rounded-md cursor-pointer hover-elevate" data-testid="link-unmatched-card">
                    <p className="text-sm font-medium mb-2">Unmatched Card Sales</p>
                    <p className="text-2xl font-bold text-chart-1" data-testid="text-unmatched-card">{summary?.unmatchedCardTransactions ?? 0}</p>
                    <p className="text-sm text-muted-foreground font-mono">{formatCurrency(summary?.unmatchedCardAmount ?? 0)}</p>
                    <p className="text-xs text-muted-foreground mt-2">Card sale recorded but no matching bank deposit found</p>
                  </div>
                </Link>
              </div>
            </CardContent>
          </Card>

          {period.description && (
            <Card>
              <CardHeader>
                <CardTitle>Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm">{period.description}</p>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}
