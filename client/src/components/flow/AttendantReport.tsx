import type { InsightsAttendantsReadModel } from "@shared/periodInsights";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { getBankColor } from "@/lib/bankColors";
import { cn } from "@/lib/utils";

interface AttendantReportProps {
  data: InsightsAttendantsReadModel | undefined;
  isLoading: boolean;
  formatRandExact: (n: number) => string;
  onJumpToDeclined?: () => void;
}

export function AttendantReport({
  data,
  isLoading,
  formatRandExact,
  onJumpToDeclined,
}: AttendantReportProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((index) => (
          <Skeleton key={index} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (!data || data.state === "no_fuel_data") {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        No fuel transaction data found
      </div>
    );
  }

  if (data.state === "no_attendant_data") {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        No attendant data available for this period.
        <br />
        <span className="text-xs">
          Map the attendant column when uploading fuel data to see this report.
        </span>
      </div>
    );
  }

  const summary = data.summary;
  if (!summary) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-[#E5E3DC] bg-card p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
          Attendant Accountability
        </p>

        <div className="space-y-0.5">
          <SummaryRow
            label="Fuel card sales"
            amount={formatRandExact(summary.fuelCardSalesAmount)}
          />
          <SummaryRow
            label="less Matched fuel card sales"
            amount={formatRandExact(summary.matchedFuelCardSalesAmount)}
          />
        </div>

        <div className="mt-3 space-y-0.5">
          <SummaryRow
            label="Unmatched fuel card sales"
            amount={formatRandExact(summary.unmatchedFuelCardSalesAmount)}
            highlight={summary.unmatchedFuelCardSalesAmount > 0}
          />
          <div className="pl-10 text-xs text-muted-foreground">
            {summary.unmatchedFuelCardSalesCount} transaction
            {summary.unmatchedFuelCardSalesCount !== 1 ? "s" : ""} across{" "}
            {summary.unmatchedAttendantCount} attendant
            {summary.unmatchedAttendantCount !== 1 ? "s" : ""}
          </div>
        </div>

        <div className="mt-3">
          <SummaryRow
            label="plus Pump calibration error"
            amount={formatRandExact(summary.pumpCalibrationError)}
            highlight={summary.pumpCalibrationError !== 0}
          />
        </div>

        <div className="mt-3 flex items-center justify-between border-t border-[#E5E3DC] pt-3 text-sm">
          <span className="font-bold">Total shortfall allocated to attendants</span>
          <span
            className={cn(
              "tabular-nums font-bold",
              summary.totalShortfall > 0
                ? "text-[#B45309]"
                : summary.totalShortfall < 0
                  ? "text-[#166534]"
                  : "",
            )}
          >
            {formatRandExact(summary.totalShortfall)}
          </span>
        </div>

        {summary.hasAnyDeclines && onJumpToDeclined && (
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={onJumpToDeclined}
              className="text-xs font-medium text-[#E8601C] hover:underline"
            >
              View full declined report {"->"}
            </button>
          </div>
        )}
      </div>

      {data.verified.map((row) => (
        <div key={row.attendant} className="rounded-lg bg-section p-3">
          <div className="mb-1.5 flex items-center justify-between">
            <div>
              <span className="text-base font-semibold">{row.attendant}</span>
              <span className="ml-2 text-xs text-muted-foreground">
                {row.verifiedSaleCount} verified sale
                {row.verifiedSaleCount !== 1 ? "s" : ""}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-0.5">
            <MetricRow
              label="Total card sales"
              amount={formatRandExact(row.totalCardSalesAmount)}
            />
            <MetricRow
              label="Matched card sales"
              amount={formatRandExact(row.matchedCardSalesAmount)}
            />

            <Separator className="my-2" />

            <MetricRow
              label="Matched bank amount"
              amount={formatRandExact(row.matchedBankAmount)}
              amountClassName="text-[#166534]"
            />
            {row.banks.length >= 2 &&
              row.banks.map((bank) => (
                <div key={bank.bankName} className="flex items-center justify-between pl-3 text-xs">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: getBankColor(bank.bankName) }}
                    />
                    {bank.bankName}
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="w-6 text-right tabular-nums text-muted-foreground">
                      {bank.count}
                    </span>
                    <span className="min-w-[90px] text-right tabular-nums text-muted-foreground">
                      {formatRandExact(bank.amount)}
                    </span>
                  </div>
                </div>
              ))}

            {row.debtorCount > 0 && <Separator className="my-2" />}

            {row.debtorCount > 0 && (
              <MetricRow
                label="Debtor / Account"
                amount={formatRandExact(row.debtorAmount)}
              />
            )}

            {row.declines && <Separator className="my-2" />}

            {row.declines && (
              <>
                <MetricRow
                  label="Declined transactions"
                  value={String(row.declines.totalCount)}
                />
                {row.declines.recoveredCount > 0 && (
                  <NestedMetricRow
                    label="Recovered"
                    count={row.declines.recoveredCount}
                    amount={formatRandExact(
                      row.declines.totalAmount - row.declines.unrecoveredAmount,
                    )}
                  />
                )}
                {row.declines.unrecoveredCount > 0 && (
                  <NestedMetricRow
                    label="Unrecovered"
                    count={row.declines.unrecoveredCount}
                    amount={formatRandExact(row.declines.unrecoveredAmount)}
                    highlight
                  />
                )}
              </>
            )}
          </div>

          {(row.unmatchedCardSalesCount > 0 || Math.abs(row.pumpCalibrationError) >= 0.01) && (
            <>
              <Separator className="my-2" />
              <div className="flex flex-col gap-0.5">
                {row.unmatchedCardSalesCount > 0 && (
                  <NestedMetricRow
                    label="Unmatched card sales"
                    count={row.unmatchedCardSalesCount}
                    amount={formatRandExact(row.unmatchedCardSalesAmount)}
                    highlight
                  />
                )}
                {Math.abs(row.pumpCalibrationError) >= 0.01 && (
                  <MetricRow
                    label="Pump calibration error"
                    amount={formatRandExact(row.pumpCalibrationError)}
                    amountClassName={row.pumpCalibrationError !== 0 ? "text-[#B45309]" : ""}
                  />
                )}
                <Separator className="my-2" />
                <div className="flex items-center justify-between text-sm font-bold">
                  <span>Attendant shortfall</span>
                  <span
                    className={cn(
                      "min-w-[90px] text-right tabular-nums font-bold",
                      row.attendantShortfall > 0
                        ? "text-[#B45309]"
                        : row.attendantShortfall < 0
                          ? "text-[#166534]"
                          : "",
                    )}
                  >
                    {formatRandExact(row.attendantShortfall)}
                  </span>
                </div>
              </div>
            </>
          )}
        </div>
      ))}

      {data.unmatchedOnly.length > 0 && (
        <div className="pt-2">
          <p className="mb-2 text-xs text-muted-foreground">
            No verified fuel card sales
          </p>
          {data.unmatchedOnly.map((row) => (
            <div
              key={row.attendant}
              className="flex items-center justify-between px-3 py-1.5 text-xs text-muted-foreground"
            >
              <span>{row.attendant}</span>
              <span className="tabular-nums">
                {row.unmatchedCardSalesCount} unmatched card sale
                {row.unmatchedCardSalesCount !== 1 ? "s" : ""} (
                {formatRandExact(row.unmatchedCardSalesAmount)})
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SummaryRow({
  label,
  amount,
  highlight,
}: {
  label: string;
  amount: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span>{label}</span>
      <span
        className={cn(
          "tabular-nums font-medium",
          highlight ? "text-[#B45309]" : "",
        )}
      >
        {amount}
      </span>
    </div>
  );
}

function MetricRow({
  label,
  amount,
  value,
  amountClassName,
}: {
  label: string;
  amount?: string;
  value?: string;
  amountClassName?: string;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      {amount ? (
        <span className={cn("tabular-nums font-medium", amountClassName)}>
          {amount}
        </span>
      ) : (
        <span className="tabular-nums font-medium">{value}</span>
      )}
    </div>
  );
}

function NestedMetricRow({
  label,
  count,
  amount,
  highlight,
}: {
  label: string;
  count: number;
  amount: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center justify-between pl-3 text-xs">
      <span className={cn(highlight ? "font-medium text-[#B45309]" : "text-muted-foreground")}>
        {label}
      </span>
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "w-6 text-right tabular-nums",
            highlight ? "font-medium text-[#B45309]" : "text-muted-foreground",
          )}
        >
          {count}
        </span>
        <span
          className={cn(
            "min-w-[90px] text-right tabular-nums",
            highlight ? "font-medium text-[#B45309]" : "text-muted-foreground",
          )}
        >
          {amount}
        </span>
      </div>
    </div>
  );
}
