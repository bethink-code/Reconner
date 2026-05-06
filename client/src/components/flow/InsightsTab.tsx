import type { ReactNode } from "react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { PeriodInsightsReadModel } from "@shared/periodInsights";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft,
  ChevronRight,
  FileText,
  Users,
  MinusCircle,
  TrendingUp,
  BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatRand } from "@/lib/format";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { getBankColor } from "@/lib/bankColors";
import { AttendantReport } from "./AttendantReport";

interface InsightsTabProps {
  periodId: string;
  initialView?: "landing" | "detail" | "attendants" | "declined";
}

export function InsightsTab({ periodId, initialView }: InsightsTabProps) {
  const [view, setView] = useState<"landing" | "detail" | "attendants" | "declined">(
    initialView || "landing",
  );

  const { data: insights, isLoading } = useQuery<PeriodInsightsReadModel>({
    queryKey: ["/api/periods", periodId, "insights"],
    enabled: !!periodId,
  });

  if (isLoading || !insights) {
    return (
      <div className="mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-48 w-full" />
          ))}
        </div>
      </div>
    );
  }

  const detail = insights.detail;
  const attendants = insights.attendants;
  const declines = insights.declines;
  const banks = detail.bankTransactions.byBank;

  const backHeader = (
    title: string,
    description?: string,
  ) => (
    <div className="mb-4">
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setView("landing")}
        className="mb-3"
      >
        <ArrowLeft className="mr-1 h-4 w-4" />
        Back to Insights
      </Button>
      <div className="px-3 py-4">
        <h2 className="font-heading text-2xl font-semibold text-[#1A1200]">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
    </div>
  );

  if (view === "landing") {
    return (
      <div className="mx-auto space-y-6">
        <div className="px-3 py-4">
          <h2 className="font-heading text-2xl font-semibold text-[#1A1200]">Insights</h2>
          <p className="text-sm text-muted-foreground">
            Reports and analysis for this reconciliation period
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <LandingCard
            icon={<FileText className="h-5 w-5 text-muted-foreground" />}
            title="Reconciliation overview"
            description="Fuel card sales reconciliation, surplus/shortfall analysis, and full transaction-level breakdown."
            onClick={() => setView("detail")}
          />
          <LandingCard
            icon={<Users className="h-5 w-5 text-muted-foreground" />}
            title="Attendants"
            description="Performance by attendant. Sales totals, match rates, and flagged transactions per person."
            onClick={() => setView("attendants")}
          />
          <LandingCard
            icon={<MinusCircle className="h-5 w-5 text-muted-foreground" />}
            title="Declined card transactions"
            description="Transactions declined at point of sale. Patterns by card type, pump, time of day."
            onClick={() => setView("declined")}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <DisabledLandingCard
            icon={<TrendingUp className="h-5 w-5 text-muted-foreground" />}
            title="Trends"
            description="Match rate and discrepancy patterns over time across periods."
          />
          <DisabledLandingCard
            icon={<BarChart3 className="h-5 w-5 text-muted-foreground" />}
            title="Pump performance"
            description="Sales and discrepancies broken down by pump number."
          />
        </div>
      </div>
    );
  }

  if (view === "detail") {
    return (
      <div className="mx-auto space-y-4">
        {backHeader(
          "Reconciliation overview",
          "Fuel card sales reconciliation, surplus/shortfall analysis, and full transaction-level breakdown.",
        )}

        <DetailCard title="Fuel sales">
          <div className="mb-3">
            <ResponsiveContainer width="100%" height={32}>
              <BarChart
                layout="vertical"
                data={[
                  {
                    card: detail.fuelSales.card.amount,
                    debtor: detail.fuelSales.debtor.amount,
                    cash: detail.fuelSales.cash.amount,
                  },
                ]}
                stackOffset="expand"
                barSize={20}
              >
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" hide />
                <Tooltip
                  content={({ payload }) => {
                    if (!payload?.length) return null;
                    return (
                      <div className="rounded-lg border border-border bg-card px-2 py-1 text-xs shadow-sm">
                        {payload.map((entry) => (
                          <div key={entry.name} className="flex gap-2">
                            <span style={{ color: entry.color }}>{entry.name}</span>
                            <span className="tabular-nums">
                              {formatRand(entry.value as number)}
                            </span>
                          </div>
                        ))}
                      </div>
                    );
                  }}
                />
                <Bar
                  dataKey="card"
                  name="Card"
                  stackId="a"
                  fill="#C05A2A"
                  radius={[4, 0, 0, 4]}
                />
                <Bar dataKey="debtor" name="Debtor" stackId="a" fill="#B45309" />
                <Bar
                  dataKey="cash"
                  name="Cash"
                  stackId="a"
                  fill="#6B7280"
                  radius={[0, 4, 4, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-1 flex gap-4 text-xs text-muted-foreground">
              <LegendSwatch label="Card" color="#C05A2A" />
              {detail.fuelSales.debtor.count > 0 && (
                <LegendSwatch label="Debtor" color="#B45309" />
              )}
              <LegendSwatch label="Cash" color="#6B7280" />
            </div>
          </div>
          <div className="space-y-0.5">
            <DetailRow
              label="Card"
              count={detail.fuelSales.card.count}
              amount={formatRand(detail.fuelSales.card.amount)}
            />
            {detail.fuelSales.debtor.count > 0 && (
              <DetailRow
                label="Debtor / Account"
                count={detail.fuelSales.debtor.count}
                amount={formatRand(detail.fuelSales.debtor.amount)}
              />
            )}
            <DetailRow
              label="Cash"
              count={detail.fuelSales.cash.count}
              amount={formatRand(detail.fuelSales.cash.amount)}
            />
            <DetailRow
              label="Total"
              count={detail.fuelSales.total.count}
              amount={formatRand(detail.fuelSales.total.amount)}
              bold
            />
          </div>
        </DetailCard>

        <DetailCard title="Bank transactions">
          {banks.length > 1 && (
            <div className="mb-3">
              <ResponsiveContainer width="100%" height={32}>
                <BarChart
                  layout="vertical"
                  data={[
                    banks.reduce(
                      (acc, bank) => ({ ...acc, [bank.bankName]: bank.approvedAmount }),
                      {} as Record<string, number>,
                    ),
                  ]}
                  stackOffset="expand"
                  barSize={20}
                >
                  <XAxis type="number" hide />
                  <YAxis type="category" hide />
                  <Tooltip
                    content={({ payload }) => {
                      if (!payload?.length) return null;
                      return (
                        <div className="rounded-lg border border-border bg-card px-2 py-1 text-xs shadow-sm">
                          {payload.map((entry) => (
                            <div key={entry.name} className="flex gap-2">
                              <span style={{ color: entry.color }}>{entry.name}</span>
                              <span className="tabular-nums">
                                {formatRand(entry.value as number)}
                              </span>
                            </div>
                          ))}
                        </div>
                      );
                    }}
                  />
                  {banks.map((bank, index) => (
                    <Bar
                      key={bank.bankName}
                      dataKey={bank.bankName}
                      name={bank.bankName}
                      stackId="a"
                      fill={getBankColor(bank.bankName)}
                      radius={[
                        index === 0 ? 4 : 0,
                        index === banks.length - 1 ? 4 : 0,
                        index === banks.length - 1 ? 4 : 0,
                        index === 0 ? 4 : 0,
                      ]}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-1 flex gap-4 text-xs text-muted-foreground">
                {banks.map((bank) => (
                  <LegendSwatch
                    key={bank.bankName}
                    label={bank.bankName}
                    color={getBankColor(bank.bankName)}
                  />
                ))}
              </div>
            </div>
          )}
          <div className="space-y-0.5">
            <DetailRow label="Matchable" count={detail.bankTransactions.matchableCount} />
            {detail.bankTransactions.outsideDateRange.count > 0 && (
              <DetailRow
                label="Outside date range"
                count={detail.bankTransactions.outsideDateRange.count}
                amount={formatRand(detail.bankTransactions.outsideDateRange.amount)}
              />
            )}
            {detail.bankTransactions.excluded.count > 0 && (
              <DetailRow
                label="Excluded (declined/reversed)"
                count={detail.bankTransactions.excluded.count}
                amount={formatRand(detail.bankTransactions.excluded.amount)}
              />
            )}
            <DetailRow
              label="Total"
              count={detail.bankTransactions.totalCount}
              bold
            />
          </div>

          {banks.length > 0 && (
            <div className="mt-3 border-t border-[#E5E3DC]/50 pt-3">
              <table className="w-full text-xs">
                <thead>
                  <tr>
                    <th className="py-1 pr-2 text-left text-xs font-medium text-muted-foreground"></th>
                    {banks.map((bank) => (
                      <th
                        key={bank.bankName}
                        className="px-1 py-1 text-right text-xs font-medium text-muted-foreground"
                      >
                        {bank.bankName}
                      </th>
                    ))}
                    <th className="py-1 pl-1 text-right text-xs font-medium text-muted-foreground">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <BankMatrixRow
                    label="Approved"
                    totals={detail.bankTransactions.totals.approvedCount}
                    values={banks.map((bank) => bank.approvedCount)}
                  />
                  {detail.bankTransactions.totals.declinedCount > 0 && (
                    <BankMatrixRow
                      label="Declined"
                      totals={detail.bankTransactions.totals.declinedCount}
                      values={banks.map((bank) => bank.declinedCount)}
                    />
                  )}
                  {detail.bankTransactions.totals.cancelledCount > 0 && (
                    <BankMatrixRow
                      label="Cancelled"
                      totals={detail.bankTransactions.totals.cancelledCount}
                      values={banks.map((bank) => bank.cancelledCount)}
                    />
                  )}
                </tbody>
              </table>
            </div>
          )}
        </DetailCard>

        <DetailCard title="Fuel card sales matching">
          <div className="mb-3">
            <ResponsiveContainer width="100%" height={32}>
              <BarChart
                layout="vertical"
                data={[
                  {
                    matched: detail.matching.matchedCardCount,
                    unmatched: detail.matching.unmatchedCardCount,
                  },
                ]}
                stackOffset="expand"
                barSize={20}
              >
                <XAxis type="number" hide />
                <YAxis type="category" hide />
                <Tooltip
                  content={({ payload }) => {
                    if (!payload?.length) return null;
                    return (
                      <div className="rounded-lg border border-border bg-card px-2 py-1 text-xs shadow-sm">
                        {payload.map((entry) => (
                          <div key={entry.name} className="flex gap-2">
                            <span style={{ color: entry.color }}>{entry.name}</span>
                            <span className="tabular-nums">{entry.value}</span>
                          </div>
                        ))}
                      </div>
                    );
                  }}
                />
                <Bar
                  dataKey="matched"
                  name="Matched"
                  stackId="a"
                  fill="#166534"
                  radius={[4, 0, 0, 4]}
                />
                <Bar
                  dataKey="unmatched"
                  name="Unmatched"
                  stackId="a"
                  fill="#B45309"
                  radius={[0, 4, 4, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-1 flex gap-4 text-xs text-muted-foreground">
              <LegendSwatch label="Matched" color="#166534" />
              <LegendSwatch label="Unmatched" color="#B45309" />
            </div>
          </div>
          <div className="space-y-0.5">
            <DetailRow
              label="Matched fuel card sales"
              count={detail.matching.matchedCardCount}
            />
            <DetailRow
              label="Unmatched fuel card sales"
              count={detail.matching.unmatchedCardCount}
            />
            <DetailRow
              label="Fuel card sales match rate"
              value={`${detail.matching.cardMatchPct}%`}
              bold
            />
          </div>
        </DetailCard>

        <DetailCard title="Fuel card sales reconciliation">
          <div className="space-y-0.5">
            <DetailRow
              label="Bank approved amount"
              amount={formatRand(detail.reconciliation.bankApprovedAmount)}
            />
            <DetailRow
              label="Fuel card sales amount"
              amount={formatRand(detail.reconciliation.fuelCardSalesAmount)}
            />
            <DetailRow
              label="Surplus / shortfall"
              amount={formatRand(detail.reconciliation.fileSurplus)}
              bold
              highlight={detail.reconciliation.fileSurplus !== 0}
            />
          </div>
        </DetailCard>

        <DetailCard title="Surplus / shortfall analysis">
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground/50">
            Matched amount variance
          </p>
          <div className="space-y-0.5">
            <DetailRow
              label="Matched fuel amount (both sides in period)"
              amount={formatRand(detail.surplusAnalysis.matchedFuelInPeriod)}
            />
            <DetailRow
              label="Matched bank amount"
              amount={formatRand(detail.surplusAnalysis.matchedBankAmount)}
            />
            <DetailRow
              label="Variance"
              amount={formatRand(detail.surplusAnalysis.matchedVariance)}
              bold
              highlight={detail.surplusAnalysis.matchedVariance !== 0}
            />
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground/60">
            Difference between bank and fuel on matched pairs where both sides fall
            inside the period. Usually small (pump calibration, rounding, or match
            tolerance).
          </p>

          <SurplusSection
            title="Fuel matched to bank outside period"
            label="In-period fuel card sales matched to out-of-period bank"
            amount={detail.surplusAnalysis.lagFuelAmount}
            description="Often settlement lag, but could also be a false match - verify before assuming."
          />
          <SurplusSection
            title="Fuel card sales with no bank match, within bank coverage"
            label="Unmatched fuel with bank data available for that date"
            amount={detail.surplusAnalysis.unmatchedFuelCoveredAmount}
            description="Bank data covers these dates but no match was found - real gaps to investigate."
          />
          <SurplusSection
            title="Fuel card sales with no bank match, outside bank coverage"
            label="Unmatched fuel for dates with no uploaded bank data"
            amount={detail.surplusAnalysis.unmatchedFuelUncoveredAmount}
            description={
              detail.surplusAnalysis.tenantBankCoverage
                ? `No bank data uploaded for these fuel dates (bank coverage: ${detail.surplusAnalysis.tenantBankCoverage.min} to ${detail.surplusAnalysis.tenantBankCoverage.max}).`
                : "No bank data uploaded yet for this property."
            }
          />
          <SurplusSection
            title="Bank with no fuel match"
            label="In-period bank amount with no fuel match"
            amount={detail.surplusAnalysis.unmatchedBankAmount}
            description="Bank deposits with no fuel sale to explain them - investigate."
          />
          <SurplusSection
            title="Bank matched to fuel outside period"
            label="In-period bank matched to out-of-period fuel (lag-explained)"
            amount={detail.surplusAnalysis.lagExplainedBankAmount}
            description="Bank deposits this period that explain fuel sales from a prior period."
          />

          <div className="mx-[-1rem] mt-3 rounded-b-xl bg-[#E5E3DC]/30 px-4 pb-2 pt-2">
            <DetailRow
              label="Total surplus / shortfall"
              amount={formatRand(detail.surplusAnalysis.totalSurplusShortfall)}
              bold
              highlight={detail.surplusAnalysis.totalSurplusShortfall !== 0}
            />
          </div>
        </DetailCard>

        {detail.surplusAnalysis.excludedBankAmount > 0 && (
          <DetailCard title="Excluded bank transactions">
            <DetailRow
              label="Excluded bank amount"
              amount={formatRand(detail.surplusAnalysis.excludedBankAmount)}
            />
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground/60">
              Declined, cancelled, or reversed transactions excluded from reconciliation.
            </p>
          </DetailCard>
        )}
      </div>
    );
  }

  if (view === "attendants") {
    return (
      <div className="mx-auto">
        {backHeader(
          "Attendants",
          "Performance by attendant. Sales totals, match rates, and flagged transactions per person.",
        )}
        <AttendantReport
          data={attendants}
          isLoading={false}
          formatRandExact={formatRand}
          onJumpToDeclined={() => setView("declined")}
        />
      </div>
    );
  }

  if (view === "declined") {
    return (
      <div className="mx-auto space-y-4">
        {backHeader(
          "Declined card transactions",
          "Transactions declined at point of sale. Patterns by card type, pump, time of day.",
        )}

        {!declines.hasDeclined ? (
          <Card className="border-[#E5E3DC] bg-section">
            <CardContent className="pb-8 pt-8 text-center">
              <p className="text-sm text-muted-foreground">
                No declined or cancelled transactions in this period.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <DetailCard title="Decline summary" summary>
              <div className="space-y-0.5">
                <DetailRow
                  label="Total declined / cancelled"
                  count={declines.summary.totalDeclined}
                  amount={formatRand(declines.summary.totalDeclinedAmount)}
                />
              </div>

              {declines.banks.map((bank) => (
                <div key={bank.bankName} className="flex items-center justify-between pl-3 text-xs">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: getBankColor(bank.bankName) }}
                    />
                    {bank.bankName}
                  </span>
                  <div className="flex items-center gap-4">
                    <span className="w-10 text-right tabular-nums text-muted-foreground">
                      {bank.count.toLocaleString()}
                    </span>
                    <span className="min-w-[100px] text-right tabular-nums text-muted-foreground">
                      {formatRand(bank.amount)}
                    </span>
                  </div>
                </div>
              ))}

              <Separator className="my-3" />
              <div className="space-y-0.5">
                <DetailRow
                  label="Resubmitted successfully"
                  count={declines.summary.resubmittedCount}
                  amount={formatRand(declines.summary.resubmittedAmount)}
                />
              </div>
              <Separator className="my-3" />
              <DetailRow
                label="Net unrecovered"
                count={declines.summary.unrecoveredCount}
                amount={formatRand(declines.summary.netUnrecoveredAmount)}
                bold
                highlight={declines.summary.netUnrecoveredAmount > 0}
              />
            </DetailCard>

            <div className="space-y-3">
              {declines.groups.map((group) => (
                <DetailCard key={group.cardLabel} title={`Card ${group.cardLabel}`}>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                      {group.bankName} - {group.transactionCount} transaction
                      {group.transactionCount !== 1 ? "s" : ""}
                      {group.attendant && (
                        <>
                          {" "} - Attendant:{" "}
                          <span className="font-medium text-foreground">
                            {group.attendant}
                          </span>
                        </>
                      )}
                    </span>
                    <span
                      className={cn(
                        "text-sm font-medium",
                        group.statusLabel === "Unrecovered"
                          ? "text-[#B45309]"
                          : "text-[#166534]",
                      )}
                    >
                      {group.statusLabel}
                    </span>
                    {group.badges.map((badge) => (
                      <span
                        key={`${group.cardLabel}-${badge.label}`}
                        className={cn(
                          "rounded-full px-2 py-0.5 text-xs font-medium",
                          badge.severity === "high"
                            ? "bg-[#B91C1C]/10 text-[#B91C1C]"
                            : badge.severity === "medium"
                              ? "bg-[#B45309]/10 text-[#B45309]"
                              : "bg-muted text-muted-foreground",
                        )}
                      >
                        {badge.label}
                      </span>
                    ))}
                  </div>
                  <div className="space-y-1">
                    {group.items.map((item) => (
                      <div
                        key={item.id}
                        className={cn(
                          "border-l-2 py-1 pl-2",
                          item.isRecovered ? "border-[#166534]/30" : "border-[#B45309]",
                        )}
                      >
                        <div className="flex items-center justify-between text-sm">
                          <span className={cn(item.isRecovered && "text-muted-foreground")}>
                            {item.type} {formatRand(item.amount)} at {item.time}
                          </span>
                          <span
                            className={cn(
                              "ml-3 shrink-0 tabular-nums",
                              item.isRecovered
                                ? "text-muted-foreground line-through"
                                : "font-medium text-[#B45309]",
                            )}
                          >
                            {formatRand(item.amount)}
                          </span>
                        </div>
                        {item.outcomeLabel && (
                          <div className="mt-1 flex items-center justify-between pl-4 text-sm font-semibold">
                            <span>{item.outcomeLabel}</span>
                            {item.outcomeType === "shortfall" ? (
                              <span className="ml-3 shrink-0 text-[#B45309]">
                                <span className="mr-1 text-xs">Shortfall</span>
                                <span className="tabular-nums">
                                  {formatRand(item.shortfall)}
                                </span>
                              </span>
                            ) : item.recoveredAmount > 0 ? (
                              <span className="ml-3 shrink-0 text-[#166534]">
                                <span className="mr-1 text-xs">Recovered</span>
                                <span className="tabular-nums">
                                  {formatRand(item.recoveredAmount)}
                                </span>
                              </span>
                            ) : null}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </DetailCard>
              ))}
            </div>
          </>
        )}
      </div>
    );
  }

  return null;
}

function LandingCard({
  icon,
  title,
  description,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <Card className="cursor-pointer transition-colors hover:border-foreground/20" onClick={onClick}>
      <CardContent className="space-y-3 p-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-section">
          {icon}
        </div>
        <div>
          <h3 className="font-semibold">{title}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        </div>
        <div className="flex items-center gap-1 text-sm font-medium text-[#B45309]">
          View report <ChevronRight className="h-4 w-4" />
        </div>
      </CardContent>
    </Card>
  );
}

function DisabledLandingCard({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Card className="opacity-60">
      <CardContent className="space-y-3 p-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-section">
          {icon}
        </div>
        <div>
          <h3 className="font-semibold">{title}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        </div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Coming Soon
        </p>
      </CardContent>
    </Card>
  );
}

function LegendSwatch({ label, color }: { label: string; color: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

function BankMatrixRow({
  label,
  values,
  totals,
}: {
  label: string;
  values: number[];
  totals: number;
}) {
  return (
    <tr>
      <td className="py-0.5 pr-2 text-xs text-muted-foreground">{label}</td>
      {values.map((value, index) => (
        <td key={`${label}-${index}`} className="px-1 py-0.5 text-right text-xs tabular-nums text-muted-foreground">
          {value || "-"}
        </td>
      ))}
      <td className="py-0.5 pl-1 text-right text-xs font-medium tabular-nums">
        {totals}
      </td>
    </tr>
  );
}

function SurplusSection({
  title,
  label,
  amount,
  description,
}: {
  title: string;
  label: string;
  amount: number;
  description: string;
}) {
  return (
    <div className="mt-3 border-t border-[#E5E3DC]/50 pt-3">
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground/50">
        {title}
      </p>
      <div className="space-y-0.5">
        <DetailRow
          label={label}
          amount={formatRand(amount)}
          bold
          highlight={amount > 0}
        />
      </div>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground/60">
        {description}
      </p>
    </div>
  );
}

function DetailCard({
  title,
  children,
  summary,
}: {
  title: string;
  children: ReactNode;
  summary?: boolean;
}) {
  return (
    <div className={cn("rounded-xl p-4", summary ? "border border-[#E5E3DC] bg-card" : "bg-section")}>
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
        {title}
      </h3>
      {children}
    </div>
  );
}

function DetailRow({
  label,
  count,
  amount,
  value,
  bold,
  highlight,
}: {
  label: string;
  count?: number;
  amount?: string;
  value?: string;
  bold?: boolean;
  highlight?: boolean;
}) {
  return (
    <div className={cn("flex items-center justify-between py-0.5 text-sm", bold && "font-medium")}>
      <span>{label}</span>
      <div className="flex items-center gap-4">
        {count !== undefined && (
          <span className="w-10 text-right tabular-nums text-muted-foreground">
            {count.toLocaleString()}
          </span>
        )}
        {amount && (
          <span
            className={cn(
              "min-w-[100px] text-right tabular-nums",
              highlight && "text-[#B45309]",
            )}
          >
            {amount}
          </span>
        )}
        {value && <span className="min-w-[100px] text-right tabular-nums">{value}</span>}
      </div>
    </div>
  );
}
