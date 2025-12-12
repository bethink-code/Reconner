import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { 
  Check, 
  AlertTriangle, 
  Search,
  Download,
  Settings,
  FileText,
  Fuel,
  ArrowRight,
  Plus,
  ChevronDown,
  ChevronRight,
  Calendar,
  Flag,
  XCircle,
  CheckCircle2,
  Clock,
  TrendingUp,
  TrendingDown,
  Minus
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
}

interface Period {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
}

type StatusState = 'success' | 'attention' | 'critical';

export function ResultsDashboard({ periodId, onRerunMatching }: ResultsDashboardProps) {
  const [, setLocation] = useLocation();
  const [coverageExpanded, setCoverageExpanded] = useState(false);

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
            BAND 3: COVERAGE & INSIGHTS STRIP
        ───────────────────────────────────────────────────────────────── */}
        <Collapsible open={coverageExpanded} onOpenChange={setCoverageExpanded}>
          <CollapsibleTrigger asChild>
            <button 
              className="w-full px-6 py-3 flex items-center justify-between hover-elevate text-left"
              data-testid="button-toggle-coverage"
            >
              <div className="flex items-center gap-6 flex-wrap">
                {/* Key Stats Preview */}
                <div className="flex items-center gap-2 text-sm">
                  <Fuel className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Fuel:</span>
                  <span className="font-medium">{summary.cardFuelTransactions.toLocaleString()} sales</span>
                  <span className="text-muted-foreground">·</span>
                  <span className="font-medium">{formatCurrency(summary.totalFuelAmount)}</span>
                </div>

                {/* Discrepancy Pill */}
                <div className={cn("flex items-center gap-1.5 text-sm", discStyle.color)}>
                  <DiscIcon className="h-4 w-4" />
                  <span className="font-medium">{formatCurrency(Math.abs(summary.discrepancy))}</span>
                  <span className="text-xs">{discStyle.label}</span>
                </div>

                {/* Gap Alert */}
                {hasGaps && (
                  <Badge variant="outline" className="text-amber-600 border-amber-300 dark:border-amber-700">
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    Gaps detected
                  </Badge>
                )}
              </div>

              <div className="flex items-center gap-2 text-muted-foreground">
                <span className="text-xs">Details</span>
                {coverageExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </div>
            </button>
          </CollapsibleTrigger>

          <CollapsibleContent>
            <div className="px-6 pb-6 space-y-4">
              {/* Date Coverage Timeline - Stacked Visualization */}
              {period && (
                <CoverageTimeline 
                  period={period}
                  summary={summary}
                  unmatchableBank={unmatchableBank}
                  hasGaps={hasGaps}
                  onAddData={onRerunMatching}
                  formatDate={formatDate}
                />
              )}

              {/* Stats Grid */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 bg-muted/30 rounded-lg text-center">
                  <p className="text-xs text-muted-foreground">Card Sales</p>
                  <p className="text-xl font-mono font-bold">
                    {summary.cardFuelTransactions.toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatCurrency(summary.totalFuelAmount)}
                  </p>
                </div>
                <div className="p-3 bg-muted/30 rounded-lg text-center">
                  <p className="text-xs text-muted-foreground">Bank Coverage</p>
                  <p className="text-xl font-mono font-bold">
                    {summary.cardFuelTransactions > 0 
                      ? Math.round((bankTotal / summary.cardFuelTransactions) * 100)
                      : 0}%
                  </p>
                  <p className="text-xs text-muted-foreground">
                    of sales verified
                  </p>
                </div>
                <div className="p-3 bg-muted/30 rounded-lg text-center">
                  <p className="text-xs text-muted-foreground">Discrepancy</p>
                  <p className={cn("text-xl font-mono font-bold", discStyle.color)}>
                    {formatCurrency(Math.abs(summary.discrepancy))}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {discStyle.label.toLowerCase()}
                  </p>
                </div>
              </div>

              {/* Gap Alert with Action */}
              {hasGaps && summary.fuelDateRange && (
                <div className="flex items-center justify-between p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    <div>
                      <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                        {unmatchableBank} transactions need fuel data
                      </p>
                      <p className="text-xs text-amber-700 dark:text-amber-300">
                        Your fuel data ends {formatDate(summary.fuelDateRange.max)}
                      </p>
                    </div>
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={onRerunMatching}
                    className="shrink-0"
                    data-testid="button-add-missing-data"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add Missing Data
                  </Button>
                </div>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
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

const BANK_COLORS = [
  { bar: "bg-blue-500", track: "bg-blue-100 dark:bg-blue-950" },
  { bar: "bg-purple-500", track: "bg-purple-100 dark:bg-purple-950" },
  { bar: "bg-teal-500", track: "bg-teal-100 dark:bg-teal-950" },
  { bar: "bg-indigo-500", track: "bg-indigo-100 dark:bg-indigo-950" },
  { bar: "bg-cyan-500", track: "bg-cyan-100 dark:bg-cyan-950" },
];

interface CoverageTimelineProps {
  period: Period;
  summary: PeriodSummary;
  unmatchableBank: number;
  hasGaps: boolean;
  onAddData: () => void;
  formatDate: (d: string) => string;
}

function CoverageTimeline({ period, summary, unmatchableBank, hasGaps, onAddData, formatDate }: CoverageTimelineProps) {
  const periodStart = new Date(period.startDate);
  const periodEnd = new Date(period.endDate);
  
  const totalDays = Math.ceil((periodEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24));
  
  const getPositionPercent = (dateStr: string) => {
    const date = new Date(dateStr);
    const dayOffset = (date.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24);
    return Math.max(0, Math.min(100, (dayOffset / totalDays) * 100));
  };
  
  const fuelStart = summary.fuelDateRange?.min ? getPositionPercent(summary.fuelDateRange.min) : 0;
  const fuelEnd = summary.fuelDateRange?.max ? getPositionPercent(summary.fuelDateRange.max) : 0;
  const fuelHasGap = summary.fuelDateRange && (
    new Date(summary.fuelDateRange.min) > periodStart || 
    new Date(summary.fuelDateRange.max) < periodEnd
  );
  
  const bankAccounts = summary.bankAccountRanges || [];
  
  return (
    <div className="p-4 bg-muted/30 rounded-lg space-y-1" data-testid="coverage-timeline">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Calendar className="h-4 w-4" />
          Period Coverage — {period.name}
        </div>
        {hasGaps ? (
          <Badge variant="outline" className="text-amber-600 border-amber-300">
            <AlertTriangle className="h-3 w-3 mr-1" />
            Gaps detected
          </Badge>
        ) : (
          <Badge variant="outline" className="text-green-600 border-green-300">
            <Check className="h-3 w-3 mr-1" />
            Full coverage
          </Badge>
        )}
      </div>
      
      {/* Reporting Period Reference Row */}
      <TimelineRow
        label="Reporting Period"
        dateRange={`${formatDate(period.startDate)} — ${formatDate(period.endDate)}`}
        barColor="bg-slate-300 dark:bg-slate-600"
        trackColor="bg-slate-100 dark:bg-slate-800"
        startPercent={0}
        widthPercent={100}
        isReference
      />
      
      {/* Fuel System Row */}
      {summary.fuelDateRange ? (
        <TimelineRow
          label="Fuel System"
          dateRange={`${formatDate(summary.fuelDateRange.min)} — ${formatDate(summary.fuelDateRange.max)}`}
          barColor={fuelHasGap ? "bg-amber-500" : "bg-orange-500"}
          trackColor="bg-orange-100 dark:bg-orange-950"
          startPercent={fuelStart}
          widthPercent={fuelEnd - fuelStart}
          hasGap={!!fuelHasGap}
          onAddData={onAddData}
        />
      ) : (
        <TimelineRow
          label="Fuel System"
          trackColor="bg-orange-100 dark:bg-orange-950"
          isEmpty
        />
      )}
      
      {/* Individual Bank Account Rows */}
      {bankAccounts.length > 0 ? (
        bankAccounts.map((account, index) => {
          const startPct = getPositionPercent(account.min);
          const endPct = getPositionPercent(account.max);
          const accountStart = new Date(account.min);
          const accountEnd = new Date(account.max);
          const accountHasGap = accountStart > periodStart || accountEnd < periodEnd;
          const colors = BANK_COLORS[index % BANK_COLORS.length];
          const displayName = account.bankName || account.sourceName || `Bank Account ${index + 1}`;
          
          return (
            <TimelineRow
              key={account.fileId || index}
              label={displayName}
              dateRange={`${formatDate(account.min)} — ${formatDate(account.max)}`}
              barColor={accountHasGap ? "bg-amber-500" : colors.bar}
              trackColor={colors.track}
              startPercent={startPct}
              widthPercent={endPct - startPct}
              hasGap={accountHasGap}
              txCount={account.txCount}
            />
          );
        })
      ) : summary.bankDateRange ? (
        <TimelineRow
          label="Bank Data"
          dateRange={`${formatDate(summary.bankDateRange.min)} — ${formatDate(summary.bankDateRange.max)}`}
          barColor="bg-blue-500"
          trackColor="bg-blue-100 dark:bg-blue-950"
          startPercent={getPositionPercent(summary.bankDateRange.min)}
          widthPercent={getPositionPercent(summary.bankDateRange.max) - getPositionPercent(summary.bankDateRange.min)}
        />
      ) : (
        <TimelineRow
          label="Bank Data"
          trackColor="bg-blue-100 dark:bg-blue-950"
          isEmpty
        />
      )}
      
      {/* Summary Footer */}
      {unmatchableBank > 0 && (
        <div className="flex items-center justify-between text-sm pt-3 mt-2 border-t">
          <span className="text-muted-foreground">Excluded (outside fuel date range):</span>
          <span className="font-medium">{unmatchableBank} transactions</span>
        </div>
      )}
    </div>
  );
}

interface TimelineRowProps {
  label: string;
  dateRange?: string;
  barColor?: string;
  trackColor: string;
  startPercent?: number;
  widthPercent?: number;
  hasGap?: boolean;
  isEmpty?: boolean;
  isReference?: boolean;
  onAddData?: () => void;
  txCount?: number;
}

function TimelineRow({
  label,
  dateRange,
  barColor,
  trackColor,
  startPercent = 0,
  widthPercent = 100,
  hasGap,
  isEmpty,
  isReference,
  onAddData,
  txCount,
}: TimelineRowProps) {
  return (
    <div className={cn(
      "grid grid-cols-[120px_1fr_110px] gap-2 items-center py-1",
      isReference && "pb-2 mb-1 border-b border-dashed"
    )}>
      {/* Label */}
      <div className={cn(
        "text-sm truncate",
        isReference ? "font-medium" : "text-muted-foreground"
      )}>
        {label}
      </div>
      
      {/* Bar */}
      <div className="relative h-4">
        <div className={cn("absolute inset-0 rounded", trackColor)} />
        {!isEmpty && barColor && (
          <div 
            className={cn("absolute h-full rounded transition-all", barColor)}
            style={{ 
              left: `${startPercent}%`, 
              width: `${Math.max(widthPercent, 2)}%` 
            }}
          />
        )}
        {isEmpty && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Badge variant="outline" className="text-red-600 text-xs h-4 px-1.5">
              No data
            </Badge>
          </div>
        )}
        {hasGap && onAddData && (
          <button
            className="absolute right-0.5 top-1/2 -translate-y-1/2 p-0.5 rounded hover-elevate"
            onClick={onAddData}
          >
            <Plus className="h-3 w-3 text-muted-foreground" />
          </button>
        )}
      </div>
      
      {/* Date Range */}
      <div className="text-xs text-right text-muted-foreground whitespace-nowrap">
        {dateRange}
        {txCount !== undefined && txCount > 0 && (
          <span className="ml-1 opacity-60">({txCount})</span>
        )}
      </div>
    </div>
  );
}
