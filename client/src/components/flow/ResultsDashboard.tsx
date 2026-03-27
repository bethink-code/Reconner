import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { InfoCard, InfoCardLabel, InfoCardContent, InfoCardAction } from "@/components/ui/info-card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Download,
  Settings,
  ChevronRight,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { MatchingRulesConfig, TransactionResolution } from "@shared/schema";
import { MatchedPairsTab } from "./MatchedPairsTab";
import { ReviewTab } from "./ReviewTab";
import { InvestigateTab } from "./InvestigateTab";
import { InsightsTab } from "./InsightsTab";

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
  cashFuelTransactions: number;
  cardFuelAmount: number;
  cashFuelAmount: number;
  debtorFuelTransactions: number;
  debtorFuelAmount: number;
  unmatchedBankTransactions: number;
  unmatchedBankAmount: number;
  unmatchedCardTransactions: number;
  unmatchedCardAmount: number;
  unmatchableBankTransactions?: number;
  unmatchableBankAmount?: number;
  excludedBankTransactions?: number;
  excludedBankAmount?: number;
  matchedBankAmount: number;
  matchedFuelAmount: number;
  resolvedBankTransactions?: number;
  scopedCardCount: number;
  scopedCardAmount: number;
  scopedMatchedCount: number;
  scopedMatchedAmount: number;
  scopedUnmatchedCount: number;
  scopedUnmatchedAmount: number;
  fuelDateRange?: { min: string; max: string };
  bankDateRange?: { min: string; max: string };
  bankCoverageRange?: { min: string; max: string };
  perBankBreakdown?: { bankName: string; approvedCount: number; approvedAmount: number; declinedCount: number; declinedAmount: number; cancelledCount: number; cancelledAmount: number; totalCount: number; totalAmount: number }[];
}

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
  const [reviewSide, setReviewSide] = useState<'bank' | 'fuel'>('bank');
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
  });

  // Resolutions query for badge counts
  const { data: resolutions } = useQuery<TransactionResolution[]>({
    queryKey: ["/api/periods", periodId, "resolutions"],
    enabled: !!periodId,
  });

  const formatRandExact = (amount: number) =>
    "R " + amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  if (isLoading || !summary) {
    return (
      <div className="space-y-4 max-w-2xl mx-auto">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  // ── Calculations ──
  const unmatchableBank = summary.unmatchableBankTransactions || 0;
  const excludedBank = summary.excludedBankTransactions || 0;
  const matchableBankTotal = summary.bankTransactions - unmatchableBank - excludedBank;
  const unmatchedBank = summary.unmatchedBankTransactions;
  const bankMatchPct = matchableBankTotal > 0 ? Math.round((summary.matchedPairs / matchableBankTotal) * 100) : 0;
  const unmatchedFuelCount = summary.cardFuelTransactions - summary.debtorFuelTransactions - summary.matchedPairs;

  // Badge counts — subtract resolved/flagged transactions from unmatched totals
  const resolvedCount = resolutions?.filter(r => r.resolutionType !== 'flagged').length || 0;
  const flaggedCount = resolutions?.filter(r => r.resolutionType === 'flagged').length || 0;
  const reviewCount = Math.max(0, unmatchedBank + Math.max(0, unmatchedFuelCount) - resolvedCount - flaggedCount);

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
            <TabsTrigger value="insights" className={tabTriggerClass}>Insights</TabsTrigger>
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
        <TabsContent value="summary" className="mt-0 max-w-4xl mx-auto">
          <div className="bg-section rounded-2xl p-6 space-y-6">
            <div className="grid grid-cols-4 gap-3">
              {([
                { key: "transactions", label: "01 · Transactions", desc: "How did matching go?", value: `${bankMatchPct}%`, sub: `${summary.matchedPairs} matched · ${formatRandExact(summary.matchedBankAmount)}`, context: `of ${matchableBankTotal} transactions · ${formatRandExact(summary.totalBankAmount)}`, action: "View all transactions", hasIssue: false },
                { key: "review", side: "bank" as const, label: "02 · Review Bank", desc: "Bank money with no fuel explanation", value: String(unmatchedBank), sub: formatRandExact(summary.unmatchedBankAmount || 0), context: `of ${matchableBankTotal} totalling ${formatRandExact(summary.totalBankAmount)}`, action: "Review bank side", hasIssue: unmatchedBank > 0 },
                { key: "review", side: "fuel" as const, label: "03 · Review Fuel", desc: "Fuel dispensed, no bank payment", value: String(Math.max(0, unmatchedFuelCount)), sub: formatRandExact(summary.unmatchedCardAmount || 0), context: `of ${summary.cardFuelTransactions - summary.debtorFuelTransactions} totalling ${formatRandExact(summary.cardFuelAmount - summary.debtorFuelAmount)}`, action: "Review fuel side", hasIssue: unmatchedFuelCount > 0 },
                { key: "investigate", label: "04 · Investigate", desc: "Your real-world follow-up list", value: String(flaggedCount), sub: flaggedCount === 0 ? "nothing to investigate yet" : "items flagged", context: "", action: "View investigate list", hasIssue: flaggedCount > 0 },
              ] as const).map((card, idx) => (
                <InfoCard
                  key={idx}
                  className="cursor-pointer hover:bg-card/80 transition-colors text-center flex flex-col"
                  onClick={() => { setActiveTab(card.key); if ('side' in card && card.side) setReviewSide(card.side); }}
                >
                  {/* Header — fixed height so all cards align */}
                  <div className="min-h-[3.5rem]">
                    <InfoCardLabel>{card.label}</InfoCardLabel>
                    <p className="text-sm font-medium text-muted-foreground">{card.desc}</p>
                  </div>
                  {/* Content — fixed height, vertically centered */}
                  <div className="border-t border-border/30 mt-3 pt-3 h-[6rem]">
                    <p className={cn("text-3xl font-bold tabular-nums", card.hasIssue ? "text-[#B45309]" : idx === 0 ? (bankMatchPct >= 60 ? "text-[#166534]" : "text-[#B91C1C]") : "text-[#166534]")}>
                      {card.value}
                      {idx === 0 && bankMatchPct >= 90 && <span className="text-[#166534] ml-1 text-lg">✓</span>}
                    </p>
                    <p className="text-xs font-medium mt-0.5">{card.sub}</p>
                    {card.context && <p className="text-[10px] text-muted-foreground mt-1">{card.context}</p>}
                  </div>
                  {/* Action — pinned to bottom */}
                  <div className="border-t border-border/30 pt-3">
                    <InfoCardAction className="justify-center">{card.action} <ArrowRight className="h-3 w-3" /></InfoCardAction>
                  </div>
                </InfoCard>
              ))}
            </div>

          {/* Period Fuel Sales */}
          <InfoCard>
              <InfoCardLabel className="mb-3">Period Fuel Sales</InfoCardLabel>
              <InfoCardContent className="flex divide-x divide-border/50">
                {[
                  { key: "all", label: "All", count: summary.fuelTransactions, amount: summary.totalFuelAmount },
                  { key: "card", label: "Card", count: summary.cardFuelTransactions - summary.debtorFuelTransactions, amount: summary.cardFuelAmount - summary.debtorFuelAmount },
                  ...(summary.debtorFuelTransactions > 0 ? [{ key: "debtor", label: "Card (Debtor)", count: summary.debtorFuelTransactions, amount: summary.debtorFuelAmount }] : []),
                  { key: "cash", label: "Cash", count: summary.cashFuelTransactions, amount: summary.cashFuelAmount },
                ].map(seg => (
                  <div key={seg.key} className="flex-1 py-2 px-3 text-center">
                    <InfoCardLabel>{seg.label}</InfoCardLabel>
                    <p className="text-base font-semibold tabular-nums">{seg.count}</p>
                    <p className="text-sm text-muted-foreground tabular-nums">{formatRandExact(seg.amount)}</p>
                  </div>
                ))}
              </InfoCardContent>
            </InfoCard>

          {/* Matching Rules */}
          <InfoCard className="py-3 px-4 cursor-pointer" onClick={() => setRulesExpanded(!rulesExpanded)}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Settings className="h-4 w-4" />
                  <span>Matching rules</span>
                </div>
                <ChevronRight className={cn("h-4 w-4 text-muted-foreground transition-transform rotate-90", rulesExpanded && "rotate-[270deg]")} />
              </div>
              {rulesExpanded && rules && (
                <InfoCardContent className="mt-4 pt-4 border-t border-border space-y-4">
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-x-4 gap-y-2">
                    <RuleValue label="Tolerance" value={`±R ${Number(rules.amountTolerance).toFixed(2)}`} />
                    <RuleValue label="Date Window" value={`${rules.dateWindowDays} day${rules.dateWindowDays !== 1 ? "s" : ""}`} />
                    <RuleValue label="Time Window" value={`${rules.timeWindowMinutes} min`} />
                    <RuleValue label="Min Confidence" value={`${rules.minimumConfidence}%`} />
                    <RuleValue label="Auto-Match" value={`${rules.autoMatchThreshold}%`} />
                    <RuleValue label="Invoice Group" value={rules.groupByInvoice ? "On" : "Off"} />
                    <RuleValue label="Card Required" value={rules.requireCardMatch ? "Yes" : "No"} />
                  </div>
                  <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); onRerunMatching(); }}>
                    <Settings className="h-4 w-4 mr-2" />Adjust
                  </Button>
                </InfoCardContent>
              )}
            </InfoCard>
          </div>{/* close single section */}
        </TabsContent>

        {/* ════════════════════════════════════════════════════════════
            TRANSACTIONS TAB
        ════════════════════════════════════════════════════════════ */}
        <TabsContent value="transactions" className="mt-0 max-w-4xl mx-auto">
          <MatchedPairsTab periodId={periodId} />
        </TabsContent>

        <TabsContent value="review" className="mt-0 max-w-4xl mx-auto ring-0 ring-offset-0 focus-visible:ring-0 focus-visible:ring-offset-0">
          <ReviewTab periodId={periodId} initialSide={reviewSide} />
        </TabsContent>

        <TabsContent value="investigate" className="mt-0 max-w-4xl mx-auto">
          <InvestigateTab periodId={periodId} />
        </TabsContent>

        <TabsContent value="insights" className="mt-0 max-w-4xl mx-auto">
          <InsightsTab periodId={periodId} />
        </TabsContent>
    </Tabs>
  );
}

function RuleValue({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">{label}</p>
      <p className="text-sm tabular-nums">{value}</p>
    </div>
  );
}
