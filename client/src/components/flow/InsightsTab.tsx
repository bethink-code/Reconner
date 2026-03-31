import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
    unmatchableBank, excludedBank, matchableBankTotal, unmatchedBank, bankMatchPct,
    cardOnly, cardOnlyAmount, bankApprovedAmount, fileSurplus,
    matchedSurplus, unmatchedBankAmt, unmatchedFuelCardAmount, totalFuelCardReconciled,
    reconSurplus, outsideRangeAmt,
  } = deriveSummaryStats(summary);

  // ═══════════════════════════════════════════════════════════
  //  BACK HEADER for sub-views
  // ═══════════════════════════════════════════════════════════
  const BackHeader = ({ title }: { title: string }) => (
    <Button
      variant="secondary"
      size="sm"
      onClick={() => setView('landing')}
      className="mb-4"
    >
      <ArrowLeft className="h-4 w-4 mr-1" />
      Back to Insights
    </Button>
  );

  // ═══════════════════════════════════════════════════════════
  //  LANDING — Report cards
  // ═══════════════════════════════════════════════════════════
  if (view === 'landing') {
    return (
      <div className="mx-auto space-y-6">
        <div>
          <h2 className="text-lg font-heading font-semibold text-[#1A1200]">Insights</h2>
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
                <h3 className="font-semibold">Financial Overview</h3>
                <p className="text-xs text-muted-foreground mt-1">Card sales reconciliation, surplus/shortfall analysis, and full transaction-level breakdown.</p>
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
                <h3 className="font-semibold">Declined</h3>
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
        <BackHeader title="Detail" />

        {/* Fuel Sales */}
        <DetailCard title="Fuel Sales">
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
        <DetailCard title="Bank Transactions">
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
        <DetailCard title="Matching">
          <div className="mb-3">
            <ResponsiveContainer width="100%" height={32}>
              <BarChart layout="vertical" data={[{ matched: summary.matchedPairs, unmatched: unmatchedBank }]} stackOffset="expand" barSize={20}>
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
            <DetailRow label="Matched" count={summary.matchedPairs} />
            <DetailRow label="Match rate" value={`${bankMatchPct}%`} />
            <DetailRow label="Unmatched bank" count={unmatchedBank} highlight={unmatchedBank > 0} />
          </div>
        </DetailCard>

        {/* Card Sales Reconciliation — top-level gap */}
        <DetailCard title="Card Sales Reconciliation">
          <div className="space-y-0.5">
            <DetailRow label="Fuel card sales" amount={formatRand(cardOnlyAmount)} />
            <DetailRow label="Bank approved amount" amount={formatRand(bankApprovedAmount)} />
          </div>
          <div className="mt-2 pt-2 border-t border-[#E5E3DC]/50">
            <DetailRow label="Surplus / Shortfall" amount={formatRand(fileSurplus)} bold highlight={fileSurplus !== 0} />
          </div>
          <p className="text-xs text-muted-foreground/60 mt-2 leading-relaxed">
            The surplus/shortfall is explained by three components below: decimal matching errors, fuel attendant errors, and unmatched bank transactions.
          </p>
        </DetailCard>

        {/* Surplus / Shortfall Analysis — 3-bucket breakdown */}
        <DetailCard title="Surplus / Shortfall Analysis">
          {/* Bucket 1: Decimal matching error */}
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/50 mb-1.5">Decimal matching error</p>
          <div className="space-y-0.5">
            <DetailRow label="Matched fuel amount" amount={formatRand(summary.matchedFuelAmount)} />
            <DetailRow label="Matched bank amount" amount={formatRand(summary.matchedBankAmount)} />
            <DetailRow label="Decimal error" amount={formatRand(matchedSurplus)} bold highlight={matchedSurplus !== 0} />
          </div>
          <p className="text-xs text-muted-foreground/60 mt-1 leading-relaxed">
            Small rounding differences between bank and fuel amounts on matched transactions.
          </p>

          {/* Bucket 2: Fuel attendant error */}
          <div className="mt-3 pt-3 border-t border-[#E5E3DC]/50">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/50 mb-1.5">Fuel attendant error</p>
            <div className="space-y-0.5">
              <DetailRow label="Unmatched fuel card transactions" amount={formatRand(unmatchedFuelCardAmount)} bold highlight={unmatchedFuelCardAmount > 0} />
            </div>
            <p className="text-xs text-muted-foreground/60 mt-1 leading-relaxed">
              Card fuel dispensed with no matching bank payment. May include declined card payments.
            </p>
          </div>

          {/* Bucket 3: Unmatched bank */}
          <div className="mt-3 pt-3 border-t border-[#E5E3DC]/50">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/50 mb-1.5">Unmatched bank transactions</p>
            {unmatchedBankAmt > 0 ? (
              <div className="space-y-0.5">
                <DetailRow label="Unmatched bank amount" amount={formatRand(unmatchedBankAmt)} bold highlight />
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No unmatched bank transactions</p>
            )}
            <p className="text-xs text-muted-foreground/60 mt-1 leading-relaxed">
              Bank approved payments with no matching fuel record.
            </p>
          </div>

          {/* Total verification */}
          <div className="mt-3 pt-2 bg-[#E5E3DC]/30 -mx-4 px-4 pb-2 rounded-b-xl">
            <DetailRow
              label="Total surplus / shortfall"
              amount={formatRand(matchedSurplus - unmatchedFuelCardAmount + unmatchedBankAmt)}
              bold
              highlight={(matchedSurplus - unmatchedFuelCardAmount + unmatchedBankAmt) !== 0}
            />
          </div>
        </DetailCard>

        {/* Excluded bank — informational */}
        {(summary.excludedBankAmount || 0) > 0 && (
          <DetailCard title="Excluded Bank Transactions">
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
        <BackHeader title="Attendants" />
        <AttendantReport
          data={attendantData}
          isLoading={attendantLoading}
          formatRandExact={formatRand}
          periodId={periodId}
          bankCoverageRange={summary.bankCoverageRange}
          unmatchedBankCount={unmatchedBank}
          unmatchedBankAmount={summary.unmatchedBankAmount || 0}
          totalDeclinedCount={totals.declinedCount}
          totalDeclinedAmount={totals.declinedAmount}
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
        <BackHeader title="Declined" />

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
            {/* Section 1: Decline Summary */}
            <DetailCard title="Decline Summary">
              <div className="space-y-0.5">
                <DetailRow label="Total declined / cancelled" count={declineData.summary.totalDeclined} amount={formatRand(declineData.summary.totalDeclinedAmount)} />
              </div>
              <div className="space-y-0.5 mt-3 pt-3 border-t border-[#E5E3DC]/50">
                <DetailRow label="Resubmitted successfully" count={declineData.summary.resubmittedCount} />
              </div>
              <div className="mt-3 pt-2 bg-[#E5E3DC]/30 -mx-4 px-4 pb-2 rounded-b-xl">
                <DetailRow label="Net unrecovered" count={declineData.summary.unrecoveredCount} amount={formatRand(declineData.summary.netUnrecoveredAmount)} bold highlight={declineData.summary.netUnrecoveredAmount > 0} />
              </div>
            </DetailCard>

            {/* Section 2: Per-bank breakdown (kept from original) */}
            <DetailCard title="Declined & Cancelled by Bank">
              {banks.length > 0 && (
                <table className="w-full text-[13px]">
                  <thead>
                    <tr>
                      <th className="text-left py-1 pr-2 font-medium text-muted-foreground text-xs"></th>
                      {banks.map(b => (<th key={b.bankName} className="text-right py-1 px-1 font-medium text-muted-foreground text-xs">{b.bankName}</th>))}
                      <th className="text-right py-1 pl-1 font-medium text-muted-foreground text-xs">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {totals.declinedCount > 0 && (
                      <tr>
                        <td className="py-0.5 pr-2 font-medium">Declined</td>
                        {banks.map(b => (<td key={b.bankName} className="text-right px-1 py-0.5 tabular-nums">{b.declinedCount || '-'}</td>))}
                        <td className="text-right pl-1 py-0.5 tabular-nums font-medium">{totals.declinedCount}</td>
                      </tr>
                    )}
                    {totals.cancelledCount > 0 && (
                      <tr className={totals.declinedCount > 0 ? "border-t border-[#E5E3DC]/50" : ""}>
                        <td className="py-0.5 pr-2 font-medium">Cancelled</td>
                        {banks.map(b => (<td key={b.bankName} className="text-right px-1 py-0.5 tabular-nums">{b.cancelledCount || '-'}</td>))}
                        <td className="text-right pl-1 py-0.5 tabular-nums font-medium">{totals.cancelledCount}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
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

              return (
                <div className="space-y-3">
                  {groups.map(([card, txns]) => {
                    const hasUnrecovered = txns.some(t => !t.isRecovered);
                    const attendant = txns.find(t => t.attendant)?.attendant;
                    return (
                      <DetailCard key={card} title={`Card ${card}`}>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs text-muted-foreground">
                            {txns[0].bank} · {txns.length} transaction{txns.length !== 1 ? 's' : ''}
                            {attendant && <> · Attendant: <span className="font-medium text-foreground">{attendant}</span></>}
                          </span>
                          {hasUnrecovered ? (
                            <span className="text-xs font-medium text-[#B45309]">Unrecovered</span>
                          ) : (
                            <span className="text-xs font-medium text-[#166534]">Recovered</span>
                          )}
                        </div>
                        <div className="space-y-1">
                          {txns.sort((a, b) => a.time.localeCompare(b.time)).map(tx => (
                            <div key={tx.id} className={cn("flex items-center justify-between text-[13px] py-1 pl-2 border-l-2", tx.isRecovered ? "border-[#166534]/30" : "border-[#B45309]")}>
                              <div className="flex-1 min-w-0">
                                <span className={cn(tx.isRecovered && "text-muted-foreground")}>
                                  {tx.type} {formatRand(tx.amount)} at {tx.time}
                                </span>
                                {tx.note && (
                                  <span className="text-xs text-muted-foreground ml-2">
                                    → {tx.note}{tx.recoveredAmount > 0 ? ` (${formatRand(tx.recoveredAmount)})` : ''}
                                  </span>
                                )}
                              </div>
                              <div className="text-right tabular-nums shrink-0 ml-3">
                                {tx.isRecovered ? (
                                  <span className="text-muted-foreground line-through">{formatRand(tx.amount)}</span>
                                ) : (
                                  <span className="text-[#B45309] font-medium">{formatRand(tx.amount)}</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </DetailCard>
                    );
                  })}
                </div>
              );
            })()}

            {/* Section 4: Suspicious Activity */}
            {declineData.suspicious.length > 0 && (
              <DetailCard title="Suspicious Activity">
                <div className="space-y-2">
                  {declineData.suspicious.map((s, i) => (
                    <div key={i} className="rounded-lg border border-[#E5E3DC] p-3">
                      <div className="flex items-start gap-2">
                        <Shield className={cn("h-4 w-4 mt-0.5 shrink-0",
                          s.severity === 'high' ? 'text-[#B91C1C]' : s.severity === 'medium' ? 'text-[#B45309]' : 'text-muted-foreground'
                        )} />
                        <div>
                          <p className={cn("text-[13px] font-medium",
                            s.severity === 'high' ? 'text-[#B91C1C]' : s.severity === 'medium' ? 'text-[#B45309]' : 'text-foreground'
                          )}>{s.pattern}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{s.detail}</p>
                          {s.attendant && <p className="text-xs text-muted-foreground">Attendant: <span className="font-medium text-foreground">{s.attendant}</span></p>}
                          {s.shortfall > 0 && (
                            <p className="text-xs font-medium text-[#B91C1C] mt-1">Potential shortfall: {formatRand(s.shortfall)}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </DetailCard>
            )}
          </>
        )}
      </div>
    );
  }

  return null;
}

// ── Shared sub-components ──

function DetailCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-section p-4">
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
    <div className={cn("flex items-center justify-between text-[13px] py-0.5", bold && "font-medium", muted && "text-muted-foreground")}>
      <span className={cn(muted && "text-muted-foreground")}>{label}</span>
      <div className="flex items-center gap-4">
        {count !== undefined && <span className="tabular-nums text-muted-foreground w-10 text-right">{count.toLocaleString()}</span>}
        {amount && <span className={cn("tabular-nums text-right min-w-[100px]", highlight && "text-[#B45309] dark:text-amber-400")}>{amount}</span>}
        {value && <span className="tabular-nums text-right min-w-[100px]">{value}</span>}
      </div>
    </div>
  );
}
