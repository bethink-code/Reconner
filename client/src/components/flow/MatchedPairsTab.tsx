import { useState, useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Unlink, Search, ChevronLeft, ChevronRight, HelpCircle, ExternalLink, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { useInvalidateReconciliation } from "@/hooks/useInvalidateReconciliation";
import { cn } from "@/lib/utils";
import { formatRand } from "@/lib/format";

interface MatchedPair {
  match: {
    id: string;
    matchType: string;
    matchConfidence: string | null;
    createdAt: string;
  };
  bankTransaction: {
    id: string;
    transactionDate: string;
    transactionTime: string | null;
    amount: string;
    description: string | null;
    cardNumber: string | null;
    referenceNumber: string | null;
  } | null;
  fuelTransaction: {
    id: string;
    transactionDate: string;
    transactionTime: string | null;
    amount: string;
    description: string | null;
    attendant: string | null;
    pump: string | null;
    referenceNumber: string | null;
  } | null;
  fuelItems?: {
    id: string;
    transactionDate: string;
    transactionTime: string | null;
    amount: string;
    description: string | null;
    attendant: string | null;
    pump: string | null;
    referenceNumber: string | null;
  }[];
}

function getMatchLabel(matchType: string, userName: string, description?: string | null): string {
  if (matchType === "auto_exact" || matchType === "auto_exact_review") return "Lekana (Exact)";
  if (matchType.startsWith("auto")) return "Lekana (Rules)";
  if (matchType === "excluded") {
    const desc = (description || "").toLowerCase();
    if (desc.includes("declined")) return "Declined";
    if (desc.includes("cancelled") || desc.includes("canceled")) return "Cancelled";
    if (desc.includes("reversed")) return "Reversed";
    if (desc.includes("duplicate")) return "Duplicate";
    return "Excluded";
  }
  if (matchType === "cash") return "Cash";
  if (matchType === "debtor") return "Debtor";
  if (matchType === "unmatched_card") return "Unmatched fuel card sales";
  if (matchType === "unmatched_bank") return "Unmatched bank";
  if (matchType === "linked") return `${userName} (With reason)`;
  return `${userName} (Confirmed)`;
}

export function MatchedPairsTab({ periodId, onJumpToReview }: { periodId: string; onJumpToReview?: (side: 'bank' | 'fuel') => void }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const userName = user?.firstName || "User";
  const [search, setSearch] = useState("");
  type TopFilter = "total" | "lekana" | "garth" | "excluded" | "review";
  type SubFilter = "exact" | "rules" | "confirmed" | "reason" | "cash" | "debtor" | "duplicates" | "bank" | "card" | null;
  const [topFilter, setTopFilter] = useState<TopFilter>("total");
  const [subFilter, setSubFilter] = useState<SubFilter>(null);
  const [page, setPage] = useState(0);
  const [pendingUnmatch, setPendingUnmatch] = useState<MatchedPair | null>(null);
  const PAGE_SIZE = 25;

  const { data: pairs = [], isLoading } = useQuery<MatchedPair[]>({
    queryKey: ["/api/periods", periodId, "matches", "details"],
    enabled: !!periodId,
  });

  const invalidateAll = useInvalidateReconciliation(periodId);

  const unmatchMutation = useMutation({
    mutationFn: async (matchId: string) => {
      return await apiRequest("DELETE", `/api/matches/${matchId}`);
    },
    onSuccess: () => {
      toast({ title: "Match removed", description: "Both transactions are now unmatched and available for re-matching." });
      invalidateAll();
      setPendingUnmatch(null);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to unmatch", description: error.message, variant: "destructive" });
    },
  });

  const isExact = (mt: string) => mt === "auto_exact" || mt === "auto_exact_review";
  const isRules = (mt: string) => mt.startsWith("auto") && !isExact(mt);
  const isConfirmed = (mt: string) => mt === "user_confirmed" || mt === "manual";
  const isReason = (mt: string) => mt === "linked";
  const isDeclinedOrDuplicate = (mt: string) => mt === "excluded";
  const isCash = (mt: string) => mt === "cash";
  const isDebtor = (mt: string) => mt === "debtor";
  const isUnmatchedCard = (mt: string) => mt === "unmatched_card";
  const isUnmatchedBank = (mt: string) => mt === "unmatched_bank";

  // Counts derived from the pairs dataset (already period-scoped on the server).
  // Count fuel ITEMS rather than pair rows so the totals match the dashboard
  // (an invoice-grouped match has 1 pair row but may represent multiple fuel items).
  const counts = useMemo(() => {
    const c = {
      exact: 0, rules: 0, confirmed: 0, reason: 0,
      cash: 0, debtor: 0, duplicates: 0,
      unmatchedCard: 0, unmatchedBank: 0,
    };
    for (const p of pairs) {
      const mt = p.match.matchType;
      const fuelItemCount = p.fuelItems?.length ?? (p.fuelTransaction ? 1 : 0);
      if (isExact(mt)) c.exact += fuelItemCount;
      else if (isRules(mt)) c.rules += fuelItemCount;
      else if (isConfirmed(mt)) c.confirmed += fuelItemCount;
      else if (isReason(mt)) c.reason += fuelItemCount;
      else if (isCash(mt)) c.cash += fuelItemCount;
      else if (isDebtor(mt)) c.debtor += fuelItemCount;
      else if (isDeclinedOrDuplicate(mt)) c.duplicates += 1; // bank-only, fuel count irrelevant
      else if (isUnmatchedCard(mt)) c.unmatchedCard += fuelItemCount;
      else if (isUnmatchedBank(mt)) c.unmatchedBank += 1;
    }
    return c;
  }, [pairs]);

  const totalFuel = counts.exact + counts.rules + counts.confirmed + counts.reason + counts.cash + counts.debtor + counts.unmatchedCard;
  const totalLekana = counts.exact + counts.rules;
  const totalGarth = counts.confirmed + counts.reason;
  const totalExcluded = counts.cash + counts.debtor + counts.duplicates;
  const totalReview = counts.unmatchedCard + counts.unmatchedBank;

  const matchesTopFilter = (mt: string, t: TopFilter) => {
    switch (t) {
      case "total": return isExact(mt) || isRules(mt) || isConfirmed(mt) || isReason(mt) || isCash(mt) || isDebtor(mt) || isUnmatchedCard(mt);
      case "lekana": return isExact(mt) || isRules(mt);
      case "garth": return isConfirmed(mt) || isReason(mt);
      case "excluded": return isCash(mt) || isDebtor(mt) || isDeclinedOrDuplicate(mt);
      case "review": return isUnmatchedCard(mt) || isUnmatchedBank(mt);
    }
  };

  const matchesSubFilter = (mt: string, s: SubFilter) => {
    if (!s) return true;
    switch (s) {
      case "exact": return isExact(mt);
      case "rules": return isRules(mt);
      case "confirmed": return isConfirmed(mt);
      case "reason": return isReason(mt);
      case "cash": return isCash(mt);
      case "debtor": return isDebtor(mt);
      case "duplicates": return isDeclinedOrDuplicate(mt);
      case "bank": return isUnmatchedBank(mt);
      case "card": return isUnmatchedCard(mt);
    }
  };

  const filtered = useMemo(() => {
    let result = pairs.filter(p => matchesTopFilter(p.match.matchType, topFilter) && matchesSubFilter(p.match.matchType, subFilter));
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(p =>
        p.bankTransaction?.amount.includes(q) ||
        p.fuelTransaction?.amount.includes(q) ||
        (p.bankTransaction?.description?.toLowerCase().includes(q)) ||
        (p.bankTransaction?.cardNumber?.toLowerCase().includes(q)) ||
        (p.fuelTransaction?.attendant?.toLowerCase().includes(q)) ||
        (p.fuelTransaction?.referenceNumber?.toLowerCase().includes(q)) ||
        (p.bankTransaction?.referenceNumber?.toLowerCase().includes(q))
      );
    }
    return result;
  }, [pairs, search, topFilter, subFilter]);

  // Reset to first page when filters change
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const paged = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);
  if (safePage !== page) setPage(safePage);

  if (isLoading) {
    return (
      <div className="bg-section rounded-2xl p-6 space-y-4">
        <div className="grid grid-cols-5 gap-3">
          {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}
        </div>
        <Skeleton className="h-10 w-full rounded-md" />
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
        </div>
      </div>
    );
  }

  if (pairs.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        No transactions yet. Upload fuel and bank data to see results here.
      </div>
    );
  }

  const legendItems = [
    ["Lekana (Exact)", "Perfect 1:1 amount and date match"],
    ["Lekana (Rules)", "Matched within your configured tolerance and date window"],
    [`${userName} (Confirmed)`, "You manually matched these transactions"],
    [`${userName} (With reason)`, "You matched and provided a reason"],
    ["Excluded", "Reversed, declined, cancelled, or duplicate — excluded from matching"],
  ];

  // Summary card helper — renders one of the 5 top-level buckets
  const SummaryCard = ({
    id, label, count, countColor, subRows, onClick, disabled,
  }: {
    id: TopFilter;
    label: string;
    count: number;
    countColor?: string;
    subRows?: { key: string; label: string; count: number; isLink?: boolean; onClickSub?: () => void }[];
    onClick?: () => void;
    disabled?: boolean;
  }) => {
    const isActive = topFilter === id;
    return (
      <button
        type="button"
        onClick={onClick || (() => { setTopFilter(id); setSubFilter(null); setPage(0); })}
        disabled={disabled}
        className={cn(
          "flex flex-col text-left rounded-xl p-3.5 transition-colors border",
          isActive ? "bg-[#FCE8A8] border-[#F5CC52]" : "bg-card border-transparent hover:bg-card/70",
          disabled && "cursor-default opacity-70"
        )}
      >
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">{label}</span>
        <span className={cn("text-3xl font-bold tabular-nums leading-none mb-2", countColor || "text-[#1A1200]")}>{count}</span>
        {subRows && subRows.length > 0 && (
          <div className="border-t border-[#F0EEE8] pt-1.5 mt-auto space-y-0.5">
            {subRows.map(sr => {
              const isSubActive = isActive && subFilter === sr.key;
              return (
                <button
                  key={sr.key}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (sr.onClickSub) {
                      sr.onClickSub();
                    } else {
                      setTopFilter(id);
                      setSubFilter(isSubActive ? null : (sr.key as SubFilter));
                      setPage(0);
                    }
                  }}
                  className={cn(
                    "w-[calc(100%+1rem)] flex items-center justify-between text-xs py-0.5 -mx-2 px-2 rounded-sm transition-colors",
                    isSubActive ? "bg-white font-semibold" : "hover:bg-black/5",
                    sr.isLink && "hover:text-[#E8601C]"
                  )}
                >
                  <span className={cn("text-muted-foreground", isSubActive && "text-[#1A1200]")}>{sr.label}</span>
                  <span className={cn("tabular-nums font-medium", isSubActive ? "text-[#E8601C]" : "text-[#1A1200]")}>{sr.count}</span>
                </button>
              );
            })}
          </div>
        )}
      </button>
    );
  };

  return (
    <div className="bg-section rounded-2xl p-6 space-y-4">
      {/* Option D — 5 summary cards */}
      <div className="grid grid-cols-5 gap-3">
        <SummaryCard
          id="total"
          label="All transactions"
          count={totalFuel}
        />
        <SummaryCard
          id="lekana"
          label="Lekana matched"
          count={totalLekana}
          subRows={[
            { key: "exact", label: "Exact", count: counts.exact },
            { key: "rules", label: "Rules", count: counts.rules },
          ]}
        />
        <SummaryCard
          id="garth"
          label={`${userName} matched`}
          count={totalGarth}
          countColor={totalGarth === 0 ? "text-muted-foreground/60" : undefined}
          subRows={[
            { key: "confirmed", label: "Confirmed", count: counts.confirmed },
            { key: "reason", label: "With reason", count: counts.reason },
          ]}
        />
        <SummaryCard
          id="excluded"
          label="Excluded"
          count={totalExcluded}
          subRows={[
            { key: "cash", label: "Cash", count: counts.cash },
            { key: "debtor", label: "Debtor", count: counts.debtor },
            { key: "duplicates", label: "Bank duplicates", count: counts.duplicates },
          ]}
        />
        <SummaryCard
          id="review"
          label="To review"
          count={totalReview}
          countColor={totalReview > 0 ? "text-[#B45309]" : undefined}
          subRows={[
            {
              key: "bank",
              label: "Unmatched bank",
              count: counts.unmatchedBank,
              isLink: true,
              onClickSub: () => onJumpToReview?.('bank'),
            },
            {
              key: "card",
              label: "Unmatched fuel card sales",
              count: counts.unmatchedCard,
              isLink: true,
              onClickSub: () => onJumpToReview?.('fuel'),
            },
          ]}
        />
      </div>

      {/* Search */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by amount, description, card, attendant..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
            className="pl-9 h-8 text-sm bg-white dark:bg-card"
          />
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 shrink-0 text-muted-foreground">
              <HelpCircle className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">Match Types</p>
              {legendItems.map(([label, desc]) => (
                <div key={label} className="flex gap-2">
                  <Badge variant="outline" className="text-[11px] px-1.5 py-0 shrink-0 h-5">{label}</Badge>
                  <span className="text-xs text-muted-foreground">{desc}</span>
                </div>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Count + pagination info */}
      <div className="flex items-center justify-between px-3 mb-2">
        <p className="text-xs text-muted-foreground">
          {filtered.length} {filtered.length === 1 ? "transaction" : "transactions"}
          {(topFilter !== "total" || subFilter) && (
            <button
              type="button"
              onClick={() => { setTopFilter("total"); setSubFilter(null); }}
              className="ml-2 text-[#E8601C] hover:underline"
            >
              Clear filter
            </button>
          )}
        </p>
        {totalPages > 1 && (
          <p className="text-xs text-muted-foreground">
            Page {safePage + 1} of {totalPages}
          </p>
        )}
      </div>

      {/* Pair list */}
      <div className="space-y-2">
        {paged.map(p => {
          const bankAmt = p.bankTransaction ? parseFloat(p.bankTransaction.amount) : 0;
          const fuelAmt = p.fuelItems && p.fuelItems.length > 1
            ? p.fuelItems.reduce((s, i) => s + parseFloat(i.amount), 0)
            : p.fuelTransaction ? parseFloat(p.fuelTransaction.amount) : 0;
          const diff = (p.fuelTransaction && p.bankTransaction) ? Math.abs(bankAmt - fuelAmt) : 0;
          const confidence = p.match.matchConfidence ? parseFloat(p.match.matchConfidence) : null;
          const matchLabel = getMatchLabel(p.match.matchType, userName, p.bankTransaction?.description);
          const mt = p.match.matchType;
          const bankOnly = !p.fuelTransaction && !!p.bankTransaction;
          const fuelOnly = !p.bankTransaction && !!p.fuelTransaction;
          const muted = bankOnly || fuelOnly;

          return (
            <div
              key={p.match.id}
              className={cn(
                "rounded-lg border p-3 grid gap-4",
                muted
                  ? "border-muted bg-muted/20 grid-cols-[1fr_auto]"
                  : "border-[#E5E3DC]/50 bg-card grid-cols-[1fr_auto_1fr]"
              )}
            >
              {/* Left — Fuel */}
              {p.fuelTransaction && !p.fuelItems && (
                <div className="min-w-0 space-y-0.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                    Fuel
                    {p.fuelTransaction.referenceNumber && <span className="normal-case tracking-normal font-normal text-[11px]"> · Inv: {p.fuelTransaction.referenceNumber}</span>}
                  </p>
                  <p className="text-sm font-semibold tabular-nums">{formatRand(fuelAmt)}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {p.fuelTransaction.transactionDate}
                    {p.fuelTransaction.transactionTime && ` ${p.fuelTransaction.transactionTime}`}
                    {p.fuelTransaction.attendant && ` \u2022 ${p.fuelTransaction.attendant}`}
                  </p>
                  {p.fuelTransaction.pump && (
                    <p className="text-xs text-muted-foreground">Pump {p.fuelTransaction.pump}</p>
                  )}
                </div>
              )}
              {/* Left — Fuel (invoice group: multiple items) */}
              {p.fuelItems && p.fuelItems.length > 1 && (
                <div className="min-w-0 space-y-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                    Fuel · {p.fuelItems.length} items
                    {p.fuelItems[0].referenceNumber && <span className="normal-case tracking-normal font-normal text-[11px]"> · Inv: {p.fuelItems[0].referenceNumber}</span>}
                  </p>
                  {p.fuelItems.map((item, idx) => (
                    <div key={item.id} className={cn("space-y-0.5", idx > 0 && "pt-1.5 border-t border-[#E5E3DC]/30")}>
                      <p className="text-sm font-semibold tabular-nums">{formatRand(item.amount)}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {item.transactionDate}
                        {item.transactionTime && ` ${item.transactionTime}`}
                        {item.attendant && ` \u2022 ${item.attendant}`}
                      </p>
                      {item.pump && (
                        <p className="text-xs text-muted-foreground">Pump {item.pump}</p>
                      )}
                    </div>
                  ))}
                  <p className="text-xs font-medium text-muted-foreground pt-1 border-t border-[#E5E3DC]/30 tabular-nums">
                    Total: {formatRand(p.fuelItems.reduce((s, i) => s + parseFloat(i.amount), 0))}
                  </p>
                </div>
              )}
              {/* Left — Bank only (excluded, unmatched_bank) */}
              {bankOnly && p.bankTransaction && (
                <div className="min-w-0 space-y-0.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">Bank</p>
                  <p className="text-sm font-semibold tabular-nums text-muted-foreground">{formatRand(bankAmt)}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {p.bankTransaction.transactionDate}
                    {p.bankTransaction.transactionTime && ` ${p.bankTransaction.transactionTime}`}
                    {p.bankTransaction.description && ` \u2022 ${p.bankTransaction.description}`}
                  </p>
                  {p.bankTransaction.cardNumber && (
                    <p className="text-xs text-muted-foreground">{p.bankTransaction.cardNumber}</p>
                  )}
                </div>
              )}

              {/* Middle — Match info */}
              <div className="flex flex-col items-center justify-center gap-1.5 min-w-[140px] -my-3 py-3 px-3 bg-card">
                <Badge variant="outline" className={cn("text-xs px-2 py-0.5", muted && "text-muted-foreground")}>
                  {matchLabel}
                </Badge>
                {confidence !== null && (
                  <span className="text-xs text-muted-foreground">{Math.round(confidence)}%</span>
                )}
                {diff > 0.005 && (
                  <span className="text-xs text-amber-600 font-medium">
                    Diff {formatRand(diff)}
                  </span>
                )}
                {!muted && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs text-muted-foreground hover:text-red-600 mt-0.5"
                    onClick={() => setPendingUnmatch(p)}
                    disabled={unmatchMutation.isPending}
                  >
                    <Unlink className="h-3 w-3 mr-1" />
                    Unmatch
                  </Button>
                )}
              </div>

              {/* Right — Bank (paired rows only) */}
              {!muted && p.bankTransaction && (
                <div className="min-w-0 space-y-0.5 text-right">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">Bank</p>
                  <p className="text-sm font-semibold tabular-nums">{formatRand(bankAmt)}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {p.bankTransaction.transactionDate}
                    {p.bankTransaction.transactionTime && ` ${p.bankTransaction.transactionTime}`}
                    {p.bankTransaction.description && ` \u2022 ${p.bankTransaction.description}`}
                  </p>
                  {(p.bankTransaction.cardNumber || p.bankTransaction.referenceNumber) && (
                    <p className="text-xs text-muted-foreground">
                      {p.bankTransaction.referenceNumber && <span>Ref: {p.bankTransaction.referenceNumber}</span>}
                      {p.bankTransaction.referenceNumber && p.bankTransaction.cardNumber && ' \u2022 '}
                      {p.bankTransaction.cardNumber}
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Pagination controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-1">
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2"
            disabled={safePage === 0}
            onClick={() => setPage(safePage - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-xs text-muted-foreground tabular-nums">
            {safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2"
            disabled={safePage >= totalPages - 1}
            onClick={() => setPage(safePage + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Confirmation dialog */}
      <AlertDialog open={!!pendingUnmatch} onOpenChange={open => { if (!open) setPendingUnmatch(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove match?</AlertDialogTitle>
            <AlertDialogDescription>
              This will unlink the bank transaction ({pendingUnmatch ? formatRand(pendingUnmatch.bankTransaction.amount) : ""}) from its fuel match.
              Both transactions will return to the unmatched pool for re-investigation.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              disabled={unmatchMutation.isPending}
              onClick={() => {
                if (pendingUnmatch) unmatchMutation.mutate(pendingUnmatch.match.id);
              }}
            >
              {unmatchMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
              Remove match
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
