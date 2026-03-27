import { useState, useEffect, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ChevronLeft, ChevronRight, Link2, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useInvalidateReconciliation } from "@/hooks/useInvalidateReconciliation";
import { cn } from "@/lib/utils";
import { formatRand, formatDate } from "@/lib/format";
import { RESOLUTION_REASONS } from "@shared/schema";
import type { Transaction, MatchingRulesConfig } from "@shared/schema";
import { CATEGORY_LABELS } from "@/lib/reconciliation-types";
import type { CategorizedTransaction } from "@/lib/reconciliation-types";

interface InvestigateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: CategorizedTransaction[];
  initialIndex: number;
  periodId: string;
  matchingRules?: MatchingRulesConfig;
  onResolved: () => void;
  hideInvestigateButton?: boolean;
  side?: 'bank' | 'fuel';
}

const INSIGHT_REASON_MAP: Record<string, string> = {
  possible_tip: "possible_tip",
  overfill: "attendant_overfill",
  duplicate_charge: "duplicate_charge",
  no_fuel_record: "no_fuel_record",
};

export function InvestigateModal({
  open,
  onOpenChange,
  items,
  initialIndex,
  periodId,
  matchingRules,
  onResolved,
  hideInvestigateButton,
  side = 'bank',
}: InvestigateModalProps) {
  const { toast } = useToast();
  const invalidateAll = useInvalidateReconciliation(periodId);
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [selectedReason, setSelectedReason] = useState("");
  const [resolutionNotes, setResolutionNotes] = useState("");

  // Reset when opening or navigating
  useEffect(() => {
    setCurrentIndex(initialIndex);
  }, [initialIndex, open]);

  const populateFromInsights = useCallback((item: CategorizedTransaction) => {
    if (item.insights.length > 0) {
      const primary = item.insights[0];
      setSelectedReason(INSIGHT_REASON_MAP[primary.type] || "other");
      setResolutionNotes(primary.detail || primary.message);
    } else {
      setSelectedReason("");
      setResolutionNotes("");
    }
  }, []);

  // Pre-populate when index changes
  useEffect(() => {
    if (open && items[currentIndex]) {
      populateFromInsights(items[currentIndex]);
    }
  }, [currentIndex, open, items, populateFromInsights]);

  // Mutations — must be before any early returns
  const createMatchMutation = useMutation({
    mutationFn: async ({ bankId, fuelId }: { bankId: string; fuelId: string }) => {
      // Create the match
      await apiRequest("POST", "/api/matches/manual", {
        periodId,
        bankTransactionId: bankId,
        fuelTransactionId: fuelId,
      });
      // Also create a resolution so the Review tab can track it
      const primaryId = side === 'fuel' ? fuelId : bankId;
      await apiRequest("POST", "/api/resolutions", {
        transactionId: primaryId,
        resolutionType: "linked",
        reason: "manual_match",
        notes: "Linked via review",
        periodId,
      });
    },
    onSuccess: () => {
      toast({ title: "Match created", description: "The transactions have been linked." });
      invalidateAndAdvance();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create match", description: error.message, variant: "destructive" });
    },
  });

  const resolveMutation = useMutation({
    mutationFn: async (data: { transactionId: string; resolutionType: string; reason?: string; notes?: string }) => {
      return await apiRequest("POST", "/api/resolutions", { ...data, periodId });
    },
    onSuccess: () => {
      toast({ title: "Transaction resolved" });
      invalidateAndAdvance();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to resolve", description: error.message, variant: "destructive" });
    },
  });

  const unmatchResolutionMutation = useMutation({
    mutationFn: async (transactionId: string) => {
      return await apiRequest("DELETE", `/api/resolutions/${transactionId}`);
    },
    onSuccess: () => {
      toast({ title: "Resolution removed", description: "Transaction is back to unmatched." });
      invalidateAndAdvance();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to unmatch", description: error.message, variant: "destructive" });
    },
  });

  const invalidateAndAdvance = () => {
    invalidateAll();
    onResolved();
    onOpenChange(false);
  };

  const handleResolve = () => {
    resolveMutation.mutate({
      transactionId: txn.id,
      resolutionType: "reviewed",
      reason: selectedReason,
      notes: resolutionNotes,
    });
  };

  const handleFlag = () => {
    resolveMutation.mutate({
      transactionId: txn.id,
      resolutionType: "flagged",
      notes: resolutionNotes || "To investigate",
    });
  };

  const handleDismiss = () => {
    resolveMutation.mutate({
      transactionId: txn.id,
      resolutionType: "dismissed",
      reason: "test_transaction",
      notes: resolutionNotes || "Low value — dismissed",
    });
  };

  const handleLink = (candidateTxn: Transaction) => {
    const bankId = side === 'fuel' ? candidateTxn.id : txn.id;
    const fuelId = side === 'fuel' ? txn.id : candidateTxn.id;
    createMatchMutation.mutate({ bankId, fuelId });
  };

  const isPending = resolveMutation.isPending || createMatchMutation.isPending || unmatchResolutionMutation.isPending;

  const item = items[currentIndex];
  if (!item) return null;

  const txn = item.transaction;
  const total = items.length;

  const goNext = () => {
    if (currentIndex < total - 1) setCurrentIndex(currentIndex + 1);
  };
  const goPrev = () => {
    if (currentIndex > 0) setCurrentIndex(currentIndex - 1);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl p-0 gap-0 overflow-hidden bg-card [--button-outline:#E5E3DC]" hideCloseButton>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E5E3DC]">
          <p className="text-sm text-muted-foreground">
            Case <span className="font-semibold text-[#1A1200]">{currentIndex + 1} of {total}</span>
            {" — "}
            {CATEGORY_LABELS[item.category] || item.category}
          </p>
          <button
            onClick={() => onOpenChange(false)}
            className="text-muted-foreground hover:text-[#1A1200] transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
        </div>

        {/* Scrollable content */}
        <div className="px-6 py-6 max-h-[65vh] overflow-y-auto">
          {/* Transaction summary — hero section */}
          <div className="mb-6">
            <p className="text-3xl font-bold tabular-nums text-[#1A1200]">{formatRand(txn.amount)}</p>
            <p className="text-sm text-muted-foreground mt-2">
              <span className="font-medium text-[#1A1200]">{txn.description || txn.sourceName || "Unknown"}</span>
              {" · "}
              {formatDate(txn.transactionDate)}
              {txn.transactionTime && ` · ${txn.transactionTime}`}
              {txn.sourceName && ` · ${txn.sourceName}`}
            </p>
          </div>

          {/* Finding box */}
          <div className="rounded-xl border border-[#E5E3DC]/50 overflow-hidden mb-6">
            {/* Insight finding */}
            {item.insights.length > 0 && (
              <div className="px-5 py-4 space-y-2 bg-[#FEF9C3]/40">
                <p className="text-xs font-semibold uppercase tracking-wider text-[#B45309]">Finding</p>
                {item.insights.map((insight, i) => (
                  <div key={i}>
                    <p className={cn("text-sm font-medium",
                      insight.type === "possible_tip" && "text-[#B45309]",
                      insight.type === "overfill" && "text-[#C05A2A]",
                      insight.type === "duplicate_charge" && "text-[#B91C1C]",
                      insight.type === "no_fuel_record" && "text-[#6B7280]"
                    )}>
                      {insight.message}
                    </p>
                    {insight.detail && (
                      <p className="text-xs text-muted-foreground mt-1">{insight.detail}</p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Matching rules — plain language */}
            {matchingRules && (
              <div className="px-5 py-3 border-t border-[#E5E3DC]/40 bg-section">
                <p className="text-xs text-muted-foreground">
                  Current matching settings: {matchingRules.dateWindowDays} day date window, R{Number(matchingRules.amountTolerance).toFixed(0)} amount tolerance, {matchingRules.timeWindowMinutes} min time window, and {matchingRules.minimumConfidence}% minimum confidence.
                </p>
              </div>
            )}

            {/* Best match */}
            {item.bestMatch && (
              <div className="px-5 py-4 border-t border-[#E5E3DC]/40 bg-[#DCFCE7]/30">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-[#166534] mb-1">Best Match</p>
                    <p className="text-base font-bold tabular-nums text-[#1A1200]">
                      {formatRand(item.bestMatch.transaction.amount)}
                      {(() => {
                        const bankAmt = parseFloat(item.transaction.amount) || 0;
                        const fuelAmt = parseFloat(item.bestMatch!.transaction.amount) || 0;
                        const diff = Math.abs(bankAmt - fuelAmt);
                        if (diff < 0.005) return null;
                        return <span className="text-sm font-medium text-[#B45309] ml-2">diff R {diff.toFixed(2)}</span>;
                      })()}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatDate(item.bestMatch.transaction.transactionDate)}
                      {item.bestMatch.transaction.transactionTime && ` · ${item.bestMatch.transaction.transactionTime}`}
                      {item.bestMatch.transaction.attendant && ` · ${item.bestMatch.transaction.attendant}`}
                      {item.bestMatch.transaction.pump && ` · Pump ${item.bestMatch.transaction.pump}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={cn("text-xs font-semibold",
                      item.bestMatch.confidence >= 80 ? "text-[#166534] border-[#166534]/30" : "text-[#B45309] border-[#B45309]/30"
                    )}>
                      {Math.round(item.bestMatch.confidence)}%
                    </Badge>
                    <Button
                      size="sm"
                      className="h-8 bg-[#166534] hover:bg-[#15803d] text-white"
                      onClick={() => handleLink(item.bestMatch!.transaction)}
                      disabled={isPending}
                    >
                      {isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5 mr-1.5" />}
                      Link
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Other potential matches */}
            {item.potentialMatches.length > 1 && (
              <div className="px-5 py-3 border-t border-[#E5E3DC]/40">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70 mb-2">Other Matches</p>
                <div className="space-y-2">
                  {item.potentialMatches.slice(1, 4).map((match) => (
                    <div key={match.transaction.id} className="flex items-center justify-between">
                      <div>
                        <span className="text-sm tabular-nums font-semibold">{formatRand(match.transaction.amount)}</span>
                        <span className="text-xs text-muted-foreground ml-2">
                          {formatDate(match.transaction.transactionDate)}
                          {match.transaction.transactionTime && ` ${match.transaction.transactionTime}`}
                          {` · diff ${formatRand(match.amountDiff)}`}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{Math.round(match.confidence)}%</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          onClick={() => handleLink(match.transaction)}
                          disabled={isPending}
                        >
                          {isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Link2 className="h-3 w-3 mr-1" />}
                          Link
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Nearest by amount (when no best match) */}
            {!item.bestMatch && item.nearestByAmount.length > 0 && (
              <div className="px-5 py-4 border-t border-[#E5E3DC]/40">
                <p className="text-xs font-semibold uppercase tracking-wider text-[#B45309] mb-3">Nearest by Amount</p>
                <div className="space-y-3">
                  {item.nearestByAmount.slice(0, 3).map((match) => (
                    <div key={match.transaction.id} className="flex items-center justify-between">
                      <div>
                        <span className="text-sm tabular-nums font-semibold">{formatRand(match.transaction.amount)}</span>
                        <span className="text-xs text-muted-foreground ml-2">
                          {formatDate(match.transaction.transactionDate)}
                          {match.transaction.transactionTime && ` ${match.transaction.transactionTime}`}
                          {` · diff ${formatRand(match.amountDiff)} · ${match.timeDiff}`}
                        </span>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => handleLink(match.transaction)}
                        disabled={isPending}
                      >
                        <Link2 className="h-3 w-3 mr-1" />
                        Link
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="border-t border-[#E5E3DC] my-6" />

          {/* Reason dropdown */}
          <div className="mb-4">
            <p className="text-sm font-semibold text-[#1A1200] mb-2">Reason</p>
            <Select value={selectedReason} onValueChange={setSelectedReason}>
              <SelectTrigger className="border-[#E5E3DC]">
                <SelectValue placeholder="Select reason" />
              </SelectTrigger>
              <SelectContent>
                {RESOLUTION_REASONS.map((reason) => (
                  <SelectItem key={reason.value} value={reason.value}>
                    {reason.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Notes */}
          <div>
            <p className="text-sm font-semibold text-[#1A1200] mb-2">Note <span className="font-normal text-muted-foreground">(optional)</span></p>
            <Textarea
              value={resolutionNotes}
              onChange={(e) => setResolutionNotes(e.target.value)}
              placeholder="Add a note..."
              className="min-h-[80px] resize-none border-[#E5E3DC]"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[#E5E3DC]">
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0"
              disabled={currentIndex === 0 || isPending}
              onClick={goPrev}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0"
              disabled={currentIndex >= total - 1 || isPending}
              onClick={goNext}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex items-center gap-2">
            {item.category === "low_value" && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleDismiss}
                disabled={isPending}
              >
                {isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                Dismiss
              </Button>
            )}
            {!hideInvestigateButton && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleFlag}
                disabled={isPending}
              >
                {isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                Investigate
              </Button>
            )}
            {item.category === 'resolved' ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => unmatchResolutionMutation.mutate(txn.id)}
                disabled={isPending || unmatchResolutionMutation.isPending}
              >
                {unmatchResolutionMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                Unmatch
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={handleResolve}
                disabled={!selectedReason || isPending}
                className="bg-[#1A1200] text-[#F5EDE6] hover:bg-[#2A2218]"
              >
                {isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                Match
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
