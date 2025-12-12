import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { 
  Check, 
  AlertTriangle, 
  Search,
  Download,
  Settings,
  FileText,
  Building2,
  Fuel,
  ArrowRight,
  Plus,
  ChevronDown,
  ChevronRight,
  Calendar,
  Info
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PeriodCoverageTimeline } from "@/components/PeriodCoverageTimeline";

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
  resolvedBankTransactions?: number;
  fuelDateRange?: { min: string; max: string };
  bankDateRange?: { min: string; max: string };
}

interface ResolutionSummary {
  linked: number;
  reviewed: number;
  dismissed: number;
  flagged: number;
  writtenOff: number;
}

interface ResultsDashboardProps {
  periodId: string;
  onRerunMatching: () => void;
}

interface Period {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
}

export function ResultsDashboard({ periodId, onRerunMatching }: ResultsDashboardProps) {
  const [, setLocation] = useLocation();
  const [detailsOpen, setDetailsOpen] = useState(false);

  const { data: summary, isLoading } = useQuery<PeriodSummary>({
    queryKey: ["/api/periods", periodId, "summary"],
    enabled: !!periodId,
  });

  const { data: period } = useQuery<Period>({
    queryKey: ["/api/periods", periodId],
    enabled: !!periodId,
  });

  const { data: resolutionSummary } = useQuery<ResolutionSummary>({
    queryKey: ["/api/periods", periodId, "resolution-summary"],
    enabled: !!periodId,
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-ZA", {
      style: "currency",
      currency: "ZAR",
    }).format(amount);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-ZA", {
      day: "numeric",
      month: "short",
    });
  };

  if (isLoading || !summary) {
    return (
      <div className="space-y-6 max-w-2xl mx-auto">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  const bankTotal = summary.bankTransactions;
  const matchedBank = summary.matchedPairs;
  const resolvedBank = summary.resolvedBankTransactions || 0;
  const verifiedBank = matchedBank + resolvedBank; // Combined matched + manually resolved
  const unmatchableBank = summary.unmatchableBankTransactions || 0;
  const unmatchedBank = summary.unmatchedBankTransactions;

  const verifiedPercent = bankTotal > 0 ? Math.round((verifiedBank / bankTotal) * 100) : 0;
  const needsReview = unmatchedBank;
  const outsideDateRange = unmatchableBank;

  // Resolution summary for completion state
  const linked = resolutionSummary?.linked || 0;
  const reviewed = resolutionSummary?.reviewed || 0;
  const dismissed = resolutionSummary?.dismissed || 0;
  const flagged = resolutionSummary?.flagged || 0;
  const writtenOff = resolutionSummary?.writtenOff || 0;
  const closedCount = linked + reviewed + dismissed + writtenOff;
  const totalResolved = closedCount + flagged;

  // All truly done only when flagged === 0 AND no unmatched transactions needing review
  const allTrulyDone = needsReview === 0 && flagged === 0;
  // Review complete means all transactions categorized but some are flagged
  const reviewComplete = needsReview === 0 && flagged > 0;

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* SECTION 1: HEADLINE METRIC */}
      <Card data-testid="card-headline-metric">
        <CardContent className="pt-6 pb-8">
          <div className="text-center space-y-4">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground uppercase tracking-wide">
                Bank Transactions Verified
              </p>
              <p className="text-6xl font-bold text-primary" data-testid="text-verified-percent">
                {verifiedPercent}%
              </p>
            </div>
            
            {/* Progress Bar */}
            <div className="w-full max-w-md mx-auto">
              <div className="h-4 bg-muted rounded-full overflow-hidden">
                <div 
                  className={cn(
                    "h-full transition-all duration-500",
                    verifiedPercent === 100 ? "bg-green-500" : "bg-primary"
                  )}
                  style={{ width: `${verifiedPercent}%` }}
                />
              </div>
            </div>

            {/* Breakdown */}
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-green-500" />
                <span className="font-medium text-foreground">{verifiedBank}</span> verified
                {resolvedBank > 0 && (
                  <span className="text-xs">({matchedBank} matched + {resolvedBank} resolved)</span>
                )}
              </span>
              <span className="text-muted-foreground/50">·</span>
              {needsReview > 0 && (
                <>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    <span className="font-medium text-foreground">{needsReview}</span> need review
                  </span>
                  <span className="text-muted-foreground/50">·</span>
                </>
              )}
              {outsideDateRange > 0 && (
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-slate-400" />
                  <span className="font-medium text-foreground">{outsideDateRange}</span> outside date range
                </span>
              )}
              {needsReview === 0 && outsideDateRange === 0 && (
                <span className="flex items-center gap-1 text-green-600">
                  <Check className="h-4 w-4" />
                  All transactions matched
                </span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* SECTION 2: COMPLETION STATE */}
      {allTrulyDone ? (
        // STATE 1: All Done - no flagged items, no pending review
        <Card className="bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800" data-testid="card-all-done">
          <CardContent className="pt-6 pb-6">
            <div className="flex flex-col items-center text-center gap-3">
              <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/50 flex items-center justify-center">
                <Check className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-green-800 dark:text-green-200">
                  All Done!
                </h3>
                <p className="text-sm text-green-700 dark:text-green-300 mt-1">
                  Your reconciliation is complete. All bank transactions have been verified.
                </p>
              </div>
              <div className="flex gap-2 mt-2">
                <Button 
                  variant="outline"
                  onClick={() => setLocation(`/report?periodId=${periodId}`)}
                  data-testid="button-export-report"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export Report
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : reviewComplete ? (
        // STATE 2: Review Complete - transactions categorized but some are flagged
        <Card className="bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800" data-testid="card-review-complete">
          <CardContent className="pt-6 pb-6 space-y-4">
            <div className="text-center">
              <h3 className="text-lg font-semibold text-orange-800 dark:text-orange-200">
                Review Complete
              </h3>
              <p className="text-sm text-orange-700 dark:text-orange-300 mt-1">
                {totalResolved} of {totalResolved} transactions categorized
              </p>
            </div>
            
            {/* Resolution Breakdown */}
            <div className="border-t border-b border-orange-200 dark:border-orange-700 py-3 space-y-2">
              {linked > 0 && (
                <div className="flex items-center gap-2 text-sm">
                  <Check className="h-4 w-4 text-green-600" />
                  <span className="text-foreground">{linked} Linked to fuel records</span>
                </div>
              )}
              {dismissed > 0 && (
                <div className="flex items-center gap-2 text-sm">
                  <Check className="h-4 w-4 text-green-600" />
                  <span className="text-foreground">{dismissed} Dismissed (low value)</span>
                </div>
              )}
              {reviewed > 0 && (
                <div className="flex items-center gap-2 text-sm">
                  <Check className="h-4 w-4 text-green-600" />
                  <span className="text-foreground">{reviewed} Marked as reviewed — no issue</span>
                </div>
              )}
              {writtenOff > 0 && (
                <div className="flex items-center gap-2 text-sm">
                  <Check className="h-4 w-4 text-green-600" />
                  <span className="text-foreground">{writtenOff} Written off</span>
                </div>
              )}
              {flagged > 0 && (
                <div className="flex items-center gap-2 text-sm">
                  <AlertTriangle className="h-4 w-4 text-orange-600" />
                  <span className="text-orange-700 dark:text-orange-300 font-medium">{flagged} Flagged for follow-up</span>
                </div>
              )}
            </div>

            {/* Warning message */}
            <div className="flex items-center gap-2 text-sm text-orange-700 dark:text-orange-300 bg-orange-100 dark:bg-orange-900/30 p-2 rounded">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{flagged} transaction{flagged !== 1 ? 's' : ''} need{flagged === 1 ? 's' : ''} manager/accountant review</span>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2 flex-wrap">
              <Button 
                onClick={() => setLocation(`/investigate?periodId=${periodId}&filter=flagged`)}
                data-testid="button-view-flagged"
              >
                <Search className="h-4 w-4 mr-2" />
                View Flagged Items
              </Button>
              <Button 
                variant="outline"
                onClick={() => window.open(`/api/periods/${periodId}/export-flagged`, '_blank')}
                data-testid="button-export-flagged"
              >
                <Download className="h-4 w-4 mr-2" />
                Export for Review
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        // STATE 3: Action Required - still needs review
        <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20" data-testid="card-action-required">
          <CardContent className="pt-6 pb-6 space-y-4">
            <div className="flex items-start gap-4">
              <div className="p-2 bg-amber-100 dark:bg-amber-900/50 rounded-lg shrink-0">
                <Search className="h-5 w-5 text-amber-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-lg">
                  {needsReview} bank transaction{needsReview !== 1 ? "s" : ""} need{needsReview === 1 ? "s" : ""} your review
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  These couldn't be automatically matched to fuel records.
                </p>
              </div>
            </div>
            <Button 
              size="lg"
              className="w-full"
              onClick={() => setLocation(`/investigate?periodId=${periodId}`)}
              data-testid="button-start-review"
            >
              Start Review
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Outside Date Range Info */}
      {outsideDateRange > 0 && (
        <Card className="bg-muted/30" data-testid="card-outside-date-range">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start gap-3">
              <Info className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-sm">
                  <span className="font-medium">{outsideDateRange} bank transaction{outsideDateRange !== 1 ? "s" : ""}</span>{" "}
                  need{outsideDateRange === 1 ? "s" : ""} fuel data
                  {summary.fuelDateRange && (
                    <span className="text-muted-foreground">
                      {" "}— your fuel data ends {formatDate(summary.fuelDateRange.max)}
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Upload fuel data for these dates to match these transactions.
                </p>
              </div>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={onRerunMatching}
                data-testid="button-add-fuel-data"
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Fuel Data
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* SECTION 3: DETAILS & EXPORT (Collapsed) */}
      <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
        <CollapsibleTrigger asChild>
          <Button 
            variant="ghost" 
            className="w-full justify-between h-auto py-3"
            data-testid="button-toggle-details"
          >
            <span className="flex items-center gap-2 text-muted-foreground">
              <FileText className="h-4 w-4" />
              View Details & Export Options
            </span>
            {detailsOpen ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="space-y-4 pt-2">
            {/* Period Coverage Timeline */}
            {period && (
              <PeriodCoverageTimeline
                periodName={period.name}
                data={{
                  periodStart: new Date(period.startDate),
                  periodEnd: new Date(period.endDate),
                  fuelDateRange: summary.fuelDateRange,
                  bankDateRange: summary.bankDateRange,
                  unmatchableCount: summary.unmatchableBankTransactions,
                }}
                onAddFuelData={onRerunMatching}
              />
            )}

            {/* Fuel Coverage Stats */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <Fuel className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-sm font-medium">Fuel Data Coverage</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-3">
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
                        ? Math.round((bankTotal / summary.cardFuelTransactions) * 100)
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
                      summary.discrepancy > 0 ? "text-red-600" : summary.discrepancy < 0 ? "text-amber-600" : "text-green-600"
                    )}>
                      {formatCurrency(Math.abs(summary.discrepancy))}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {summary.discrepancy > 0 ? "bank exceeds fuel" : summary.discrepancy < 0 ? "fuel exceeds bank" : "balanced"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Matching Rules Summary */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <Settings className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-sm font-medium">Matching Rules Used</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Current configuration
                  </p>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={onRerunMatching}
                    data-testid="button-adjust-rules"
                  >
                    <Settings className="h-4 w-4 mr-2" />
                    Adjust Rules
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Export Options */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <Download className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-sm font-medium">Export Options</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-2">
                  <Button 
                    variant="outline"
                    className="justify-start"
                    onClick={() => setLocation(`/report?periodId=${periodId}`)}
                    data-testid="button-export-full-report"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Export Full Report
                  </Button>
                  <Button 
                    variant="outline"
                    className="justify-start"
                    onClick={() => setLocation(`/report?periodId=${periodId}&type=accountant`)}
                    data-testid="button-export-accountant"
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    Export for Accountant
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
