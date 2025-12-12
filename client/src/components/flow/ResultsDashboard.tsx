import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { 
  Check, 
  AlertTriangle, 
  Download,
  Settings,
  FileText,
  ArrowRight,
  Plus,
  Flag,
  XCircle,
  CheckCircle2,
  Clock,
  TrendingUp,
  TrendingDown,
  Minus,
  Search
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

type StatusState = 'success' | 'attention' | 'critical';

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
      <div className="space-y-4 max-w-2xl mx-auto">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-20 w-full" />
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
  const writtenOff = resolutionSummary?.writtenOff || 0;

  // Determine overall state
  const allDone = unmatchedBank === 0 && flagged === 0;
  const reviewComplete = unmatchedBank === 0 && flagged > 0;
  const hasGaps = unmatchableBank > 0;
  
  // Determine status state for styling
  // Priority: critical (unmatched) > attention (flagged/gaps) > success
  const getStatusState = (): StatusState => {
    if (unmatchedBank > 0) return 'critical'; // Unmatched always takes priority
    if (flagged > 0 || hasGaps) return 'attention'; // Flagged or gaps need attention
    return 'success'; // All done
  };
  
  const statusState = getStatusState();

  // Status styling
  const statusStyles = {
    success: {
      badge: 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300',
      border: 'border-green-200 dark:border-green-800',
      bg: 'bg-green-50/50 dark:bg-green-950/20',
      progress: 'bg-green-500',
      icon: Check,
      label: 'All Good'
    },
    attention: {
      badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300',
      border: 'border-amber-200 dark:border-amber-800',
      bg: 'bg-amber-50/50 dark:bg-amber-950/20',
      progress: 'bg-amber-500',
      icon: AlertTriangle,
      label: 'Needs Attention'
    },
    critical: {
      badge: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300',
      border: 'border-red-200 dark:border-red-800',
      bg: 'bg-red-50/50 dark:bg-red-950/20',
      progress: 'bg-red-500',
      icon: XCircle,
      label: 'Action Required'
    }
  };

  const styles = statusStyles[statusState];
  const StatusIcon = styles.icon;

  // Discrepancy styling
  const getDiscrepancyStyle = () => {
    const absDisc = Math.abs(summary.discrepancy);
    if (absDisc < 100) return { color: 'text-green-600 dark:text-green-400', icon: Minus, label: 'Balanced' };
    if (summary.discrepancy > 0) return { color: 'text-red-600 dark:text-red-400', icon: TrendingUp, label: 'Bank exceeds fuel' };
    return { color: 'text-amber-600 dark:text-amber-400', icon: TrendingDown, label: 'Fuel exceeds bank' };
  };
  const discStyle = getDiscrepancyStyle();
  const DiscIcon = discStyle.icon;

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      {/* ═══════════════════════════════════════════════════════════════════
          UNIFIED RECONCILIATION OUTCOME CARD
          Three bands: Hero → Resolution Row → Coverage Strip
      ═══════════════════════════════════════════════════════════════════ */}
      <Card className={cn("overflow-hidden", styles.border)} data-testid="card-reconciliation-outcome">
        {/* ─────────────────────────────────────────────────────────────────
            BAND 1: HERO STATUS BAR
        ───────────────────────────────────────────────────────────────── */}
        <div className={cn("p-6", styles.bg)}>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            {/* Left: Verification % and Status */}
            <div className="flex items-center gap-4">
              <div className="text-center">
                <p className="text-5xl font-bold text-primary" data-testid="text-verified-percent">
                  {verifiedPercent}%
                </p>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mt-1">
                  Verified
                </p>
              </div>
              
              {/* Progress ring visual or badge */}
              <div className="flex flex-col gap-2">
                <Badge className={cn("gap-1", styles.badge)} data-testid="badge-status">
                  <StatusIcon className="h-3 w-3" />
                  {styles.label}
                </Badge>
                <p className="text-sm text-muted-foreground">
                  {verifiedBank} of {bankTotal} bank transactions
                </p>
              </div>
            </div>

            {/* Right: Primary CTA */}
            <div className="flex flex-col gap-2">
              {unmatchedBank > 0 ? (
                <Button 
                  size="lg"
                  onClick={() => setLocation(`/investigate?periodId=${periodId}`)}
                  data-testid="button-investigate"
                >
                  <Search className="h-4 w-4 mr-2" />
                  Investigate {unmatchedBank} Unmatched
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              ) : flagged > 0 ? (
                <Button 
                  size="lg"
                  onClick={() => setLocation(`/investigate?periodId=${periodId}&filter=flagged`)}
                  data-testid="button-view-flagged"
                >
                  <Flag className="h-4 w-4 mr-2" />
                  Review {flagged} Flagged
                </Button>
              ) : (
                <Button 
                  size="lg"
                  variant="outline"
                  onClick={() => window.open(`/api/periods/${periodId}/export`, '_blank')}
                  data-testid="button-export-report"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export Report
                </Button>
              )}
            </div>
          </div>

          {/* Progress Bar */}
          <div className="mt-4">
            <div className="h-3 bg-muted rounded-full overflow-hidden">
              <div 
                className={cn("h-full transition-all duration-500", styles.progress)}
                style={{ width: `${verifiedPercent}%` }}
              />
            </div>
          </div>
        </div>

        {/* ─────────────────────────────────────────────────────────────────
            BAND 2: RESOLUTION SUMMARY ROW
        ───────────────────────────────────────────────────────────────── */}
        <div className="border-t border-b px-6 py-4 bg-background">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            {/* Matched */}
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span className="font-medium">{matchedBank}</span>
                  <span className="text-muted-foreground">Matched</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>Auto-matched to fuel records</TooltipContent>
            </Tooltip>

            {/* Linked (manually) */}
            {linked > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-2 text-sm">
                    <Check className="h-4 w-4 text-green-500" />
                    <span className="font-medium">{linked}</span>
                    <span className="text-muted-foreground">Linked</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>Manually linked to fuel records</TooltipContent>
              </Tooltip>
            )}

            {/* Reviewed */}
            {reviewed > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-2 text-sm">
                    <Check className="h-4 w-4 text-blue-500" />
                    <span className="font-medium">{reviewed}</span>
                    <span className="text-muted-foreground">Reviewed</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>Marked as reviewed — no issue found</TooltipContent>
              </Tooltip>
            )}

            {/* Dismissed */}
            {dismissed > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-2 text-sm">
                    <XCircle className="h-4 w-4 text-slate-400" />
                    <span className="font-medium">{dismissed}</span>
                    <span className="text-muted-foreground">Dismissed</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>Low value transactions dismissed</TooltipContent>
              </Tooltip>
            )}

            {/* Flagged */}
            {flagged > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button 
                    className="flex items-center gap-2 text-sm hover-elevate rounded px-2 py-1 -mx-2"
                    onClick={() => setLocation(`/investigate?periodId=${periodId}&filter=flagged`)}
                    data-testid="link-flagged"
                  >
                    <Flag className="h-4 w-4 text-orange-500" />
                    <span className="font-medium text-orange-600 dark:text-orange-400">{flagged}</span>
                    <span className="text-orange-600 dark:text-orange-400">Flagged</span>
                    <ArrowRight className="h-3 w-3 text-orange-500" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Needs manager/accountant review — click to view</TooltipContent>
              </Tooltip>
            )}

            {/* Outside Range */}
            {unmatchableBank > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-2 text-sm">
                    <Clock className="h-4 w-4 text-slate-400" />
                    <span className="font-medium">{unmatchableBank}</span>
                    <span className="text-muted-foreground">Outside range</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>Bank transactions outside fuel data date range</TooltipContent>
              </Tooltip>
            )}

            {/* Unmatched */}
            {unmatchedBank > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button 
                    className="flex items-center gap-2 text-sm hover-elevate rounded px-2 py-1 -mx-2"
                    onClick={() => setLocation(`/investigate?periodId=${periodId}`)}
                    data-testid="link-unmatched"
                  >
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    <span className="font-medium text-amber-600 dark:text-amber-400">{unmatchedBank}</span>
                    <span className="text-amber-600 dark:text-amber-400">Need review</span>
                    <ArrowRight className="h-3 w-3 text-amber-500" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Could not be auto-matched — click to investigate</TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>

        {/* ─────────────────────────────────────────────────────────────────
            BAND 3: COVERAGE LEDGER (Always Visible)
        ───────────────────────────────────────────────────────────────── */}
        <div className="px-6 pb-4 border-t">
          {period && (
            <CoverageLedger 
              period={period}
              summary={summary}
              formatDate={formatDate}
              formatCurrency={formatCurrency}
              onAddFuelData={onAddFuelData}
              onAddBankData={onAddBankData}
            />
          )}
        </div>
      </Card>

      {/* ═══════════════════════════════════════════════════════════════════
          FOOTER CARDS (Always Visible)
      ═══════════════════════════════════════════════════════════════════ */}
      
      {/* Matching Rules Used */}
      <Card data-testid="card-matching-rules">
        <CardHeader className="py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Settings className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-sm font-medium">Matching Rules Used</CardTitle>
            </div>
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
        </CardHeader>
      </Card>

      {/* Export Options */}
      <Card data-testid="card-export-options">
        <CardHeader className="py-3">
          <div className="flex items-center gap-2">
            <Download className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium">Export Options</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="pt-0 pb-4">
          <div className="flex flex-wrap gap-2">
            <Button 
              variant="outline"
              size="sm"
              onClick={() => window.open(`/api/periods/${periodId}/export`, '_blank')}
              data-testid="button-export-full"
            >
              <Download className="h-4 w-4 mr-2" />
              Full Report
            </Button>
            <Button 
              variant="outline"
              size="sm"
              onClick={() => setLocation(`/report?periodId=${periodId}&type=accountant`)}
              data-testid="button-export-accountant"
            >
              <FileText className="h-4 w-4 mr-2" />
              Export for Accountant
            </Button>
            {flagged > 0 && (
              <Button 
                variant="outline"
                size="sm"
                onClick={() => window.open(`/api/periods/${periodId}/export-flagged`, '_blank')}
                data-testid="button-export-flagged"
              >
                <Flag className="h-4 w-4 mr-2" />
                Export Flagged Items
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

interface CoverageLedgerProps {
  period: Period;
  summary: PeriodSummary;
  formatDate: (d: string) => string;
  formatCurrency: (n: number) => string;
  onAddFuelData?: () => void;
  onAddBankData?: () => void;
}

function CoverageLedger({ period, summary, formatDate, formatCurrency, onAddFuelData, onAddBankData }: CoverageLedgerProps) {
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
    amount?: number;
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
      amount: summary.totalFuelAmount,
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
      amount: summary.totalBankAmount,
      hasGap: bankHasGap,
      color: 'bg-blue-500',
      type: 'bank',
      onAdd: bankHasGap ? onAddBankData : undefined
    });
  }

  return (
    <div className="pt-4 space-y-1" data-testid="coverage-ledger">
      {rows.map((row, idx) => {
        const leftPct = getPositionPercent(row.min);
        const widthPct = getPositionPercent(row.max) - leftPct;
        const isPeriod = row.type === 'period';
        
        return (
          <div 
            key={idx} 
            className={cn(
              "grid grid-cols-[72px_1fr_auto] gap-3 items-center py-1",
              isPeriod && "pb-2 mb-1 border-b border-dashed"
            )}
          >
            {/* Label with color dot */}
            <div className="flex items-center gap-2">
              <span className={cn("w-2 h-2 rounded-full shrink-0", row.color)} />
              <span className={cn(
                "text-sm truncate",
                isPeriod ? "font-medium" : "text-muted-foreground"
              )}>
                {row.label}
              </span>
            </div>
            
            {/* Bar track with positioned segment */}
            <div className="relative h-5 flex items-center">
              {/* Track background */}
              <div className="absolute inset-x-0 h-1.5 bg-muted rounded-full" />
              
              {/* Segment */}
              <div 
                className={cn(
                  "absolute h-1.5 rounded-full",
                  row.hasGap ? "bg-amber-400" : row.color
                )}
                style={{ 
                  left: `${leftPct}%`, 
                  width: `${Math.max(widthPct, 1)}%` 
                }}
              />
              
              {/* Add button at gap edge */}
              {row.hasGap && row.onAdd && (
                <button
                  onClick={row.onAdd}
                  className="absolute h-5 w-5 flex items-center justify-center rounded bg-amber-100 dark:bg-amber-900/50 border border-amber-300 dark:border-amber-700 hover-elevate"
                  style={{ left: `calc(${leftPct + widthPct}% + 4px)` }}
                  data-testid={`button-add-${row.type}-data`}
                >
                  <Plus className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                </button>
              )}
            </div>
            
            {/* Right column: dates + count */}
            <div className="flex items-center gap-3 text-xs text-muted-foreground whitespace-nowrap">
              <span>{formatDate(row.min)} — {formatDate(row.max)}</span>
              {row.count !== undefined && (
                <span className="tabular-nums font-medium text-foreground">
                  {row.count.toLocaleString()}
                </span>
              )}
              {row.amount !== undefined && (
                <span className="text-muted-foreground">
                  ({formatCurrency(row.amount)})
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
