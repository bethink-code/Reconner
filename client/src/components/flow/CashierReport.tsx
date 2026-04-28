import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { getBankColor } from "@/lib/bankColors";
import { cn } from "@/lib/utils";

interface CashierBankBreakdown {
  bankName: string;
  count: number;
  amount: number;
}

export interface CashierSummaryRow {
  cashier: string;
  matchedCount: number;
  matchedAmount: number;
  matchedBankAmount: number;
  unmatchedCount: number;
  unmatchedAmount: number;
  debtorCount: number;
  debtorAmount: number;
  declinedCount: number;
  declinedAmount: number;
  banks: CashierBankBreakdown[];
  totalCount: number;
  totalAmount: number;
  phantomSlipCount: number;
  phantomSlipAmount: number;
  nextPeriodPendingCount: number;
  nextPeriodPendingAmount: number;
}

interface CashierReportProps {
  data: CashierSummaryRow[] | undefined;
  isLoading: boolean;
  formatRandExact: (n: number) => string;
  onJumpToReprint?: () => void;
}

export function CashierReport({ data, isLoading, formatRandExact, onJumpToReprint }: CashierReportProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
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

  const allUnknown = data.every(c => c.cashier === "Unknown");
  if (allUnknown && data.length === 1) {
    return (
      <div className="text-sm text-muted-foreground py-8 text-center">
        No cashier data available for this period.
        <br />
        <span className="text-xs">Map the cashier column when uploading fuel data to see this report.</span>
      </div>
    );
  }

  const withVerified = data.filter(c => c.matchedCount > 0);
  const sorted = [...withVerified].sort((a, b) => b.matchedBankAmount - a.matchedBankAmount);
  const withUnmatchedOnly = data.filter(c => c.matchedCount === 0 && c.unmatchedCount > 0);

  const totalVerifiedFuelAmount = sorted.reduce((sum, r) => sum + r.matchedAmount, 0);
  const totalVerifiedBankAmount = sorted.reduce((sum, r) => sum + r.matchedBankAmount, 0);
  const totalUnmatchedCount = data.reduce((sum, r) => sum + r.unmatchedCount, 0);
  const totalUnmatchedAmount = data.reduce((sum, r) => sum + r.unmatchedAmount, 0);
  const totalPhantomCount = data.reduce((sum, r) => sum + r.phantomSlipCount, 0);
  const totalPhantomAmount = data.reduce((sum, r) => sum + r.phantomSlipAmount, 0);
  const totalNextPeriodCount = data.reduce((sum, r) => sum + r.nextPeriodPendingCount, 0);
  const totalNextPeriodAmount = data.reduce((sum, r) => sum + r.nextPeriodPendingAmount, 0);

  const Op = ({ word }: { word?: string }) => (
    <span className="inline-block w-10 text-xs text-muted-foreground/70">{word ?? ""}</span>
  );

  const fuelCardSales = totalVerifiedFuelAmount + totalUnmatchedAmount;
  const matchedFuelCardSales = totalVerifiedFuelAmount;
  const calibrationError = totalVerifiedFuelAmount - totalVerifiedBankAmount;
  const totalShortfall = totalUnmatchedAmount + calibrationError;
  const unmatchedCashierCount = data.filter(c => c.unmatchedCount > 0).length;

  return (
    <div className="space-y-3">

      {/* Cashier accountability summary */}
      <div className="rounded-xl bg-card border border-[#E5E3DC] p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70 mb-3">Cashier Accountability</p>

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

        <div className="mt-3 space-y-0.5">
          <div className="flex items-center justify-between text-sm">
            <span><Op />Unmatched fuel card sales</span>
            <span className={cn("tabular-nums font-medium", totalUnmatchedAmount > 0 ? "text-[#B45309]" : "")}>{formatRandExact(totalUnmatchedAmount)}</span>
          </div>
          <div className="text-xs text-muted-foreground pl-10">
            {totalUnmatchedCount} transaction{totalUnmatchedCount !== 1 ? "s" : ""} across {unmatchedCashierCount} cashier{unmatchedCashierCount !== 1 ? "s" : ""}
          </div>
        </div>

        <div className="mt-3">
          <div className="flex items-center justify-between text-sm">
            <span><Op word="plus" />Pump calibration error</span>
            <span className={cn("tabular-nums font-medium", calibrationError !== 0 ? "text-[#B45309]" : "")}>{formatRandExact(calibrationError)}</span>
          </div>
        </div>

        <div className="flex items-center justify-between text-sm pt-3 mt-3 border-t border-[#E5E3DC]">
          <span className="font-bold"><Op />Total shortfall allocated to cashiers</span>
          <span className={cn("tabular-nums font-bold", totalShortfall > 0 ? "text-[#B45309]" : totalShortfall < 0 ? "text-[#166534]" : "")}>{formatRandExact(totalShortfall)}</span>
        </div>

        {totalPhantomCount > 0 && (
          <div className="mt-3 pt-3 border-t border-[#E5E3DC]">
            <div className="flex items-center justify-between text-sm">
              <span className="text-[#B91C1C] font-medium"><Op />Suspected phantom slips</span>
              <div className="flex items-center gap-3">
                <span className="tabular-nums text-[#B91C1C] font-medium w-6 text-right">{totalPhantomCount}</span>
                <span className="tabular-nums text-[#B91C1C] font-medium text-right min-w-[100px]">{formatRandExact(totalPhantomAmount)}</span>
              </div>
            </div>
            {onJumpToReprint && (
              <div className="flex justify-end mt-1">
                <button type="button" onClick={onJumpToReprint} className="text-xs font-medium text-[#E8601C] hover:underline">
                  View reprint report →
                </button>
              </div>
            )}
          </div>
        )}

        {totalNextPeriodCount > 0 && (
          <div className="mt-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span><Op />Pending next period (likely settlement lag)</span>
              <div className="flex items-center gap-3">
                <span className="tabular-nums w-6 text-right">{totalNextPeriodCount}</span>
                <span className="tabular-nums text-right min-w-[100px]">{formatRandExact(totalNextPeriodAmount)}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Per-cashier verified sales */}
      {sorted.map(row => {
        const totalCardSales = row.matchedAmount + row.unmatchedAmount;
        const matchedCardSales = row.matchedAmount;
        const matchedBank = row.matchedBankAmount;
        const unmatchedCardSales = row.unmatchedAmount;
        const calibrationErr = row.matchedAmount - row.matchedBankAmount;
        const cashierShortfall = unmatchedCardSales + calibrationErr;
        return (
          <div key={row.cashier} className="rounded-lg bg-section p-3">
            <div className="flex items-center justify-between mb-1.5">
              <div>
                <span className="text-base font-semibold">{row.cashier}</span>
                <span className="text-xs text-muted-foreground ml-2">
                  {row.matchedCount} verified sale{row.matchedCount !== 1 ? "s" : ""}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-0.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Total card sales</span>
                <span className="tabular-nums font-medium">{formatRandExact(totalCardSales)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Matched card sales</span>
                <span className="tabular-nums font-medium">{formatRandExact(matchedCardSales)}</span>
              </div>

              <Separator className="my-2" />

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

              {row.debtorCount > 0 && (
                <>
                  <Separator className="my-2" />
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Debtor / Account</span>
                    <span className="tabular-nums font-medium">{formatRandExact(row.debtorAmount)}</span>
                  </div>
                </>
              )}
            </div>

            {(row.unmatchedCount > 0 || Math.abs(calibrationErr) >= 0.01 || row.phantomSlipCount > 0) && (
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
                  {row.phantomSlipCount > 0 && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-[#B91C1C] font-medium">Suspected phantom slips</span>
                      <div className="flex items-center gap-3">
                        <span className="tabular-nums text-[#B91C1C] font-medium w-6 text-right">{row.phantomSlipCount}</span>
                        <span className="tabular-nums text-[#B91C1C] font-medium text-right min-w-[90px]">{formatRandExact(row.phantomSlipAmount)}</span>
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
                    <span>Cashier shortfall</span>
                    <span className={cn("tabular-nums text-right min-w-[90px] font-bold", cashierShortfall > 0 ? "text-[#B45309]" : cashierShortfall < 0 ? "text-[#166534]" : "")}>{formatRandExact(cashierShortfall)}</span>
                  </div>
                </div>
              </>
            )}
          </div>
        );
      })}

      {withUnmatchedOnly.length > 0 && (
        <div className="pt-2">
          <p className="text-xs text-muted-foreground mb-2">No verified fuel card sales</p>
          {withUnmatchedOnly.map(row => (
            <div key={row.cashier} className="flex items-center justify-between px-3 py-1.5 text-xs text-muted-foreground">
              <span>{row.cashier}</span>
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
