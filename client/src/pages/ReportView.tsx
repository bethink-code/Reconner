import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Download, FileText } from "lucide-react";
import StatusBadge from "@/components/StatusBadge";
import { Link } from "wouter";

export default function ReportView() {
  const [exportFormat, setExportFormat] = useState("pdf");

  // todo: remove mock functionality
  const reportData = {
    periodName: "January 2024 Reconciliation",
    dateRange: "Jan 1 - Jan 31, 2024",
    generatedAt: new Date().toLocaleString(),
    summary: {
      totalTransactions: 150,
      matched: 120,
      unmatched: 20,
      partial: 10,
      reconciliationRate: 80,
      totalAmount: 125750.50,
      discrepancy: 250.00,
    },
    matchedTransactions: [
      { id: "TXN-001", date: "2024-01-15", amount: 1250.50, reference: "REF-2024-001" },
      { id: "TXN-002", date: "2024-01-16", amount: 890.00, reference: "REF-2024-002" },
      { id: "TXN-004", date: "2024-01-18", amount: 1450.25, reference: "REF-2024-004" },
    ],
    unmatchedTransactions: [
      { id: "TXN-003", date: "2024-01-17", amount: 2100.75, reference: "REF-2024-003" },
      { id: "TXN-005", date: "2024-01-19", amount: 750.00, reference: "REF-2024-005" },
    ],
  };

  const handleExport = () => {
    console.log(`Exporting report as ${exportFormat}`);
    // todo: remove mock functionality - implement actual export
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center gap-4">
            <Link href="/reconcile">
              <Button variant="ghost" size="icon" data-testid="button-back">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div className="flex-1">
              <h1 className="text-2xl font-semibold">Reconciliation Report</h1>
              <p className="text-sm text-muted-foreground mt-1">
                {reportData.periodName}
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
          {/* Report Header */}
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-xl">{reportData.periodName}</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    Period: {reportData.dateRange}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Generated: {reportData.generatedAt}
                  </p>
                </div>
                <StatusBadge status="complete" />
              </div>
            </CardHeader>
          </Card>

          {/* Summary Statistics */}
          <Card>
            <CardHeader>
              <CardTitle>Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Total Transactions</p>
                  <p className="text-2xl font-bold">{reportData.summary.totalTransactions}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Matched</p>
                  <p className="text-2xl font-bold text-chart-2">{reportData.summary.matched}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Unmatched</p>
                  <p className="text-2xl font-bold text-destructive">{reportData.summary.unmatched}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Reconciliation Rate</p>
                  <p className="text-2xl font-bold">{reportData.summary.reconciliationRate}%</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6 mt-6 pt-6 border-t">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Total Amount</p>
                  <p className="text-xl font-mono font-semibold">
                    {formatCurrency(reportData.summary.totalAmount)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Discrepancy</p>
                  <p className="text-xl font-mono font-semibold text-destructive">
                    {formatCurrency(reportData.summary.discrepancy)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Matched Transactions */}
          <Card>
            <CardHeader>
              <CardTitle>Matched Transactions ({reportData.matchedTransactions.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-muted/50">
                    <tr className="border-b">
                      <th className="text-left p-3 text-sm font-semibold">Transaction ID</th>
                      <th className="text-left p-3 text-sm font-semibold">Date</th>
                      <th className="text-left p-3 text-sm font-semibold">Reference</th>
                      <th className="text-right p-3 text-sm font-semibold">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.matchedTransactions.map((txn) => (
                      <tr key={txn.id} className="border-b">
                        <td className="p-3 text-sm font-mono">{txn.id}</td>
                        <td className="p-3 text-sm">{txn.date}</td>
                        <td className="p-3 text-sm font-mono">{txn.reference}</td>
                        <td className="p-3 text-sm font-mono text-right">
                          {formatCurrency(txn.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Unmatched Transactions */}
          <Card>
            <CardHeader>
              <CardTitle>Unmatched Transactions ({reportData.unmatchedTransactions.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-muted/50">
                    <tr className="border-b">
                      <th className="text-left p-3 text-sm font-semibold">Transaction ID</th>
                      <th className="text-left p-3 text-sm font-semibold">Date</th>
                      <th className="text-left p-3 text-sm font-semibold">Reference</th>
                      <th className="text-right p-3 text-sm font-semibold">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.unmatchedTransactions.map((txn) => (
                      <tr key={txn.id} className="border-b">
                        <td className="p-3 text-sm font-mono">{txn.id}</td>
                        <td className="p-3 text-sm">{txn.date}</td>
                        <td className="p-3 text-sm font-mono">{txn.reference}</td>
                        <td className="p-3 text-sm font-mono text-right">
                          {formatCurrency(txn.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
