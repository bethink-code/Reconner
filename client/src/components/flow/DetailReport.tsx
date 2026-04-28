import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { formatRand } from "@/lib/format";
import { getBankColor } from "@/lib/bankColors";
import { deriveSummaryStats } from "@/lib/reconciliation-utils";
import type { PeriodSummary } from "@/lib/reconciliation-types";
import { DetailCard, DetailRow } from "./_DetailUI";

interface DetailReportProps {
  summary: PeriodSummary;
}

export function DetailReport({ summary }: DetailReportProps) {
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
    matchableBankTotal, unmatchedBank, cardMatchPct,
    matchedCardCount, unmatchedFuelCount,
    cardOnly, cardOnlyAmount, bankApprovedAmount, fileSurplus,
    unmatchedBankAmt, outsideRangeAmt,
    matchedFuelInPeriod, lagFuelAmount, unmatchedFuelCoveredAmount, unmatchedFuelUncoveredAmount,
    lagExplainedBankAmount, matchedVariance, tenantBankCoverage,
  } = deriveSummaryStats(summary);

  return (
    <div className="mx-auto space-y-4">
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
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/50 mb-1.5">Matched amount variance</p>
        <div className="space-y-0.5">
          <DetailRow label="Matched fuel amount (both sides in period)" amount={formatRand(matchedFuelInPeriod)} />
          <DetailRow label="Matched bank amount" amount={formatRand(summary.matchedBankAmount)} />
          <DetailRow label="Variance" amount={formatRand(matchedVariance)} bold highlight={matchedVariance !== 0} />
        </div>
        <p className="text-xs text-muted-foreground/60 mt-1 leading-relaxed">
          Difference between bank and fuel on matched pairs where both sides fall inside the period. Usually small (pump calibration, rounding, or match tolerance).
        </p>

        <div className="mt-3 pt-3 border-t border-[#E5E3DC]/50">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/50 mb-1.5">Fuel matched to bank outside period</p>
          <div className="space-y-0.5">
            <DetailRow label="In-period fuel card sales matched to out-of-period bank" amount={formatRand(lagFuelAmount)} bold highlight={lagFuelAmount > 0} />
          </div>
          <p className="text-xs text-muted-foreground/60 mt-1 leading-relaxed">
            Often settlement lag, but could also be a false match — verify before assuming.
          </p>
        </div>

        <div className="mt-3 pt-3 border-t border-[#E5E3DC]/50">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/50 mb-1.5">Fuel card sales with no bank match, within bank coverage</p>
          <div className="space-y-0.5">
            <DetailRow label="Unmatched fuel with bank data available for that date" amount={formatRand(unmatchedFuelCoveredAmount)} bold highlight={unmatchedFuelCoveredAmount > 0} />
          </div>
          <p className="text-xs text-muted-foreground/60 mt-1 leading-relaxed">
            Bank data covers these dates but no match was found — real gaps to investigate.
          </p>
        </div>

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

        <div className="mt-3 pt-3 border-t border-[#E5E3DC]/50">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/50 mb-1.5">Bank with no fuel match</p>
          <div className="space-y-0.5">
            <DetailRow label="In-period bank amount with no fuel match" amount={formatRand(unmatchedBankAmt)} bold highlight={unmatchedBankAmt > 0} />
          </div>
          <p className="text-xs text-muted-foreground/60 mt-1 leading-relaxed">
            Bank deposits with no fuel sale to explain them — investigate.
          </p>
        </div>

        <div className="mt-3 pt-3 border-t border-[#E5E3DC]/50">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/50 mb-1.5">Bank matched to fuel outside period</p>
          <div className="space-y-0.5">
            <DetailRow label="In-period bank matched to out-of-period fuel (lag-explained)" amount={formatRand(lagExplainedBankAmount)} bold highlight={lagExplainedBankAmount > 0} />
          </div>
          <p className="text-xs text-muted-foreground/60 mt-1 leading-relaxed">
            Bank deposits this period that explain fuel sales from a prior period.
          </p>
        </div>

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
