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
              {/* Compact Coverage Ribbon */}
              {period && (
                <CoverageRibbon 
                  period={period}
                  summary={summary}
                  formatDate={formatDate}
                  hasGaps={hasGaps}
                  onAddData={onRerunMatching}
                />
              )}

              {/* Compact Stats Row */}
              <div className="flex flex-wrap gap-4 text-sm pt-2 border-t">
                <div>
                  <span className="text-muted-foreground">Card Sales: </span>
                  <span className="font-medium">{summary.cardFuelTransactions.toLocaleString()}</span>
                  <span className="text-muted-foreground"> ({formatCurrency(summary.totalFuelAmount)})</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Bank Txns: </span>
                  <span className="font-medium">{bankTotal.toLocaleString()}</span>
                  <span className="text-muted-foreground"> ({formatCurrency(summary.totalBankAmount)})</span>
                </div>
              </div>
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

interface CoverageRibbonProps {
  period: Period;
  summary: PeriodSummary;
  formatDate: (d: string) => string;
  hasGaps: boolean;
  onAddData: () => void;
}

function CoverageRibbon({ period, summary, formatDate, hasGaps, onAddData }: CoverageRibbonProps) {
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
  
  const fuelRange = summary.fuelDateRange;
  const fuelHasGap = fuelRange && checkGap(fuelRange.min, fuelRange.max);
  const bankAccounts = summary.bankAccountRanges || [];
  
  // Build all sources for the ribbon
  const sources: Array<{
    name: string;
    min: string;
    max: string;
    count?: number;
    hasGap: boolean;
    color: string;
    type: 'fuel' | 'bank';
  }> = [];
  
  if (fuelRange) {
    sources.push({
      name: 'Fuel',
      min: fuelRange.min,
      max: fuelRange.max,
      count: summary.cardFuelTransactions,
      hasGap: !!fuelHasGap,
      color: 'bg-orange-500',
      type: 'fuel'
    });
  }
  
  bankAccounts.forEach((account, index) => {
    const colors = ['bg-blue-500', 'bg-purple-500', 'bg-teal-500', 'bg-indigo-500', 'bg-cyan-500'];
    sources.push({
      name: account.bankName || account.sourceName || `Bank ${index + 1}`,
      min: account.min,
      max: account.max,
      count: account.txCount,
      hasGap: checkGap(account.min, account.max),
      color: colors[index % colors.length],
      type: 'bank'
    });
  });
  
  // Fallback if no individual bank accounts but have aggregate range
  if (bankAccounts.length === 0 && summary.bankDateRange) {
    sources.push({
      name: 'Bank',
      min: summary.bankDateRange.min,
      max: summary.bankDateRange.max,
      count: summary.bankTransactions,
      hasGap: checkGap(summary.bankDateRange.min, summary.bankDateRange.max),
      color: 'bg-blue-500',
      type: 'bank'
    });
  }

  return (
    <div className="space-y-2" data-testid="coverage-ribbon">
      {/* Reference bar with period dates */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span>{formatDate(period.startDate)}</span>
        <div className="flex-1 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full relative">
          {/* Fuel and bank coverage segments on single track */}
          {sources.map((source, idx) => {
            const left = getPositionPercent(source.min);
            const width = getPositionPercent(source.max) - left;
            return (
              <Tooltip key={idx}>
                <TooltipTrigger asChild>
                  <div 
                    className={cn(
                      "absolute h-full rounded-full transition-all cursor-pointer",
                      source.hasGap ? "bg-amber-400" : source.color
                    )}
                    style={{ 
                      left: `${left}%`, 
                      width: `${Math.max(width, 2)}%`,
                      top: `${idx * 3}px`
                    }}
                  />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="font-medium">{source.name}</p>
                  <p className="text-xs">{formatDate(source.min)} — {formatDate(source.max)}</p>
                  {source.count && <p className="text-xs">{source.count.toLocaleString()} transactions</p>}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
        <span>{formatDate(period.endDate)}</span>
      </div>
      
      {/* Source chips - compact inline display */}
      <div className="flex flex-wrap items-center gap-1.5">
        {sources.map((source, idx) => (
          <div 
            key={idx}
            className={cn(
              "inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs",
              "bg-muted/50 border"
            )}
          >
            <span className={cn("w-2 h-2 rounded-full", source.hasGap ? "bg-amber-400" : source.color)} />
            <span className="font-medium">{source.name}</span>
            <span className="text-muted-foreground">
              {formatDate(source.min)}—{formatDate(source.max)}
            </span>
            {source.count && (
              <span className="text-muted-foreground">({source.count.toLocaleString()})</span>
            )}
            {source.hasGap && (
              <AlertTriangle className="h-3 w-3 text-amber-500" />
            )}
          </div>
        ))}
        
        {/* Add Data action when gaps exist */}
        {hasGaps && (
          <button
            onClick={onAddData}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 hover-elevate"
            data-testid="button-add-missing-data"
          >
            <Plus className="h-3 w-3" />
            Add data
          </button>
        )}
      </div>
    </div>
  );
}
