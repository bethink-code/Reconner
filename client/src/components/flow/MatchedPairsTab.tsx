import { useState, useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

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
  };
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
}

const formatRand = (amount: string | number) => {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return "R " + num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

function getMatchLabel(matchType: string, userName: string): string {
  if (matchType === "auto_exact" || matchType === "auto_exact_review") return "Lekana (Exact)";
  if (matchType.startsWith("auto")) return "Lekana (Rules)";
  if (matchType === "excluded") return "Excluded";
  if (matchType === "linked") return `${userName} (With reason)`;
  return `${userName} (Confirmed)`;
}

export function MatchedPairsTab({ periodId }: { periodId: string }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const userName = user?.firstName || "User";
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "exact" | "rules" | "confirmed" | "reason" | "excluded">("all");
  const [page, setPage] = useState(0);
  const [pendingUnmatch, setPendingUnmatch] = useState<MatchedPair | null>(null);
  const PAGE_SIZE = 25;

  const { data: pairs = [], isLoading } = useQuery<MatchedPair[]>({
    queryKey: ["/api/periods", periodId, "matches", "details"],
    enabled: !!periodId,
  });

  const { data: summary } = useQuery<{ unmatchedBankTransactions: number }>({
    queryKey: ["/api/periods", periodId, "summary"],
    enabled: !!periodId,
  });

  const unmatchMutation = useMutation({
    mutationFn: async (matchId: string) => {
      return await apiRequest("DELETE", `/api/matches/${matchId}`);
    },
    onSuccess: () => {
      toast({ title: "Match removed", description: "Both transactions are now unmatched and available for re-matching." });
      queryClient.invalidateQueries({ queryKey: ["/api/periods", periodId, "summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/periods", periodId, "matches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/periods", periodId, "transactions"] });
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
  const isExcluded = (mt: string) => mt === "excluded";

  const filtered = useMemo(() => {
    let result = pairs;
    if (typeFilter === "exact") {
      result = result.filter(p => isExact(p.match.matchType));
    } else if (typeFilter === "rules") {
      result = result.filter(p => isRules(p.match.matchType));
    } else if (typeFilter === "confirmed") {
      result = result.filter(p => isConfirmed(p.match.matchType));
    } else if (typeFilter === "reason") {
      result = result.filter(p => isReason(p.match.matchType));
    } else if (typeFilter === "excluded") {
      result = result.filter(p => isExcluded(p.match.matchType));
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(p =>
        p.bankTransaction.amount.includes(q) ||
        p.fuelTransaction.amount.includes(q) ||
        (p.bankTransaction.description?.toLowerCase().includes(q)) ||
        (p.bankTransaction.cardNumber?.toLowerCase().includes(q)) ||
        (p.fuelTransaction.attendant?.toLowerCase().includes(q)) ||
        (p.fuelTransaction.referenceNumber?.toLowerCase().includes(q)) ||
        (p.bankTransaction.referenceNumber?.toLowerCase().includes(q))
      );
    }
    return result;
  }, [pairs, search, typeFilter]);

  const exactCount = useMemo(() => pairs.filter(p => isExact(p.match.matchType)).length, [pairs]);
  const rulesCount = useMemo(() => pairs.filter(p => isRules(p.match.matchType)).length, [pairs]);
  const confirmedCount = useMemo(() => pairs.filter(p => isConfirmed(p.match.matchType)).length, [pairs]);
  const reasonCount = useMemo(() => pairs.filter(p => isReason(p.match.matchType)).length, [pairs]);
  const excludedCount = useMemo(() => pairs.filter(p => isExcluded(p.match.matchType)).length, [pairs]);
  const unmatchedCount = summary?.unmatchedBankTransactions ?? 0;

  // Reset to first page when filters change
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const paged = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);
  if (safePage !== page) setPage(safePage);

  if (isLoading) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">Loading matched pairs...</div>
    );
  }

  if (pairs.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        No matched pairs yet. Run auto-match or manually match transactions to see results here.
      </div>
    );
  }

  const legendItems = [
    ["Lekana (Exact)", "Perfect 1:1 amount and date match"],
    ["Lekana (Rules)", "Matched within your configured tolerance and date window"],
    [`${userName} (Confirmed)`, "You manually matched these transactions"],
    [`${userName} (With reason)`, "You matched and provided a reason"],
    ["Excluded", "Reversed, declined, or cancelled — excluded from matching"],
  ];

  return (
    <div>
      {/* Category summary cards */}
      <div className="flex gap-2 flex-wrap">
        {([
          ["all", "All", pairs.length + unmatchedCount],
          ["exact", "Lekana (Exact)", exactCount],
          ["rules", "Lekana (Rules)", rulesCount],
          ["confirmed", `${userName} (Confirmed)`, confirmedCount],
          ["reason", `${userName} (With reason)`, reasonCount],
          ["excluded", "Excluded", excludedCount],
        ] as const).map(([value, label, count]) => (
          <button
            key={value}
            onClick={() => { setTypeFilter(typeFilter === value ? "all" : value); setPage(0); }}
            className={cn(
              "rounded-lg p-2.5 text-left transition-colors border flex-1 min-w-0 min-h-[72px] flex flex-col justify-end",
              typeFilter === value
                ? "border-[#B8860B]/30 bg-[#FEF9C3] dark:bg-amber-950/30"
                : "border-[#E5E3DC]/50 bg-[#FAFAF6] dark:bg-muted/30 hover:border-[#B8860B]/20"
            )}
          >
            {(() => {
              const match = label.match(/^(.+?)\s*\((.+)\)$/);
              return match ? (
                <>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">{match[1]}</p>
                  <p className="text-[9px] uppercase tracking-wider text-muted-foreground/50">{match[2]}</p>
                </>
              ) : (
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">{label}</p>
              );
            })()}
            <p className={cn("text-lg font-semibold tabular-nums mt-0.5", typeFilter === value && "text-[#B45309]")}>{count}</p>
          </button>
        ))}
        {/* Unmatched card — navigates to investigate */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setLocation(`/investigate?periodId=${periodId}`)}
          style={{ cursor: 'pointer' }}
          className={cn(
            "rounded-lg p-2.5 text-left transition-colors border flex-1 min-w-0 min-h-[72px] flex flex-col justify-end",
            unmatchedCount > 0
              ? "border-[#B45309]/20 bg-[#FEF9C3]/50 hover:bg-[#FEF9C3]"
              : "border-[#E5E3DC]/50 bg-[#FAFAF6] dark:bg-muted/30"
          )}
        >
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">Unmatched</p>
          <p className={cn("text-lg font-semibold tabular-nums mt-0.5", unmatchedCount > 0 && "text-[#B45309]")}>{unmatchedCount}</p>
        </div>
      </div>

      {/* Search + legend */}
      <div className="flex items-center gap-2 mt-5" style={{ marginBottom: '4rem' }}>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by amount, description, card, attendant..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
            className="pl-9 h-8 text-sm"
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
          {filtered.length} {filtered.length === 1 ? "pair" : "pairs"}
          {typeFilter !== "all" && ` — click again to clear filter`}
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
          const bankAmt = parseFloat(p.bankTransaction.amount);
          const fuelAmt = p.fuelTransaction ? parseFloat(p.fuelTransaction.amount) : 0;
          const diff = p.fuelTransaction ? Math.abs(bankAmt - fuelAmt) : 0;
          const confidence = p.match.matchConfidence ? parseFloat(p.match.matchConfidence) : null;
          const matchLabel = getMatchLabel(p.match.matchType, userName);
          const excluded = p.match.matchType === "excluded";

          return (
            <div
              key={p.match.id}
              className={cn(
                "rounded-lg border p-3 grid gap-4",
                excluded
                  ? "border-muted bg-muted/20 grid-cols-[1fr_auto]"
                  : "border-[#E5E3DC] bg-[#FAFAF6] dark:bg-muted/30 grid-cols-[1fr_auto_1fr]"
              )}
            >
              {/* Left — Bank */}
              <div className="min-w-0 space-y-0.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">Bank</p>
                <p className={cn("text-sm font-semibold tabular-nums", excluded && "text-muted-foreground")}>{formatRand(bankAmt)}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {p.bankTransaction.transactionDate}
                  {p.bankTransaction.transactionTime && ` ${p.bankTransaction.transactionTime}`}
                  {p.bankTransaction.description && ` \u2022 ${p.bankTransaction.description}`}
                </p>
                {p.bankTransaction.cardNumber && (
                  <p className="text-xs text-muted-foreground">{p.bankTransaction.cardNumber}</p>
                )}
              </div>

              {/* Middle — Match info */}
              <div className="flex flex-col items-center justify-center gap-1.5 min-w-[140px]">
                <Badge variant="outline" className={cn("text-xs px-2 py-0.5", excluded && "text-muted-foreground")}>
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
                {!excluded && (
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

              {/* Right — Fuel */}
              {p.fuelTransaction && (
                <div className="min-w-0 space-y-0.5 text-right">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">Fuel</p>
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
