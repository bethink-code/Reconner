import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  AlertTriangle, 
  Download,
  Settings,
  FileText,
  Plus,
  Flag,
  Clock
} from "lucide-react";
import { cn } from "@/lib/utils";

interface BankAccountRange {
  fileId: string;
  sourceName: string;
  bankName: string | null;
  min: string;
  max: string;
  txCount: number;
}

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
  bankAccountRanges?: BankAccountRange[];
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
  onAddFuelData?: () => void;
  onAddBankData?: () => void;
}

interface Period {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
}

export function ResultsDashboard({ periodId, onRerunMatching, onAddFuelData, onAddBankData }: ResultsDashboardProps) {
  const [, setLocation] = useLocation();

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

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-ZA", {
      day: "2-digit",
      month: "short",
    });
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat("en-ZA").format(num);
  };

  if (isLoading || !summary) {
    return (
      <div className="space-y-4 max-w-2xl mx-auto">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  // Calculate key metrics
  const bankTotal = summary.bankTransactions;
  const matchedBank = summary.matchedPairs;
  const resolvedBank = summary.resolvedBankTransactions || 0;
  const verifiedBank = matchedBank + resolvedBank;
  const unmatchableBank = summary.unmatchableBankTransactions || 0;
  const unmatchedBank = summary.unmatchedBankTransactions;
  const verifiedPercent = bankTotal > 0 ? Math.round((verifiedBank / bankTotal) * 100) : 0;

  // Resolution counts
  const linked = resolutionSummary?.linked || 0;
  const reviewed = resolutionSummary?.reviewed || 0;
  const dismissed = resolutionSummary?.dismissed || 0;
  const flagged = resolutionSummary?.flagged || 0;

  // Check for any gaps in coverage
  const hasAnyGap = checkForGaps(period, summary);

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* ═══════════════════════════════════════════════════════════════════
          MAIN RESULTS CARD
      ═══════════════════════════════════════════════════════════════════ */}
      <Card className="overflow-hidden" data-testid="card-reconciliation-outcome">
        <CardContent className="p-6 space-y-6">
          
          {/* ─────────────────────────────────────────────────────────────────
              HERO: Large Verified % + CTA
          ───────────────────────────────────────────────────────────────── */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-5xl font-bold tracking-tight" data-testid="text-verified-percent">
                  {verifiedPercent}%
                </span>
                <span className="text-lg text-muted-foreground font-medium uppercase tracking-wide">
                  Verified
                </span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {verifiedBank} of {bankTotal} bank transactions
              </p>
            </div>
            
            <div className="flex flex-col items-end gap-2">
              {(unmatchedBank > 0 || flagged > 0) && (
                <Badge 
                  variant="outline" 
                  className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800"
                  data-testid="badge-needs-review"
                >
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  {unmatchedBank + flagged} need review
                </Badge>
              )}
              
              {unmatchedBank > 0 ? (
                <Button 
                  className="bg-primary"
                  onClick={() => setLocation(`/investigate?periodId=${periodId}`)}
                  data-testid="button-investigate"
                >
                  <AlertTriangle className="h-4 w-4 mr-2" />
                  Investigate {unmatchedBank} Unmatched
                </Button>
              ) : flagged > 0 ? (
                <Button 
                  className="bg-primary"
                  onClick={() => setLocation(`/investigate?periodId=${periodId}&filter=flagged`)}
                  data-testid="button-review-flagged"
                >
                  <Flag className="h-4 w-4 mr-2" />
                  Review {flagged} Flagged
                </Button>
              ) : (
                <Button 
                  variant="outline"
                  onClick={() => window.open(`/api/periods/${periodId}/export`, '_blank')}
                  data-testid="button-export-hero"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export Report
                </Button>
              )}
            </div>
          </div>

          {/* Progress Bar */}
          <div className="h-3 bg-muted rounded-full overflow-hidden">
            <div 
              className="h-full bg-green-500 transition-all duration-500"
              style={{ width: `${verifiedPercent}%` }}
            />
          </div>

          {/* ─────────────────────────────────────────────────────────────────
              STATUS ROW: Inline badges
          ───────────────────────────────────────────────────────────────── */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <StatusBadge color="bg-green-500" count={matchedBank + linked} label="Matched" />
            {reviewed > 0 && <StatusBadge color="bg-blue-500" count={reviewed} label="Reviewed" />}
            {dismissed > 0 && <StatusBadge color="bg-slate-400" count={dismissed} label="Dismissed" />}
            {flagged > 0 && <StatusBadge color="bg-orange-500" count={flagged} label="Flagged" />}
          </div>

          {/* ─────────────────────────────────────────────────────────────────
              ALERT BANNER: Transactions outside date range
          ───────────────────────────────────────────────────────────────── */}
          {unmatchableBank > 0 && (
            <Alert className="bg-muted/50 border-muted-foreground/20">
              <Clock className="h-4 w-4" />
              <AlertDescription className="flex items-center justify-between w-full">
                <span>{unmatchableBank} transactions outside date range</span>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={onAddBankData}
                  data-testid="button-add-data-alert"
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add Data
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {/* ─────────────────────────────────────────────────────────────────
              DATA COVERAGE SECTION
          ───────────────────────────────────────────────────────────────── */}
          <div className="pt-2">
            {/* Section Header */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Data Coverage
              </h3>
              {hasAnyGap && (
                <Badge 
                  variant="outline" 
                  className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800"
                  data-testid="badge-gap-detected"
                >
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  Gap detected
                </Badge>
              )}
            </div>

            {/* Column Headers */}
            <div className="grid grid-cols-[80px_1fr_120px_80px_40px] gap-3 text-xs text-muted-foreground uppercase tracking-wider mb-2 px-1">
              <span>Source</span>
              <span></span>
              <span className="text-right">Dates</span>
              <span className="text-right">Count</span>
              <span></span>
            </div>

            {/* Coverage Rows */}
            {period && (
              <CoverageLedger 
                period={period}
                summary={summary}
                formatDate={formatDate}
                formatNumber={formatNumber}
                onAddFuelData={onAddFuelData}
                onAddBankData={onAddBankData}
              />
            )}
          </div>

          {/* ─────────────────────────────────────────────────────────────────
              FOOTER: Export Buttons
          ───────────────────────────────────────────────────────────────── */}
          <div className="flex flex-wrap gap-3 pt-4 border-t">
            <Button 
              variant="outline"
              onClick={() => window.open(`/api/periods/${periodId}/export`, '_blank')}
              data-testid="button-export-full"
            >
              <FileText className="h-4 w-4 mr-2" />
              Export Full Report
            </Button>
            <Button 
              variant="outline"
              onClick={() => setLocation(`/report?periodId=${periodId}&type=accountant`)}
              data-testid="button-export-accountant"
            >
              <Download className="h-4 w-4 mr-2" />
              Export for Accountant
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Matching Rules Card */}
      <Card data-testid="card-matching-rules">
        <CardContent className="py-3 px-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Settings className="h-4 w-4" />
              <span>Matching Rules</span>
            </div>
            <Button 
              variant="ghost" 
              size="sm"
              onClick={onRerunMatching}
              data-testid="button-adjust-rules"
            >
              <Settings className="h-4 w-4 mr-2" />
              Adjust
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Helper component for status badges
function StatusBadge({ color, count, label }: { color: string; count: number; label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className={cn("w-2.5 h-2.5 rounded-full", color)} />
      <span className="font-semibold tabular-nums">{count}</span>
      <span className="text-muted-foreground">{label}</span>
    </div>
  );
}

// Check if there are any gaps in coverage
function checkForGaps(period: Period | undefined, summary: PeriodSummary): boolean {
  if (!period) return false;
  
  const periodStart = new Date(period.startDate);
  const periodEnd = new Date(period.endDate);
  
  const checkGap = (minDate: string, maxDate: string) => {
    return new Date(minDate) > periodStart || new Date(maxDate) < periodEnd;
  };
  
  if (summary.fuelDateRange && checkGap(summary.fuelDateRange.min, summary.fuelDateRange.max)) {
    return true;
  }
  
  if (summary.bankAccountRanges) {
    for (const account of summary.bankAccountRanges) {
      if (checkGap(account.min, account.max)) {
        return true;
      }
    }
  }
  
  if (summary.bankDateRange && checkGap(summary.bankDateRange.min, summary.bankDateRange.max)) {
    return true;
  }
  
  return false;
}

interface CoverageLedgerProps {
  period: Period;
  summary: PeriodSummary;
  formatDate: (d: string) => string;
  formatNumber: (n: number) => string;
  onAddFuelData?: () => void;
  onAddBankData?: () => void;
}

function CoverageLedger({ period, summary, formatDate, formatNumber, onAddFuelData, onAddBankData }: CoverageLedgerProps) {
  const periodStart = new Date(period.startDate);
  const periodEnd = new Date(period.endDate);
  const totalDays = Math.ceil((periodEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24));
  
  const getPositionPercent = (dateStr: string) => {
    const date = new Date(dateStr);
    const dayOffset = (date.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24);
    return Math.max(0, Math.min(100, (dayOffset / totalDays) * 100));
  };

  const checkGap = (minDate: string, maxDate: string) => {
    return new Date(minDate) > periodStart || new Date(maxDate) < periodEnd;
  };

  // Build rows for ledger
  interface LedgerRow {
    label: string;
    min: string;
    max: string;
    count?: number;
    hasGap: boolean;
    color: string;
    type: 'period' | 'fuel' | 'bank';
    onAdd?: () => void;
  }

  const rows: LedgerRow[] = [];
  
  // Period reference row
  rows.push({
    label: 'Period',
    min: period.startDate,
    max: period.endDate,
    hasGap: false,
    color: 'bg-slate-400 dark:bg-slate-500',
    type: 'period'
  });

  // Fuel row
  if (summary.fuelDateRange) {
    const fuelHasGap = checkGap(summary.fuelDateRange.min, summary.fuelDateRange.max);
    rows.push({
      label: 'Fuel',
      min: summary.fuelDateRange.min,
      max: summary.fuelDateRange.max,
      count: summary.cardFuelTransactions,
      hasGap: fuelHasGap,
      color: 'bg-orange-500',
      type: 'fuel',
      onAdd: fuelHasGap ? onAddFuelData : undefined
    });
  }

  // Bank account rows
  const bankAccounts = summary.bankAccountRanges || [];
  const bankColors = ['bg-blue-500', 'bg-purple-500', 'bg-teal-500', 'bg-indigo-500', 'bg-cyan-500'];
  
  bankAccounts.forEach((account, index) => {
    const accountHasGap = checkGap(account.min, account.max);
    rows.push({
      label: account.bankName || account.sourceName || `Bank ${index + 1}`,
      min: account.min,
      max: account.max,
      count: account.txCount,
      hasGap: accountHasGap,
      color: bankColors[index % bankColors.length],
      type: 'bank',
      onAdd: accountHasGap ? onAddBankData : undefined
    });
  });

  // Fallback for aggregate bank data
  if (bankAccounts.length === 0 && summary.bankDateRange) {
    const bankHasGap = checkGap(summary.bankDateRange.min, summary.bankDateRange.max);
    rows.push({
      label: 'Bank',
      min: summary.bankDateRange.min,
      max: summary.bankDateRange.max,
      count: summary.bankTransactions,
      hasGap: bankHasGap,
      color: 'bg-blue-500',
      type: 'bank',
      onAdd: bankHasGap ? onAddBankData : undefined
    });
  }

  return (
    <div className="space-y-1" data-testid="coverage-ledger">
      {rows.map((row, idx) => {
        const leftPct = getPositionPercent(row.min);
        const rightPct = getPositionPercent(row.max);
        const widthPct = rightPct - leftPct;
        const isPeriod = row.type === 'period';
        
        // Calculate gap regions for striped pattern
        const hasLeftGap = leftPct > 0;
        const hasRightGap = rightPct < 100;
        
        return (
          <div 
            key={idx} 
            className="grid grid-cols-[80px_1fr_120px_80px_40px] gap-3 items-center py-2"
            data-testid={`coverage-row-${row.type}-${idx}`}
          >
            {/* Source: Color dot + label */}
            <div className="flex items-center gap-2">
              <span className={cn("w-2.5 h-2.5 rounded-full shrink-0", row.color)} />
              <span className={cn(
                "text-sm truncate",
                isPeriod ? "text-muted-foreground" : "font-medium"
              )}>
                {row.label}
              </span>
            </div>
            
            {/* Bar visualization */}
            <div className="relative h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              {/* Striped gap on left */}
              {row.hasGap && hasLeftGap && (
                <div 
                  className="absolute h-full"
                  style={{ 
                    left: 0, 
                    width: `${leftPct}%`,
                    background: `repeating-linear-gradient(
                      -45deg,
                      transparent,
                      transparent 2px,
                      rgba(251, 146, 60, 0.3) 2px,
                      rgba(251, 146, 60, 0.3) 4px
                    )`
                  }}
                />
              )}
              
              {/* Solid coverage bar */}
              <div 
                className={cn("absolute h-full rounded-full", row.color)}
                style={{ 
                  left: `${leftPct}%`, 
                  width: `${Math.max(widthPct, 1)}%` 
                }}
              />
              
              {/* Striped gap on right */}
              {row.hasGap && hasRightGap && (
                <div 
                  className="absolute h-full"
                  style={{ 
                    left: `${rightPct}%`, 
                    width: `${100 - rightPct}%`,
                    background: `repeating-linear-gradient(
                      -45deg,
                      transparent,
                      transparent 2px,
                      rgba(251, 146, 60, 0.3) 2px,
                      rgba(251, 146, 60, 0.3) 4px
                    )`
                  }}
                />
              )}
            </div>
            
            {/* Dates column */}
            <div className="text-sm text-muted-foreground text-right whitespace-nowrap">
              {formatDate(row.min)} — {formatDate(row.max)}
            </div>
            
            {/* Count column */}
            <div className="text-sm font-semibold text-right tabular-nums">
              {row.count !== undefined ? formatNumber(row.count) : '—'}
            </div>
            
            {/* Action column: Add Data button for gaps */}
            <div className="flex justify-end">
              {row.hasGap && row.onAdd && (
                <button
                  onClick={row.onAdd}
                  className="h-6 w-6 flex items-center justify-center rounded bg-amber-100 dark:bg-amber-900/50 border border-amber-300 dark:border-amber-700 hover-elevate"
                  data-testid={`button-add-${row.type}-data`}
                  title="Add data to fill gap"
                >
                  <Plus className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
