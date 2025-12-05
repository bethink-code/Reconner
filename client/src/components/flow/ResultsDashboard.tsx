import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { 
  Check, 
  AlertTriangle, 
  X,
  Search,
  Download,
  Settings,
  FileText,
  Building2,
  Fuel,
  ArrowRight,
  Plus
} from "lucide-react";
import { cn } from "@/lib/utils";

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
  unmatchableBankTransactions?: number;
}

interface ResultsDashboardProps {
  periodId: string;
  onRerunMatching: () => void;
}

export function ResultsDashboard({ periodId, onRerunMatching }: ResultsDashboardProps) {
  const [, setLocation] = useLocation();

  const { data: summary, isLoading } = useQuery<PeriodSummary>({
    queryKey: ["/api/periods", periodId, "summary"],
    enabled: !!periodId,
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-ZA", {
      style: "currency",
      currency: "ZAR",
    }).format(amount);
  };

  if (isLoading || !summary) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const bankTotal = summary.bankTransactions;
  const matchedBank = summary.matchedPairs;
  const unmatchableBank = summary.unmatchableBankTransactions || 0;
  const unmatchedBank = summary.unmatchedBankTransactions;
  const bankAmount = summary.totalBankAmount;

  const matchedPercent = bankTotal > 0 ? (matchedBank / bankTotal) * 100 : 0;
  const unmatchablePercent = bankTotal > 0 ? (unmatchableBank / bankTotal) * 100 : 0;
  const unmatchedPercent = bankTotal > 0 ? (unmatchedBank / bankTotal) * 100 : 0;

  const needsInvestigation = unmatchedBank;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Reconciliation Results</h2>
          <p className="text-sm text-muted-foreground">
            Review your matched transactions
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onRerunMatching} data-testid="button-rerun-matching">
            <Settings className="h-4 w-4 mr-2" />
            Adjust Rules
          </Button>
          <Button 
            variant="outline"
            onClick={() => setLocation(`/report?periodId=${periodId}`)}
            data-testid="button-export"
          >
            <Download className="h-4 w-4 mr-2" />
            Export Report
          </Button>
        </div>
      </div>

      <Card data-testid="card-bank-summary">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Bank Transactions</CardTitle>
          </div>
          <CardDescription>
            {bankTotal.toLocaleString()} transactions ({formatCurrency(bankAmount)})
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-green-500" />
                  <span className="text-sm font-medium">Matched</span>
                </div>
                <div className="text-right">
                  <span className="font-mono font-medium">{matchedBank}</span>
                  <span className="text-muted-foreground text-sm ml-2">
                    ({matchedPercent.toFixed(1)}%)
                  </span>
                </div>
              </div>
              <Progress value={matchedPercent} className="h-2 bg-muted" />
            </div>

            {unmatchableBank > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-amber-500" />
                    <span className="text-sm font-medium">Unmatchable</span>
                    <Badge variant="secondary" className="text-xs">
                      outside date range
                    </Badge>
                  </div>
                  <div className="text-right">
                    <span className="font-mono font-medium">{unmatchableBank}</span>
                    <span className="text-muted-foreground text-sm ml-2">
                      ({unmatchablePercent.toFixed(1)}%)
                    </span>
                  </div>
                </div>
                <Progress value={unmatchablePercent} className="h-2 bg-muted [&>div]:bg-amber-500" />
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500" />
                  <span className="text-sm font-medium">Unmatched</span>
                  <Badge variant="secondary" className="text-xs">
                    needs review
                  </Badge>
                </div>
                <div className="text-right">
                  <span className="font-mono font-medium">{unmatchedBank}</span>
                  <span className="text-muted-foreground text-sm ml-2">
                    ({unmatchedPercent.toFixed(1)}%)
                  </span>
                </div>
              </div>
              <Progress value={unmatchedPercent} className="h-2 bg-muted [&>div]:bg-red-500" />
            </div>
          </div>

          {needsInvestigation > 0 && (
            <Card className="bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800">
              <CardContent className="pt-4">
                <div className="flex items-start gap-3">
                  <Search className="h-5 w-5 text-amber-600 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-medium text-amber-800 dark:text-amber-200">
                      {needsInvestigation} bank transaction{needsInvestigation !== 1 ? "s" : ""} need investigation
                    </p>
                    <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                      These couldn't be automatically matched to fuel records.
                    </p>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="mt-3"
                      onClick={() => setLocation(`/investigate?periodId=${periodId}`)}
                      data-testid="button-review-unmatched"
                    >
                      Review Unmatched
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {needsInvestigation === 0 && matchedBank > 0 && (
            <Card className="bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800">
              <CardContent className="pt-4">
                <div className="flex items-start gap-3">
                  <Check className="h-5 w-5 text-green-600 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-medium text-green-800 dark:text-green-200">
                      All matchable bank transactions are reconciled
                    </p>
                    <p className="text-sm text-green-700 dark:text-green-300 mt-1">
                      Every bank transaction within the fuel data range has been matched.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>

      <Card data-testid="card-fuel-coverage">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Fuel className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg text-muted-foreground">Fuel Data Coverage</CardTitle>
          </div>
          <CardDescription>Reference information about your fuel records</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-xs text-muted-foreground">Card Sales</p>
              <p className="text-lg font-mono font-medium">
                {summary.cardFuelTransactions.toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatCurrency(summary.totalFuelAmount)}
              </p>
            </div>
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-xs text-muted-foreground">Bank Coverage</p>
              <p className="text-lg font-mono font-medium">
                {summary.cardFuelTransactions > 0 
                  ? ((bankTotal / summary.cardFuelTransactions) * 100).toFixed(1)
                  : 0}%
              </p>
              <p className="text-xs text-muted-foreground">
                of card sales verified
              </p>
            </div>
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-xs text-muted-foreground">Discrepancy</p>
              <p className={cn(
                "text-lg font-mono font-medium",
                summary.discrepancy > 0 ? "text-red-600" : "text-green-600"
              )}>
                {formatCurrency(Math.abs(summary.discrepancy))}
              </p>
              <p className="text-xs text-muted-foreground">
                {summary.discrepancy > 0 ? "bank exceeds fuel" : "fuel exceeds bank"}
              </p>
            </div>
          </div>

          {summary.cardFuelTransactions > 0 && bankTotal < summary.cardFuelTransactions * 0.1 && (
            <div className="mt-4 p-3 bg-muted/50 rounded-lg flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-sm text-muted-foreground">
                  Bank data covers a small portion of your card sales.
                  Upload more bank statements to increase coverage.
                </p>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="px-0 h-auto mt-1"
                  onClick={() => setLocation(`/setup/${periodId}`)}
                  data-testid="button-add-more-bank"
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add Bank Statement
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-center gap-4 pt-4">
        <Button 
          variant="outline"
          onClick={() => setLocation(`/reconcile?periodId=${periodId}`)}
          data-testid="button-view-all-transactions"
        >
          <FileText className="h-4 w-4 mr-2" />
          View All Transactions
        </Button>
        <Button 
          onClick={() => setLocation(`/report?periodId=${periodId}`)}
          data-testid="button-generate-report"
        >
          <Download className="h-4 w-4 mr-2" />
          Generate Full Report
        </Button>
      </div>
    </div>
  );
}
