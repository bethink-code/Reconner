import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Search, X, Check, ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate, formatRand } from "@/lib/format";
import { useAuth } from "@/hooks/useAuth";
import { CATEGORY_LABELS } from "@/lib/reconciliation-types";
import type {
  CategorizedTransaction,
  ReviewQueueReadModel,
} from "@/lib/reconciliation-types";
import { InvestigateModal } from "./InvestigateModal";
import { TransactionRow } from "./TransactionRow";

type ReviewSide = "bank" | "fuel";

interface ReviewTabProps {
  periodId: string;
  initialSide?: ReviewSide;
}

export function ReviewTab({ periodId, initialSide }: ReviewTabProps) {
  const { user } = useAuth();
  const userName = user?.firstName || "User";
  const [side, setSide] = useState<ReviewSide>(initialSide || "fuel");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<"date" | "amount">("date");
  // Default: newest transactions at the top.
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [modalOpen, setModalOpen] = useState(false);
  const [modalInitialIndex, setModalInitialIndex] = useState(0);
  const [modalItems, setModalItems] = useState<CategorizedTransaction[]>([]);

  useEffect(() => {
    setSearchQuery("");
  }, [side]);

  useEffect(() => {
    if (initialSide) {
      setSide(initialSide);
    }
  }, [initialSide]);

  const { data: reviewModel, isLoading } = useQuery<ReviewQueueReadModel>({
    queryKey: ["/api/periods", periodId, "review-model"],
    queryFn: async () => {
      const response = await fetch(`/api/periods/${periodId}/review-model`);
      if (!response.ok) throw new Error("Failed to fetch review data");
      return response.json();
    },
    enabled: !!periodId,
    refetchOnMount: false,
  });

  const sideModel = reviewModel?.sides[side];

  const filteredTransactions = useMemo(() => {
    if (!sideModel) return [];
    if (!searchQuery.trim()) return sideModel.transactions;

    const query = searchQuery.toLowerCase().trim();
    return sideModel.transactions.filter((item) => {
      const transaction = item.transaction;
      return (
        transaction.description?.toLowerCase().includes(query) ||
        transaction.referenceNumber?.toLowerCase().includes(query) ||
        transaction.sourceName?.toLowerCase().includes(query) ||
        parseFloat(transaction.amount).toFixed(2).includes(query) ||
        formatDate(transaction.transactionDate).toLowerCase().includes(query)
      );
    });
  }, [searchQuery, sideModel]);

  const sortedTransactions = useMemo(() => {
    const items = [...filteredTransactions];
    const dir = sortDir === "asc" ? 1 : -1;
    items.sort((a, b) => {
      if (sortField === "amount") {
        const diff = parseFloat(a.transaction.amount) - parseFloat(b.transaction.amount);
        if (diff !== 0) return diff * dir;
      } else {
        const aKey = `${a.transaction.transactionDate ?? ""} ${a.transaction.transactionTime ?? ""}`;
        const bKey = `${b.transaction.transactionDate ?? ""} ${b.transaction.transactionTime ?? ""}`;
        const cmp = aKey.localeCompare(bKey);
        if (cmp !== 0) return cmp * dir;
      }
      return a.transaction.id.localeCompare(b.transaction.id);
    });
    return items;
  }, [filteredTransactions, sortField, sortDir]);

  const totalUnresolved = sideModel?.transactions.length || 0;

  const openModal = (transactionId: string) => {
    const index = sortedTransactions.findIndex((item) => item.transaction.id === transactionId);
    if (index < 0) return;

    setModalItems(sortedTransactions);
    setModalInitialIndex(index);
    setModalOpen(true);
  };

  if (isLoading || !reviewModel || !sideModel) {
    return (
      <div className="mx-auto space-y-4">
        {[1, 2, 3].map((item) => (
          <Skeleton key={item} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  const sideCards: { key: ReviewSide; label: string }[] = [
    { key: "fuel", label: "Sales transactions" },
    { key: "bank", label: "Bank transactions" },
  ];

  return (
    <div className="mx-auto space-y-4">
      <div className="px-3 py-4">
        <h2 className="text-2xl font-heading font-semibold text-[#1A1200]">Review unmatched transactions</h2>
        <p className="text-sm text-muted-foreground">
          Work through each side. Resolve what you can. Anything you can&apos;t explain goes to Investigate.
        </p>
      </div>

      <div className="bg-section rounded-xl overflow-hidden p-4 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          {sideCards.map((card) => {
            const isActive = side === card.key;
            const summary = reviewModel.sides[card.key].summary;
            return (
              <button
                key={card.key}
                onClick={() => {
                  setSide(card.key);
                  setSearchQuery("");
                }}
                className={cn(
                  "rounded-xl p-5 text-left transition-colors",
                  isActive ? "bg-card border border-[#E5E3DC]/50 shadow-sm" : "hover:bg-background",
                )}
              >
                <h3 className="mb-3 text-sm font-semibold text-[#1A1200]">{card.label}</h3>

                <div className="mb-1 flex items-baseline justify-between">
                  <p
                    className={cn(
                      "text-3xl font-bold tabular-nums",
                      summary.unresolvedCount > 0 ? "text-[#B45309]" : "text-[#166534]",
                    )}
                  >
                    {summary.unresolvedCount}
                  </p>
                  <p
                    className={cn(
                      "text-base font-bold tabular-nums",
                      summary.unresolvedCount > 0 ? "text-[#B45309]" : "text-[#1A1200]",
                    )}
                  >
                    {formatRand(summary.unresolvedAmount)}
                  </p>
                </div>

                <div className="mb-4 flex items-baseline justify-between">
                  <p className="text-xs text-muted-foreground">To review</p>
                  <p className="text-[10px] text-muted-foreground">
                    across {summary.originalCount} {card.key === "bank" ? "bank" : "sales"} transactions
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className={cn("rounded-lg p-2.5", isActive ? "bg-section" : "bg-white dark:bg-card")}>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                      Reviewed by {userName}
                    </p>
                    <p className={cn("text-lg font-bold tabular-nums", summary.matchedCount > 0 && "text-[#166534]")}>
                      {summary.matchedCount}
                    </p>
                    <p
                      className={cn(
                        "text-sm font-medium tabular-nums",
                        summary.matchedAmount > 0 ? "text-[#166534]" : "text-muted-foreground",
                      )}
                    >
                      {summary.matchedAmount > 0 ? formatRand(summary.matchedAmount) : "\u2014"}
                    </p>
                  </div>

                  <div className={cn("rounded-lg p-2.5", isActive ? "bg-section" : "bg-white dark:bg-card")}>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                      To Investigate
                    </p>
                    <p className={cn("text-lg font-bold tabular-nums", summary.flaggedCount > 0 && "text-[#B45309]")}>
                      {summary.flaggedCount}
                    </p>
                    <p
                      className={cn(
                        "text-sm font-medium tabular-nums",
                        summary.flaggedAmount > 0 ? "text-[#B45309]" : "text-muted-foreground",
                      )}
                    >
                      {summary.flaggedAmount > 0 ? formatRand(summary.flaggedAmount) : "\u2014"}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {totalUnresolved === 0 && sideModel.transactions.length === 0 ? (
          <div className="bg-card rounded-xl p-8">
            <div className="flex flex-col items-center justify-center gap-4 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#DCFCE7]">
                <Check className="h-6 w-6 text-[#166534]" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-[#1A1200]">Review Complete</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  All {side === "fuel" ? "sales" : "bank"} transactions have been reviewed.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-section rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search by amount, description, reference, or date..."
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  className="bg-card pl-9"
                />
                {searchQuery && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2"
                    onClick={() => setSearchQuery("")}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <span className="text-xs text-muted-foreground">Sort</span>
                <div className="flex overflow-hidden rounded-lg border border-border/50 bg-card">
                  {(["date", "amount"] as const).map((field) => (
                    <button
                      key={field}
                      type="button"
                      onClick={() => setSortField(field)}
                      className={cn(
                        "px-3 py-1.5 text-xs capitalize transition-colors",
                        field === "amount" && "border-l border-border/50",
                        sortField === field
                          ? "bg-section font-medium text-[#1A1200]"
                          : "text-muted-foreground hover:bg-section/50",
                      )}
                    >
                      {field}
                    </button>
                  ))}
                </div>
                <Button
                  variant="secondary"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => setSortDir((dir) => (dir === "asc" ? "desc" : "asc"))}
                  title={sortDir === "asc" ? "Ascending" : "Descending"}
                  aria-label={`Sort ${sortDir === "asc" ? "ascending" : "descending"}`}
                >
                  {sortDir === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>

            {searchQuery && filteredTransactions.length === 0 ? (
              <div className="py-6 text-center">
                <Search className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">No transactions match "{searchQuery}"</p>
                <Button variant="ghost" size="sm" onClick={() => setSearchQuery("")}>
                  Clear search
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {sortedTransactions.map((item) => {
                  const isResolved = item.category === "resolved";
                  const categoryLabel = CATEGORY_LABELS[item.category] || item.category;
                  const bestStageLabel = item.bestMatch?.stageLabel;
                  const badgeLabel =
                    !isResolved && bestStageLabel ? `${categoryLabel} · ${bestStageLabel}` : categoryLabel;

                  return (
                    <TransactionRow
                      key={item.transaction.id}
                      transaction={item.transaction}
                      onClick={() => openModal(item.transaction.id)}
                      dimmed={isResolved}
                      badge={
                        <Badge
                          variant="outline"
                          className={cn("text-xs", isResolved && "text-[#166534] border-[#166534]/30")}
                        >
                          {badgeLabel}
                        </Badge>
                      }
                      subtitle={!isResolved && item.insights.length > 0 ? item.insights[0].message : undefined}
                      subtitleColor={!isResolved && item.insights.length > 0 ? "text-[#B45309]" : undefined}
                    />
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      <InvestigateModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        items={modalItems}
        initialIndex={modalInitialIndex}
        periodId={periodId}
        matchingRules={reviewModel.matchingRules}
        onResolved={() => {}}
        side={side}
      />
    </div>
  );
}
