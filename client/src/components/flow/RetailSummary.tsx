import { useQuery } from "@tanstack/react-query";
import type { RetailSummaryReadModel } from "@shared/retailSummary";
import { Skeleton } from "@/components/ui/skeleton";
import { formatRand } from "@/lib/format";
import { cn } from "@/lib/utils";

export function RetailSummary({ periodId }: { periodId: string }) {
  const { data, isLoading } = useQuery<RetailSummaryReadModel>({
    queryKey: ["/api/periods", periodId, "retail-summary"],
    enabled: !!periodId,
  });

  if (isLoading || !data) {
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const { sales, reconciliation: rec } = data;
  const settles = rec.difference === 0;
  const rate = rec.cardMatchRate;
  const rateColor = rate >= 95 ? "text-[#166534]" : rate >= 80 ? "text-[#B45309]" : "text-[#B91C1C]";

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      {/* Headline: card sales reconciled to bank */}
      <div className="rounded-2xl bg-section p-6 text-center">
        <p className={cn("font-heading text-5xl font-bold", rateColor)}>{rate}%</p>
        <p className="mt-1 text-lg font-medium">of card sales reconciled to the bank</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {rec.matched.count} of {rec.cardSales.count} card sales matched
          {rec.unmatchedCard.count + rec.unmatchedBank.count > 0 &&
            ` · ${rec.unmatchedCard.count + rec.unmatchedBank.count} to review`}
        </p>
      </div>

      {/* Point of sale: total = card + cash */}
      <div className="rounded-2xl bg-section p-6">
        <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
          Point of sale
        </h3>
        <div className="grid grid-cols-3 divide-x divide-border/50">
          <Figure label="Total sales" amount={sales.total.amount} count={sales.total.count} emphasis />
          <Figure label="Card" amount={sales.card.amount} count={sales.card.count} />
          <Figure label="Cash" amount={sales.cash.amount} count={sales.cash.count} />
        </div>
        <p className="mt-3 text-xs text-muted-foreground/70">
          Total takings split by tender. Card is what should reach the bank; cash stays at the till.
        </p>
      </div>

      {/* Card reconciled to the bank */}
      <div className="rounded-2xl bg-section p-6">
        <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
          Card sales vs bank
        </h3>
        <div className="space-y-0.5">
          <Row label="Card sales (POS)" amount={rec.cardSales.amount} count={rec.cardSales.count} />
          <Row label="Bank settled" amount={rec.bankSettled.amount} count={rec.bankSettled.count} />
          <div className="my-2 border-t border-border/50" />
          <Row label="Matched to bank" amount={rec.matched.amount} count={rec.matched.count} good />
          <Row
            label="Card sales not yet in the bank"
            amount={rec.unmatchedCard.amount}
            count={rec.unmatchedCard.count}
            warn={rec.unmatchedCard.count > 0}
          />
          <Row
            label="Bank with no matching sale"
            amount={rec.unmatchedBank.amount}
            count={rec.unmatchedBank.count}
            warn={rec.unmatchedBank.count > 0}
          />
        </div>
        <div className="mx-[-1.5rem] mt-4 rounded-b-2xl bg-card/60 px-6 py-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">Card vs bank difference</span>
            <span
              className={cn(
                "text-lg font-bold tabular-nums",
                settles ? "text-[#166534]" : "text-[#B45309]",
              )}
            >
              {formatRand(rec.difference)}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground/70">
            {settles
              ? "Card takings reconcile exactly to the bank."
              : "Card takings and bank settlements differ — the items above explain the gap."}
          </p>
        </div>
      </div>
    </div>
  );
}

function Figure({
  label,
  amount,
  count,
  emphasis,
}: {
  label: string;
  amount: number;
  count: number;
  emphasis?: boolean;
}) {
  return (
    <div className="px-4 first:pl-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("mt-1 font-bold tabular-nums", emphasis ? "text-2xl text-[#1A1200]" : "text-xl")}>
        {formatRand(amount)}
      </p>
      <p className="text-xs text-muted-foreground">
        {count} {count === 1 ? "sale" : "sales"}
      </p>
    </div>
  );
}

function Row({
  label,
  amount,
  count,
  good,
  warn,
}: {
  label: string;
  amount: number;
  count: number;
  good?: boolean;
  warn?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-0.5 text-sm">
      <span>{label}</span>
      <div className="flex items-center gap-4">
        <span className="w-10 text-right tabular-nums text-muted-foreground">{count}</span>
        <span
          className={cn(
            "min-w-[110px] text-right tabular-nums",
            good && "text-[#166534]",
            warn && "text-[#B45309]",
          )}
        >
          {formatRand(amount)}
        </span>
      </div>
    </div>
  );
}
