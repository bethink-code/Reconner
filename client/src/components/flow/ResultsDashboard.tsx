import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Download,
  Settings,
  ChevronRight,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";
import { getBankColor } from "@/lib/bankColors";
import { AttendantReport, type AttendantSummaryRow } from "./AttendantReport";
import type { MatchingRulesConfig } from "@shared/schema";
import { MatchedPairsTab } from "./MatchedPairsTab";

interface BankAccountRange {
  fileId: string;
  sourceName: string;
  bankName: string | null;
  min: string;
  max: string;
  txCount: number;
  inRangeCount?: number;
}

interface PerBankBreakdown {
  bankName: string;
  approvedCount: number;
  approvedAmount: number;
  declinedCount: number;
  declinedAmount: number;
  cancelledCount: number;
  cancelledAmount: number;
  totalCount: number;
  totalAmount: number;
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
  bankAccountRanges?: BankAccountRange[];
  perBankBreakdown?: PerBankBreakdown[];
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

function heroBarColor(pct: number): string {
  if (pct > 60) return "bg-[#166534]";
  if (pct >= 20) return "bg-[#B45309]";
  return "bg-[#B91C1C]";
}

function heroTextColor(pct: number): string {
  if (pct > 60) return "text-[#166534] dark:text-emerald-400";
  if (pct >= 20) return "text-[#B45309] dark:text-amber-400";
  return "text-[#B91C1C] dark:text-red-400";
}

export function ResultsDashboard({ periodId, onRerunMatching, onAddFuelData, onAddBankData }: ResultsDashboardProps) {
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState("summary");
  const [rulesExpanded, setRulesExpanded] = useState(false);

  const { data: summary, isLoading } = useQuery<PeriodSummary>({
    queryKey: ["/api/periods", periodId, "summary"],
    enabled: !!periodId,
  });

  const { data: period } = useQuery<Period>({
    queryKey: ["/api/periods", periodId],
    enabled: !!periodId,
  });

  const { data: attendantData, isLoading: attendantLoading } = useQuery<AttendantSummaryRow[]>({
    queryKey: ["/api/periods", periodId, "attendant-summary"],
    enabled: !!periodId && activeTab === "attendants",
  });

  const { data: rules } = useQuery<MatchingRulesConfig>({
    queryKey: ["/api/periods", periodId, "matching-rules"],
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

  const formatRandExact = (amount: number) => {
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

  // ── Shared calculations ──
  const bankTotal = summary.bankTransactions;
  const unmatchableBank = summary.unmatchableBankTransactions || 0;
  const excludedBank = summary.excludedBankTransactions || 0;
  const unmatchedBank = summary.unmatchedBankTransactions;
  const matchableBankTotal = bankTotal - unmatchableBank - excludedBank;

  const cardOnly = summary.cardFuelTransactions - summary.debtorFuelTransactions;
  const cardOnlyAmount = summary.cardFuelAmount - summary.debtorFuelAmount;
  const bankApprovedAmount = summary.matchedBankAmount + (summary.unmatchedBankAmount || 0);
  const fileSurplus = bankApprovedAmount - summary.cardFuelAmount;
  const matchedSurplus = summary.matchedBankAmount - summary.matchedFuelAmount;
  const unmatchedBankAmt = summary.unmatchedBankAmount || 0;
  const unmatchedFuelCardAmount = summary.unmatchedCardAmount || 0;
  const totalFuelCardReconciled = summary.matchedFuelAmount + unmatchedFuelCardAmount;
  const reconSurplus = unmatchedFuelCardAmount + fileSurplus;
  const bankMatchPct = matchableBankTotal > 0 ? Math.round((summary.matchedPairs / matchableBankTotal) * 100) : 0;
  const outsideRangeAmt = summary.unmatchableBankAmount || 0;

  // Fuel-side verification scoped to bank coverage dates
  const scopedCardCount = summary.scopedCardCount || 0;
  const scopedMatchedCount = summary.scopedMatchedCount || 0;
  const scopedUnmatchedCount = summary.scopedUnmatchedCount || 0;
  const scopedVerifyPct = scopedCardCount > 0 ? Math.round((scopedMatchedCount / scopedCardCount) * 100) : 0;
  const banks = summary.perBankBreakdown || [];
  const totals = banks.reduce((acc, b) => ({
    declinedCount: acc.declinedCount + b.declinedCount,
    declinedAmount: acc.declinedAmount + b.declinedAmount,
    cancelledCount: acc.cancelledCount + b.cancelledCount,
    cancelledAmount: acc.cancelledAmount + b.cancelledAmount,
    approvedCount: acc.approvedCount + b.approvedCount,
    approvedAmount: acc.approvedAmount + b.approvedAmount,
  }), { declinedCount: 0, declinedAmount: 0, cancelledCount: 0, cancelledAmount: 0, approvedCount: 0, approvedAmount: 0 });

  const tabTriggerClass = "text-sm px-1 pb-2.5 -mb-px text-[#6B7280] border-b-2 border-transparent rounded-none bg-transparent shadow-none data-[state=active]:!bg-transparent data-[state=active]:!text-[#1A1200] data-[state=active]:!font-semibold data-[state=active]:!text-base data-[state=active]:!border-[#1A1200] data-[state=active]:!shadow-none hover:text-[#1A1200] transition-colors";

  return (
    <div className={cn("space-y-6 mx-auto transition-all", activeTab === "matched" ? "max-w-4xl" : "max-w-2xl")}>
      {/* ═══════════════════════════════════════════════════════════════════
          MAIN RESULTS CARD
      ═══════════════════════════════════════════════════════════════════ */}
      <Card className="overflow-hidden" data-testid="card-reconciliation-outcome">
        <CardContent className="p-6 space-y-6">

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            {/* Tab bar + Download */}
            <div className="flex items-end justify-between border-b border-[#E5E3DC] mb-16">
              <div className="flex items-end gap-4">
                <TabsList className="bg-transparent p-0 rounded-none w-auto h-auto gap-4">
                  <TabsTrigger value="summary" className={tabTriggerClass}>Summary</TabsTrigger>
                  <TabsTrigger value="detail" className={tabTriggerClass}>Detail</TabsTrigger>
                  <TabsTrigger value="attendants" className={tabTriggerClass}>Attendants</TabsTrigger>
                  <TabsTrigger value="matched" className={tabTriggerClass}>Transactions</TabsTrigger>
                </TabsList>
                <button
                  onClick={() => setLocation(`/investigate?periodId=${periodId}`)}
                  className={cn(
                    "text-sm px-1 pb-[12px] -mb-px border-b-2 border-transparent transition-colors hover:text-[#1A1200]",
                    unmatchedBank > 0 ? "text-[#B45309]" : "text-[#6B7280]"
                  )}
                >
                  Review ({unmatchedBank})
                </button>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="border border-[#E5E3DC] mb-2"
                onClick={() => window.open(`/api/periods/${periodId}/export`, '_blank')}
                data-testid="button-export-full"
              >
                <Download className="h-4 w-4 mr-2" />
                Download
              </Button>
            </div>

            {/* ════════════════════════════════════════════════════════════
                SUMMARY TAB — Owner's view
            ════════════════════════════════════════════════════════════ */}
            <TabsContent value="summary" className="mt-0 space-y-6">
              {/* Hero — matching summary */}
              <div className="text-center space-y-1">
                <p className="text-lg font-heading font-semibold text-[#1A1200]">Matching Complete</p>
                <p className="text-5xl font-heading font-bold text-[#1A1200] dark:text-[#F0EAE0]">{bankMatchPct}%</p>
                <p className="text-sm text-muted-foreground">of your {period?.name || "period"} bank transactions verified</p>
                <p className={cn("text-lg font-medium",
                  bankMatchPct >= 90 ? "text-[#166534]" : bankMatchPct >= 70 ? "text-[#B45309]" : "text-red-600"
                )}>
                  {summary.matchedPairs} matched · {formatRandExact(summary.matchedBankAmount)} verified
                </p>
              </div>

              {/* Review cards — the most important info */}
              <div className="grid grid-cols-2 gap-3">
                <div className={cn(
                  "rounded-lg p-4",
                  unmatchedBank > 0
                    ? "bg-[#FEF9C3] dark:bg-amber-950/30"
                    : "bg-[#DCFCE7] dark:bg-emerald-950/30"
                , "text-center")}>
                  <p className={cn("text-2xl font-semibold", unmatchedBank > 0 ? "text-[#B45309]" : "text-[#166534]")}>{unmatchedBank}</p>
                  <p className="text-sm font-medium">bank transactions with no fuel match</p>
                  <p className="text-lg font-semibold text-[#1A1200] tabular-nums">{formatRandExact(summary.unmatchedBankAmount || 0)}</p>
                  <p className="text-xs text-muted-foreground mt-2">of {matchableBankTotal} bank statements totalling {formatRandExact(summary.totalBankAmount)}</p>
                </div>
                <div className={cn(
                  "rounded-lg p-4",
                  summary.cardFuelTransactions - summary.matchedPairs > 0
                    ? "bg-[#FEF9C3] dark:bg-amber-950/30"
                    : "bg-[#DCFCE7] dark:bg-emerald-950/30"
                , "text-center")}>
                  <p className={cn("text-2xl font-semibold", summary.cardFuelTransactions - summary.debtorFuelTransactions - summary.matchedPairs > 0 ? "text-[#B45309]" : "text-[#166534]")}>{summary.cardFuelTransactions - summary.debtorFuelTransactions - summary.matchedPairs}</p>
                  <p className="text-sm font-medium">fuel card sales with no bank payment</p>
                  <p className="text-lg font-semibold text-[#1A1200] tabular-nums">{formatRandExact(summary.unmatchedCardAmount || 0)}</p>
                  <p className="text-xs text-muted-foreground mt-2">of {summary.cardFuelTransactions - summary.debtorFuelTransactions} card sales totalling {formatRandExact(summary.cardFuelAmount - summary.debtorFuelAmount)}</p>
                </div>
              </div>

              {/* Fuel sales breakdown */}
              {(() => {
                const segments = [
                  { key: "all", label: "All", count: summary.fuelTransactions, amount: summary.totalFuelAmount },
                  { key: "card", label: "Card", count: summary.cardFuelTransactions - summary.debtorFuelTransactions, amount: summary.cardFuelAmount - summary.debtorFuelAmount },
                  ...(summary.debtorFuelTransactions > 0 ? [{ key: "debtor", label: "Card (Debtor)", count: summary.debtorFuelTransactions, amount: summary.debtorFuelAmount }] : []),
                  { key: "cash", label: "Cash", count: summary.cashFuelTransactions, amount: summary.cashFuelAmount },
                ];
                return (
                  <div className="rounded-xl bg-[#FAFAF6] dark:bg-muted/30 p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 mb-3">Period Fuel Sales</p>
                    <div className="flex divide-x divide-border/50">
                      {segments.map((seg) => (
                        <button
                          key={seg.key}
                          onClick={() => {
                            if (seg.key === "review" && unmatchedBank > 0) {
                              setLocation(`/investigate?periodId=${periodId}`);
                            }
                          }}
                          className={cn(
                            "flex-1 py-2 px-3 text-center transition-colors",
                            seg.key === "review" && unmatchedBank > 0
                              ? "hover:bg-[#FEF9C3] cursor-pointer"
                              : ""
                          )}
                        >
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">{seg.label}</p>
                          <p className={cn(
                            "text-base font-semibold tabular-nums",
                            seg.key === "review" && unmatchedBank > 0 ? "text-[#B45309]" : ""
                          )}>{seg.count}</p>
                          <p className="text-sm text-muted-foreground tabular-nums">{formatRandExact(seg.amount)}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })()}


            </TabsContent>

            {/* ════════════════════════════════════════════════════════════
                DETAIL TAB — Accountant's view
            ════════════════════════════════════════════════════════════ */}
            <TabsContent value="detail" className="mt-0 space-y-4">

              {/* ── CARD 1: Fuel Sales Breakdown ── */}
              <DetailCard title="Fuel Sales">
                <div className="mb-3">
                  <ResponsiveContainer width="100%" height={32}>
                    <BarChart
                      layout="vertical"
                      data={[{
                        card: cardOnlyAmount,
                        debtor: summary.debtorFuelAmount,
                        cash: summary.cashFuelAmount,
                      }]}
                      stackOffset="expand"
                      barSize={20}
                    >
                      <XAxis type="number" hide />
                      <YAxis type="category" dataKey="name" hide />
                      <Tooltip
                        content={({ payload }) => {
                          if (!payload?.length) return null;
                          return (
                            <div className="bg-card border border-border rounded-lg px-2 py-1 text-xs shadow-sm">
                              {payload.map(p => (
                                <div key={p.name} className="flex gap-2">
                                  <span style={{ color: p.color }}>{p.name}</span>
                                  <span className="tabular-nums">{formatRandExact(p.value as number)}</span>
                                </div>
                              ))}
                            </div>
                          );
                        }}
                      />
                      <Bar dataKey="card" name="Card" stackId="a" fill="#C05A2A" radius={[4, 0, 0, 4]} />
                      <Bar dataKey="debtor" name="Debtor" stackId="a" fill="#B45309" />
                      <Bar dataKey="cash" name="Cash" stackId="a" fill="#6B7280" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="flex gap-4 text-[10px] text-muted-foreground mt-1">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-[#C05A2A]" />Card</span>
                    {summary.debtorFuelTransactions > 0 && (
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-[#B45309]" />Debtor</span>
                    )}
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-[#6B7280]" />Cash</span>
                  </div>
                </div>
                <div className="space-y-0.5">
                  <DetailRow label="Card" count={cardOnly} amount={formatRandExact(cardOnlyAmount)} />
                  {summary.debtorFuelTransactions > 0 && (
                    <DetailRow label="Debtor / Account" count={summary.debtorFuelTransactions} amount={formatRandExact(summary.debtorFuelAmount)} />
                  )}
                  <DetailRow label="Cash" count={summary.cashFuelTransactions} amount={formatRandExact(summary.cashFuelAmount)} />
                  <DetailRow label="Total" count={summary.fuelTransactions} amount={formatRandExact(summary.totalFuelAmount)} bold />
                </div>
              </DetailCard>

              {/* ── CARD 2: Bank Transactions ── */}
              <DetailCard title="Bank Transactions">
                {banks.length > 1 && (
                  <div className="mb-3">
                    <ResponsiveContainer width="100%" height={32}>
                      <BarChart
                        layout="vertical"
                        data={[banks.reduce((acc, b) => ({ ...acc, [b.bankName]: b.approvedAmount }), {} as Record<string, number>)]}
                        stackOffset="expand"
                        barSize={20}
                      >
                        <XAxis type="number" hide />
                        <YAxis type="category" hide />
                        <Tooltip
                          content={({ payload }) => {
                            if (!payload?.length) return null;
                            return (
                              <div className="bg-card border border-border rounded-lg px-2 py-1 text-xs shadow-sm">
                                {payload.map(p => (
                                  <div key={p.name} className="flex gap-2">
                                    <span style={{ color: p.color }}>{p.name}</span>
                                    <span className="tabular-nums">{formatRandExact(p.value as number)}</span>
                                  </div>
                                ))}
                              </div>
                            );
                          }}
                        />
                        {banks.map((b, i) => {
                          const isFirst = i === 0;
                          const isLast = i === banks.length - 1;
                          return (
                            <Bar
                              key={b.bankName}
                              dataKey={b.bankName}
                              name={b.bankName}
                              stackId="a"
                              fill={getBankColor(b.bankName)}
                              radius={[isFirst ? 4 : 0, isLast ? 4 : 0, isLast ? 4 : 0, isFirst ? 4 : 0]}
                            />
                          );
                        })}
                      </BarChart>
                    </ResponsiveContainer>
                    <div className="flex gap-4 text-[10px] text-muted-foreground mt-1">
                      {banks.map((b) => (
                        <span key={b.bankName} className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: getBankColor(b.bankName) }} />
                          {b.bankName}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                <div className="space-y-0.5">
                  <DetailRow label="Matchable" count={matchableBankTotal} />
                  {(summary.unmatchableBankTransactions || 0) > 0 && (
                    <DetailRow label="Outside date range" count={summary.unmatchableBankTransactions || 0}
                      amount={formatRandExact(outsideRangeAmt)} />
                  )}
                  {(summary.excludedBankTransactions || 0) > 0 && (
                    <DetailRow label="Excluded (declined/reversed)" count={summary.excludedBankTransactions || 0} />
                  )}
                  <DetailRow label="Total" count={summary.bankTransactions} bold />
                </div>

                {/* Per-bank table */}
                {banks.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-[#E5E3DC]/50">
                    <table className="w-full text-xs">
                      <thead>
                        <tr>
                          <th className="text-left py-1 pr-2 font-medium text-muted-foreground text-[10px]"></th>
                          {banks.map(b => (
                            <th key={b.bankName} className="text-right py-1 px-1 font-medium text-muted-foreground text-[10px]">{b.bankName}</th>
                          ))}
                          <th className="text-right py-1 pl-1 font-medium text-muted-foreground text-[10px]">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td className="py-0.5 pr-2 text-xs text-muted-foreground">Approved</td>
                          {banks.map(b => (
                            <td key={b.bankName} className="text-right px-1 py-0.5 tabular-nums text-xs">{b.approvedCount || '-'}</td>
                          ))}
                          <td className="text-right pl-1 py-0.5 tabular-nums text-xs font-medium">{totals.approvedCount}</td>
                        </tr>
                        {totals.declinedCount > 0 && (
                          <tr>
                            <td className="py-0.5 pr-2 text-xs text-muted-foreground">Declined</td>
                            {banks.map(b => (
                              <td key={b.bankName} className="text-right px-1 py-0.5 tabular-nums text-xs text-muted-foreground">{b.declinedCount || '-'}</td>
                            ))}
                            <td className="text-right pl-1 py-0.5 tabular-nums text-xs text-muted-foreground">{totals.declinedCount}</td>
                          </tr>
                        )}
                        {totals.cancelledCount > 0 && (
                          <tr>
                            <td className="py-0.5 pr-2 text-xs text-muted-foreground">Cancelled</td>
                            {banks.map(b => (
                              <td key={b.bankName} className="text-right px-1 py-0.5 tabular-nums text-xs text-muted-foreground">{b.cancelledCount || '-'}</td>
                            ))}
                            <td className="text-right pl-1 py-0.5 tabular-nums text-xs text-muted-foreground">{totals.cancelledCount}</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </DetailCard>

              {/* ── CARD 3: Matching ── */}
              <DetailCard title="Matching">
                <div className="mb-3">
                  <ResponsiveContainer width="100%" height={32}>
                    <BarChart
                      layout="vertical"
                      data={[{
                        matched: summary.matchedPairs,
                        unmatched: unmatchedBank,
                      }]}
                      stackOffset="expand"
                      barSize={20}
                    >
                      <XAxis type="number" hide />
                      <YAxis type="category" hide />
                      <Tooltip
                        content={({ payload }) => {
                          if (!payload?.length) return null;
                          return (
                            <div className="bg-card border border-border rounded-lg px-2 py-1 text-xs shadow-sm">
                              {payload.map(p => (
                                <div key={p.name} className="flex gap-2">
                                  <span style={{ color: p.color }}>{p.name}</span>
                                  <span className="tabular-nums">{p.value}</span>
                                </div>
                              ))}
                            </div>
                          );
                        }}
                      />
                      <Bar dataKey="matched" name="Matched" stackId="a" fill="#166534" radius={[4, 0, 0, 4]} />
                      <Bar dataKey="unmatched" name="Unmatched" stackId="a" fill="#B45309" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="flex gap-4 text-[10px] text-muted-foreground mt-1">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-[#166534]" />Matched</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-[#B45309]" />Unmatched</span>
                  </div>
                </div>
                <div className="space-y-0.5">
                  <DetailRow label="Matched" count={summary.matchedPairs} />
                  <DetailRow label="Match rate" value={`${bankMatchPct}%`} />
                  <DetailRow label="Unmatched bank" count={unmatchedBank} highlight={unmatchedBank > 0} />
                </div>
              </DetailCard>

              {/* ── CARD 4: Financial Reconciliation ── */}
              <DetailCard title="Financial Reconciliation">
                <div className="space-y-0.5">
                  <DetailRow label="Fuel card sales" amount={formatRandExact(summary.cardFuelAmount)} />
                  <DetailRow label="Bank approved amount" amount={formatRandExact(bankApprovedAmount)} />
                  <DetailRow label="File surplus / shortfall" amount={formatRandExact(fileSurplus)} highlight={fileSurplus !== 0} />
                </div>
                <div className="space-y-0.5 mt-3 pt-3 border-t border-[#E5E3DC]/50">
                  <DetailRow label="Matched bank amount" amount={formatRandExact(summary.matchedBankAmount)} />
                  <DetailRow label="Corresponding fuel amount" amount={formatRandExact(summary.matchedFuelAmount)} />
                  <DetailRow label="Matched surplus / shortfall" amount={formatRandExact(matchedSurplus)} highlight={matchedSurplus !== 0} />
                  {unmatchedBankAmt > 0 && (
                    <DetailRow label="Unmatched bank amount" amount={formatRandExact(unmatchedBankAmt)} />
                  )}
                </div>
                <div className="space-y-0.5 mt-3 pt-3 border-t border-[#E5E3DC]/50">
                  <DetailRow label="Unmatched fuel card" amount={formatRandExact(unmatchedFuelCardAmount)} />
                  <DetailRow label="Total fuel card reconciled" amount={formatRandExact(totalFuelCardReconciled)} />
                </div>
                <div className="mt-3 pt-2 bg-[#F0EFE8] dark:bg-muted/50 -mx-4 px-4 pb-2 rounded-b-xl">
                  <DetailRow label="Reconciliation surplus / shortfall" amount={formatRandExact(reconSurplus)} bold highlight={reconSurplus !== 0} />
                </div>
                {(summary.excludedBankAmount || 0) > 0 && (
                  <div className="mt-2">
                    <DetailRow label="Excluded bank amount" amount={formatRandExact(summary.excludedBankAmount || 0)} muted />
                  </div>
                )}
              </DetailCard>
            </TabsContent>

            {/* ════════════════════════════════════════════════════════════
                ATTENDANTS TAB — Insight view
            ════════════════════════════════════════════════════════════ */}
            <TabsContent value="attendants" className="mt-0">
              <AttendantReport
                data={attendantData}
                isLoading={attendantLoading}
                formatRandExact={formatRandExact}
                periodId={periodId}
                bankCoverageRange={summary.bankCoverageRange}
                unmatchedBankCount={unmatchedBank}
                unmatchedBankAmount={summary.unmatchedBankAmount || 0}
                onInvestigate={() => setLocation(`/investigate?periodId=${periodId}`)}
              />
            </TabsContent>

            <TabsContent value="matched" className="mt-0">
              <MatchedPairsTab periodId={periodId} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Matching Rules Row */}
      <Card data-testid="card-matching-rules">
        <CardContent className="py-3 px-4">
          <div
            className="flex items-center justify-between cursor-pointer"
            onClick={() => setRulesExpanded(!rulesExpanded)}
          >
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Settings className="h-4 w-4" />
              <span>Matching Rules</span>
            </div>
            <ChevronRight className={cn("h-4 w-4 text-muted-foreground transition-transform rotate-90", rulesExpanded && "rotate-[270deg]")} />
          </div>
          {rulesExpanded && rules && (
            <div className="mt-4 pt-4 border-t border-[#E5E3DC] space-y-4">
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-x-4 gap-y-2">
                <RuleValue label="Tolerance" value={`±R ${Number(rules.amountTolerance).toFixed(2)}`} />
                <RuleValue label="Date Window" value={`${rules.dateWindowDays} day${rules.dateWindowDays !== 1 ? "s" : ""}`} />
                <RuleValue label="Time Window" value={`${rules.timeWindowMinutes} min`} />
                <RuleValue label="Min Confidence" value={`${rules.minimumConfidence}%`} />
                <RuleValue label="Auto-Match" value={`${rules.autoMatchThreshold}%`} />
                <RuleValue label="Invoice Group" value={rules.groupByInvoice ? "On" : "Off"} />
                <RuleValue label="Card Required" value={rules.requireCardMatch ? "Yes" : "No"} />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => { e.stopPropagation(); onRerunMatching(); }}
                data-testid="button-adjust-rules"
              >
                <Settings className="h-4 w-4 mr-2" />
                Adjust
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function DetailCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-[#FAFAF6] dark:bg-muted/30 p-4">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 mb-3">
        {title}
      </h3>
      {children}
    </div>
  );
}

function DetailRow({ label, count, amount, value, bold, highlight, muted }: {
  label: string;
  count?: number;
  amount?: string;
  value?: string;
  bold?: boolean;
  highlight?: boolean;
  muted?: boolean;
}) {
  return (
    <div className={cn("flex items-center justify-between text-xs py-0.5", bold && "font-medium", muted && "text-muted-foreground")}>
      <span className={cn(muted && "text-muted-foreground")}>{label}</span>
      <div className="flex items-center gap-4">
        {count !== undefined && (
          <span className="tabular-nums text-muted-foreground w-10 text-right">{count.toLocaleString()}</span>
        )}
        {amount && (
          <span className={cn("tabular-nums text-right min-w-[100px]", highlight && "text-[#B45309] dark:text-amber-400")}>{amount}</span>
        )}
        {value && (
          <span className="tabular-nums text-right min-w-[100px]">{value}</span>
        )}
      </div>
    </div>
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
      color: '#C05A2A',
      type: 'fuel',
      onAdd: fuelHasGap ? onAddFuelData : undefined
    });
  }

  // Bank account rows
  const bankAccounts = summary.bankAccountRanges || [];

  bankAccounts.forEach((account, index) => {
    const bankLabel = account.bankName || account.sourceName || `Bank ${index + 1}`;
    const accountHasGap = checkGap(account.min, account.max);
    rows.push({
      label: bankLabel,
      min: account.min,
      max: account.max,
      count: account.inRangeCount ?? account.txCount,
      hasGap: accountHasGap,
      color: getBankColor(bankLabel),
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

          // Dot color: now a hex string directly
          const dotHex = isPeriod ? '#C4C2B8' : row.color;

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
                    className="absolute rounded-full"
                    style={{
                      left: `${leftPct}%`,
                      width: `${Math.max(widthPct, 1.5)}%`,
                      height: "6px",
                      top: "7px",
                      backgroundColor: row.color,
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
