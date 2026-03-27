import { Skeleton } from "@/components/ui/skeleton";
import { getBankColor } from "@/lib/bankColors";

interface AttendantBankBreakdown {
  bankName: string;
  count: number;
  amount: number;
}

export interface AttendantSummaryRow {
  attendant: string;
  matchedCount: number;
  matchedAmount: number;
  matchedBankAmount: number;
  unmatchedCount: number;
  unmatchedAmount: number;
  banks: AttendantBankBreakdown[];
  totalCount: number;
  totalAmount: number;
}

interface AttendantReportProps {
  data: AttendantSummaryRow[] | undefined;
  isLoading: boolean;
  formatRandExact: (n: number) => string;
  periodId: string;
  bankCoverageRange?: { min: string; max: string };
  unmatchedBankCount?: number;
  unmatchedBankAmount?: number;
  onInvestigate?: () => void;
}

function formatCoverageDate(dateStr: string) {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-ZA", { day: "2-digit", month: "short" });
}

export function AttendantReport({
  data,
  isLoading,
  formatRandExact,
  bankCoverageRange,
  unmatchedBankCount,
  unmatchedBankAmount,
  onInvestigate,
}: AttendantReportProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-8 text-center">
        No fuel transaction data found
      </div>
    );
  }

  // Check if all attendants are "Unknown"
  const allUnknown = data.every(a => a.attendant === "Unknown");
  if (allUnknown && data.length === 1) {
    return (
      <div className="text-sm text-muted-foreground py-8 text-center">
        No attendant data available for this period.
        <br />
        <span className="text-xs">Map the attendant column when uploading fuel data to see this report.</span>
      </div>
    );
  }

  // Attendants with verified sales, sorted by bank amount descending
  const withVerified = data.filter(a => a.matchedCount > 0);
  const sorted = [...withVerified].sort((a, b) => b.matchedBankAmount - a.matchedBankAmount);

  // Attendants with unmatched card sales but no verified sales
  const withUnmatchedOnly = data.filter(a => a.matchedCount === 0 && a.unmatchedCount > 0);

  // Grand totals
  const totalVerifiedCount = sorted.reduce((sum, r) => sum + r.matchedCount, 0);
  const totalVerifiedBankAmount = sorted.reduce((sum, r) => sum + r.matchedBankAmount, 0);

  return (
    <div className="space-y-3">
      <p className="text-[11px] italic text-[#6B7280] mb-1">
        Card sales verified against uploaded bank statements
        {bankCoverageRange && (
          <span> ({formatCoverageDate(bankCoverageRange.min)} – {formatCoverageDate(bankCoverageRange.max)})</span>
        )}
      </p>

      {/* Grand total header */}
      <div className="flex items-center justify-between text-xs px-1 pb-1 border-b border-[#E5E3DC]">
        <span className="text-muted-foreground font-medium">
          {totalVerifiedCount} verified card sale{totalVerifiedCount !== 1 ? "s" : ""}
        </span>
        <span className="font-semibold tabular-nums">{formatRandExact(totalVerifiedBankAmount)}</span>
      </div>

      {/* Per-attendant verified sales */}
      {sorted.map(row => (
        <div
          key={row.attendant}
          className="rounded-lg bg-section dark:bg-muted/30 p-3"
        >
          {/* Name + verified amount */}
          <div className="flex items-center justify-between mb-1.5">
            <div>
              <span className="text-sm font-semibold">{row.attendant}</span>
              <span className="text-xs text-muted-foreground ml-2">
                {row.matchedCount} verified sale{row.matchedCount !== 1 ? "s" : ""}
              </span>
            </div>
            <span className="text-sm font-semibold tabular-nums text-[#166534] dark:text-emerald-400">
              {formatRandExact(row.matchedBankAmount)}
            </span>
          </div>

          {/* Bank breakdown */}
          {row.banks.length > 0 && (
            <div className="space-y-0.5 text-xs">
              {row.banks.map(bank => (
                <div key={bank.bankName} className="flex items-center justify-between pl-3">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: getBankColor(bank.bankName) }} />
                    {bank.bankName}
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="tabular-nums text-muted-foreground w-6 text-right">{bank.count}</span>
                    <span className="tabular-nums text-muted-foreground text-right min-w-[90px]">{formatRandExact(bank.amount)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Unmatched card sales for this attendant */}
          {row.unmatchedCount > 0 && (
            <div className="flex items-center justify-between text-xs pl-3 mt-1 pt-1 border-t border-[#E5E3DC]/50">
              <span className="text-muted-foreground">Unmatched card sales</span>
              <div className="flex items-center gap-3">
                <span className="tabular-nums text-muted-foreground w-6 text-right">{row.unmatchedCount}</span>
                <span className="tabular-nums text-muted-foreground text-right min-w-[90px]">{formatRandExact(row.unmatchedAmount)}</span>
              </div>
            </div>
          )}
        </div>
      ))}

      {/* Attendants with unmatched card sales only (no verified) */}
      {withUnmatchedOnly.length > 0 && (
        <div className="pt-2">
          <p className="text-[11px] text-muted-foreground mb-2">No verified card sales</p>
          {withUnmatchedOnly.map(row => (
            <div
              key={row.attendant}
              className="flex items-center justify-between px-3 py-1.5 text-xs text-muted-foreground"
            >
              <span>{row.attendant}</span>
              <span className="tabular-nums">
                {row.unmatchedCount} unmatched card sale{row.unmatchedCount !== 1 ? "s" : ""} ({formatRandExact(row.unmatchedAmount)})
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Unattributable bank transactions */}
      {(unmatchedBankCount ?? 0) > 0 && (
        <div className="rounded-lg bg-[#FEF9C3] dark:bg-amber-950/30 p-3 mt-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-[#B45309]">
                {unmatchedBankCount} unmatched bank transaction{unmatchedBankCount !== 1 ? "s" : ""}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatRandExact(unmatchedBankAmount || 0)} — could not be attributed to any attendant
              </p>
            </div>
            {onInvestigate && (
              <button
                onClick={onInvestigate}
                className="text-xs font-medium text-[#B45309] hover:underline"
              >
                Investigate
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
