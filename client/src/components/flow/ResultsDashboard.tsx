import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { InfoCard, InfoCardLabel, InfoCardContent, InfoCardAction } from "@/components/ui/info-card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Download,
  Settings,
  ChevronRight,
  ArrowRight,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatRand } from "@/lib/format";
import type { MatchingRulesConfig, TransactionResolution } from "@shared/schema";
import type { PeriodSummary } from "@/lib/reconciliation-types";
import { deriveSummaryStats } from "@/lib/reconciliation-utils";
import { buildMatchingStages } from "@shared/matchingStages";
import { MatchedPairsTab } from "./MatchedPairsTab";
import { ReviewTab } from "./ReviewTab";
import { InvestigateTab } from "./InvestigateTab";
import { InsightsTab } from "./InsightsTab";

interface ResultsDashboardProps {
  periodId: string;
  onRerunMatching: () => void;
  onAddFuelData?: () => void;
  onAddBankData?: () => void;
  stepColor?: string;
}

interface Period {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
}

export function ResultsDashboard({ periodId, onRerunMatching, stepColor }: ResultsDashboardProps) {
  const [activeTab, setActiveTab] = useState("summary");
  const [reviewSide, setReviewSide] = useState<'bank' | 'fuel'>('fuel');
  const [insightsView, setInsightsView] = useState<'landing' | 'detail' | 'attendants' | 'declined'>('landing');
  const [rulesExpanded, setRulesExpanded] = useState(false);

  const { data: summary, isLoading } = useQuery<PeriodSummary>({
    queryKey: ["/api/periods", periodId, "summary"],
    enabled: !!periodId,
  });

  const { data: period } = useQuery<Period>({
    queryKey: ["/api/periods", periodId],
    enabled: !!periodId,
  });

  const { data: rules } = useQuery<MatchingRulesConfig>({
    queryKey: ["/api/periods", periodId, "matching-rules"],
    enabled: !!periodId,
    // Always refetch when the Summary tab mounts — rules change via the Adjust → Configure
    // flow, and users expect the displayed values to reflect the current saved rules
    refetchOnMount: "always",
  });

  // Resolutions query for badge counts
  const { data: resolutions } = useQuery<TransactionResolution[]>({
    queryKey: ["/api/periods", periodId, "resolutions"],
    enabled: !!periodId,
  });

  // Decline analysis for net unrecovered amount
  const { data: declineData } = useQuery<{
    summary: { totalDeclined: number; resubmittedCount: number; unrecoveredCount: number; netUnrecoveredAmount: number };
  }>({
    queryKey: ["/api/periods", periodId, "decline-analysis"],
    enabled: !!periodId && (summary?.excludedBankTransactions || 0) > 0,
  });

  if (isLoading || !summary) {
    return (
      <div className="space-y-4 max-w-2xl mx-auto">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  // ── Calculations ──
  const { unmatchableBank, excludedBank, matchableBankTotal, unmatchedBank, cardMatchPct, matchedCardCount, unmatchedFuelCount, cardOnlyAmount, bankApprovedAmount, fileSurplus } = deriveSummaryStats(summary);

  // Badge counts — subtract resolved/flagged transactions from unmatched totals
  const resolvedCount = resolutions?.filter(r => r.resolutionType !== 'flagged').length || 0;
  const flaggedCount = resolutions?.filter(r => r.resolutionType === 'flagged').length || 0;
  const reviewCount = Math.max(0, unmatchedBank + Math.max(0, unmatchedFuelCount) - resolvedCount - flaggedCount);
  const matchingStages = rules ? buildMatchingStages(rules) : [];

  const tabTriggerClass = "text-sm px-1 pb-2.5 -mb-px text-[#6B7280] border-b-2 border-transparent rounded-none bg-transparent shadow-none data-[state=active]:!bg-transparent data-[state=active]:!text-[#1A1200] data-[state=active]:!font-semibold data-[state=active]:!text-base data-[state=active]:!border-[#1A1200] data-[state=active]:!shadow-none hover:text-[#1A1200] transition-colors";

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab}>
      {/* ── Tab bar — in its own section ── */}
      <div className="bg-section rounded-2xl max-w-4xl mx-auto px-6 pt-5 pb-0 mb-4">
        <div className="flex items-end justify-between border-b border-border">
          <TabsList className="bg-transparent p-0 rounded-none w-auto h-auto gap-4">
            <TabsTrigger value="summary" className={tabTriggerClass}>Summary</TabsTrigger>
            <TabsTrigger value="transactions" className={tabTriggerClass}>Transactions</TabsTrigger>
            <TabsTrigger value="review" className={tabTriggerClass}>
              Review
              <span className={cn(
                "ml-1.5 text-xs tabular-nums px-1.5 py-0.5 rounded-full",
                reviewCount > 0 ? "bg-[#B45309] text-white" : "bg-muted text-muted-foreground"
              )}>{reviewCount}</span>
            </TabsTrigger>
            <TabsTrigger value="investigate" className={tabTriggerClass}>
              Investigate
              <span className={cn(
                "ml-1.5 text-xs tabular-nums px-1.5 py-0.5 rounded-full",
                flaggedCount > 0 ? "bg-[#B45309] text-white" : "bg-muted text-muted-foreground"
              )}>{flaggedCount}</span>
            </TabsTrigger>
            <TabsTrigger value="insights" className={tabTriggerClass} onClick={() => setInsightsView('landing')}>Insights</TabsTrigger>
          </TabsList>
          <Button
            variant="ghost"
            size="sm"
            className="border border-border mb-2"
            onClick={() => window.open(`/api/periods/${periodId}/export`, '_blank')}
          >
            <Download className="h-4 w-4 mr-2" />
            Download
          </Button>
        </div>
      </div>

        {/* ════════════════════════════════════════════════════════════
            SUMMARY TAB — 4 action cards
        ════════════════════════════════════════════════════════════ */}
      <div className="bg-section rounded-2xl max-w-4xl mx-auto px-6 py-4 mb-4">
        <button
          type="button"
          onClick={() => setRulesExpanded(!rulesExpanded)}
          className="w-full text-left"
          data-testid="button-toggle-matching-logic"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">Matching Logic</p>
              <p className="text-sm text-[#1A1200]">
                These are the active rules and ordered Lekana passes behind this reconciliation.
              </p>
            </div>
            <ChevronRight className={cn("h-4 w-4 text-muted-foreground transition-transform rotate-90", rulesExpanded && "rotate-[270deg]")} />
          </div>
        </button>

        {rulesExpanded && rules && (
          <div className="mt-4 pt-4 border-t border-border space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3">
              <RuleValue label="Tolerance" value={`±R ${Number(rules.amountTolerance).toFixed(2)}`} />
              <RuleValue label="Match Window" value={`${rules.dateWindowDays} day${rules.dateWindowDays !== 1 ? "s" : ""}`} />
              <RuleValue label="Operational Close" value={`${rules.timeWindowMinutes} min`} />
              <RuleValue label="Attendant Delay" value={`${rules.attendantSubmissionDelayMinutes} min`} />
              <RuleValue label="Min Confidence" value={`${rules.minimumConfidence}%`} />
              <RuleValue label="Auto-Match" value={`${rules.autoMatchThreshold}%`} />
              <RuleValue label="Invoice Group" value={rules.groupByInvoice ? "On" : "Off"} />
              <RuleValue label="Card Required" value={rules.requireCardMatch ? "Yes" : "No"} />
              {period && <RuleValue label="Period" value={`${period.startDate} to ${period.endDate}`} />}
            </div>

            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">Ordered Passes</p>
              <div className="space-y-3">
                {matchingStages.map((stage) => (
                  <div key={stage.id} className="rounded-xl bg-card border border-border/60 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Pass {stage.order}
                        </p>
                        <p className="text-sm font-semibold mt-1">{stage.name}</p>
                        <p className="text-xs text-muted-foreground mt-1">{stage.description}</p>
                      </div>
                      <Badge variant="secondary" className="shrink-0">
                        {stage.minimumConfidence}% min
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-3">
                      <Badge variant="outline">Amount +/- R{stage.maxAmountDiff.toFixed(2)}</Badge>
                      <Badge variant="outline">
                        {stage.boundaryMode === "boundary"
                          ? "Previous-day start / next-day end"
                          : stage.maxDateDiffDays === 0
                            ? "Same day only"
                            : `Up to ${stage.maxDateDiffDays} day lag`}
                      </Badge>
                      <Badge variant="outline">
                        {stage.requireExactAmount
                          ? `${rules.attendantSubmissionDelayMinutes} min attendant submission delay`
                          : stage.maxTimeDiffMinutes === null
                            ? "No same-day time cap"
                            : `${stage.maxTimeDiffMinutes} min time window`}
                      </Badge>
                      <Badge variant="outline">
                        {stage.requireCardMatch ? "Card match required" : "Card match optional"}
                      </Badge>
                      {stage.requireExactAmount && (
                        <Badge variant="outline">Exact amount first</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-start">
              <Button variant="outline" size="sm" onClick={onRerunMatching}>
                <Settings className="h-4 w-4 mr-2" />Adjust
              </Button>
            </div>
          </div>
        )}
      </div>

        <TabsContent value="summary" className="mt-0 max-w-4xl mx-auto">
          <div className="bg-section rounded-2xl p-6 space-y-5">

            {/* Row 1: Match health ring + Review actions */}
            <div className="grid grid-cols-3 gap-4">
              {/* Match Health */}
              <InfoCard className="flex flex-col items-center justify-center py-5 cursor-pointer hover:bg-card/80 transition-colors" onClick={() => setActiveTab('transactions')}>
                <div className="relative w-24 h-24 mb-3">
                  <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                    <circle cx="50" cy="50" r="42" fill="none" stroke="#E5E3DC" strokeWidth="8" />
                    <circle cx="50" cy="50" r="42" fill="none"
                      stroke={cardMatchPct >= 80 ? "#166534" : cardMatchPct >= 60 ? "#B45309" : "#B91C1C"}
                      strokeWidth="8" strokeLinecap="round"
                      strokeDasharray={`${cardMatchPct * 2.639} ${263.9 - cardMatchPct * 2.639}`} />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className={cn("text-2xl font-bold tabular-nums", cardMatchPct >= 80 ? "text-[#166534]" : cardMatchPct >= 60 ? "text-[#B45309]" : "text-[#B91C1C]")}>{cardMatchPct}%</span>
                  </div>
                </div>
                <p className="text-sm font-semibold">Fuel card sales match rate</p>
                <p className="text-xs text-muted-foreground">{matchedCardCount} of {summary.cardFuelTransactions} card transactions matched</p>
                <InfoCardAction className="mt-2 justify-center">View transactions <ArrowRight className="h-3 w-3" /></InfoCardAction>
              </InfoCard>

              {/* Review Fuel */}
              <InfoCard className="cursor-pointer hover:bg-card/80 transition-colors flex flex-col" onClick={() => { setActiveTab('review'); setReviewSide('fuel'); }}>
                <InfoCardLabel>Review Fuel</InfoCardLabel>
                <p className="text-xs text-muted-foreground mt-0.5">Fuel card sales with no approved card payment</p>
                <div className="flex-1 flex items-center gap-3 mt-3">
                  <span className={cn("text-3xl font-bold tabular-nums", unmatchedFuelCount > 0 ? "text-[#B45309]" : "text-[#166534]")}>{Math.max(0, unmatchedFuelCount)}</span>
                  <div>
                    <p className="text-sm font-semibold tabular-nums">{formatRand(summary.unmatchedCardAmount || 0)}</p>
                    <p className="text-xs text-muted-foreground">{unmatchedFuelCount === 1 ? 'card transaction' : 'card transactions'}</p>
                  </div>
                </div>
                {/* Progress bar */}
                <div className="w-full h-1.5 rounded-full bg-[#E5E3DC] mt-3">
                  <div className="h-full rounded-full bg-[#166534]" style={{ width: `${summary.cardFuelTransactions > 0 ? ((summary.cardFuelTransactions - Math.max(0, unmatchedFuelCount)) / summary.cardFuelTransactions) * 100 : 100}%` }} />
                </div>
                <InfoCardAction className="mt-2">Review fuel side <ArrowRight className="h-3 w-3" /></InfoCardAction>
              </InfoCard>

              {/* Review Bank */}
              <InfoCard className="cursor-pointer hover:bg-card/80 transition-colors flex flex-col" onClick={() => { setActiveTab('review'); setReviewSide('bank'); }}>
                <InfoCardLabel>Review Bank</InfoCardLabel>
                <p className="text-xs text-muted-foreground mt-0.5">Approved card payment with no fuel transaction</p>
                <div className="flex-1 flex items-center gap-3 mt-3">
                  <span className={cn("text-3xl font-bold tabular-nums", unmatchedBank > 0 ? "text-[#B45309]" : "text-[#166534]")}>{unmatchedBank}</span>
                  <div>
                    <p className="text-sm font-semibold tabular-nums">{formatRand(summary.unmatchedBankAmount || 0)}</p>
                    <p className="text-xs text-muted-foreground">{unmatchedBank === 1 ? 'bank transaction' : 'bank transactions'}</p>
                  </div>
                </div>
                {/* Progress bar */}
                <div className="w-full h-1.5 rounded-full bg-[#E5E3DC] mt-3">
                  <div className="h-full rounded-full bg-[#166534]" style={{ width: `${matchableBankTotal > 0 ? ((matchableBankTotal - unmatchedBank) / matchableBankTotal) * 100 : 100}%` }} />
                </div>
                <InfoCardAction className="mt-2">Review bank side <ArrowRight className="h-3 w-3" /></InfoCardAction>
              </InfoCard>
            </div>

            {/* Row 2: Reconciliation + Declined + Investigate */}
            <div className={cn("grid gap-4", excludedBank > 0 ? "grid-cols-3" : "grid-cols-2")}>
              {/* Reconciliation */}
              <InfoCard className="cursor-pointer hover:bg-card/80 transition-colors" onClick={() => { setInsightsView('detail'); setActiveTab('insights'); }}>
                <InfoCardLabel>Reconciliation</InfoCardLabel>
                {/* Visual bar: fuel vs bank */}
                <div className="mt-3 space-y-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Fuel card sales</span>
                    <span className="tabular-nums font-medium text-foreground">{formatRand(cardOnlyAmount)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Bank approved</span>
                    <span className="tabular-nums font-medium text-foreground">{formatRand(bankApprovedAmount)}</span>
                  </div>
                  <div className="flex justify-between text-xs mt-1 pt-1 border-t border-border/30">
                    <span className="font-medium">Surplus / Shortfall</span>
                    <span className={cn("tabular-nums font-bold", fileSurplus !== 0 ? "text-[#B45309]" : "text-[#166534]")}>{formatRand(fileSurplus)}</span>
                  </div>
                </div>
                <InfoCardAction className="mt-3">View analysis <ArrowRight className="h-3 w-3" /></InfoCardAction>
              </InfoCard>

              {/* Declined */}
              {excludedBank > 0 && (
                <InfoCard className="cursor-pointer hover:bg-card/80 transition-colors" onClick={() => { setInsightsView('declined'); setActiveTab('insights'); }}>
                  <InfoCardLabel>Declined card transactions</InfoCardLabel>
                  <div className="flex items-center gap-3 mt-3">
                    <AlertTriangle className="h-8 w-8 text-[#B45309]" />
                    <div>
                      <p className="text-2xl font-bold tabular-nums text-[#B45309]">{declineData?.summary.unrecoveredCount ?? excludedBank}</p>
                      <p className="text-xs text-muted-foreground">unrecovered</p>
                    </div>
                  </div>
                  <p className="text-sm font-semibold tabular-nums text-[#B45309] mt-2">{formatRand(declineData?.summary.netUnrecoveredAmount ?? (summary.excludedBankAmount || 0))}</p>
                  <p className="text-xs text-muted-foreground">{excludedBank} total declined · {declineData?.summary.resubmittedCount ?? 0} resubmitted</p>
                  <InfoCardAction className="mt-2">View report <ArrowRight className="h-3 w-3" /></InfoCardAction>
                </InfoCard>
              )}

              {/* Investigate */}
              <InfoCard
                className="cursor-pointer hover:bg-card/80 transition-colors"
                onClick={() => setActiveTab(flaggedCount === 0 ? 'review' : 'investigate')}
              >
                <InfoCardLabel>Investigate</InfoCardLabel>
                {flaggedCount === 0 ? (
                  <>
                    <p className="text-xs text-muted-foreground mt-3">
                      Items you flag during review land here. Start with Review to work through anything unmatched.
                    </p>
                    <InfoCardAction className="mt-auto pt-3">Start reviewing <ArrowRight className="h-3 w-3" /></InfoCardAction>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-3 mt-3">
                      <span className="text-2xl font-bold tabular-nums text-[#B45309]">{flaggedCount}</span>
                      <p className="text-xs text-muted-foreground">items flagged for follow-up</p>
                    </div>
                    <InfoCardAction className="mt-auto pt-3">View investigate list <ArrowRight className="h-3 w-3" /></InfoCardAction>
                  </>
                )}
              </InfoCard>
            </div>

            {/* Row 3: Period Fuel Sales */}
            <InfoCard>
              <InfoCardLabel className="mb-3">Period Fuel Sales</InfoCardLabel>
              <InfoCardContent className="flex divide-x divide-border/50">
                {[
                  { key: "all", label: "All", count: summary.fuelTransactions, amount: summary.totalFuelAmount },
                  { key: "card", label: "Card", count: summary.cardFuelTransactions, amount: summary.cardFuelAmount },
                  ...(summary.debtorFuelTransactions > 0 ? [{ key: "debtor", label: "Debtor / Account", count: summary.debtorFuelTransactions, amount: summary.debtorFuelAmount }] : []),
                  { key: "cash", label: "Cash", count: summary.cashFuelTransactions, amount: summary.cashFuelAmount },
                ].map(seg => (
                  <div key={seg.key} className="flex-1 py-2 px-3 text-center">
                    <InfoCardLabel>{seg.label}</InfoCardLabel>
                    <p className="text-base font-semibold tabular-nums">{seg.count}</p>
                    <p className="text-sm text-muted-foreground tabular-nums">{formatRand(seg.amount)}</p>
                  </div>
                ))}
              </InfoCardContent>
            </InfoCard>

          </div>
        </TabsContent>

        {/* ════════════════════════════════════════════════════════════
            TRANSACTIONS TAB
        ════════════════════════════════════════════════════════════ */}
        <TabsContent value="transactions" className="mt-0 max-w-4xl mx-auto">
          <MatchedPairsTab periodId={periodId} onJumpToReview={(side) => { setReviewSide(side); setActiveTab('review'); }} />
        </TabsContent>

        <TabsContent value="review" className="mt-0 max-w-4xl mx-auto ring-0 ring-offset-0 focus-visible:ring-0 focus-visible:ring-offset-0">
          <ReviewTab periodId={periodId} initialSide={reviewSide} />
        </TabsContent>

        <TabsContent value="investigate" className="mt-0 max-w-4xl mx-auto">
          <InvestigateTab periodId={periodId} onJumpToAttendants={() => { setInsightsView('attendants'); setActiveTab('insights'); }} />
        </TabsContent>

        <TabsContent value="insights" className="mt-0 max-w-4xl mx-auto">
          <InsightsTab periodId={periodId} initialView={insightsView} key={insightsView} />
        </TabsContent>
    </Tabs>
  );
}

function RuleValue({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">{label}</p>
      <p className="text-sm tabular-nums">{value}</p>
    </div>
  );
}
