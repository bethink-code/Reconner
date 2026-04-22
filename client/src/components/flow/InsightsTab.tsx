import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
  AlertTriangle,
  Shield,
  CheckCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatRand } from "@/lib/format";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { getBankColor } from "@/lib/bankColors";
import { AttendantReport, type AttendantSummaryRow } from "./AttendantReport";
import type { PeriodSummary } from "@/lib/reconciliation-types";
import { deriveSummaryStats } from "@/lib/reconciliation-utils";

interface InsightsTabProps {
  periodId: string;
  initialView?: 'landing' | 'detail' | 'attendants' | 'declined';
}

export function InsightsTab({ periodId, initialView }: InsightsTabProps) {
  const [view, setView] = useState<'landing' | 'detail' | 'attendants' | 'declined'>(initialView || 'landing');

  const { data: summary, isLoading } = useQuery<PeriodSummary>({
    queryKey: ["/api/periods", periodId, "summary"],
    enabled: !!periodId,
  });

  const { data: attendantData, isLoading: attendantLoading } = useQuery<AttendantSummaryRow[]>({
    queryKey: ["/api/periods", periodId, "attendant-summary"],
    enabled: !!periodId,
  });

  const { data: declineData, isLoading: declineLoading } = useQuery<{
    summary: { totalDeclined: number; resubmittedCount: number; unrecoveredCount: number; netUnrecoveredAmount: number; totalDeclinedAmount: number };
    transactions: { id: string; date: string; time: string; amount: number; bank: string; cardNumber: string; description: string; type: string; note: string; recoveredAmount: number; isRecovered: boolean; attendant: string | null; cashier: string | null }[];
    suspicious: { pattern: string; severity: 'high' | 'medium' | 'low'; detail: string; cardNumber: string; amount: number; shortfall: number; attendant: string | null }[];
  }>({
    queryKey: ["/api/periods", periodId, "decline-analysis"],
    enabled: !!periodId,
  });

  if (isLoading || !summary) {
    return (
      <div className="space-y-4 mx-auto">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-48 w-full" />)}
        </div>
      </div>
    );
  }

  const banks = summary.perBankBreakdown || [];
  const totals = banks.reduce((acc, b) => ({
    declinedCount: acc.declinedCount + b.declinedCount,
    declinedAmount: acc.declinedAmount + b.declinedAmount,
    cancelledCount: acc.cancelledCount + b.cancelledCount,
    cancelledAmount: acc.cancelledAmount + b.cancelledAmount,
    approvedCount: acc.approvedCount + b.approvedCount,
    approvedAmount: acc.approvedAmount + b.approvedAmount,
  }), { declinedCount: 0, declinedAmount: 0, cancelledCount: 0, cancelledAmount: 0, approvedCount: 0, approvedAmount: 0 });

  const {
    unmatchableBank, excludedBank, matchableBankTotal, unmatchedBank, cardMatchPct,
    matchedCardCount, unmatchedFuelCount,
    cardOnly, cardOnlyAmount, bankApprovedAmount, fileSurplus,
    matchedSurplus, unmatchedBankAmt, unmatchedFuelCardAmount, totalFuelCardReconciled,
    reconSurplus, outsideRangeAmt,
    matchedFuelInPeriod, lagFuelAmount, unmatchedFuelCoveredAmount, unmatchedFuelUncoveredAmount,
    lagExplainedBankAmount, matchedVariance, tenantBankCoverage,
  } = deriveSummaryStats(summary);

  // ═══════════════════════════════════════════════════════════
  //  BACK HEADER for sub-views
  // ═══════════════════════════════════════════════════════════
  const BackHeader = ({ title, description }: { title: string; description?: string }) => (
    <div className="mb-4">
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setView('landing')}
        className="mb-3"
      >
        <ArrowLeft className="h-4 w-4 mr-1" />
        Back to Insights
      </Button>
      <div className="px-3 py-4">
        <h2 className="text-2xl font-heading font-semibold text-[#1A1200]">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
    </div>
  );

  // ═══════════════════════════════════════════════════════════
  //  LANDING — Report cards
  // ═══════════════════════════════════════════════════════════
  if (view === 'landing') {
    return (
      <div className="mx-auto space-y-6">
        <div className="px-3 py-4">
          <h2 className="text-2xl font-heading font-semibold text-[#1A1200]">Insights</h2>
          <p className="text-sm text-muted-foreground">Reports and analysis for this reconciliation period</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Detail report */}
          <Card className="cursor-pointer hover:border-foreground/20 transition-colors" onClick={() => setView('detail')}>
            <CardContent className="p-5 space-y-3">
              <div className="w-10 h-10 rounded-lg bg-section flex items-center justify-center">
                <FileText className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <h3 className="font-semibold">Reconciliation overview</h3>
                <p className="text-xs text-muted-foreground mt-1">Fuel card sales reconciliation, surplus/shortfall analysis, and full transaction-level breakdown.</p>
              </div>
              <div className="flex items-center gap-1 text-sm font-medium text-[#B45309]">
                View report <ChevronRight className="h-4 w-4" />
              </div>
            </CardContent>
          </Card>

          {/* Attendants report */}
          <Card className="cursor-pointer hover:border-foreground/20 transition-colors" onClick={() => setView('attendants')}>
            <CardContent className="p-5 space-y-3">
              <div className="w-10 h-10 rounded-lg bg-section flex items-center justify-center">
                <Users className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <h3 className="font-semibold">Attendants</h3>
                <p className="text-xs text-muted-foreground mt-1">Performance by attendant. Sales totals, match rates, and flagged transactions per person.</p>
              </div>
              <div className="flex items-center gap-1 text-sm font-medium text-[#B45309]">
                View report <ChevronRight className="h-4 w-4" />
              </div>
            </CardContent>
          </Card>

          {/* Declined report */}
          <Card className="cursor-pointer hover:border-foreground/20 transition-colors" onClick={() => setView('declined')}>
            <CardContent className="p-5 space-y-3">
              <div className="w-10 h-10 rounded-lg bg-section flex items-center justify-center">
                <MinusCircle className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <h3 className="font-semibold">Declined card transactions</h3>
                <p className="text-xs text-muted-foreground mt-1">Transactions declined at point of sale. Patterns by card type, pump, time of day.</p>
              </div>
              <div className="flex items-center gap-1 text-sm font-medium text-[#B45309]">
                View report <ChevronRight className="h-4 w-4" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Coming soon */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card className="opacity-60">
            <CardContent className="p-5 space-y-3">
              <div className="w-10 h-10 rounded-lg bg-section flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <h3 className="font-semibold">Trends</h3>
                <p className="text-xs text-muted-foreground mt-1">Match rate and discrepancy patterns over time across periods.</p>
              </div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Coming Soon</p>
            </CardContent>
          </Card>

          <Card className="opacity-60">
            <CardContent className="p-5 space-y-3">
              <div className="w-10 h-10 rounded-lg bg-section flex items-center justify-center">
                <BarChart3 className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <h3 className="font-semibold">Pump performance</h3>
                <p className="text-xs text-muted-foreground mt-1">Sales and discrepancies broken down by pump number.</p>
              </div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Coming Soon</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════
  //  DETAIL SUB-VIEW
  // ═══════════════════════════════════════════════════════════
  if (view === 'detail') {
    return (
      <div className="mx-auto space-y-4">
        <BackHeader
          title="Reconciliation overview"
          description="Fuel card sales reconciliation, surplus/shortfall analysis, and full transaction-level breakdown."
        />

        {/* Fuel Sales */}
        <DetailCard title="Fuel sales">
          <div className="mb-3">
            <ResponsiveContainer width="100%" height={32}>
              <BarChart layout="vertical" data={[{ card: cardOnlyAmount, debtor: summary.debtorFuelAmount, cash: summary.cashFuelAmount }]} stackOffset="expand" barSize={20}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" hide />
                <Tooltip content={({ payload }) => {
                  if (!payload?.length) return null;
                  return (<div className="bg-card border border-border rounded-lg px-2 py-1 text-xs shadow-sm">{payload.map(p => (<div key={p.name} className="flex gap-2"><span style={{ color: p.color }}>{p.name}</span><span className="tabular-nums">{formatRand(p.value as number)}</span></div>))}</div>);
                }} />
                <Bar dataKey="card" name="Card" stackId="a" fill="#C05A2A" radius={[4, 0, 0, 4]} />
                <Bar dataKey="debtor" name="Debtor" stackId="a" fill="#B45309" />
                <Bar dataKey="cash" name="Cash" stackId="a" fill="#6B7280" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <div className="flex gap-4 text-xs text-muted-foreground mt-1">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-[#C05A2A]" />Card</span>
              {summary.debtorFuelTransactions > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-[#B45309]" />Debtor</span>}
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-[#6B7280]" />Cash</span>
            </div>
          </div>
          <div className="space-y-0.5">
            <DetailRow label="Card" count={cardOnly} amount={formatRand(cardOnlyAmount)} />
            {summary.debtorFuelTransactions > 0 && <DetailRow label="Debtor / Account" count={summary.debtorFuelTransactions} amount={formatRand(summary.debtorFuelAmount)} />}
            <DetailRow label="Cash" count={summary.cashFuelTransactions} amount={formatRand(summary.cashFuelAmount)} />
            <DetailRow label="Total" count={summary.fuelTransactions} amount={formatRand(summary.totalFuelAmount)} bold />
          </div>
        </DetailCard>

        {/* Bank Transactions */}
        <DetailCard title="Bank transactions">
          {banks.length > 1 && (
            <div className="mb-3">
              <ResponsiveContainer width="100%" height={32}>
                <BarChart layout="vertical" data={[banks.reduce((acc, b) => ({ ...acc, [b.bankName]: b.approvedAmount }), {} as Record<string, number>)]} stackOffset="expand" barSize={20}>
                  <XAxis type="number" hide />
                  <YAxis type="category" hide />
                  <Tooltip content={({ payload }) => {
                    if (!payload?.length) return null;
                    return (<div className="bg-card border border-border rounded-lg px-2 py-1 text-xs shadow-sm">{payload.map(p => (<div key={p.name} className="flex gap-2"><span style={{ color: p.color }}>{p.name}</span><span className="tabular-nums">{formatRand(p.value as number)}</span></div>))}</div>);
                  }} />
                  {banks.map((b, i) => (
                    <Bar key={b.bankName} dataKey={b.bankName} name={b.bankName} stackId="a" fill={getBankColor(b.bankName)} radius={[i === 0 ? 4 : 0, i === banks.length - 1 ? 4 : 0, i === banks.length - 1 ? 4 : 0, i === 0 ? 4 : 0]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
              <div className="flex gap-4 text-xs text-muted-foreground mt-1">
                {banks.map(b => (<span key={b.bankName} className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm" style={{ backgroundColor: getBankColor(b.bankName) }} />{b.bankName}</span>))}
              </div>
            </div>
          )}
          <div className="space-y-0.5">
            <DetailRow label="Matchable" count={matchableBankTotal} />
            {(summary.unmatchableBankTransactions || 0) > 0 && <DetailRow label="Outside date range" count={summary.unmatchableBankTransactions || 0} amount={formatRand(outsideRangeAmt)} />}
            {(summary.excludedBankTransactions || 0) > 0 && <DetailRow label="Excluded (declined/reversed)" count={summary.excludedBankTransactions || 0} />}
            <DetailRow label="Total" count={summary.bankTransactions} bold />
          </div>

          {banks.length > 0 && (
            <div className="mt-3 pt-3 border-t border-[#E5E3DC]/50">
              <table className="w-full text-xs">
                <thead>
                  <tr>
                    <th className="text-left py-1 pr-2 font-medium text-muted-foreground text-xs"></th>
                    {banks.map(b => (<th key={b.bankName} className="text-right py-1 px-1 font-medium text-muted-foreground text-xs">{b.bankName}</th>))}
                    <th className="text-right py-1 pl-1 font-medium text-muted-foreground text-xs">Total</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="py-0.5 pr-2 text-xs text-muted-foreground">Approved</td>
                    {banks.map(b => (<td key={b.bankName} className="text-right px-1 py-0.5 tabular-nums text-xs">{b.approvedCount || '-'}</td>))}
                    <td className="text-right pl-1 py-0.5 tabular-nums text-xs font-medium">{totals.approvedCount}</td>
                  </tr>
                  {totals.declinedCount > 0 && (
                    <tr>
                      <td className="py-0.5 pr-2 text-xs text-muted-foreground">Declined</td>
                      {banks.map(b => (<td key={b.bankName} className="text-right px-1 py-0.5 tabular-nums text-xs text-muted-foreground">{b.declinedCount || '-'}</td>))}
                      <td className="text-right pl-1 py-0.5 tabular-nums text-xs text-muted-foreground">{totals.declinedCount}</td>
                    </tr>
                  )}
                  {totals.cancelledCount > 0 && (
                    <tr>
                      <td className="py-0.5 pr-2 text-xs text-muted-foreground">Cancelled</td>
                      {banks.map(b => (<td key={b.bankName} className="text-right px-1 py-0.5 tabular-nums text-xs text-muted-foreground">{b.cancelledCount || '-'}</td>))}
                      <td className="text-right pl-1 py-0.5 tabular-nums text-xs text-muted-foreground">{totals.cancelledCount}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </DetailCard>

        {/* Matching */}
        <DetailCard title="Fuel card sales matching">
          <div className="mb-3">
            <ResponsiveContainer width="100%" height={32}>
              <BarChart layout="vertical" data={[{ matched: matchedCardCount, unmatched: Math.max(0, unmatchedFuelCount) }]} stackOffset="expand" barSize={20}>
                <XAxis type="number" hide />
                <YAxis type="category" hide />
                <Tooltip content={({ payload }) => {
                  if (!payload?.length) return null;
                  return (<div className="bg-card border border-border rounded-lg px-2 py-1 text-xs shadow-sm">{payload.map(p => (<div key={p.name} className="flex gap-2"><span style={{ color: p.color }}>{p.name}</span><span className="tabular-nums">{p.value}</span></div>))}</div>);
                }} />
                <Bar dataKey="matched" name="Matched" stackId="a" fill="#166534" radius={[4, 0, 0, 4]} />
                <Bar dataKey="unmatched" name="Unmatched" stackId="a" fill="#B45309" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <div className="flex gap-4 text-xs text-muted-foreground mt-1">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-[#166534]" />Matched</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-[#B45309]" />Unmatched</span>
            </div>
          </div>
          <div className="space-y-0.5">
            <DetailRow label="Fuel card sales match rate" value={`${cardMatchPct}%`} />
            <DetailRow label="Matched fuel card sales transactions" count={matchedCardCount} />
            <DetailRow label="Unmatched fuel card sales transactions" count={Math.max(0, unmatchedFuelCount)} highlight={unmatchedFuelCount > 0} />
          </div>
        </DetailCard>

        {/* Card Sales Reconciliation — top-level gap */}
        <DetailCard title="Fuel card sales reconciliation">
          <div className="space-y-0.5">
            <DetailRow label="Bank approved amount" amount={formatRand(bankApprovedAmount)} />
            <DetailRow label="Fuel card sales" amount={formatRand(cardOnlyAmount)} />
          </div>
          <div className="mt-2 pt-2 border-t border-[#E5E3DC]/50">
            <DetailRow label="Surplus / shortfall" amount={formatRand(fileSurplus)} bold highlight={fileSurplus !== 0} />
          </div>
          <p className="text-xs text-muted-foreground/60 mt-2 leading-relaxed">
            The surplus/shortfall breaks down into six factual buckets below. Each bucket contributes a signed amount that sums to the total above.
          </p>
        </DetailCard>

        {/* Surplus / Shortfall Analysis — 6-bucket factual breakdown */}
        <DetailCard title="Surplus / shortfall analysis">
          {/* Bucket 1: Matched amount variance */}
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/50 mb-1.5">Matched amount variance</p>
          <div className="space-y-0.5">
            <DetailRow label="Matched fuel amount (both sides in period)" amount={formatRand(matchedFuelInPeriod)} />
            <DetailRow label="Matched bank amount" amount={formatRand(summary.matchedBankAmount)} />
            <DetailRow label="Variance" amount={formatRand(matchedVariance)} bold highlight={matchedVariance !== 0} />
          </div>
          <p className="text-xs text-muted-foreground/60 mt-1 leading-relaxed">
            Difference between bank and fuel on matched pairs where both sides fall inside the period. Usually small (pump calibration, rounding, or match tolerance).
          </p>

          {/* Bucket 2: Fuel matched to bank outside period */}
          <div className="mt-3 pt-3 border-t border-[#E5E3DC]/50">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/50 mb-1.5">Fuel matched to bank outside period</p>
            <div className="space-y-0.5">
              <DetailRow label="In-period fuel card sales matched to out-of-period bank" amount={formatRand(lagFuelAmount)} bold highlight={lagFuelAmount > 0} />
            </div>
            <p className="text-xs text-muted-foreground/60 mt-1 leading-relaxed">
              Often settlement lag, but could also be a false match — verify before assuming.
            </p>
          </div>

          {/* Bucket 3: Unmatched fuel, within bank coverage */}
          <div className="mt-3 pt-3 border-t border-[#E5E3DC]/50">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/50 mb-1.5">Fuel card sales with no bank match, within bank coverage</p>
            <div className="space-y-0.5">
              <DetailRow label="Unmatched fuel with bank data available for that date" amount={formatRand(unmatchedFuelCoveredAmount)} bold highlight={unmatchedFuelCoveredAmount > 0} />
            </div>
            <p className="text-xs text-muted-foreground/60 mt-1 leading-relaxed">
              Bank data covers these dates but no match was found — real gaps to investigate.
            </p>
          </div>

          {/* Bucket 4: Unmatched fuel, outside bank coverage */}
          <div className="mt-3 pt-3 border-t border-[#E5E3DC]/50">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/50 mb-1.5">Fuel card sales with no bank match, outside bank coverage</p>
            <div className="space-y-0.5">
              <DetailRow label="Unmatched fuel for dates with no uploaded bank data" amount={formatRand(unmatchedFuelUncoveredAmount)} bold highlight={unmatchedFuelUncoveredAmount > 0} />
            </div>
            <p className="text-xs text-muted-foreground/60 mt-1 leading-relaxed">
              {tenantBankCoverage
                ? `No bank data uploaded for these fuel dates (bank coverage: ${tenantBankCoverage.min} to ${tenantBankCoverage.max}).`
                : "No bank data uploaded yet for this property."}
            </p>
          </div>

          {/* Bucket 5: Bank with no fuel match */}
          <div className="mt-3 pt-3 border-t border-[#E5E3DC]/50">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/50 mb-1.5">Bank with no fuel match</p>
            <div className="space-y-0.5">
              <DetailRow label="In-period bank amount with no fuel match" amount={formatRand(unmatchedBankAmt)} bold highlight={unmatchedBankAmt > 0} />
            </div>
            <p className="text-xs text-muted-foreground/60 mt-1 leading-relaxed">
              Bank deposits with no fuel sale to explain them — investigate.
            </p>
          </div>

          {/* Bucket 6: Bank matched to fuel outside period */}
          <div className="mt-3 pt-3 border-t border-[#E5E3DC]/50">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/50 mb-1.5">Bank matched to fuel outside period</p>
            <div className="space-y-0.5">
              <DetailRow label="In-period bank matched to out-of-period fuel (lag-explained)" amount={formatRand(lagExplainedBankAmount)} bold highlight={lagExplainedBankAmount > 0} />
            </div>
            <p className="text-xs text-muted-foreground/60 mt-1 leading-relaxed">
              Bank deposits this period that explain fuel sales from a prior period.
            </p>
          </div>

          {/* Total verification */}
          <div className="mt-3 pt-2 bg-[#E5E3DC]/30 -mx-4 px-4 pb-2 rounded-b-xl">
            <DetailRow
              label="Total surplus / shortfall"
              amount={formatRand(
                matchedVariance
                - lagFuelAmount
                - unmatchedFuelCoveredAmount
                - unmatchedFuelUncoveredAmount
                + unmatchedBankAmt
                + lagExplainedBankAmount
              )}
              bold
              highlight={(matchedVariance - lagFuelAmount - unmatchedFuelCoveredAmount - unmatchedFuelUncoveredAmount + unmatchedBankAmt + lagExplainedBankAmount) !== 0}
            />
          </div>
        </DetailCard>

        {/* Excluded bank — informational */}
        {(summary.excludedBankAmount || 0) > 0 && (
          <DetailCard title="Excluded bank transactions">
            <DetailRow label="Excluded bank amount" amount={formatRand(summary.excludedBankAmount || 0)} />
            <p className="text-xs text-muted-foreground/60 mt-1 leading-relaxed">
              Declined, cancelled, or reversed transactions excluded from reconciliation.
            </p>
          </DetailCard>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════
  //  ATTENDANTS SUB-VIEW
  // ═══════════════════════════════════════════════════════════
  if (view === 'attendants') {
    return (
      <div className="mx-auto">
        <BackHeader
          title="Attendants"
          description="Performance by attendant. Sales totals, match rates, and flagged transactions per person."
        />
        <AttendantReport
          data={attendantData}
          isLoading={attendantLoading}
          formatRandExact={formatRand}
          periodId={periodId}
          unmatchedBankCount={unmatchedBank}
          unmatchedBankAmount={summary.unmatchedBankAmount || 0}
          declineTransactions={declineData?.transactions}
          onJumpToDeclined={() => setView('declined')}
        />
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════
  //  DECLINED SUB-VIEW
  // ═══════════════════════════════════════════════════════════
  if (view === 'declined') {
    const hasDeclined = totals.declinedCount > 0 || totals.cancelledCount > 0;

    return (
      <div className="mx-auto space-y-4">
        <BackHeader
          title="Declined card transactions"
          description="Transactions declined at point of sale. Patterns by card type, pump, time of day."
        />

        {!hasDeclined ? (
          <Card className="bg-section border-[#E5E3DC]">
            <CardContent className="pt-8 pb-8 text-center">
              <p className="text-sm text-muted-foreground">No declined or cancelled transactions in this period.</p>
            </CardContent>
          </Card>
        ) : declineLoading || !declineData ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}
          </div>
        ) : (
          <>
            {/* Section 1: Decline Summary — includes per-bank breakdown */}
            <DetailCard title="Decline summary" summary>
              <div className="space-y-0.5">
                <DetailRow label="Total declined / cancelled" count={declineData.summary.totalDeclined} amount={formatRand(declineData.summary.totalDeclinedAmount)} />
              </div>

              {(() => {
                // Group ALL declined-analysis transactions by bank so sub-items sum to the top total
                const byBank = new Map<string, { count: number; amount: number }>();
                for (const tx of declineData.transactions) {
                  const key = tx.bank || 'Unknown';
                  const existing = byBank.get(key) ?? { count: 0, amount: 0 };
                  existing.count += 1;
                  existing.amount += tx.amount;
                  byBank.set(key, existing);
                }
                return Array.from(byBank.entries())
                  .sort((a, b) => b[1].count - a[1].count)
                  .map(([bankName, stats]) => (
                    <div key={bankName} className="flex items-center justify-between pl-3 text-xs">
                      <span className="text-muted-foreground flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: getBankColor(bankName) }} />
                        {bankName}
                      </span>
                      <div className="flex items-center gap-4">
                        <span className="tabular-nums text-muted-foreground w-10 text-right">{stats.count.toLocaleString()}</span>
                        <span className="tabular-nums text-muted-foreground text-right min-w-[100px]">{formatRand(stats.amount)}</span>
                      </div>
                    </div>
                  ));
              })()}

              <Separator className="my-3" />
              <div className="space-y-0.5">
                <DetailRow
                  label="Resubmitted successfully"
                  count={declineData.summary.resubmittedCount}
                  amount={formatRand(declineData.summary.totalDeclinedAmount - declineData.summary.netUnrecoveredAmount)}
                />
              </div>
              <Separator className="my-3" />
              <DetailRow label="Net unrecovered" count={declineData.summary.unrecoveredCount} amount={formatRand(declineData.summary.netUnrecoveredAmount)} bold highlight={declineData.summary.netUnrecoveredAmount > 0} />
            </DetailCard>

            {/* Section 3: Transaction Detail — grouped by card */}
            {(() => {
              // Group transactions by card number
              const byCard = new Map<string, typeof declineData.transactions>();
              for (const tx of declineData.transactions) {
                const key = tx.cardNumber || tx.id;
                if (!byCard.has(key)) byCard.set(key, []);
                byCard.get(key)!.push(tx);
              }
              // Sort groups: unrecovered first, then by count descending
              const groups = Array.from(byCard.entries()).sort((a, b) => {
                const aUnrecovered = a[1].some(t => !t.isRecovered);
                const bUnrecovered = b[1].some(t => !t.isRecovered);
                if (aUnrecovered !== bUnrecovered) return aUnrecovered ? -1 : 1;
                return b[1].length - a[1].length;
              });

              // Suspicious patterns grouped by card so we can show them as badges on each card group
              const suspiciousByCard = new Map<string, Map<string, 'high' | 'medium' | 'low'>>();
              for (const s of declineData.suspicious) {
                if (!s.cardNumber) continue; // non-card-specific patterns handled below
                if (!suspiciousByCard.has(s.cardNumber)) suspiciousByCard.set(s.cardNumber, new Map());
                // If the same pattern appears multiple times, keep the highest severity seen
                const existing = suspiciousByCard.get(s.cardNumber)!.get(s.pattern);
                const rank = { high: 0, medium: 1, low: 2 };
                if (!existing || rank[s.severity] < rank[existing]) {
                  suspiciousByCard.get(s.cardNumber)!.set(s.pattern, s.severity);
                }
              }
              const isLateNight = (time: string) => {
                if (!time) return false;
                const h = parseInt(time.split(':')[0]);
                return h >= 22 || h < 5;
              };
              const badgeColor = (sev: 'high' | 'medium' | 'low') =>
                sev === 'high' ? 'bg-[#B91C1C]/10 text-[#B91C1C]'
                : sev === 'medium' ? 'bg-[#B45309]/10 text-[#B45309]'
                : 'bg-muted text-muted-foreground';

              return (
                <div className="space-y-3">
                  {groups.map(([card, txns]) => {
                    const hasUnrecovered = txns.some(t => !t.isRecovered);
                    const attendant = txns.find(t => t.attendant)?.attendant;
                    const cardPatterns = Array.from(suspiciousByCard.get(card) ?? new Map<string, 'high' | 'medium' | 'low'>());
                    if (txns.some(t => isLateNight(t.time))) cardPatterns.push(['Late-night decline', 'low']);
                    return (
                      <DetailCard key={card} title={`Card ${card}`}>
                        <div className="flex items-center flex-wrap gap-2 mb-2">
                          <span className="text-sm text-muted-foreground">
                            {txns[0].bank} · {txns.length} transaction{txns.length !== 1 ? 's' : ''}
                            {attendant && <> · Attendant: <span className="font-medium text-foreground">{attendant}</span></>}
                          </span>
                          {hasUnrecovered ? (
                            <span className="text-sm font-medium text-[#B45309]">Unrecovered</span>
                          ) : (
                            <span className="text-sm font-medium text-[#166534]">Recovered</span>
                          )}
                          {cardPatterns.map(([pattern, severity]) => (
                            <span key={pattern} className={cn("text-xs font-medium px-2 py-0.5 rounded-full", badgeColor(severity))}>
                              {pattern}
                            </span>
                          ))}
                        </div>
                        <div className="space-y-1">
                          {txns.sort((a, b) => a.time.localeCompare(b.time)).map(tx => {
                            const shortfall = tx.amount - tx.recoveredAmount;
                            const isPartial = shortfall > 0.50 && tx.recoveredAmount > 0;
                            // Reformat the note: strip "— shortfall NNN.NN" and append "of R {recovered}"
                            const outcomeLabel = isPartial
                              ? `${tx.note.split(' — shortfall')[0]} of ${formatRand(tx.recoveredAmount)}`
                              : tx.note;
                            return (
                              <div key={tx.id} className={cn("py-1 pl-2 border-l-2", tx.isRecovered ? "border-[#166534]/30" : "border-[#B45309]")}>
                                {/* Declined transaction */}
                                <div className="flex items-center justify-between text-sm">
                                  <span className={cn(tx.isRecovered && "text-muted-foreground")}>
                                    {tx.type} {formatRand(tx.amount)} at {tx.time}
                                  </span>
                                  <span className={cn("tabular-nums shrink-0 ml-3", tx.isRecovered ? "text-muted-foreground line-through" : "text-[#B45309] font-medium")}>
                                    {formatRand(tx.amount)}
                                  </span>
                                </div>
                                {/* Outcome — the payoff line */}
                                {tx.note && (
                                  <div className="flex items-center justify-between text-sm font-semibold mt-1 pl-4">
                                    <span>{outcomeLabel}</span>
                                    {isPartial ? (
                                      <span className="text-[#B45309] shrink-0 ml-3"><span className="text-xs mr-1">Shortfall</span><span className="tabular-nums">{formatRand(shortfall)}</span></span>
                                    ) : tx.recoveredAmount > 0 ? (
                                      <span className="text-[#166534] shrink-0 ml-3"><span className="text-xs mr-1">Recovered</span><span className="tabular-nums">{formatRand(tx.recoveredAmount)}</span></span>
                                    ) : null}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </DetailCard>
                    );
                  })}
                </div>
              );
            })()}

          </>
        )}
      </div>
    );
  }

  return null;
}

// ── Shared sub-components ──

function DetailCard({ title, children, summary }: { title: string; children: React.ReactNode; summary?: boolean }) {
  return (
    <div className={cn("rounded-xl p-4", summary ? "bg-card border border-[#E5E3DC]" : "bg-section")}>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70 mb-3">{title}</h3>
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
    <div className={cn("flex items-center justify-between text-sm py-0.5", bold && "font-medium", muted && "text-muted-foreground")}>
      <span className={cn(muted && "text-muted-foreground")}>{label}</span>
      <div className="flex items-center gap-4">
        {count !== undefined && <span className="tabular-nums text-muted-foreground w-10 text-right">{count.toLocaleString()}</span>}
        {amount && <span className={cn("tabular-nums text-right min-w-[100px]", highlight && "text-[#B45309] dark:text-amber-400")}>{amount}</span>}
        {value && <span className="tabular-nums text-right min-w-[100px]">{value}</span>}
      </div>
    </div>
  );
}
