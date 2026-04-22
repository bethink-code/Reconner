import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { getBankColor } from "@/lib/bankColors";
import { cn } from "@/lib/utils";

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
  debtorCount: number;
  debtorAmount: number;
  declinedCount: number;
  declinedAmount: number;
  banks: AttendantBankBreakdown[];
  totalCount: number;
  totalAmount: number;
}

export interface AttendantDeclineTransaction {
  amount: number;
  attendant: string | null;
  isRecovered: boolean;
  recoveredAmount: number;
}

interface AttendantReportProps {
  data: AttendantSummaryRow[] | undefined;
  isLoading: boolean;
  formatRandExact: (n: number) => string;
  periodId: string;
  unmatchedBankCount?: number;
  unmatchedBankAmount?: number;
  declineTransactions?: AttendantDeclineTransaction[];
  onInvestigate?: () => void;
  onJumpToDeclined?: () => void;
}

export function AttendantReport({
  data,
  isLoading,
  formatRandExact,
  unmatchedBankCount,
  unmatchedBankAmount,
  declineTransactions,
  onInvestigate,
  onJumpToDeclined,
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
  const totalVerifiedFuelAmount = sorted.reduce((sum, r) => sum + r.matchedAmount, 0);
  const totalVerifiedBankAmount = sorted.reduce((sum, r) => sum + r.matchedBankAmount, 0);
  const totalUnmatchedCount = data.reduce((sum, r) => sum + r.unmatchedCount, 0);
  const totalUnmatchedAmount = data.reduce((sum, r) => sum + r.unmatchedAmount, 0);
  const totalDecimalError = totalVerifiedBankAmount - totalVerifiedFuelAmount;

  // Per-attendant decline stats from the richer /decline-analysis data
  type DeclineStats = { count: number; recovered: number; unrecovered: number; unrecoveredAmount: number };
  const declineByAttendant = new Map<string, DeclineStats>();
  for (const tx of declineTransactions ?? []) {
    const key = (tx.attendant && tx.attendant.trim()) || "Unknown";
    const s = declineByAttendant.get(key) ?? { count: 0, recovered: 0, unrecovered: 0, unrecoveredAmount: 0 };
    s.count += 1;
    if (tx.isRecovered) s.recovered += 1;
    else {
      s.unrecovered += 1;
      s.unrecoveredAmount += tx.amount - (tx.recoveredAmount || 0);
    }
    declineByAttendant.set(key, s);
  }
  const hasAnyDeclines = (declineTransactions?.length ?? 0) > 0;

  return (
    <div className="space-y-3">

      {/* Attendant accountability summary */}
      {(() => {
        const fuelCardSales = totalVerifiedFuelAmount + totalUnmatchedAmount; // B
        const matchedFuelCardSales = totalVerifiedFuelAmount;                 // D
        const unmatchedFuelCardSales = totalUnmatchedAmount;                  // E = B − D
        const calibrationError = totalVerifiedFuelAmount - totalVerifiedBankAmount; // G (+ve = fuel > bank = shortfall)
        const totalShortfall = unmatchedFuelCardSales + calibrationError;     // E + G
        const unmatchedAttendantCount = data.filter(a => a.unmatchedCount > 0).length;
        const Op = ({ word }: { word?: string }) => (
          <span className="inline-block w-10 text-xs text-muted-foreground/70">{word ?? ""}</span>
        );
        return (
          <div className="rounded-xl bg-card border border-[#E5E3DC] p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70 mb-3">Attendant Accountability</p>

            {/* Group 1: Fuel card sales − Matched = Unmatched */}
            <div className="space-y-0.5">
              <div className="flex items-center justify-between text-sm">
                <span><Op />Fuel card sales</span>
                <span className="tabular-nums font-medium">{formatRandExact(fuelCardSales)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span><Op word="less" />Matched fuel card sales</span>
                <span className="tabular-nums font-medium">{formatRandExact(matchedFuelCardSales)}</span>
              </div>
            </div>

            {/* Group 2: Unmatched result + its transaction count */}
            <div className="mt-3 space-y-0.5">
              <div className="flex items-center justify-between text-sm">
                <span><Op />Unmatched fuel card sales</span>
                <span className={cn("tabular-nums font-medium", unmatchedFuelCardSales > 0 ? "text-[#B45309]" : "")}>{formatRandExact(unmatchedFuelCardSales)}</span>
              </div>
              <div className="text-xs text-muted-foreground pl-10">
                {totalUnmatchedCount} transaction{totalUnmatchedCount !== 1 ? "s" : ""} across {unmatchedAttendantCount} attendant{unmatchedAttendantCount !== 1 ? "s" : ""}
              </div>
            </div>

            {/* Group 3: plus Calibration */}
            <div className="mt-3">
              <div className="flex items-center justify-between text-sm">
                <span><Op word="plus" />Pump calibration error</span>
                <span className={cn("tabular-nums font-medium", calibrationError !== 0 ? "text-[#B45309]" : "")}>{formatRandExact(calibrationError)}</span>
              </div>
            </div>

            {/* Total */}
            <div className="flex items-center justify-between text-sm pt-3 mt-3 border-t border-[#E5E3DC]">
              <span className="font-bold"><Op />Total shortfall allocated to attendants</span>
              <span className={cn("tabular-nums font-bold", totalShortfall > 0 ? "text-[#B45309]" : totalShortfall < 0 ? "text-[#166534]" : "")}>{formatRandExact(totalShortfall)}</span>
            </div>

            {hasAnyDeclines && onJumpToDeclined && (
              <div className="flex justify-end mt-3">
                <button
                  type="button"
                  onClick={onJumpToDeclined}
                  className="text-xs font-medium text-[#E8601C] hover:underline"
                >
                  View full declined report →
                </button>
              </div>
            )}
          </div>
        );
      })()}


      {/* Per-attendant verified sales */}
      {sorted.map(row => {
        const totalCardSales = row.matchedAmount + row.unmatchedAmount;      // A
        const matchedCardSales = row.matchedAmount;                           // B
        const matchedBank = row.matchedBankAmount;                            // C
        const unmatchedCardSales = row.unmatchedAmount;                       // A − B
        const calibrationErr = row.matchedAmount - row.matchedBankAmount;     // B − C (+ve = shortfall)
        const attendantShortfall = unmatchedCardSales + calibrationErr;       // (A−B) + (B−C) = A − C
        return (
          <div key={row.attendant} className="rounded-lg bg-section p-3">
            {/* Name + count */}
            <div className="flex items-center justify-between mb-1.5">
              <div>
                <span className="text-base font-semibold">{row.attendant}</span>
                <span className="text-xs text-muted-foreground ml-2">
                  {row.matchedCount} verified sale{row.matchedCount !== 1 ? "s" : ""}
                </span>
              </div>
            </div>

            {/* Main line items — all siblings in one container */}
            {(() => {
              const stats = declineByAttendant.get(row.attendant);
              const fallbackDeclinedCount = row.declinedCount;
              const fallbackDeclinedAmount = row.declinedAmount;
              return (
                <div className="flex flex-col gap-0.5">
                  {/* Total card sales */}
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Total card sales</span>
                    <span className="tabular-nums font-medium">{formatRandExact(totalCardSales)}</span>
                  </div>

                  {/* Matched card sales */}
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Matched card sales</span>
                    <span className="tabular-nums font-medium">{formatRandExact(matchedCardSales)}</span>
                  </div>

                  <Separator className="my-2" />

                  {/* Matched bank amount + nested bank breakdown */}
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Matched bank amount</span>
                    <span className="tabular-nums font-medium text-[#166534]">{formatRandExact(matchedBank)}</span>
                  </div>
                  {row.banks.length >= 2 && row.banks.map(bank => (
                    <div key={bank.bankName} className="flex items-center justify-between pl-3 text-xs">
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

                  {row.debtorCount > 0 && <Separator className="my-2" />}

                  {/* Debtor / Account — main category */}
                  {row.debtorCount > 0 && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Debtor / Account</span>
                      <span className="tabular-nums font-medium">{formatRandExact(row.debtorAmount)}</span>
                    </div>
                  )}

                  {(stats || fallbackDeclinedCount > 0) && <Separator className="my-2" />}

                  {/* Declined transactions — main category + nested recovered/unrecovered */}
                  {stats ? (
                    <>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Declined transactions</span>
                        <span className="tabular-nums font-medium">{stats.count}</span>
                      </div>
                      <div className="flex items-center justify-between pl-3 text-xs">
                        <span className="text-muted-foreground">Recovered</span>
                        <span className="tabular-nums text-muted-foreground">{stats.recovered}</span>
                      </div>
                      {stats.unrecovered > 0 && (
                        <div className="flex items-center justify-between pl-3 text-xs">
                          <span className="text-[#B45309] font-medium">Unrecovered</span>
                          <div className="flex items-center gap-3">
                            <span className="tabular-nums text-[#B45309] font-medium w-6 text-right">{stats.unrecovered}</span>
                            <span className="tabular-nums text-[#B45309] font-medium text-right min-w-[90px]">{formatRandExact(stats.unrecoveredAmount)}</span>
                          </div>
                        </div>
                      )}
                    </>
                  ) : fallbackDeclinedCount > 0 && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Declined transactions</span>
                      <span className="tabular-nums font-medium">{fallbackDeclinedCount}</span>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Derived: unmatched, calibration, shortfall */}
            {(row.unmatchedCount > 0 || Math.abs(calibrationErr) >= 0.01) && (
              <>
                <Separator className="my-2" />
                <div className="flex flex-col gap-0.5">
                {row.unmatchedCount > 0 && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Unmatched card sales</span>
                    <div className="flex items-center gap-3">
                      <span className="tabular-nums text-muted-foreground w-6 text-right">{row.unmatchedCount}</span>
                      <span className={cn("tabular-nums text-right min-w-[90px]", unmatchedCardSales > 0 ? "text-[#B45309]" : "")}>{formatRandExact(unmatchedCardSales)}</span>
                    </div>
                  </div>
                )}
                {Math.abs(calibrationErr) >= 0.01 && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Pump calibration error</span>
                    <span className={cn("tabular-nums text-right min-w-[90px]", calibrationErr !== 0 ? "text-[#B45309]" : "")}>{formatRandExact(calibrationErr)}</span>
                  </div>
                )}
                <Separator className="my-2" />
                <div className="flex items-center justify-between text-sm font-bold">
                  <span>Attendant shortfall</span>
                  <span className={cn("tabular-nums text-right min-w-[90px] font-bold", attendantShortfall > 0 ? "text-[#B45309]" : attendantShortfall < 0 ? "text-[#166534]" : "")}>{formatRandExact(attendantShortfall)}</span>
                </div>
                </div>
              </>
            )}
          </div>
        );
      })}

      {/* Attendants with unmatched card sales only (no verified) */}
      {withUnmatchedOnly.length > 0 && (
        <div className="pt-2">
          <p className="text-xs text-muted-foreground mb-2">No verified fuel card sales</p>
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

    </div>
  );
}
