import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  ArrowLeft, 
  Download, 
  CreditCard, 
  Banknote, 
  Building2,
  CheckCircle2,
  Clock,
  XCircle,
  AlertTriangle,
  TrendingUp,
  Upload,
  Settings,
  Eye,
  Star,
  Info,
  Calendar,
  FileText
} from "lucide-react";
import StatusBadge from "@/components/StatusBadge";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import type { ReconciliationPeriod } from "@shared/schema";

type VerificationSummary = {
  overview: {
    fuelSystem: {
      totalSales: number;
      cardSales: number;
      cardTransactions: number;
      cashSales: number;
      cashTransactions: number;
    };
    bankStatements: {
      totalAmount: number;
      totalTransactions: number;
      sources: { name: string; amount: number; transactions: number }[];
      dateRange: { earliest: string | null; latest: string | null; days: number };
    };
  };
  verificationStatus: {
    verified: { transactions: number; amount: number; percentage: number };
    pendingVerification: { transactions: number; amount: number; reason: string };
    unverified: { transactions: number; amount: number; percentage: number };
    cashSales: { transactions: number; amount: number; reason: string };
  };
  coverageAnalysis: {
    volumeCoverage: number;
    dateRangeCoverage: number;
    fuelDateRange: { earliest: string | null; latest: string | null; days: number };
    bankDateRange: { earliest: string | null; latest: string | null; days: number };
    missingDays: number;
    dailyAverages: { fuel: number; bank: number };
    volumeGap: number;
  };
  discrepancyReport: {
    verifiedSales: number;
    bankDeposits: number;
    difference: number;
    bankHasMore: boolean;
    pendingVerification: { amount: number; transactions: number; percentageOfCardSales: number };
    unmatchedIssues: { count: number; amount: number };
  };
  matchingResults: {
    performanceRating: number;
    performanceLabel: string;
    bankTransactions: { matched: number; unmatched: number; matchRate: number };
    matchQuality: {
      highConfidence: number;
      mediumConfidence: number;
    };
    invoiceGrouping: {
      multiLineInvoices: number;
      totalItemsGrouped: number;
    };
    matchesByDateOffset: {
      sameDay: number;
      oneDay: number;
      twoDays: number;
      threePlusDays: number;
    };
  };
  recommendedActions: {
    critical: { action: string; description: string; details: string[] }[];
    important: { action: string; description: string; details: string[] }[];
    optional: { action: string; description: string; details: string[] }[];
  };
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

  const { data: period, isLoading: periodLoading } = useQuery<ReconciliationPeriod>({
    queryKey: ['/api/periods', periodId],
    enabled: !!periodId,
  });

  const { data: summary, isLoading: summaryLoading } = useQuery<VerificationSummary>({
    queryKey: ['/api/periods', periodId, 'verification-summary'],
    enabled: !!periodId,
  });
  
  const isLoading = periodLoading || summaryLoading;

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

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-ZA', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const renderStars = (rating: number) => {
    return (
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star 
            key={star} 
            className={`h-5 w-5 ${star <= rating ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground/30'}`} 
          />
        ))}
      </div>
    );
  };

  if (isLoading || !period) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b bg-card">
          <div className="max-w-7xl mx-auto px-6 py-4">
            <div className="flex items-center gap-4">
              <Skeleton className="h-9 w-9 rounded-md" />
              <div className="flex-1">
                <Skeleton className="h-8 w-64 mb-2" />
                <Skeleton className="h-4 w-32" />
              </div>
              <Skeleton className="h-9 w-32" />
              <Skeleton className="h-9 w-24" />
            </div>
          </div>
        </header>
        <main className="max-w-6xl mx-auto px-6 py-8">
          <div className="space-y-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-6 w-48 mb-2" />
                  <Skeleton className="h-4 w-64" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-32 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        </main>
      </div>
    );
  }

  const vs = summary?.verificationStatus;
  const ca = summary?.coverageAnalysis;
  const dr = summary?.discrepancyReport;
  const mr = summary?.matchingResults;
  const ra = summary?.recommendedActions;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex flex-wrap items-center gap-4">
            <Link href={`/flow/${periodId}`}>
              <Button variant="ghost" size="icon" data-testid="button-back">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-semibold truncate">Reconciliation Dashboard</h1>
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

      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="space-y-6">
          
          {/* Section 1: Overview - The Complete Picture */}
          <Card data-testid="section-overview">
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <CardTitle className="text-xl flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Reconciliation Overview
                  </CardTitle>
                  <CardDescription className="mt-1">
                    {period.name} • {formatDate(period.startDate)} to {formatDate(period.endDate)}
                  </CardDescription>
                </div>
                <StatusBadge status={period.status as "draft" | "in_progress" | "complete"} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Fuel Management System */}
                <div className="p-4 rounded-lg border bg-card">
                  <div className="flex items-center gap-2 mb-4">
                    <CreditCard className="h-5 w-5 text-chart-4" />
                    <h3 className="font-semibold">Fuel Management System</h3>
                    <Badge variant="outline" className="ml-auto">Source of Truth</Badge>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm text-muted-foreground">Total Sales</p>
                      <p className="text-2xl font-bold font-mono" data-testid="text-total-fuel-sales">
                        {formatCurrency(summary?.overview.fuelSystem.totalSales ?? 0)}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-3 bg-chart-4/10 rounded-md">
                        <div className="flex items-center gap-1 mb-1">
                          <CreditCard className="h-3.5 w-3.5 text-chart-4" />
                          <span className="text-xs font-medium">Card</span>
                        </div>
                        <p className="font-bold font-mono">{formatCurrency(summary?.overview.fuelSystem.cardSales ?? 0)}</p>
                        <p className="text-xs text-muted-foreground">{summary?.overview.fuelSystem.cardTransactions ?? 0} transactions</p>
                      </div>
                      <div className="p-3 bg-chart-5/10 rounded-md">
                        <div className="flex items-center gap-1 mb-1">
                          <Banknote className="h-3.5 w-3.5 text-chart-5" />
                          <span className="text-xs font-medium">Cash</span>
                        </div>
                        <p className="font-bold font-mono">{formatCurrency(summary?.overview.fuelSystem.cashSales ?? 0)}</p>
                        <p className="text-xs text-muted-foreground">{summary?.overview.fuelSystem.cashTransactions ?? 0} transactions</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Bank Statements Uploaded */}
                <div className="p-4 rounded-lg border bg-card">
                  <div className="flex items-center gap-2 mb-4">
                    <Building2 className="h-5 w-5 text-chart-2" />
                    <h3 className="font-semibold">Bank Statements Uploaded</h3>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm text-muted-foreground">Total</p>
                      <p className="text-2xl font-bold font-mono" data-testid="text-total-bank-amount">
                        {formatCurrency(summary?.overview.bankStatements.totalAmount ?? 0)}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {summary?.overview.bankStatements.totalTransactions ?? 0} transactions
                      </p>
                    </div>
                    {summary?.overview.bankStatements.sources && summary.overview.bankStatements.sources.length > 0 && (
                      <div className="space-y-1">
                        {summary.overview.bankStatements.sources.map((source, idx) => (
                          <div key={idx} className="flex justify-between text-sm">
                            <span className="text-muted-foreground">{source.name}</span>
                            <span className="font-mono">{formatCurrency(source.amount)} ({source.transactions} txs)</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      <span>
                        Coverage: {formatDate(summary?.overview.bankStatements.dateRange.earliest ?? null)} - {formatDate(summary?.overview.bankStatements.dateRange.latest ?? null)}
                        {summary?.overview.bankStatements.dateRange.days ? ` (${summary.overview.bankStatements.dateRange.days} days)` : ''}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Section 2: Verification Status */}
          <Card data-testid="section-verification-status">
            <CardHeader>
              <CardTitle className="text-xl flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5" />
                Verification Status
              </CardTitle>
              <CardDescription>What can we verify? What's pending?</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Verified */}
              <div className="p-4 rounded-lg border border-chart-2/30 bg-chart-2/5">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-chart-2" />
                    <span className="font-semibold">Verified (Matched to Bank)</span>
                  </div>
                  <span className="text-2xl font-bold text-chart-2" data-testid="text-verified-percentage">
                    {(vs?.verified.percentage ?? 0).toFixed(1)}%
                  </span>
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground mb-2">
                  <span data-testid="text-verified-transactions">{vs?.verified.transactions ?? 0} transactions</span>
                  <span className="font-mono">{formatCurrency(vs?.verified.amount ?? 0)}</span>
                </div>
                <Progress value={vs?.verified.percentage ?? 0} className="h-2" />
              </div>

              {/* Pending Verification */}
              {(vs?.pendingVerification.transactions ?? 0) > 0 && (
                <div className="p-4 rounded-lg border border-yellow-500/30 bg-yellow-500/5">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Clock className="h-5 w-5 text-yellow-600" />
                      <span className="font-semibold">Pending Verification (Bank Missing)</span>
                    </div>
                    <Link href={`/flow/${periodId}`}>
                      <Button variant="outline" size="sm" className="text-yellow-700 border-yellow-600/30" data-testid="button-upload-missing-bank">
                        <Upload className="h-4 w-4 mr-2" />
                        Upload Bank Data
                      </Button>
                    </Link>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span data-testid="text-pending-transactions">{vs?.pendingVerification.transactions ?? 0} transactions</span>
                    <span className="font-mono">{formatCurrency(vs?.pendingVerification.amount ?? 0)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">{vs?.pendingVerification.reason}</p>
                </div>
              )}

              {/* Unverified */}
              {(vs?.unverified.transactions ?? 0) > 0 && (
                <div className="p-4 rounded-lg border border-chart-1/30 bg-chart-1/5">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <XCircle className="h-5 w-5 text-chart-1" />
                      <span className="font-semibold">Unverified (No Match in Bank)</span>
                    </div>
                    <Link href={`/investigate?periodId=${periodId}`}>
                      <Button variant="outline" size="sm" className="text-chart-1 border-chart-1/30" data-testid="button-review-unverified">
                        <Eye className="h-4 w-4 mr-2" />
                        Review ({vs?.unverified.transactions ?? 0})
                      </Button>
                    </Link>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span data-testid="text-unverified-transactions">{vs?.unverified.transactions ?? 0} transactions</span>
                    <span className="font-mono">{formatCurrency(vs?.unverified.amount ?? 0)}</span>
                    <span className="text-lg font-bold text-chart-1 ml-auto" data-testid="text-unverified-percentage">
                      {(vs?.unverified.percentage ?? 0).toFixed(1)}%
                    </span>
                  </div>
                </div>
              )}

              {/* Cash Sales */}
              <div className="p-4 rounded-lg border bg-muted/30">
                <div className="flex items-center gap-2 mb-2">
                  <Info className="h-5 w-5 text-muted-foreground" />
                  <span className="font-semibold">Cash Sales (Cannot Verify)</span>
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span>{vs?.cashSales.transactions ?? 0} transactions</span>
                  <span className="font-mono">{formatCurrency(vs?.cashSales.amount ?? 0)}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-2">{vs?.cashSales.reason}</p>
              </div>
            </CardContent>
          </Card>

          {/* Section 3: Bank Coverage Analysis */}
          <Card data-testid="section-coverage-analysis">
            <CardHeader>
              <CardTitle className="text-xl flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Bank Coverage Analysis
              </CardTitle>
              <CardDescription>How complete is your bank data?</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-6 p-4 rounded-lg border border-yellow-500/30 bg-yellow-500/5">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="h-5 w-5 text-yellow-600" />
                  <span className="font-semibold">
                    Coverage: {(ca?.volumeCoverage ?? 0).toFixed(1)}%
                  </span>
                  {(ca?.volumeCoverage ?? 0) < 50 && (
                    <span className="text-sm text-yellow-700">
                      ({(100 - (ca?.volumeCoverage ?? 0)).toFixed(0)}% of card sales cannot be verified)
                    </span>
                  )}
                </div>
                <Progress value={ca?.volumeCoverage ?? 0} className="h-3 mb-2" />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-medium mb-3">Date Range</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Fuel Data:</span>
                      <span>
                        {formatDate(ca?.fuelDateRange.earliest ?? null)} - {formatDate(ca?.fuelDateRange.latest ?? null)}
                        {ca?.fuelDateRange.days ? ` (${ca.fuelDateRange.days} days)` : ''}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Bank Data:</span>
                      <span>
                        {formatDate(ca?.bankDateRange.earliest ?? null)} - {formatDate(ca?.bankDateRange.latest ?? null)}
                        {ca?.bankDateRange.days ? ` (${ca.bankDateRange.days} days)` : ''}
                      </span>
                    </div>
                    {(ca?.missingDays ?? 0) > 0 && (
                      <div className="flex justify-between text-chart-1">
                        <span>Missing:</span>
                        <span>~{ca?.missingDays} days of data</span>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <h4 className="font-medium mb-3">Transaction Volume</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Fuel (card):</span>
                      <span>{(ca?.dailyAverages.fuel ?? 0).toFixed(1)} transactions/day</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Bank:</span>
                      <span>{(ca?.dailyAverages.bank ?? 0).toFixed(1)} transactions/day</span>
                    </div>
                    {(ca?.volumeGap ?? 0) > 1.5 && (
                      <div className="flex justify-between text-chart-1">
                        <span>Gap:</span>
                        <span>{(ca?.volumeGap ?? 0).toFixed(1)}x difference</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {(ca?.volumeCoverage ?? 0) < 80 && (
                <div className="mt-6 p-4 bg-muted/30 rounded-lg">
                  <h4 className="font-medium mb-2">Possible Reasons for Gap</h4>
                  <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                    <li>Additional merchant accounts not uploaded</li>
                    <li>Corporate cards processed separately</li>
                    <li>Fleet cards on different bank account</li>
                    <li>Missing bank account statements</li>
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Section 4: Discrepancy Report */}
          <Card data-testid="section-discrepancy-report">
            <CardHeader>
              <CardTitle className="text-xl flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                Discrepancy Report
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Financial Discrepancies */}
                <div className="p-4 rounded-lg border">
                  <h4 className="font-medium mb-3">Financial Discrepancies</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Verified Sales:</span>
                      <span className="font-mono">{formatCurrency(dr?.verifiedSales ?? 0)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Bank Deposits:</span>
                      <span className="font-mono">{formatCurrency(dr?.bankDeposits ?? 0)}</span>
                    </div>
                    <div className="flex justify-between font-medium pt-2 border-t">
                      <span>Difference:</span>
                      <span className={`font-mono ${dr?.bankHasMore ? 'text-chart-2' : 'text-chart-1'}`}>
                        {dr?.bankHasMore ? '+' : '-'}{formatCurrency(dr?.difference ?? 0)}
                      </span>
                    </div>
                  </div>
                  {dr?.bankHasMore && (
                    <div className="mt-3 flex items-center gap-2 text-xs text-chart-2">
                      <CheckCircle2 className="h-4 w-4" />
                      Bank deposits exceed verified fuel sales
                    </div>
                  )}
                </div>

                {/* Unable to Verify */}
                <div className="p-4 rounded-lg border border-yellow-500/30 bg-yellow-500/5">
                  <h4 className="font-medium mb-3">Unable to Verify</h4>
                  <p className="text-sm text-muted-foreground mb-2">Card Sales Without Bank Data</p>
                  <p className="text-xl font-bold font-mono">{formatCurrency(dr?.pendingVerification.amount ?? 0)}</p>
                  <p className="text-sm text-muted-foreground">
                    {(dr?.pendingVerification.percentageOfCardSales ?? 0).toFixed(1)}% of card sales • {dr?.pendingVerification.transactions ?? 0} transactions
                  </p>
                  <div className="mt-3">
                    <Link href={`/flow/${periodId}`}>
                      <Button variant="outline" size="sm" className="text-yellow-700 border-yellow-600/30" data-testid="button-upload-additional-bank">
                        <Upload className="h-4 w-4 mr-2" />
                        Upload Additional Bank Statements
                      </Button>
                    </Link>
                  </div>
                </div>
              </div>

              {/* Matching Issues */}
              {(dr?.unmatchedIssues.count ?? 0) > 0 && (
                <div className="mt-6 p-4 rounded-lg border border-chart-1/30 bg-chart-1/5">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-medium">Matching Issues (Review Required)</h4>
                    <Link href={`/investigate?periodId=${periodId}`}>
                      <Button variant="outline" size="sm" data-testid="button-review-unmatched">
                        <Eye className="h-4 w-4 mr-2" />
                        Review Unmatched
                      </Button>
                    </Link>
                  </div>
                  <p className="text-sm">
                    <span className="font-bold text-chart-1">{dr?.unmatchedIssues.count ?? 0} transactions</span>
                    <span className="text-muted-foreground"> • </span>
                    <span className="font-mono">{formatCurrency(dr?.unmatchedIssues.amount ?? 0)}</span>
                  </p>
                  <div className="mt-3 text-xs text-muted-foreground">
                    Possible reasons: Amount differences beyond tolerance, date outside matching window, duplicate or voided transactions, refunds or adjustments
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Section 5: Matching Results */}
          <Card data-testid="section-matching-results">
            <CardHeader>
              <CardTitle className="text-xl flex items-center gap-2">
                <Star className="h-5 w-5" />
                Matching Results
              </CardTitle>
              <CardDescription>For verifiable portion only</CardDescription>
            </CardHeader>
            <CardContent>
              {/* Performance Rating */}
              <div className="p-4 rounded-lg border mb-6">
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Match Performance</p>
                    <div className="flex items-center gap-3">
                      <span className="text-3xl font-bold" data-testid="text-match-rate">
                        {(mr?.bankTransactions.matchRate ?? 0).toFixed(1)}%
                      </span>
                      <Badge 
                        variant={(mr?.performanceRating ?? 0) >= 4 ? "default" : "secondary"}
                        className={`${(mr?.performanceRating ?? 0) >= 4 ? 'bg-chart-2' : ''}`}
                      >
                        {mr?.performanceLabel ?? 'N/A'}
                      </Badge>
                    </div>
                  </div>
                  <div>
                    {renderStars(mr?.performanceRating ?? 0)}
                  </div>
                </div>
                <div className="mt-4 text-sm text-muted-foreground">
                  Of {(mr?.bankTransactions.matched ?? 0) + (mr?.bankTransactions.unmatched ?? 0)} Bank Transactions:
                  <span className="text-chart-2 ml-2">Matched: {mr?.bankTransactions.matched ?? 0}</span>
                  {(mr?.bankTransactions.unmatched ?? 0) > 0 ? (
                    <Link href={`/investigate?periodId=${periodId}`}>
                      <span className="text-chart-1 ml-2 underline hover:no-underline cursor-pointer">
                        Unmatched: {mr?.bankTransactions.unmatched ?? 0}
                      </span>
                    </Link>
                  ) : (
                    <span className="text-chart-1 ml-2">Unmatched: {mr?.bankTransactions.unmatched ?? 0}</span>
                  )}
                </div>
                {(mr?.bankTransactions.matchRate ?? 0) >= 70 && (
                  <p className="text-xs text-chart-2 mt-2">
                    {(mr?.bankTransactions.matchRate ?? 0).toFixed(0)}% is within expected range (75-90%)
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Match Quality */}
                <div className="p-4 rounded-lg border">
                  <h4 className="font-medium mb-3">Match Quality</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">High Confidence (85-100%)</span>
                      <span className="font-bold text-chart-2">{mr?.matchQuality.highConfidence ?? 0}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Medium Confidence (70-84%)</span>
                      <span className="font-bold text-chart-4">{mr?.matchQuality.mediumConfidence ?? 0}</span>
                    </div>
                  </div>
                </div>

                {/* Invoice Grouping */}
                <div className="p-4 rounded-lg border">
                  <h4 className="font-medium mb-3">Invoice Grouping</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Multi-line invoices</span>
                      <span className="font-bold">{mr?.invoiceGrouping.multiLineInvoices ?? 0}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Total items grouped</span>
                      <span className="font-bold">{mr?.invoiceGrouping.totalItemsGrouped ?? 0}</span>
                    </div>
                  </div>
                </div>

                {/* Match Date Offsets */}
                <div className="p-4 rounded-lg border">
                  <h4 className="font-medium mb-3">Processing Time</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Same day</span>
                      <span className="font-bold text-chart-2">{mr?.matchesByDateOffset.sameDay ?? 0}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">1 day later</span>
                      <span className="font-bold">{mr?.matchesByDateOffset.oneDay ?? 0}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">2+ days later</span>
                      <span className="font-bold">{(mr?.matchesByDateOffset.twoDays ?? 0) + (mr?.matchesByDateOffset.threePlusDays ?? 0)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Section 6: Recommended Actions */}
          <Card data-testid="section-recommended-actions">
            <CardHeader>
              <CardTitle className="text-xl flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Recommended Actions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Critical Actions */}
              {ra?.critical && ra.critical.length > 0 && (
                <div>
                  {ra.critical.map((action, idx) => (
                    <div key={idx} className="p-4 rounded-lg border border-chart-1/30 bg-chart-1/5 mb-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="destructive">Critical</Badge>
                        <span className="font-semibold">{action.description}</span>
                      </div>
                      <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside mb-3">
                        {action.details.map((detail, didx) => (
                          <li key={didx}>{detail}</li>
                        ))}
                      </ul>
                      {action.action === 'upload_bank_statements' && (
                        <Link href={`/flow/${periodId}`}>
                          <Button variant="destructive" size="sm" data-testid="button-upload-bank">
                            <Upload className="h-4 w-4 mr-2" />
                            Upload Bank Files
                          </Button>
                        </Link>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Important Actions */}
              {ra?.important && ra.important.length > 0 && (
                <div>
                  {ra.important.map((action, idx) => (
                    <div key={idx} className="p-4 rounded-lg border border-yellow-500/30 bg-yellow-500/5 mb-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="outline" className="text-yellow-700 border-yellow-600/30 bg-yellow-100">Important</Badge>
                        <span className="font-semibold">{action.description}</span>
                      </div>
                      <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside mb-3">
                        {action.details.map((detail, didx) => (
                          <li key={didx}>{detail}</li>
                        ))}
                      </ul>
                      {action.action === 'review_unmatched' && (
                        <Link href={`/investigate?periodId=${periodId}`}>
                          <Button variant="outline" size="sm" data-testid="button-review-unmatched-action">
                            <Eye className="h-4 w-4 mr-2" />
                            Review Unmatched
                          </Button>
                        </Link>
                      )}
                      {action.action === 'adjust_rules' && (
                        <Link href={`/flow/${periodId}`}>
                          <Button variant="outline" size="sm" data-testid="button-adjust-rules">
                            <Settings className="h-4 w-4 mr-2" />
                            Configure Rules
                          </Button>
                        </Link>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Optional Actions */}
              {ra?.optional && ra.optional.length > 0 && (
                <div>
                  {ra.optional.map((action, idx) => (
                    <div key={idx} className="p-4 rounded-lg border bg-muted/30 mb-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="secondary">Optional</Badge>
                        <span className="font-semibold">{action.description}</span>
                      </div>
                      <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside mb-3">
                        {action.details.map((detail, didx) => (
                          <li key={didx}>{detail}</li>
                        ))}
                      </ul>
                      {action.action === 'adjust_rules' && (
                        <Link href={`/flow/${periodId}`}>
                          <Button variant="ghost" size="sm" data-testid="button-configure-rules">
                            <Settings className="h-4 w-4 mr-2" />
                            Configure Rules
                          </Button>
                        </Link>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* No actions needed */}
              {(!ra?.critical || ra.critical.length === 0) && 
               (!ra?.important || ra.important.length === 0) && 
               (!ra?.optional || ra.optional.length === 0) && (
                <div className="p-4 rounded-lg border border-chart-2/30 bg-chart-2/5 text-center">
                  <CheckCircle2 className="h-8 w-8 text-chart-2 mx-auto mb-2" />
                  <p className="font-semibold">No actions required</p>
                  <p className="text-sm text-muted-foreground">Your reconciliation is complete and accurate.</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Notes Section */}
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
