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
  inRangeCount?: number;
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

interface VerificationSummary {
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
    };
  };
  verificationStatus: {
    verified: { transactions: number; amount: number; percentage: number };
    pendingVerification: { transactions: number; amount: number };
    unverified: { transactions: number; amount: number; percentage: number };
    cashSales: { transactions: number; amount: number };
  };
  discrepancyReport: {
    unmatchedIssues: { count: number; amount: number };
  };
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

  const { data: verification } = useQuery<VerificationSummary>({
    queryKey: ["/api/periods", periodId, "verification-summary"],
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
    return num.toLocaleString("en-US");
  };

  const formatRand = (amount: number) => {
    if (Math.abs(amount) >= 1000) {
      return "R " + amount.toLocaleString("en-US", { maximumFractionDigits: 0 });
    }
    return "R " + amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
  const excludedBank = summary.excludedBankTransactions || 0;
  const unmatchedBank = summary.unmatchedBankTransactions;
  // Only count in-range, non-excluded bank transactions for the verified %
  const matchableBankTotal = bankTotal - unmatchableBank - excludedBank;
  const verifiedPercent = matchableBankTotal > 0 ? Math.round((verifiedBank / matchableBankTotal) * 100) : 0;

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
              HERO: Financial summary — leads with money
          ───────────────────────────────────────────────────────────────── */}
          {verification ? (() => {
            const totalSales = verification.overview.fuelSystem.totalSales;
            const verifiedAmount = verification.verificationStatus.verified.amount;
            const notOnBank = totalSales - verifiedAmount;
            const verifiedPct = totalSales > 0 ? Math.round((verifiedAmount / totalSales) * 100) : 0;
            const unmatchedBankAmount = verification.discrepancyReport.unmatchedIssues.amount;
            // Use count-based % for "bank records verified" (consistent with matching complete screen)
            const bankMatchPct = verifiedPercent;
            const unmatchedBankPct = 100 - bankMatchPct;

            return (
              <>
                {/* Lens 1: The Period — total fuel sales */}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                    Period Fuel Sales
                  </p>
                  <span className="text-3xl font-bold tracking-tight">
                    {formatRand(totalSales)}
                  </span>
                </div>

                {/* Lens 2: Bank Verified */}
                <div className="rounded-lg bg-card p-4">
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-2xl font-bold">
                      {bankMatchPct}%
                    </span>
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      of Bank Records Verified
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold tracking-tight text-[#166534] dark:text-emerald-400">
                      {formatRand(verifiedAmount)}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      of {formatRand(totalSales)} total sales
                    </span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden mt-3">
                    <div
                      className="h-full bg-[#166534] transition-all duration-500 rounded-full"
                      style={{ width: `${bankMatchPct}%` }}
                    />
                  </div>
                  {unmatchedBankAmount > 0 && (
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-[#166534]/20 dark:border-emerald-900">
                      <p className="text-sm text-muted-foreground">
                        {formatRand(unmatchedBankAmount)} ({unmatchedBankPct}% of bank records) didn't match fuel data
                      </p>
                      <Button
                        size="sm"
                        onClick={() => setLocation(`/investigate?periodId=${periodId}`)}
                        data-testid="button-investigate"
                      >
                        Investigate
                      </Button>
                    </div>
                  )}
                </div>

                {/* Lens 3: Not on Bank */}
                <div className="rounded-lg border bg-muted/30 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                    Not on Bank Records
                  </p>
                  <span className="text-3xl font-bold tracking-tight">
                    {formatRand(notOnBank)}
                  </span>
                  <p className="text-sm text-muted-foreground mt-2">
                    {100 - verifiedPct}% of period fuel sales not covered in this reconciliation (likely cash payments, missing bank statements, or other unreconciled methods)
                  </p>
                </div>
              </>
            );
          })() : (
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-5xl font-bold tracking-tight">
                  {verifiedPercent}%
                </span>
                <span className="text-lg text-muted-foreground font-medium uppercase tracking-wide">
                  Verified
                </span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {verifiedBank} of {matchableBankTotal} bank transactions matched
              </p>
            </div>
          )}

          {/* ─────────────────────────────────────────────────────────────────
              DATA COVERAGE SECTION
          ───────────────────────────────────────────────────────────────── */}
          <div className="pt-2">
            {/* Section Header */}
            <div className="mb-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Data Coverage
              </h3>
            </div>

            {/* Column Headers */}
            <div className="grid text-[10px] text-muted-foreground uppercase tracking-wider mb-2" style={{ gridTemplateColumns: "90px 1fr 110px 48px" }}>
              <span>Source</span>
              <span></span>
              <span className="text-right">Dates</span>
              <span className="text-right">Count</span>
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
              <Download className="h-4 w-4 mr-2" />
              Download Report (Excel)
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
function RevenueRow({ color, label, amount, total, formatRand }: {
  color: string; label: string; amount: number; total: number; formatRand: (n: number) => string;
}) {
  const pct = total > 0 ? (amount / total) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <span className={cn("w-2.5 h-2.5 rounded-full shrink-0", color)} />
      <span className="text-sm flex-1">{label}</span>
      <span className="text-sm font-semibold tabular-nums">{formatRand(amount)}</span>
      <span className="text-xs text-muted-foreground w-10 text-right tabular-nums">{pct.toFixed(0)}%</span>
    </div>
  );
}

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

  // Calculate the full date range across ALL data sources (not just the period)
  // so the timeline shows where each source sits relative to the period
  const allDates: Date[] = [periodStart, periodEnd];
  if (summary.fuelDateRange) {
    allDates.push(new Date(summary.fuelDateRange.min), new Date(summary.fuelDateRange.max));
  }
  if (summary.bankDateRange) {
    allDates.push(new Date(summary.bankDateRange.min), new Date(summary.bankDateRange.max));
  }
  (summary.bankAccountRanges || []).forEach(a => {
    allDates.push(new Date(a.min), new Date(a.max));
  });
  const timelineStart = new Date(Math.min(...allDates.map(d => d.getTime())));
  const timelineEnd = new Date(Math.max(...allDates.map(d => d.getTime())));
  // Add 1 day so end dates represent end-of-day (e.g. "28 Feb" means through end of 28 Feb)
  const totalMs = timelineEnd.getTime() + 86400000 - timelineStart.getTime();
  const totalDays = Math.max(1, totalMs / (1000 * 60 * 60 * 24));

  const getPositionPercent = (dateStr: string, isEnd = false) => {
    const date = new Date(dateStr);
    // End dates should go to end-of-day
    const ms = date.getTime() + (isEnd ? 86400000 : 0) - timelineStart.getTime();
    return Math.max(0, Math.min(100, (ms / (totalDays * 86400000)) * 100));
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
    color: 'bg-slate-300 dark:bg-slate-600',
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
      color: 'bg-[#C05A2A]',
      type: 'fuel',
      onAdd: fuelHasGap ? onAddFuelData : undefined
    });
  }

  // Bank account rows
  const bankAccounts = summary.bankAccountRanges || [];
  const bankColors = ['bg-[#007C7F]', 'bg-[#C0334E]', 'bg-[#2E8A5A]', 'bg-[#1A4B9C]', 'bg-[#7B4FA0]', 'bg-[#C47A1E]', 'bg-[#1E6B8C]', 'bg-[#8C3A3A]', 'bg-[#2E7A6B]', 'bg-[#A05030]', 'bg-[#4A6FA0]', 'bg-[#7A3A6B]', 'bg-[#5A7A2E]', 'bg-[#A04A1E]', 'bg-[#2E4A8C]'];
  
  bankAccounts.forEach((account, index) => {
    const accountHasGap = checkGap(account.min, account.max);
    rows.push({
      label: account.bankName || account.sourceName || `Bank ${index + 1}`,
      min: account.min,
      max: account.max,
      count: account.inRangeCount ?? account.txCount,
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
      color: 'bg-[#007C7F]',
      type: 'bank',
      onAdd: bankHasGap ? onAddBankData : undefined
    });
  }


  return (
    <div data-testid="coverage-ledger">
      <div className="space-y-0">
        {rows.map((row, idx) => {
          const leftPct = getPositionPercent(row.min);
          const rightPct = getPositionPercent(row.max, true);
          const widthPct = rightPct - leftPct;
          const isPeriod = row.type === 'period';

          // Period reference fill position
          const pL = getPositionPercent(period.startDate);
          const pR = getPositionPercent(period.endDate, true);

          // Dot color: Tailwind bg class → inline style hex
          const dotHex = isPeriod ? '#C4C2B8' : row.color.match(/#[0-9A-Fa-f]+/)?.[0] || '#1A1200';

          return (
            <div
              key={idx}
              className={cn(
                "grid items-center py-2",
                idx < rows.length - 1 && "border-b border-[#E5E3DC]"
              )}
              style={{ gridTemplateColumns: "90px 1fr 110px 48px" }}
              data-testid={`coverage-row-${row.type}-${idx}`}
            >
              {/* Source dot + label */}
              <div className="flex items-center gap-2 min-w-0">
                <div
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: dotHex }}
                />
                <span className="text-xs text-muted-foreground truncate">
                  {row.label}
                </span>
              </div>

              {/* Gantt track */}
              <div className="relative h-5 mx-2">
                {/* Period extent reference fill */}
                <div
                  className="absolute rounded bg-[#ECEAE2] dark:bg-[#2A2218]"
                  style={{ left: `${pL}%`, width: `${pR - pL}%`, top: 0, bottom: 0 }}
                />
                {/* Source bar — 6px pill */}
                {!isPeriod && (
                  <div
                    className={cn("absolute rounded-full", row.color)}
                    style={{
                      left: `${leftPct}%`,
                      width: `${Math.max(widthPct, 1.5)}%`,
                      height: "6px",
                      top: "7px",
                    }}
                  />
                )}
              </div>

              {/* Date range */}
              <div className="text-[11px] text-muted-foreground text-right whitespace-nowrap">
                {formatDate(row.min)} — {formatDate(row.max)}
              </div>

              {/* Count */}
              <div className="text-[11px] text-muted-foreground text-right tabular-nums">
                {row.count !== undefined ? formatNumber(row.count) : '—'}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
