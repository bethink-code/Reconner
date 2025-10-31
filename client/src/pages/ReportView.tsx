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
import { ArrowLeft, Download } from "lucide-react";
import StatusBadge from "@/components/StatusBadge";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import type { ReconciliationPeriod, Transaction } from "@shared/schema";

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

  const matchedTransactions = transactions.filter(t => t.matchStatus === "matched");
  const unmatchedTransactions = transactions.filter(t => t.matchStatus === "unmatched");
  const partialTransactions = transactions.filter(t => t.matchStatus === "partial");

  const totalAmount = transactions.reduce((sum, t) => sum + parseFloat(t.amount || '0'), 0);
  const matchedAmount = matchedTransactions.reduce((sum, t) => sum + parseFloat(t.amount || '0'), 0);
  const unmatchedAmount = unmatchedTransactions.reduce((sum, t) => sum + parseFloat(t.amount || '0'), 0);

  const reconciliationRate = transactions.length > 0 
    ? Math.round((matchedTransactions.length / transactions.length) * 100) 
    : 0;

  const handleExport = () => {
    const url = `/api/periods/${periodId}/report/${exportFormat}`;
    window.open(url, '_blank');
    
    toast({
      title: "Downloading report",
      description: `Your ${exportFormat.toUpperCase()} report is being downloaded.`,
    });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
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
                <StatusBadge status={period.status} />
              </div>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Total Transactions</p>
                  <p className="text-2xl font-bold">{transactions.length}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Matched</p>
                  <p className="text-2xl font-bold text-chart-2">{matchedTransactions.length}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Unmatched</p>
                  <p className="text-2xl font-bold text-chart-1">{unmatchedTransactions.length}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Partial</p>
                  <p className="text-2xl font-bold text-chart-3">{partialTransactions.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Financial Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Total Amount</p>
                  <p className="text-2xl font-bold font-mono">{formatCurrency(totalAmount)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Matched Amount</p>
                  <p className="text-2xl font-bold font-mono text-chart-2">{formatCurrency(matchedAmount)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Unmatched Amount</p>
                  <p className="text-2xl font-bold font-mono text-chart-1">{formatCurrency(unmatchedAmount)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Reconciliation Rate</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <div className="text-4xl font-bold">{reconciliationRate}%</div>
                <div className="flex-1">
                  <div className="h-4 bg-muted rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-chart-2 transition-all"
                      style={{ width: `${reconciliationRate}%` }}
                    />
                  </div>
                  <p className="text-sm text-muted-foreground mt-2">
                    {matchedTransactions.length} of {transactions.length} transactions matched
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
