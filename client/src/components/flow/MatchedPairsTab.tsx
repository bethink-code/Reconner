import { useState, useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { InfoCard, InfoCardContent } from "@/components/ui/info-card";
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
    return "Excluded";
  }
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
    <div className="bg-section rounded-2xl p-6 space-y-4">
      {/* Category summary — segmented card */}
      <InfoCard>
        <InfoCardContent className="flex divide-x divide-border/50 items-end">
          {([
            ["all", "All", null, pairs.length + unmatchedCount],
            ["exact", "Lekana", "Exact", exactCount],
            ["rules", "Lekana", "Rules", rulesCount],
            ["confirmed", userName, "Confirmed", confirmedCount],
            ["reason", userName, "With reason", reasonCount],
            ["excluded", "Excluded", null, excludedCount],
            ["unmatched", "Review", null, unmatchedCount],
          ] as [string, string, string | null, number][]).map(([value, label, sublabel, count]) => {
            const isUnmatched = value === "unmatched";
            const isActive = !isUnmatched && typeFilter === value;
            return (
              <button
                key={value}
                onClick={() => {
                  if (isUnmatched && unmatchedCount > 0) {
                    setLocation(`/investigate?periodId=${periodId}`);
                  } else if (!isUnmatched) {
                    setTypeFilter(typeFilter === value ? "all" : value);
                    setPage(0);
                  }
                }}
                className={cn(
                  "flex-1 py-2 px-2 text-center transition-colors rounded-lg",
                  isActive && "bg-[#F5C400]/75",
                  !isActive && !isUnmatched && "hover:bg-white/50",
                  isUnmatched && unmatchedCount > 0 && "hover:bg-[#F5C400]/30 cursor-pointer",
                  isUnmatched && unmatchedCount === 0 && "cursor-default"
                )}
              >
                <p className={cn("text-[10px] font-semibold uppercase tracking-wider", isActive ? "text-black/50" : "text-muted-foreground/70")}>{label}</p>
                {sublabel && <p className={cn("text-[10px] uppercase tracking-wider", isActive ? "text-black/60" : "text-muted-foreground/50")}>{sublabel}</p>}
                <p className={cn(
                  "text-lg font-bold tabular-nums mt-0.5",
                  isActive && "text-[#1A1200]",
                  !isActive && isUnmatched && unmatchedCount > 0 && "text-[#B45309]"
                )}>{count}</p>
              </button>
            );
          })}
        </InfoCardContent>

        {/* Search + legend — inside segmented card */}
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/30">
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
      </InfoCard>

      {/* Context card explaining current filter */}
      {typeFilter !== "all" && (() => {
        const contexts: Record<string, { title: string; description: string }> = {
          exact: {
            title: "Exact matches by lekana",
            description: "These transactions matched perfectly — same amount, same date. No human review needed.",
          },
          rules: {
            title: "Rule-based matches by lekana",
            description: "These were matched using your configured tolerance and date window. The amounts or dates were close enough to count as a match, but not identical.",
          },
          confirmed: {
            title: `Confirmed by ${userName}`,
            description: "You manually reviewed these and confirmed they belong together.",
          },
          reason: {
            title: `Matched by ${userName} with a reason`,
            description: "You matched these and documented why — for example, a tip or an overfill that explains the difference.",
          },
          excluded: {
            title: "Excluded from matching",
            description: "Your bank flagged these as declined, cancelled, or reversed — the payment didn't go through. They're kept here for your records but weren't included in the reconciliation.",
          },
          unmatched: {
            title: "Unmatched transactions",
            description: "These bank transactions had no matching fuel record. Head to the Review tab to work through them.",
          },
        };
        const ctx = contexts[typeFilter];
        if (!ctx) return null;
        return (
          <InfoCard className="p-3">
            <p className="text-sm font-medium text-[#1A1200]">{ctx.title}</p>
            <p className="text-xs text-muted-foreground mt-1">{ctx.description}</p>
          </InfoCard>
        );
      })()}

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
          const fuelAmt = p.fuelItems && p.fuelItems.length > 1
            ? p.fuelItems.reduce((s, i) => s + parseFloat(i.amount), 0)
            : p.fuelTransaction ? parseFloat(p.fuelTransaction.amount) : 0;
          const diff = p.fuelTransaction ? Math.abs(bankAmt - fuelAmt) : 0;
          const confidence = p.match.matchConfidence ? parseFloat(p.match.matchConfidence) : null;
          const matchLabel = getMatchLabel(p.match.matchType, userName, p.bankTransaction.description);
          const excluded = p.match.matchType === "excluded";

          return (
            <div
              key={p.match.id}
              className={cn(
                "rounded-lg border p-3 grid gap-4",
                excluded
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
              {/* Left — Excluded (bank only, no fuel pair) */}
              {excluded && (
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

              {/* Right — Bank */}
              {!excluded && (
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
