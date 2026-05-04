import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
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
import {
  Search,
  X,
  Check,
  ArrowRight,
  Building2,
  Fuel,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useInvalidateReconciliation } from "@/hooks/useInvalidateReconciliation";
import { cn } from "@/lib/utils";
import { formatRand, formatDate } from "@/lib/format";
import { useAuth } from "@/hooks/useAuth";
import type { Transaction, TransactionResolution, MatchingRulesConfig } from "@shared/schema";
import { CATEGORY_LABELS } from "@/lib/reconciliation-types";
import type { PaginatedResponse, PotentialMatch, TransactionInsight, CategorizedTransaction } from "@/lib/reconciliation-types";
import { buildMatchingStages } from "@shared/matchingStages";
import { InvestigateModal } from "./InvestigateModal";
import { TransactionRow } from "./TransactionRow";

const LOW_VALUE_THRESHOLD = 50;
const REVIEW_STAGE_BADGE_LABELS: Record<string, string> = {
  strict_same_day_exact: "Strict same-day",
  operational_close_match: "Operational close",
  boundary_transactions: "Boundary",
  settlement_fallback: "Settlement fallback",
};

interface ReviewTabProps {
  periodId: string;
  initialSide?: 'bank' | 'fuel';
}

export function ReviewTab({ periodId, initialSide }: ReviewTabProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const userName = user?.firstName || "User";
  const [side, setSide] = useState<'bank' | 'fuel'>(initialSide || 'fuel');
  const [searchQuery, setSearchQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [modalInitialIndex, setModalInitialIndex] = useState(0);
  const [modalItems, setModalItems] = useState<CategorizedTransaction[]>([]);
  const [pendingBulkAction, setPendingBulkAction] = useState<{
    type: 'confirm' | 'flag' | 'dismiss';
    count: number;
    action: () => void;
  } | null>(null);

  // Reset search when switching sides
  useEffect(() => { setSearchQuery(""); }, [side]);

  // Keep the selected side in sync with summary-card drill-downs.
  useEffect(() => {
    if (initialSide) {
      setSide(initialSide);
    }
  }, [initialSide]);

  // ── Data fetching ──
  const { data: unmatchedData, isLoading: unmatchedLoading } = useQuery<PaginatedResponse>({
    queryKey: ["/api/periods", periodId, "transactions", "unmatched", "bank"],
    queryFn: async () => {
      const params = new URLSearchParams({ page: "1", limit: "200", matchStatus: "unmatched", sourceType: "bank" });
      const response = await fetch(`/api/periods/${periodId}/transactions?${params}`);
      if (!response.ok) throw new Error("Failed to fetch transactions");
      return response.json();
    },
    enabled: !!periodId,
  });

  const { data: fuelData } = useQuery<PaginatedResponse>({
    queryKey: ["/api/periods", periodId, "transactions", "unmatched", "fuel"],
    queryFn: async () => {
      const params = new URLSearchParams({ page: "1", limit: "500", matchStatus: "unmatched", sourceType: "fuel", isCardTransaction: "yes" });
      const response = await fetch(`/api/periods/${periodId}/transactions?${params}`);
      if (!response.ok) throw new Error("Failed to fetch fuel transactions");
      return response.json();
    },
    enabled: !!periodId,
  });

  const { data: resolutions } = useQuery<TransactionResolution[]>({
    queryKey: ["/api/periods", periodId, "resolutions"],
    enabled: !!periodId,
  });

  // Fetch ALL bank transactions (including resolved) for resolution counting
  const { data: allBankData } = useQuery<PaginatedResponse>({
    queryKey: ["/api/periods", periodId, "transactions", "all", "bank"],
    queryFn: async () => {
      const params = new URLSearchParams({ page: "1", limit: "500", sourceType: "bank" });
      const response = await fetch(`/api/periods/${periodId}/transactions?${params}`);
      if (!response.ok) throw new Error("Failed to fetch all bank transactions");
      return response.json();
    },
    enabled: !!periodId,
  });

  // Fetch ALL fuel transactions (including resolved) for resolution counting
  const { data: allFuelData } = useQuery<PaginatedResponse>({
    queryKey: ["/api/periods", periodId, "transactions", "all", "fuel"],
    queryFn: async () => {
      const params = new URLSearchParams({ page: "1", limit: "500", sourceType: "fuel", isCardTransaction: "yes" });
      const response = await fetch(`/api/periods/${periodId}/transactions?${params}`);
      if (!response.ok) throw new Error("Failed to fetch all fuel transactions");
      return response.json();
    },
    enabled: !!periodId,
  });

  const allSideData = side === 'bank' ? allBankData : allFuelData;

  const { data: matchingRules } = useQuery<MatchingRulesConfig>({
    queryKey: ["/api/periods", periodId, "matching-rules"],
    enabled: !!periodId,
  });
  const dateWindowDays = matchingRules?.dateWindowDays ?? 3;

  // ── Derived data ──
  const resolvedIds = useMemo(() => new Set(resolutions?.map(r => r.transactionId) || []), [resolutions]);

  const flaggedResolutions = useMemo(() => (resolutions || []).filter(r => r.resolutionType === 'flagged'), [resolutions]);
  const flaggedTransactionIds = useMemo(() => new Set(flaggedResolutions.map(r => r.transactionId)), [flaggedResolutions]);

  const reviewExclusivity = useMemo(() => {
    if (!unmatchedData?.transactions || !fuelData?.transactions) {
      return {
        claimedBankIds: new Set<string>(),
        visibleBankTransactions: [] as Transaction[],
      };
    }

    const matchingStages = buildMatchingStages({
      amountTolerance: matchingRules?.amountTolerance ?? 2,
      dateWindowDays: matchingRules?.dateWindowDays ?? 3,
      timeWindowMinutes: matchingRules?.timeWindowMinutes ?? 60,
      attendantSubmissionDelayMinutes: matchingRules?.attendantSubmissionDelayMinutes ?? 120,
      requireCardMatch: matchingRules?.requireCardMatch ?? false,
      minimumConfidence: matchingRules?.minimumConfidence ?? 60,
      autoMatchThreshold: matchingRules?.autoMatchThreshold ?? 85,
    });

    const parseTimeToMinutes = (timeStr: string | null | undefined): number | null => {
      if (!timeStr) return null;
      const match = timeStr.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
      if (!match) return null;
      return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
    };

    const allFuel = [...(allFuelData?.transactions || fuelData.transactions)].filter(
      (tx) => tx.sourceType === "fuel" && tx.isCardTransaction === "yes",
    );
    const groupedByDay = new Map<string, Transaction[]>();
    for (const tx of allFuel) {
      const key = tx.transactionDate;
      if (!groupedByDay.has(key)) groupedByDay.set(key, []);
      groupedByDay.get(key)!.push(tx);
    }

    const fuelBoundaryPositions = new Map<string, "start" | "end" | "both" | "none">();
    for (const dayTxs of groupedByDay.values()) {
      const sorted = [...dayTxs].sort((a, b) => {
        const timeA = parseTimeToMinutes(a.transactionTime) ?? Number.MAX_SAFE_INTEGER;
        const timeB = parseTimeToMinutes(b.transactionTime) ?? Number.MAX_SAFE_INTEGER;
        if (timeA !== timeB) return timeA - timeB;
        return a.id.localeCompare(b.id);
      });
      if (sorted.length === 0) continue;
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      fuelBoundaryPositions.set(first.id, first.id === last.id ? "both" : "start");
      fuelBoundaryPositions.set(last.id, first.id === last.id ? "both" : "end");
    }

    const scoreFuelToBank = (fuelTxn: Transaction, bankTxn: Transaction): PotentialMatch | null => {
      const fuelAmount = parseFloat(fuelTxn.amount);
      const bankAmount = parseFloat(bankTxn.amount);
      const amountDiff = Math.abs(bankAmount - fuelAmount);
      const fuelDate = new Date(fuelTxn.transactionDate).getTime();
      const bankDate = new Date(bankTxn.transactionDate).getTime();
      const dayDiff = Math.round((bankDate - fuelDate) / 86400000);
      const fuelTime = parseTimeToMinutes(fuelTxn.transactionTime);
      const bankTime = parseTimeToMinutes(bankTxn.transactionTime);
      const boundaryPosition = fuelBoundaryPositions.get(fuelTxn.id) || "none";

      for (const stage of matchingStages) {
        if (amountDiff > stage.maxAmountDiff) continue;
        if (stage.requireExactAmount && amountDiff > 0.01) continue;
        if (dayDiff < stage.minDateDiffDays || dayDiff > stage.maxDateDiffDays) continue;

        if (stage.boundaryMode === "boundary") {
          const allowsPreviousDay = boundaryPosition === "start" || boundaryPosition === "both";
          const allowsNextDay = boundaryPosition === "end" || boundaryPosition === "both";
          const isDirectionalBoundary =
            (dayDiff === -1 && allowsPreviousDay) ||
            (dayDiff === 1 && allowsNextDay);
          if (!isDirectionalBoundary) continue;
        }

        if (dayDiff === 0 && fuelTime !== null && bankTime !== null) {
          const timeGap = Math.abs(bankTime - fuelTime);
          if (stage.maxTimeDiffMinutes !== null && timeGap > stage.maxTimeDiffMinutes) continue;
        }

        let confidence = 70;
        if (dayDiff === 0) confidence = 85;
        else if (Math.abs(dayDiff) === 1) confidence = 75;
        else if (Math.abs(dayDiff) === 2) confidence = 68;
        else confidence = 65;

        let timeDiffLabel = dayDiff === 0 ? "Same day" : `${Math.abs(dayDiff)} day${Math.abs(dayDiff) >= 2 ? "s" : ""}`;
        if (dayDiff === 0 && fuelTime !== null && bankTime !== null) {
          const timeGap = Math.abs(bankTime - fuelTime);
          timeDiffLabel = timeGap === 0 ? "Same time" : `${timeGap} min`;
          if (timeGap <= 5) confidence = 100;
          else if (timeGap <= 15) confidence = 95;
          else if (timeGap <= 30) confidence = 85;
          else confidence = 75;
        }

        if (amountDiff > 0) {
          const divisor = stage.maxAmountDiff <= 0 ? 0.01 : stage.maxAmountDiff;
          confidence -= Math.min(5, (amountDiff / divisor) * 5);
        }

        if (stage.requireCardMatch) {
          if (!bankTxn.cardNumber || !fuelTxn.cardNumber) continue;
          if (bankTxn.cardNumber !== fuelTxn.cardNumber) continue;
          confidence += 25;
        } else if (bankTxn.cardNumber && fuelTxn.cardNumber) {
          if (bankTxn.cardNumber === fuelTxn.cardNumber) confidence += 25;
          else confidence -= 30;
        }

        confidence = Math.max(0, Math.min(100, confidence));
        if (confidence < stage.minimumConfidence) continue;

        return {
          transaction: bankTxn,
          confidence,
          timeDiff: timeDiffLabel,
          amountDiff,
          stageId: stage.id,
          stageLabel: REVIEW_STAGE_BADGE_LABELS[stage.id] || stage.name,
        };
      }

      return null;
    };

    const fuelPrimaryTransactions = (allFuelData?.transactions || fuelData.transactions).filter((txn) => {
      if (flaggedTransactionIds.has(txn.id)) return false;
      if (txn.matchStatus === "unmatched") return true;
      if (resolvedIds.has(txn.id)) return true;
      return false;
    });

    const unresolvedBankTransactions = unmatchedData.transactions.filter(
      (txn) => !resolvedIds.has(txn.id) && !flaggedTransactionIds.has(txn.id),
    );

    const candidateClaims = fuelPrimaryTransactions
      .map((fuelTxn) => {
        const bestBank = unresolvedBankTransactions
          .map((bankTxn) => scoreFuelToBank(fuelTxn, bankTxn))
          .filter((match): match is PotentialMatch => !!match)
          .sort((a, b) => {
            if (b.confidence !== a.confidence) return b.confidence - a.confidence;
            return a.amountDiff - b.amountDiff;
          })[0];

        if (!bestBank) return null;

        return {
          fuelId: fuelTxn.id,
          bankId: bestBank.transaction.id,
          confidence: bestBank.confidence,
          amountDiff: bestBank.amountDiff,
        };
      })
      .filter((claim): claim is { fuelId: string; bankId: string; confidence: number; amountDiff: number } => !!claim)
      .sort((a, b) => {
        if (b.confidence !== a.confidence) return b.confidence - a.confidence;
        return a.amountDiff - b.amountDiff;
      });

    const usedFuelIds = new Set<string>();
    const claimedBankIds = new Set<string>();
    for (const claim of candidateClaims) {
      if (usedFuelIds.has(claim.fuelId) || claimedBankIds.has(claim.bankId)) continue;
      usedFuelIds.add(claim.fuelId);
      claimedBankIds.add(claim.bankId);
    }

    return {
      claimedBankIds,
      visibleBankTransactions: unmatchedData.transactions.filter((txn) => !claimedBankIds.has(txn.id)),
    };
  }, [allFuelData, flaggedTransactionIds, fuelData, matchingRules, resolvedIds, unmatchedData]);

  const flaggedTransactions = useMemo(() => {
    if (!allSideData?.transactions) return [];
    return allSideData.transactions
      .filter(txn => flaggedTransactionIds.has(txn.id))
      .map(txn => ({ transaction: txn, resolution: flaggedResolutions.find(r => r.transactionId === txn.id) }))
      .sort((a, b) => parseFloat(b.transaction.amount) - parseFloat(a.transaction.amount));
  }, [allSideData, flaggedTransactionIds, flaggedResolutions]);

  // Per-side counts — all user actions create resolutions, so count from resolutions table
  const perSideCounts = useMemo(() => {
    const result = {
      bank: { matched: 0, matchedAmount: 0, flagged: 0, flaggedAmount: 0 },
      fuel: { matched: 0, matchedAmount: 0, flagged: 0, flaggedAmount: 0 },
    };
    if (!resolutions) return result;

    // Build lookup: txId → { side, amount }
    const txLookup = new Map<string, { side: 'bank' | 'fuel'; amount: number }>();
    for (const t of allBankData?.transactions || []) {
      txLookup.set(t.id, { side: 'bank', amount: parseFloat(t.amount) || 0 });
    }
    for (const t of allFuelData?.transactions || []) {
      txLookup.set(t.id, { side: 'fuel', amount: parseFloat(t.amount) || 0 });
    }

    for (const r of resolutions) {
      const tx = txLookup.get(r.transactionId);
      if (!tx) continue;

      if (r.resolutionType === 'flagged') {
        result[tx.side].flagged++;
        result[tx.side].flaggedAmount += tx.amount;
      } else {
        result[tx.side].matched++;
        result[tx.side].matchedAmount += tx.amount;
      }
    }
    return result;
  }, [resolutions, allBankData, allFuelData]);

  // ── Categorization ──
  const categorizedTransactions = useMemo((): CategorizedTransaction[] => {
    if (!unmatchedData?.transactions || !fuelData?.transactions) return [];

    const matchingStages = buildMatchingStages({
      amountTolerance: matchingRules?.amountTolerance ?? 2,
      dateWindowDays: matchingRules?.dateWindowDays ?? 3,
      timeWindowMinutes: matchingRules?.timeWindowMinutes ?? 60,
      attendantSubmissionDelayMinutes: matchingRules?.attendantSubmissionDelayMinutes ?? 120,
      requireCardMatch: matchingRules?.requireCardMatch ?? false,
      minimumConfidence: matchingRules?.minimumConfidence ?? 60,
      autoMatchThreshold: matchingRules?.autoMatchThreshold ?? 85,
    });

    const parseTimeToMinutes = (timeStr: string | null | undefined): number | null => {
      if (!timeStr) return null;
      const match = timeStr.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
      if (!match) return null;
      return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
    };

    const fuelBoundaryPositions = (() => {
      const allFuel = [...(allFuelData?.transactions || fuelData.transactions)].filter(
        (tx) => tx.sourceType === "fuel" && tx.isCardTransaction === "yes",
      );
      const grouped = new Map<string, Transaction[]>();
      for (const tx of allFuel) {
        const key = tx.transactionDate;
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key)!.push(tx);
      }

      const positions = new Map<string, "start" | "end" | "both" | "none">();
      for (const dayTxs of grouped.values()) {
        const sorted = [...dayTxs].sort((a, b) => {
          const timeA = parseTimeToMinutes(a.transactionTime) ?? Number.MAX_SAFE_INTEGER;
          const timeB = parseTimeToMinutes(b.transactionTime) ?? Number.MAX_SAFE_INTEGER;
          if (timeA !== timeB) return timeA - timeB;
          return a.id.localeCompare(b.id);
        });
        if (sorted.length === 0) continue;
        const first = sorted[0];
        const last = sorted[sorted.length - 1];
        positions.set(first.id, first.id === last.id ? "both" : "start");
        positions.set(last.id, first.id === last.id ? "both" : "end");
      }
      return positions;
    })();

    const stageLabelMap: Record<string, string> = {
      strict_same_day_exact: "Strict same-day",
      operational_close_match: "Operational close",
      boundary_transactions: "Boundary",
      settlement_fallback: "Settlement fallback",
    };

    const scoreSuggestion = (primaryTxn: Transaction, candidateTxn: Transaction): PotentialMatch | null => {
      const fuelTxn = side === "fuel" ? primaryTxn : candidateTxn;
      const bankTxn = side === "fuel" ? candidateTxn : primaryTxn;
      const fuelAmount = parseFloat(fuelTxn.amount);
      const bankAmount = parseFloat(bankTxn.amount);
      const amountDiff = Math.abs(bankAmount - fuelAmount);
      const fuelDate = new Date(fuelTxn.transactionDate).getTime();
      const bankDate = new Date(bankTxn.transactionDate).getTime();
      const dayDiff = Math.round((bankDate - fuelDate) / 86400000);
      const fuelTime = parseTimeToMinutes(fuelTxn.transactionTime);
      const bankTime = parseTimeToMinutes(bankTxn.transactionTime);
      const boundaryPosition = fuelBoundaryPositions.get(fuelTxn.id) || "none";

      for (const stage of matchingStages) {
        if (amountDiff > stage.maxAmountDiff) continue;
        if (stage.requireExactAmount && amountDiff > 0.01) continue;
        if (dayDiff < stage.minDateDiffDays || dayDiff > stage.maxDateDiffDays) continue;

        if (stage.boundaryMode === "boundary") {
          const allowsPreviousDay = boundaryPosition === "start" || boundaryPosition === "both";
          const allowsNextDay = boundaryPosition === "end" || boundaryPosition === "both";
          const isDirectionalBoundary =
            (dayDiff === -1 && allowsPreviousDay) ||
            (dayDiff === 1 && allowsNextDay);
          if (!isDirectionalBoundary) continue;
        }

        if (dayDiff === 0 && fuelTime !== null && bankTime !== null) {
          const timeGap = Math.abs(bankTime - fuelTime);
          if (stage.maxTimeDiffMinutes !== null && timeGap > stage.maxTimeDiffMinutes) continue;
        }

        let confidence = 70;
        if (dayDiff === 0) confidence = 85;
        else if (Math.abs(dayDiff) === 1) confidence = 75;
        else if (Math.abs(dayDiff) === 2) confidence = 68;
        else confidence = 65;

        let timeDiffLabel = dayDiff === 0 ? "Same day" : `${Math.abs(dayDiff)} day${Math.abs(dayDiff) >= 2 ? "s" : ""}`;
        if (dayDiff === 0 && fuelTime !== null && bankTime !== null) {
          const timeGap = Math.abs(bankTime - fuelTime);
          timeDiffLabel = timeGap === 0 ? "Same time" : `${timeGap} min`;
          if (timeGap <= 5) confidence = 100;
          else if (timeGap <= 15) confidence = 95;
          else if (timeGap <= 30) confidence = 85;
          else confidence = 75;
        }

        if (amountDiff > 0) {
          const divisor = stage.maxAmountDiff <= 0 ? 0.01 : stage.maxAmountDiff;
          confidence -= Math.min(5, (amountDiff / divisor) * 5);
        }

        if (stage.requireCardMatch) {
          if (!bankTxn.cardNumber || !fuelTxn.cardNumber) continue;
          if (bankTxn.cardNumber !== fuelTxn.cardNumber) continue;
          confidence += 25;
        } else if (bankTxn.cardNumber && fuelTxn.cardNumber) {
          if (bankTxn.cardNumber === fuelTxn.cardNumber) confidence += 25;
          else confidence -= 30;
        }

        confidence = Math.max(0, Math.min(100, confidence));
        if (confidence < stage.minimumConfidence) continue;

        return {
          transaction: candidateTxn,
          confidence,
          timeDiff: timeDiffLabel,
          amountDiff,
          stageId: stage.id,
          stageLabel: stageLabelMap[stage.id] || stage.name,
        };
      }

      return null;
    };

    // Show: unmatched transactions + user-resolved transactions (not flagged, not auto-matched)
    // Flagged go to Investigate tab. Auto-matched (no resolution) stay in Transactions tab.
    const flaggedIds = new Set(flaggedResolutions.map(r => r.transactionId));

    // Use allData to include resolved/linked items that left the unmatched query
    const allPrimary = side === 'fuel'
      ? (allFuelData?.transactions || fuelData.transactions)
      : (allBankData?.transactions || unmatchedData.transactions);

    // Filter to: unmatched OR has a user resolution (linked/reviewed/dismissed)
    const primaryTxns = allPrimary.filter(txn => {
      if (flaggedIds.has(txn.id)) return false; // flagged → Investigate tab
      if (side === 'bank' && reviewExclusivity.claimedBankIds.has(txn.id)) return false; // fuel-led ownership keeps the same case out of contradictory views
      if (txn.matchStatus === 'unmatched') return true; // still needs review
      if (resolvedIds.has(txn.id)) return true; // user acted on it — show as resolved
      return false; // auto-matched by engine — belongs in Transactions tab
    });

    // Candidates for matching: always use the opposite side's unmatched list
    const candidateTxns = side === 'fuel'
      ? unmatchedData.transactions
      : fuelData.transactions;

    const result = primaryTxns
      .map((primaryTxn): CategorizedTransaction => {
        const primaryAmount = parseFloat(primaryTxn.amount);
        const primaryDate = new Date(primaryTxn.transactionDate);

        const allScored = candidateTxns
          .map((candidateTxn) => scoreSuggestion(primaryTxn, candidateTxn))
          .filter((match): match is PotentialMatch => !!match);

        const potentialMatches = allScored
          .sort((a, b) => {
            if (b.confidence !== a.confidence) return b.confidence - a.confidence;
            return a.amountDiff - b.amountDiff;
          })
          .slice(0, 5);

        const nearestByAmount = [...allScored]
          .sort((a, b) => a.amountDiff - b.amountDiff)
          .slice(0, 3);

        const bestMatch = potentialMatches[0];

        let category: CategorizedTransaction['category'];
        if (resolvedIds.has(primaryTxn.id)) category = 'resolved';
        else if (primaryAmount < LOW_VALUE_THRESHOLD) category = 'low_value';
        else if (bestMatch && bestMatch.confidence >= (matchingRules?.autoMatchThreshold ?? 85)) category = 'quick_win';
        else if (bestMatch && bestMatch.confidence >= (matchingRules?.minimumConfidence ?? 60)) category = 'investigate';
        else category = 'no_match';

        const insights: TransactionInsight[] = [];
        try {
          const nearest = nearestByAmount[0];
          if (nearest && (category === 'no_match' || category === 'investigate')) {
            const diff = primaryAmount - parseFloat(nearest.transaction.amount);
            const absDiff = Math.abs(diff);
            if (absDiff > 2 && absDiff <= 25) {
              if (side === 'fuel') {
                insights.push(diff > 0
                  ? { type: 'overfill', message: `Fuel sale R${absDiff.toFixed(2)} more than bank payment`, detail: `Bank: R${parseFloat(nearest.transaction.amount).toFixed(2)} on ${nearest.transaction.transactionDate} — possible overfill by attendant` }
                  : { type: 'possible_tip', message: `Bank payment R${absDiff.toFixed(2)} more than fuel sale`, detail: `Bank: R${parseFloat(nearest.transaction.amount).toFixed(2)} on ${nearest.transaction.transactionDate} — difference may include attendant tip` }
                );
              } else {
                insights.push(diff > 0
                  ? { type: 'possible_tip', message: `Bank paid R${absDiff.toFixed(2)} more than fuel record`, detail: `Fuel: R${parseFloat(nearest.transaction.amount).toFixed(2)} on ${nearest.transaction.transactionDate} — difference may include attendant tip` }
                  : { type: 'overfill', message: `Fuel record R${absDiff.toFixed(2)} more than bank payment`, detail: `Fuel: R${parseFloat(nearest.transaction.amount).toFixed(2)} on ${nearest.transaction.transactionDate} — possible overfill by attendant` }
                );
              }
            } else if (absDiff > 25) {
              insights.push(side === 'fuel'
                ? { type: 'no_fuel_record', message: `Nearest bank payment is R${absDiff.toFixed(2)} away`, detail: `No close bank match found — may not have settled yet` }
                : { type: 'no_fuel_record', message: `Nearest fuel record is R${absDiff.toFixed(2)} away`, detail: `No close fuel match found — may be a non-fuel POS charge or missing fuel record` }
              );
            }
          }
        } catch (e) { console.error('Insight generation error:', e); }

        return { transaction: primaryTxn, category, bestMatch, potentialMatches, nearestByAmount, insights };
      })
      .sort((a, b) => parseFloat(b.transaction.amount) - parseFloat(a.transaction.amount));

    // Duplicate detection
    try {
      const amountDateGroups = new Map<string, CategorizedTransaction[]>();
      for (const ct of result) {
        const key = `${parseFloat(ct.transaction.amount).toFixed(2)}_${ct.transaction.transactionDate}`;
        if (!amountDateGroups.has(key)) amountDateGroups.set(key, []);
        amountDateGroups.get(key)!.push(ct);
      }
      Array.from(amountDateGroups.values()).forEach(group => {
        if (group.length > 1) {
          const primaryAmt = parseFloat(group[0].transaction.amount);
          const primaryDateStr = group[0].transaction.transactionDate;
          const candidatesOnDate = (side === 'fuel' ? unmatchedData!.transactions : fuelData!.transactions).filter((ct: Transaction) => {
            const diff = Math.abs(parseFloat(ct.amount) - primaryAmt);
            return diff < 15 && ct.transactionDate === primaryDateStr;
          }).length;
          const chargeLabel = side === 'fuel' ? 'fuel sales' : 'bank charges';
          const recordLabel = side === 'fuel' ? 'bank payment' : 'fuel record';
          group.forEach(ct => {
            ct.insights.unshift({
              type: 'duplicate_charge',
              message: `${group.length} identical ${chargeLabel} of R${parseFloat(group[0].transaction.amount).toFixed(2)} on this date`,
              detail: candidatesOnDate < group.length
                ? `Only ${candidatesOnDate} matching ${recordLabel}${candidatesOnDate !== 1 ? 's' : ''} found — ${group.length - candidatesOnDate} may be duplicate ${chargeLabel} or missing ${recordLabel}s`
                : `${candidatesOnDate} ${recordLabel}s found at similar amounts`,
            });
          });
        }
      });
    } catch (e) { console.error('Duplicate detection error:', e); }

    return result;
  }, [unmatchedData, fuelData, allFuelData, allBankData, resolvedIds, side, matchingRules, flaggedResolutions, reviewExclusivity.claimedBankIds]);

  const filteredTransactions = useMemo(() => {
    if (!searchQuery.trim()) return categorizedTransactions;
    const q = searchQuery.toLowerCase().trim();
    return categorizedTransactions.filter(ct => {
      const txn = ct.transaction;
      return (
        txn.description?.toLowerCase().includes(q) ||
        txn.referenceNumber?.toLowerCase().includes(q) ||
        txn.sourceName?.toLowerCase().includes(q) ||
        parseFloat(txn.amount).toFixed(2).includes(q) ||
        formatDate(txn.transactionDate).toLowerCase().includes(q)
      );
    });
  }, [categorizedTransactions, searchQuery]);

  const totalUnresolved = categorizedTransactions.filter(ct => ct.category !== 'resolved').length;

  const openModal = (txnId: string) => {
    const idx = categorizedTransactions.findIndex(ct => ct.transaction.id === txnId);
    if (idx >= 0) {
      setModalItems(categorizedTransactions);
      setModalInitialIndex(idx);
      setModalOpen(true);
    }
  };

  // ── Mutations ──
  const invalidateAll = useInvalidateReconciliation(periodId);

  const createMatchMutation = useMutation({
    mutationFn: async ({ primaryId, candidateId }: { primaryId: string; candidateId: string }) => {
      await apiRequest("POST", "/api/matches/manual", {
        periodId,
        bankTransactionId: side === 'fuel' ? candidateId : primaryId,
        fuelTransactionId: side === 'fuel' ? primaryId : candidateId,
      });
      // Also create a resolution so counts track correctly
      await apiRequest("POST", "/api/resolutions", {
        transactionId: primaryId,
        resolutionType: "linked",
        reason: "manual_match",
        notes: "Linked via review",
        periodId,
      });
    },
    onSuccess: () => { toast({ title: "Match created", description: "The transactions have been linked." }); invalidateAll(); },
    onError: (error: Error) => { toast({ title: "Failed to create match", description: error.message, variant: "destructive" }); },
  });

  const bulkConfirmMutation = useMutation({
    mutationFn: async (matches: { bankId: string; fuelId: string }[]): Promise<{ count: number }> => {
      const response = await apiRequest("POST", "/api/matches/bulk-confirm", { matches, periodId });
      return response.json();
    },
    onSuccess: (data: { count: number }) => { toast({ title: "Matches confirmed", description: `${data.count} transactions linked.` }); invalidateAll(); },
    onError: (error: Error) => { toast({ title: "Failed to confirm", description: error.message, variant: "destructive" }); },
  });

  const bulkDismissMutation = useMutation({
    mutationFn: async (transactionIds: string[]): Promise<{ count: number }> => {
      const response = await apiRequest("POST", "/api/resolutions/bulk-dismiss", { transactionIds, periodId });
      return response.json();
    },
    onSuccess: (data: { count: number }) => { toast({ title: "Dismissed", description: `${data.count} low-value transactions dismissed.` }); invalidateAll(); },
    onError: (error: Error) => { toast({ title: "Failed to dismiss", description: error.message, variant: "destructive" }); },
  });

  const bulkFlagMutation = useMutation({
    mutationFn: async (transactionIds: string[]): Promise<{ count: number }> => {
      const response = await apiRequest("POST", "/api/resolutions/bulk-flag", { transactionIds, periodId });
      return response.json();
    },
    onSuccess: (data: { count: number }) => { toast({ title: "Flagged", description: `${data.count} transactions flagged for investigation.` }); invalidateAll(); },
    onError: (error: Error) => { toast({ title: "Failed to flag", description: error.message, variant: "destructive" }); },
  });

  // ── Landing counts ──
  const bankUnmatchedCount = reviewExclusivity.visibleBankTransactions.filter(t => !resolvedIds.has(t.id)).length || 0;
  const bankUnmatchedAmount = reviewExclusivity.visibleBankTransactions.filter(t => !resolvedIds.has(t.id)).reduce((s, t) => s + parseFloat(t.amount), 0) || 0;
  const bankTotalCount = reviewExclusivity.visibleBankTransactions.length || 0;
  const bankTotalAmount = reviewExclusivity.visibleBankTransactions.reduce((s, t) => s + parseFloat(t.amount), 0) || 0;

  const fuelUnmatchedCount = fuelData?.transactions?.filter(t => !resolvedIds.has(t.id)).length || 0;
  const fuelUnmatchedAmount = fuelData?.transactions?.filter(t => !resolvedIds.has(t.id)).reduce((s, t) => s + parseFloat(t.amount), 0) || 0;
  const fuelTotalCount = fuelData?.total || 0;
  const fuelTotalAmount = fuelData?.transactions?.reduce((s, t) => s + parseFloat(t.amount), 0) || 0;

  if (unmatchedLoading || !fuelData || !unmatchedData) {
    return (
      <div className="space-y-4 mx-auto">
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full" />)}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════
  //  SINGLE SCREEN — Summary cards + filtered list
  // ═══════════════════════════════════════════════════════════
  return (
    <div className="mx-auto space-y-4">
      {/* Header */}
      <div className="px-3 py-4">
        <h2 className="text-2xl font-heading font-semibold text-[#1A1200]">Review unmatched transactions</h2>
        <p className="text-sm text-muted-foreground">Work through each side. Resolve what you can. Anything you can't explain goes to Investigate.</p>
      </div>

      {/* Review container — beige background for everything */}
      <div className="bg-section rounded-xl overflow-hidden p-4 space-y-4">

      {/* Side selector — two cards */}
      <div className="grid grid-cols-2 gap-3">
          {([
            { key: 'fuel' as const, label: 'Fuel card sales transactions', count: fuelUnmatchedCount, amount: fuelUnmatchedAmount, total: fuelTotalCount, totalAmt: fuelTotalAmount },
            { key: 'bank' as const, label: 'Bank transactions', count: bankUnmatchedCount, amount: bankUnmatchedAmount, total: bankTotalCount, totalAmt: bankTotalAmount },
          ]).map((s, idx) => {
            const isActive = side === s.key;
            const sideCounts = perSideCounts[s.key];
            // Original total that needed review = still unmatched + matched by user + flagged
            const originalTotal = s.count + sideCounts.matched + sideCounts.flagged;
            const originalAmount = s.amount + sideCounts.matchedAmount + sideCounts.flaggedAmount;
            return (
              <button
                key={s.key}
                onClick={() => { setSide(s.key); setSearchQuery(""); }}
                className={cn(
                  "p-5 text-left transition-colors rounded-xl",
                  isActive ? "bg-card border border-[#E5E3DC]/50 shadow-sm" : "hover:bg-background"
                )}
              >
                {/* Title */}
                <h3 className="text-sm font-semibold text-[#1A1200] mb-3">{s.label}</h3>

                {/* Hero: count + amount of original total */}
                <div className="flex items-baseline justify-between mb-1">
                  <p className={cn("text-3xl font-bold tabular-nums", s.count > 0 ? "text-[#B45309]" : "text-[#166534]")}>{s.count}</p>
                  <p className={cn("text-base font-bold tabular-nums", s.count > 0 ? "text-[#B45309]" : "text-[#1A1200]")}>{formatRand(originalAmount)}</p>
                </div>
                <div className="flex items-baseline justify-between mb-4">
                  <p className="text-xs text-muted-foreground">To review</p>
                  <p className="text-[10px] text-muted-foreground">across {originalTotal} {s.key === 'bank' ? 'bank' : 'fuel card sales'} transactions</p>
                </div>

                {/* Destination counts: Matched by user | To investigate */}
                <div className="grid grid-cols-2 gap-2">
                  <div className={cn("rounded-lg p-2.5", isActive ? "bg-section" : "bg-white dark:bg-card")}>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">Matched by {userName}</p>
                    <p className={cn("text-lg font-bold tabular-nums", sideCounts.matched > 0 ? "text-[#166534]" : "")}>{sideCounts.matched}</p>
                    <p className={cn("text-sm tabular-nums font-medium", sideCounts.matched > 0 ? "text-[#166534]" : "text-muted-foreground")}>{sideCounts.matchedAmount > 0 ? formatRand(sideCounts.matchedAmount) : "\u2014"}</p>
                  </div>
                  <div className={cn("rounded-lg p-2.5", isActive ? "bg-section" : "bg-white dark:bg-card")}>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">To Investigate</p>
                    <p className={cn("text-lg font-bold tabular-nums", sideCounts.flagged > 0 ? "text-[#B45309]" : "")}>{sideCounts.flagged}</p>
                    <p className={cn("text-sm tabular-nums font-medium", sideCounts.flagged > 0 ? "text-[#B45309]" : "text-muted-foreground")}>{sideCounts.flaggedAmount > 0 ? formatRand(sideCounts.flaggedAmount) : "\u2014"}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

      {/* Transaction list for selected side */}
      {totalUnresolved === 0 && categorizedTransactions.length === 0 ? (
        <div className="bg-card rounded-xl p-8">
          <div className="flex flex-col items-center justify-center text-center gap-4">
            <div className="w-12 h-12 rounded-full bg-[#DCFCE7] flex items-center justify-center">
              <Check className="h-6 w-6 text-[#166534]" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-[#1A1200]">Review Complete</h3>
              <p className="text-sm text-muted-foreground mt-1">All {side === 'fuel' ? 'fuel' : 'bank'} transactions have been reviewed.</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-section rounded-xl p-4 space-y-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by amount, description, reference, or date..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-card"
            />
            {searchQuery && (
              <Button variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7" onClick={() => setSearchQuery("")}>
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>

          {searchQuery && filteredTransactions.length === 0 ? (
            <div className="py-6 text-center">
              <Search className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No transactions match "{searchQuery}"</p>
              <Button variant="ghost" size="sm" onClick={() => setSearchQuery("")}>Clear search</Button>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredTransactions.map(item => {
                const isResolved = item.category === 'resolved';
                const categoryLabel = CATEGORY_LABELS[item.category] || item.category;
                const bestStageLabel = item.bestMatch?.stageId ? REVIEW_STAGE_BADGE_LABELS[item.bestMatch.stageId] : undefined;
                const badgeLabel = !isResolved && bestStageLabel ? `${categoryLabel} · ${bestStageLabel}` : categoryLabel;
                return (
                  <TransactionRow
                    key={item.transaction.id}
                    transaction={item.transaction}
                    onClick={() => openModal(item.transaction.id)}
                    dimmed={isResolved}
                    badge={<Badge variant="outline" className={cn("text-xs", isResolved && "text-[#166534] border-[#166534]/30")}>{badgeLabel}</Badge>}
                    subtitle={!isResolved && item.insights.length > 0 ? item.insights[0].message : undefined}
                    subtitleColor={!isResolved && item.insights.length > 0 ? "text-[#B45309]" : undefined}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}

      </div>{/* Close beige container */}

      {/* Bulk Action Confirmation */}
      <AlertDialog open={!!pendingBulkAction} onOpenChange={(open) => !open && setPendingBulkAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingBulkAction?.type === 'confirm' && 'Confirm All Quick Wins'}
              {pendingBulkAction?.type === 'flag' && 'Flag All for Investigation'}
              {pendingBulkAction?.type === 'dismiss' && 'Dismiss All Low Value'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingBulkAction?.type === 'confirm' && `This will confirm ${pendingBulkAction.count} matches.`}
              {pendingBulkAction?.type === 'flag' && `This will flag ${pendingBulkAction.count} transactions for investigation.`}
              {pendingBulkAction?.type === 'dismiss' && `This will dismiss ${pendingBulkAction.count} low-value transactions.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { pendingBulkAction?.action(); setPendingBulkAction(null); }}>
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Case Modal */}
      <InvestigateModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        items={modalItems}
        initialIndex={modalInitialIndex}
        periodId={periodId}
        matchingRules={matchingRules}
        onResolved={() => {}}
        side={side}
      />
    </div>
  );
}
