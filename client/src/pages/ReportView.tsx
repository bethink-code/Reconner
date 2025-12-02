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
import { ArrowLeft, Download, CreditCard, Banknote } from "lucide-react";
import StatusBadge from "@/components/StatusBadge";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import type { ReconciliationPeriod, Transaction } from "@shared/schema";

type ReportSummary = {
  totalTransactions: number;
  fuelTransactions: number;
  bankTransactions: number;
  matchedTransactions: number;
  unmatchedTransactions: number;
  matchRate: number;
  totalFuelAmount: number;
  totalBankAmount: number;
  discrepancy: number;
  cardFuelTransactions: number;
  cashFuelTransactions: number;
  cardFuelAmount: number;
  cashFuelAmount: number;
  cardMatchRate: number;
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
                  <p className="text-sm text-muted-foreground mb-1">Matched</p>
                  <p className="text-2xl font-bold text-chart-2" data-testid="text-matched-transactions">{summary?.matchedTransactions ?? 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Card vs Cash Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <div className="p-4 bg-muted/30 rounded-md">
                  <div className="flex items-center gap-2 mb-2">
                    <CreditCard className="h-4 w-4 text-chart-4" />
                    <p className="text-sm font-medium">Card Transactions</p>
                  </div>
                  <p className="text-2xl font-bold" data-testid="text-card-transactions">{summary?.cardFuelTransactions ?? 0}</p>
                  <p className="text-sm text-muted-foreground font-mono">{formatCurrency(summary?.cardFuelAmount ?? 0)}</p>
                </div>
                <div className="p-4 bg-muted/30 rounded-md">
                  <div className="flex items-center gap-2 mb-2">
                    <Banknote className="h-4 w-4 text-chart-5" />
                    <p className="text-sm font-medium">Cash Transactions</p>
                  </div>
                  <p className="text-2xl font-bold" data-testid="text-cash-transactions">{summary?.cashFuelTransactions ?? 0}</p>
                  <p className="text-sm text-muted-foreground font-mono">{formatCurrency(summary?.cashFuelAmount ?? 0)}</p>
                </div>
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
              <CardTitle>Card Reconciliation Rate</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <div className="text-4xl font-bold" data-testid="text-match-rate">{Math.round(summary?.cardMatchRate ?? 0)}%</div>
                <div className="flex-1">
                  <div className="h-4 bg-muted rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-chart-2 transition-all"
                      style={{ width: `${Math.round(summary?.cardMatchRate ?? 0)}%` }}
                    />
                  </div>
                  <p className="text-sm text-muted-foreground mt-2">
                    {summary?.matchedTransactions ?? 0} of {summary?.cardFuelTransactions ?? 0} card transactions matched
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Cash transactions ({summary?.cashFuelTransactions ?? 0}) are excluded from matching
                  </p>
                </div>
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
