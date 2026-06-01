import type { CashGapView } from "@shared/cashGap";
import { cn } from "@/lib/utils";
import { formatRand, formatDate } from "@/lib/format";

export function CashGapReport({ data }: { data: CashGapView }) {
  if (data.state === "no_cash_data") {
    return (
      <div className="rounded-xl border border-[#E5E3DC] bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">
          No cash sales or cash inputs for this period. Enter your cash on Step 3 of the
          reconciliation flow to see this report.
        </p>
      </div>
    );
  }

  if (data.state === "awaiting_input") {
    return (
      <div className="space-y-4">
        <Section title="Cash gap" emphasised>
          <div className="flex items-start gap-4">
            <div className="flex-1">
              <p className="text-2xl font-semibold tabular-nums text-muted-foreground">
                Not captured
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                You haven't entered how much cash you received this period. We can't show the gap
                until that number is in.
              </p>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground/80">
                Enter cash received (and any cash spent) on Step 3 of the reconciliation flow.
                Or leave them blank — this report stays available either way.
              </p>
            </div>
            <div className="text-right text-xs text-muted-foreground space-y-1 shrink-0">
              <p className="text-[10px] uppercase tracking-wider">POS cash sales</p>
              <p className="text-base font-semibold tabular-nums text-foreground">
                {formatRand(data.summary.cashSalesAmount)}
              </p>
              <p className="text-[10px]">{data.summary.cashSalesCount} transactions</p>
            </div>
          </div>
        </Section>

        {data.daily.length > 0 && <DailyTable daily={data.daily} />}
      </div>
    );
  }

  const { summary, daily } = data;
  // Non-null in the "ready" state; coalesce defensively for the type-checker.
  const discrepancy = summary.discrepancy ?? 0;
  const cashInHand = summary.cashInHand ?? 0;

  return (
    <div className="space-y-4">
      {/* The leak: POS cash sales − cash received. Spend never enters this. */}
      <Section title="Cash gap" emphasised>
        <div className="space-y-0.5">
          <Row
            label="POS cash sales"
            count={summary.cashSalesCount}
            amount={formatRand(summary.cashSalesAmount)}
          />
          <Row label="Cash received" amount={`− ${formatRand(summary.received ?? 0)}`} />
          <Divider />
          <Row
            label={discrepancy > 0 ? "Cash discrepancy (unaccounted)" : "Cash discrepancy"}
            amount={formatRand(discrepancy)}
            bold
            highlight={discrepancy !== 0}
          />
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground/80">
          What the till rang up as cash, versus what you said you received. This is the leak —
          money spent can't explain it, because you can only spend cash that actually arrived.
        </p>
      </Section>

      {/* Cash in hand: cash received − cash spent. A separate question from the leak. */}
      <Section title="Cash in hand" subtitle="What should physically be on hand after documented spend.">
        <div className="space-y-0.5">
          <Row label="Cash received" amount={formatRand(summary.received ?? 0)} />
          <Row
            label="Cash spent"
            count={summary.spentCount}
            amount={`− ${formatRand(summary.spentAmount)}`}
          />
          <Divider />
          <Row label="Cash in hand" amount={formatRand(cashInHand)} bold />
        </div>
      </Section>

      <DailyTable daily={daily} />
    </div>
  );
}

function DailyTable({ daily }: { daily: CashGapView["daily"] }) {
  return (
    <Section title="By day" subtitle="Cash sales and cash spent grouped by transaction date.">
      {daily.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">No daily activity yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#E5E3DC]/50 text-xs text-muted-foreground">
              <th className="py-1.5 pr-2 text-left font-medium">Date</th>
              <th className="px-2 py-1.5 text-right font-medium">Cash sales</th>
              <th className="px-2 py-1.5 text-right font-medium">Sales R</th>
              <th className="px-2 py-1.5 text-right font-medium">Spent items</th>
              <th className="py-1.5 pl-2 text-right font-medium">Spent R</th>
            </tr>
          </thead>
          <tbody>
            {daily.map((row) => (
              <tr key={row.date} className="border-b border-[#E5E3DC]/30 last:border-b-0">
                <td className="py-1.5 pr-2 tabular-nums">{formatDate(row.date)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                  {row.cashSalesCount || "-"}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {row.cashSalesAmount > 0 ? formatRand(row.cashSalesAmount) : "-"}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                  {row.spentCount || "-"}
                </td>
                <td className="py-1.5 pl-2 text-right tabular-nums">
                  {row.spentAmount > 0 ? formatRand(row.spentAmount) : "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Section>
  );
}

function Section({
  title,
  subtitle,
  emphasised,
  children,
}: {
  title: string;
  subtitle?: string;
  emphasised?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("rounded-xl p-4", emphasised ? "border border-[#E5E3DC] bg-card" : "bg-section")}>
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
        {title}
      </h3>
      {subtitle && <p className="mb-3 text-xs text-muted-foreground">{subtitle}</p>}
      {children}
    </div>
  );
}

function Divider() {
  return <div className="my-1 border-t border-[#E5E3DC]/60" />;
}

function Row({
  label,
  count,
  amount,
  bold,
  highlight,
}: {
  label: string;
  count?: number;
  amount?: string;
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
              "min-w-[110px] text-right tabular-nums",
              highlight && "text-[#B45309]",
            )}
          >
            {amount}
          </span>
        )}
      </div>
    </div>
  );
}
