import { useQuery } from "@tanstack/react-query";
import type { RetailSummaryReadModel } from "@shared/retailSummary";
import type { ReviewQueueReadModel } from "@shared/reconciliationReview";
import { deriveResultsDashboardQueueMetrics } from "@shared/reconciliationResultsView";
import type { CashGapView } from "@shared/cashGap";
import { Skeleton } from "@/components/ui/skeleton";
import { InfoCard, InfoCardLabel, InfoCardAction } from "@/components/ui/info-card";
import { ArrowRight } from "lucide-react";
import { formatRand } from "@/lib/format";
import { cn } from "@/lib/utils";

interface RetailSummaryProps {
  periodId: string;
  /** Matching screen uses compact = headline + tender split only. Dashboard uses the full grid. */
  compact?: boolean;
  /** Cash gap view (dashboard only) — rendered as a compact card; full report lives in Insights. */
  cashGap?: CashGapView;
  /** Navigate to the full Cash Gap report (Insights tab). */
  onViewCashGap?: () => void;
}

export function RetailSummary({ periodId, compact = false, cashGap, onViewCashGap }: RetailSummaryProps) {
  const { data, isLoading } = useQuery<RetailSummaryReadModel>({
    queryKey: ["/api/periods", periodId, "retail-summary"],
    enabled: !!periodId,
  });
  // Shares the dashboard's review-model query (same key → React Query dedupes) for the honest
  // "needs attention" count — surplus leftovers with no partner are excluded.
  const { data: reviewModel } = useQuery<ReviewQueueReadModel>({
    queryKey: ["/api/periods", periodId, "review-model"],
    enabled: !!periodId,
  });

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40 w-full" />
        {!compact && <Skeleton className="h-48 w-full" />}
      </div>
    );
  }

  const { sales, reconciliation: rec } = data;
  const rate = rec.cardMatchRate;
  const rateColor = rate >= 95 ? "text-[#166534]" : rate >= 80 ? "text-[#B45309]" : "text-[#B91C1C]";
  const ringStroke = rate >= 80 ? "#166534" : rate >= 60 ? "#B45309" : "#B91C1C";
  const settles = rec.difference === 0;
  // "To review" = items that actually need attention (matches the Review tab badge), not raw
  // unmatched. null until the review model loads, so we never flash the inflated count.
  const reviewCount = reviewModel ? deriveResultsDashboardQueueMetrics(reviewModel).reviewCount : null;

  // ── Matching screen: headline rate + tender split only ──
  if (compact) {
    return (
      <div className="space-y-4">
        <div className="space-y-1 text-center">
          <p className={cn("font-heading text-5xl font-bold", rateColor)}>{rate}%</p>
          <p className="text-lg font-medium">of card sales reconciled to the bank</p>
          <p className="text-sm text-muted-foreground">
            {rec.matched.count} of {rec.cardSales.count} card sales matched
            {reviewCount !== null && reviewCount > 0 && ` · ${reviewCount} to review`}
          </p>
        </div>
        <div className="rounded-xl bg-section p-4">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            Point of sale
          </p>
          <div className={cn("grid divide-x divide-border/50", sales.other.count > 0 ? "grid-cols-4" : "grid-cols-3")}>
            <Figure label="Total sales" amount={sales.total.amount} count={sales.total.count} emphasis />
            <Figure label="Card" amount={sales.card.amount} count={sales.card.count} />
            <Figure label="Cash" amount={sales.cash.amount} count={sales.cash.count} />
            {sales.other.count > 0 && (
              <Figure label="Other tenders" amount={sales.other.amount} count={sales.other.count} />
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Dashboard: grid of cards (matches the fuel summary density) ──
  const cashGapCard = renderCashGapCard(cashGap, onViewCashGap);

  return (
    <div className="bg-section rounded-2xl p-6 space-y-4">
      {/* Top row: reconciliation rate · point of sale · cash gap */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <InfoCard className="flex flex-col items-center justify-center py-5 text-center">
          <div className="relative mb-3 h-24 w-24">
            <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
              <circle cx="50" cy="50" r="42" fill="none" stroke="#E5E3DC" strokeWidth="8" />
              <circle
                cx="50" cy="50" r="42" fill="none" stroke={ringStroke} strokeWidth="8" strokeLinecap="round"
                strokeDasharray={`${rate * 2.639} ${263.9 - rate * 2.639}`}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className={cn("text-2xl font-bold tabular-nums", rateColor)}>{rate}%</span>
            </div>
          </div>
          <p className="text-sm font-semibold">Card reconciled to bank</p>
          <p className="text-xs text-muted-foreground">
            {rec.matched.count} of {rec.cardSales.count} matched{reviewCount !== null && reviewCount > 0 ? ` · ${reviewCount} to review` : ""}
          </p>
        </InfoCard>

        <InfoCard className="flex flex-col">
          <InfoCardLabel>Point of sale</InfoCardLabel>
          <p className="mt-2 text-2xl font-bold tabular-nums">{formatRand(sales.total.amount)}</p>
          <p className="text-xs text-muted-foreground">{sales.total.count} sales · total takings</p>
          <div className={cn("mt-3 grid gap-2", sales.other.count > 0 ? "grid-cols-3" : "grid-cols-2")}>
            <div>
              <p className="text-xs text-muted-foreground">Card</p>
              <p className="text-sm font-semibold tabular-nums">{formatRand(sales.card.amount)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Cash</p>
              <p className="text-sm font-semibold tabular-nums">{formatRand(sales.cash.amount)}</p>
            </div>
            {sales.other.count > 0 && (
              <div>
                <p className="text-xs text-muted-foreground">Other tenders</p>
                <p className="text-sm font-semibold tabular-nums">{formatRand(sales.other.amount)}</p>
              </div>
            )}
          </div>
        </InfoCard>

        {cashGapCard}
      </div>

      {/* Card sales vs bank — detail row */}
      <InfoCard>
        <InfoCardLabel>Card sales vs bank</InfoCardLabel>
        <div className="mt-3 space-y-0.5">
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
        <div className="mt-3 flex items-center justify-between border-t border-border/50 pt-3">
          <span className="text-sm font-semibold">Card vs bank difference</span>
          <span className={cn("text-lg font-bold tabular-nums", settles ? "text-[#166534]" : "text-[#B45309]")}>
            {formatRand(rec.difference)}
          </span>
        </div>
      </InfoCard>
    </div>
  );
}

/** Compact cash-gap card for the dashboard grid. Full report lives in Insights. */
function renderCashGapCard(cashGap?: CashGapView, onView?: () => void) {
  if (!cashGap || cashGap.state === "no_cash_data") return null;
  const clickable = onView ? "cursor-pointer hover:bg-card/80 transition-colors" : "";

  if (cashGap.state === "awaiting_input") {
    return (
      <InfoCard className={cn("flex flex-col border-dashed", clickable)} onClick={onView} data-testid="card-cash-gap-awaiting">
        <InfoCardLabel>Cash gap</InfoCardLabel>
        <p className="mt-2 text-xl font-semibold tabular-nums text-muted-foreground">Not captured</p>
        <p className="text-xs text-muted-foreground">cash received not entered</p>
        <p className="mt-2 text-xs text-muted-foreground">
          POS cash sales <span className="tabular-nums text-foreground">{formatRand(cashGap.summary.cashSalesAmount)}</span>
        </p>
        {onView && <InfoCardAction className="mt-2">Enter on Step 3 <ArrowRight className="h-3 w-3" /></InfoCardAction>}
      </InfoCard>
    );
  }

  const discrepancy = cashGap.summary.discrepancy ?? 0;
  return (
    <InfoCard className={cn("flex flex-col", clickable)} onClick={onView} data-testid="card-cash-gap">
      <InfoCardLabel>Cash gap</InfoCardLabel>
      <p className={cn("mt-2 text-2xl font-bold tabular-nums", discrepancy !== 0 ? "text-[#B45309]" : "text-[#166534]")}>
        {formatRand(discrepancy)}
      </p>
      <p className="text-xs text-muted-foreground">{discrepancy !== 0 ? "unaccounted" : "fully accounted"}</p>
      <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
        <p>Cash sales <span className="tabular-nums">{formatRand(cashGap.summary.cashSalesAmount)}</span></p>
        <p>Received <span className="tabular-nums">{formatRand(cashGap.summary.received ?? 0)}</span></p>
      </div>
      {onView && <InfoCardAction className="mt-2">View report <ArrowRight className="h-3 w-3" /></InfoCardAction>}
    </InfoCard>
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
