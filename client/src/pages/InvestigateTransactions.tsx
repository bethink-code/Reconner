import { useState, useEffect, useMemo } from "react";
import { useLocation, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ArrowLeft,
  Search,
  Link as LinkIcon,
  X,
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  DollarSign,
  Building2,
  Fuel,
  Zap,
  HelpCircle,
  Flag,
  CheckCircle2,
  XCircle,
  Coins,
  Info,
  Download,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import type { Transaction, TransactionResolution, MatchingRulesConfig } from "@shared/schema";
import { InvestigateModal } from "@/components/flow/InvestigateModal";
import { RESOLUTION_REASONS } from "@shared/schema";

const LOW_VALUE_THRESHOLD = 50; // R50

const CATEGORY_LABELS: Record<string, string> = {
  quick_win: "Quick win",
  investigate: "Investigate",
  no_match: "No match",
  low_value: "Low value",
};

interface PaginatedResponse {
  transactions: Transaction[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface PotentialMatch {
  transaction: Transaction;
  confidence: number;
  timeDiff: string;
  amountDiff: number;
}

interface TransactionInsight {
  type: 'possible_tip' | 'overfill' | 'duplicate_charge' | 'no_fuel_record';
  message: string;
  detail?: string;
}

interface CategorizedTransaction {
  transaction: Transaction;
  category: 'quick_win' | 'investigate' | 'no_match' | 'low_value';
  bestMatch?: PotentialMatch;
  potentialMatches: PotentialMatch[];
  nearestByAmount: PotentialMatch[];
  insights: TransactionInsight[];
}

export default function InvestigateTransactions() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [periodId, setPeriodId] = useState<string>("");
  const [filterMode, setFilterMode] = useState<'all' | 'flagged'>('all');
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedTxn, setExpandedTxn] = useState<string | null>(null);
  const [selectedReason, setSelectedReason] = useState<string>("");
  const [resolutionNotes, setResolutionNotes] = useState<string>("");
  const [modalOpen, setModalOpen] = useState(false);
  const [modalInitialIndex, setModalInitialIndex] = useState(0);
  const [modalItems, setModalItems] = useState<CategorizedTransaction[]>([]);

  // Pre-populate resolve form based on Lekana's insights
  const expandWithInsights = (txnId: string | null, insights?: TransactionInsight[]) => {
    setExpandedTxn(txnId);
    if (!txnId || !insights || insights.length === 0) {
      setSelectedReason('');
      setResolutionNotes('');
      return;
    }
    const primary = insights[0];
    const reasonMap: Record<string, string> = {
      'possible_tip': 'other',
      'overfill': 'other',
      'duplicate_charge': 'other',
      'no_fuel_record': 'other',
    };
    setSelectedReason(reasonMap[primary.type] || '');
    setResolutionNotes(primary.detail || primary.message);
  };

  const [pendingBulkAction, setPendingBulkAction] = useState<{
    type: 'confirm' | 'flag' | 'dismiss';
    count: number;
    action: () => void;
  } | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({
    quick_win: true,
    investigate: true,
    no_match: true,
    low_value: false,
    flagged: true,
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("periodId");
    const filter = params.get("filter");
    if (id) {
      setPeriodId(id);
    } else {
      setLocation("/");
    }
    if (filter === 'flagged') {
      setFilterMode('flagged');
    }
  }, [setLocation]);

  // Fetch all unmatched bank transactions
  const { data: unmatchedData, isLoading: unmatchedLoading } = useQuery<PaginatedResponse>({
    queryKey: ["/api/periods", periodId, "transactions", "unmatched", "bank"],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: "1",
        limit: "200",
        matchStatus: "unmatched",
        sourceType: "bank",
      });
      const response = await fetch(`/api/periods/${periodId}/transactions?${params}`);
      if (!response.ok) throw new Error("Failed to fetch transactions");
      return response.json();
    },
    enabled: !!periodId,
  });

  // Fetch unmatched fuel transactions for matching
  const { data: fuelData } = useQuery<PaginatedResponse>({
    queryKey: ["/api/periods", periodId, "transactions", "unmatched", "fuel"],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: "1",
        limit: "500",
        matchStatus: "unmatched",
        sourceType: "fuel",
        isCardTransaction: "yes",
      });
      const response = await fetch(`/api/periods/${periodId}/transactions?${params}`);
      if (!response.ok) throw new Error("Failed to fetch fuel transactions");
      return response.json();
    },
    enabled: !!periodId,
  });

  // Fetch excluded bank transactions (reversed, declined, cancelled) for audit visibility
  const { data: excludedData } = useQuery<PaginatedResponse>({
    queryKey: ["/api/periods", periodId, "transactions", "excluded", "bank"],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: "1",
        limit: "200",
        matchStatus: "excluded",
        sourceType: "bank",
      });
      const response = await fetch(`/api/periods/${periodId}/transactions?${params}`);
      if (!response.ok) throw new Error("Failed to fetch excluded transactions");
      return response.json();
    },
    enabled: !!periodId,
  });

  // Fetch resolutions to filter out already resolved
  const { data: resolutions } = useQuery<TransactionResolution[]>({
    queryKey: ["/api/periods", periodId, "resolutions"],
    enabled: !!periodId,
  });

  // Fetch all bank transactions (including resolved) for flagged filter mode
  const { data: allBankData } = useQuery<PaginatedResponse>({
    queryKey: ["/api/periods", periodId, "transactions", "all", "bank"],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: "1",
        limit: "500",
        sourceType: "bank",
      });
      const response = await fetch(`/api/periods/${periodId}/transactions?${params}`);
      if (!response.ok) throw new Error("Failed to fetch all bank transactions");
      return response.json();
    },
    enabled: !!periodId,
  });

  // Fetch matching rules to know the configured date window
  const { data: matchingRules } = useQuery<MatchingRulesConfig>({
    queryKey: ["/api/periods", periodId, "matching-rules"],
    enabled: !!periodId,
  });
  const dateWindowDays = matchingRules?.dateWindowDays ?? 3;

  const resolvedIds = useMemo(() => {
    return new Set(resolutions?.map(r => r.transactionId) || []);
  }, [resolutions]);

  // Get flagged transaction IDs and their resolutions
  const flaggedResolutions = useMemo(() => {
    return (resolutions || []).filter(r => r.resolutionType === 'flagged');
  }, [resolutions]);

  const flaggedTransactionIds = useMemo(() => {
    return new Set(flaggedResolutions.map(r => r.transactionId));
  }, [flaggedResolutions]);

  // Build list of flagged transactions with their resolution info
  const flaggedTransactions = useMemo(() => {
    if (!allBankData?.transactions) return [];

    return allBankData.transactions
      .filter(txn => flaggedTransactionIds.has(txn.id))
      .map(txn => {
        const resolution = flaggedResolutions.find(r => r.transactionId === txn.id);
        return { transaction: txn, resolution };
      })
      .sort((a, b) => parseFloat(b.transaction.amount) - parseFloat(a.transaction.amount));
  }, [allBankData, flaggedTransactionIds, flaggedResolutions]);

  // Count resolutions by type for completion state
  const resolutionCounts = useMemo(() => {
    const counts = {
      linked: 0,
      reviewed: 0,
      dismissed: 0,
      flagged: 0,
      total: 0,
    };
    if (!resolutions) return counts;
    
    resolutions.forEach(r => {
      counts.total++;
      switch (r.resolutionType) {
        case 'linked':
          counts.linked++;
          break;
        case 'reviewed':
          counts.reviewed++;
          break;
        case 'dismissed':
          counts.dismissed++;
          break;
        case 'flagged':
          counts.flagged++;
          break;
      }
    });
    return counts;
  }, [resolutions]);

  // Categorize transactions with potential matches
  const categorizedTransactions = useMemo((): CategorizedTransaction[] => {
    if (!unmatchedData?.transactions || !fuelData?.transactions) return [];

    const fuelTxns = fuelData.transactions;

    const result = unmatchedData.transactions
      .filter(txn => !resolvedIds.has(txn.id))
      .map((bankTxn): CategorizedTransaction => {
        const bankAmount = parseFloat(bankTxn.amount);
        const bankDate = new Date(bankTxn.transactionDate);

        // Find potential matches
        const allScored = fuelTxns
          .map((fuelTxn): PotentialMatch => {
            const fuelAmount = parseFloat(fuelTxn.amount);
            const fuelDate = new Date(fuelTxn.transactionDate);
            const daysDiff = Math.abs(
              (bankDate.getTime() - fuelDate.getTime()) / (1000 * 60 * 60 * 24)
            );
            const amountDiff = Math.abs(bankAmount - fuelAmount);

            let confidence = 100;
            if (daysDiff > 0) confidence -= daysDiff * 10;
            // Graduated amount penalty: fuel vs bank often differs by a few Rand
            if (amountDiff <= 1) confidence -= amountDiff * 2;
            else if (amountDiff <= 10) confidence -= amountDiff * 1;
            else if (amountDiff <= 50) confidence -= 10 + (amountDiff - 10) * 0.5;
            else confidence -= 30 + (amountDiff - 50) * 0.3;
            confidence = Math.max(0, Math.min(100, confidence));

            return {
              transaction: fuelTxn,
              confidence,
              timeDiff:
                daysDiff === 0
                  ? "Same day"
                  : daysDiff < 1
                    ? "< 1 day"
                    : `${Math.floor(daysDiff)} day${daysDiff >= 2 ? "s" : ""}`,
              amountDiff,
            };
          });

        const potentialMatches = allScored
          .filter((m) => {
            if (m.confidence <= 20) return false;
            const fuelDate = new Date(m.transaction.transactionDate);
            const days = Math.abs((bankDate.getTime() - fuelDate.getTime()) / (1000 * 60 * 60 * 24));
            return days <= dateWindowDays;
          })
          .sort((a, b) => b.confidence - a.confidence)
          .slice(0, 5);

        // Top 3 nearest by amount within the configured date window
        const nearestByAmount = [...allScored]
          .filter(m => {
            const fuelDate = new Date(m.transaction.transactionDate);
            const days = Math.abs((bankDate.getTime() - fuelDate.getTime()) / (1000 * 60 * 60 * 24));
            return days <= dateWindowDays;
          })
          .sort((a, b) => a.amountDiff - b.amountDiff)
          .slice(0, 3);

        const bestMatch = potentialMatches[0];

        // Determine category
        let category: CategorizedTransaction['category'];
        if (bankAmount < LOW_VALUE_THRESHOLD) {
          category = 'low_value';
        } else if (bestMatch && bestMatch.confidence >= 80) {
          category = 'quick_win';
        } else if (bestMatch && bestMatch.confidence >= 50) {
          category = 'investigate';
        } else {
          category = 'no_match';
        }

        // Generate insights for near-misses
        const insights: TransactionInsight[] = [];
        try {
        const nearest = nearestByAmount[0];
        if (nearest && (category === 'no_match' || category === 'investigate')) {
          const diff = bankAmount - parseFloat(nearest.transaction.amount);
          const absDiff = Math.abs(diff);
          if (absDiff > 2 && absDiff <= 25) {
            // Bank paid more than fuel record — likely tip
            if (diff > 0) {
              const fuelAmt = parseFloat(nearest.transaction.amount).toFixed(2);
              const fuelDate = nearest.transaction.transactionDate;
              insights.push({
                type: 'possible_tip',
                message: `Bank paid R${absDiff.toFixed(2)} more than fuel record`,
                detail: `Fuel: R${fuelAmt} on ${fuelDate} — difference may include attendant tip`,
              });
            } else {
              const fuelAmt = parseFloat(nearest.transaction.amount).toFixed(2);
              const fuelDate = nearest.transaction.transactionDate;
              insights.push({
                type: 'overfill',
                message: `Fuel record R${absDiff.toFixed(2)} more than bank payment`,
                detail: `Fuel: R${fuelAmt} on ${fuelDate} — possible overfill by attendant`,
              });
            }
          } else if (absDiff > 25) {
            insights.push({
              type: 'no_fuel_record',
              message: `Nearest fuel record is R${absDiff.toFixed(2)} away`,
              detail: `No close fuel match found — may be a non-fuel POS charge or missing fuel record`,
            });
          }
        }
        } catch (e) {
          console.error('Insight generation error:', e);
        }

        return {
          transaction: bankTxn,
          category,
          bestMatch,
          potentialMatches,
          nearestByAmount,
          insights,
        };
      })
      .sort((a, b) => parseFloat(b.transaction.amount) - parseFloat(a.transaction.amount));

    // Second pass: detect duplicate bank charges
    try {
    const amountDateGroups = new Map<string, CategorizedTransaction[]>();
    for (const ct of result) {
      const key = `${parseFloat(ct.transaction.amount).toFixed(2)}_${ct.transaction.transactionDate}`;
      if (!amountDateGroups.has(key)) amountDateGroups.set(key, []);
      amountDateGroups.get(key)!.push(ct);
    }
    Array.from(amountDateGroups.values()).forEach((group) => {
      if (group.length > 1) {
        // Count how many fuel records exist at this amount on this date
        const bankAmt = parseFloat(group[0].transaction.amount);
        const bankDateStr = group[0].transaction.transactionDate;
        const fuelOnDate = fuelTxns.filter((ft: Transaction) => {
          const diff = Math.abs(parseFloat(ft.amount) - bankAmt);
          const sameDate = ft.transactionDate === bankDateStr;
          return diff < 15 && sameDate;
        }).length;

        group.forEach((ct: CategorizedTransaction) => {
          ct.insights.unshift({
            type: 'duplicate_charge',
            message: `${group.length} identical bank charges of R${parseFloat(group[0].transaction.amount).toFixed(2)} on this date`,
            detail: fuelOnDate < group.length
              ? `Only ${fuelOnDate} matching fuel record${fuelOnDate !== 1 ? 's' : ''} found — ${group.length - fuelOnDate} may be duplicate bank charge${group.length - fuelOnDate !== 1 ? 's' : ''} or missing fuel records`
              : `${fuelOnDate} fuel records found at similar amounts`,
          });
        });
      }
    });
    } catch (e) {
      console.error('Duplicate detection error:', e);
    }

    return result;
  }, [unmatchedData, fuelData, resolvedIds]);

  // Filter by search query
  const filteredTransactions = useMemo(() => {
    if (!searchQuery.trim()) return categorizedTransactions;
    const q = searchQuery.toLowerCase().trim();
    return categorizedTransactions.filter(ct => {
      const txn = ct.transaction;
      const amount = parseFloat(txn.amount).toFixed(2);
      return (
        txn.description?.toLowerCase().includes(q) ||
        txn.referenceNumber?.toLowerCase().includes(q) ||
        txn.sourceName?.toLowerCase().includes(q) ||
        amount.includes(q) ||
        formatDate(txn.transactionDate).toLowerCase().includes(q)
      );
    });
  }, [categorizedTransactions, searchQuery]);

  // Group by category
  const groupedTransactions = useMemo(() => {
    const groups: Record<CategorizedTransaction['category'], CategorizedTransaction[]> = {
      quick_win: [],
      investigate: [],
      no_match: [],
      low_value: [],
    };
    filteredTransactions.forEach(ct => {
      groups[ct.category].push(ct);
    });
    return groups;
  }, [filteredTransactions]);

  const openModal = (txnId: string) => {
    const idx = categorizedTransactions.findIndex(ct => ct.transaction.id === txnId);
    if (idx >= 0) {
      setModalItems(categorizedTransactions);
      setModalInitialIndex(idx);
      setModalOpen(true);
    }
  };

  const openFlaggedModal = (txnId: string) => {
    const flaggedAsCategorized: CategorizedTransaction[] = flaggedTransactions.map(({ transaction }) => ({
      transaction,
      category: 'no_match' as const,
      potentialMatches: [],
      nearestByAmount: [],
      insights: [],
    }));
    const idx = flaggedAsCategorized.findIndex(ct => ct.transaction.id === txnId);
    if (idx >= 0) {
      setModalItems(flaggedAsCategorized);
      setModalInitialIndex(idx);
      setModalOpen(true);
    }
  };

  const totalUnresolved = categorizedTransactions.length;
  const totalResolved = resolvedIds.size;
  const totalAll = totalUnresolved + totalResolved;
  const progressPercent = totalAll > 0 ? Math.round((totalResolved / totalAll) * 100) : 0;

  // Auto-select flagged tab when no unresolved items exist
  useEffect(() => {
    if (totalUnresolved === 0 && flaggedTransactions.length > 0 && filterMode === 'all') {
      setFilterMode('flagged');
    }
  }, [totalUnresolved, flaggedTransactions.length, filterMode]);

  // Mutations
  const createMatchMutation = useMutation({
    mutationFn: async ({ bankId, fuelId }: { bankId: string; fuelId: string }) => {
      return await apiRequest("POST", "/api/matches/manual", {
        periodId,
        bankTransactionId: bankId,
        fuelTransactionId: fuelId,
      });
    },
    onSuccess: () => {
      toast({ title: "Match created", description: "The transactions have been linked." });
      // Invalidate all related queries to ensure UI updates
      queryClient.invalidateQueries({ queryKey: ["/api/periods", periodId, "summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/periods", periodId, "transactions", "unmatched", "bank"] });
      queryClient.invalidateQueries({ queryKey: ["/api/periods", periodId, "transactions", "unmatched", "fuel"] });
      queryClient.invalidateQueries({ queryKey: ["/api/periods", periodId, "resolutions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/periods", periodId, "matches"] });
      setExpandedTxn(null);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create match", description: error.message, variant: "destructive" });
    },
  });

  const createResolutionMutation = useMutation({
    mutationFn: async (data: { transactionId: string; resolutionType: string; reason?: string; notes?: string }) => {
      return await apiRequest("POST", "/api/resolutions", {
        ...data,
        periodId,
      });
    },
    onSuccess: () => {
      toast({ title: "Transaction resolved", description: "The transaction has been marked as reviewed." });
      // Invalidate all related queries to ensure UI updates
      queryClient.invalidateQueries({ queryKey: ["/api/periods", periodId, "summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/periods", periodId, "transactions", "unmatched", "bank"] });
      queryClient.invalidateQueries({ queryKey: ["/api/periods", periodId, "transactions", "unmatched", "fuel"] });
      queryClient.invalidateQueries({ queryKey: ["/api/periods", periodId, "resolutions"] });
      setExpandedTxn(null);
      setSelectedReason("");
      setResolutionNotes("");
    },
    onError: (error: Error) => {
      toast({ title: "Failed to resolve", description: error.message, variant: "destructive" });
    },
  });

  const bulkDismissMutation = useMutation({
    mutationFn: async (transactionIds: string[]): Promise<{ count: number }> => {
      const response = await apiRequest("POST", "/api/resolutions/bulk-dismiss", {
        transactionIds,
        periodId,
      });
      return response.json();
    },
    onSuccess: (data: { count: number }) => {
      toast({ title: "Transactions dismissed", description: `${data.count} low-value transactions dismissed.` });
      queryClient.invalidateQueries({ queryKey: ["/api/periods", periodId, "summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/periods", periodId, "transactions", "unmatched", "bank"] });
      queryClient.invalidateQueries({ queryKey: ["/api/periods", periodId, "transactions", "unmatched", "fuel"] });
      queryClient.invalidateQueries({ queryKey: ["/api/periods", periodId, "resolutions"] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to dismiss", description: error.message, variant: "destructive" });
    },
  });

  // Bulk confirm all quick wins
  const bulkConfirmMutation = useMutation({
    mutationFn: async (matches: { bankId: string; fuelId: string }[]): Promise<{ count: number }> => {
      const response = await apiRequest("POST", "/api/matches/bulk-confirm", {
        matches,
        periodId,
      });
      return response.json();
    },
    onSuccess: (data: { count: number }) => {
      toast({ title: "Matches confirmed", description: `${data.count} transactions linked successfully.` });
      queryClient.invalidateQueries({ queryKey: ["/api/periods", periodId, "summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/periods", periodId, "transactions", "unmatched", "bank"] });
      queryClient.invalidateQueries({ queryKey: ["/api/periods", periodId, "transactions", "unmatched", "fuel"] });
      queryClient.invalidateQueries({ queryKey: ["/api/periods", periodId, "resolutions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/periods", periodId, "matches"] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to confirm matches", description: error.message, variant: "destructive" });
    },
  });

  // Bulk flag all for review
  const bulkFlagMutation = useMutation({
    mutationFn: async (transactionIds: string[]): Promise<{ count: number }> => {
      const response = await apiRequest("POST", "/api/resolutions/bulk-flag", {
        transactionIds,
        periodId,
      });
      return response.json();
    },
    onSuccess: (data: { count: number }) => {
      toast({ title: "Transactions flagged", description: `${data.count} transactions flagged for review.` });
      queryClient.invalidateQueries({ queryKey: ["/api/periods", periodId, "summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/periods", periodId, "transactions", "unmatched", "bank"] });
      queryClient.invalidateQueries({ queryKey: ["/api/periods", periodId, "transactions", "unmatched", "fuel"] });
      queryClient.invalidateQueries({ queryKey: ["/api/periods", periodId, "resolutions"] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to flag", description: error.message, variant: "destructive" });
    },
  });

  const formatCurrency = (amount: string | number) => {
    const num = typeof amount === "string" ? parseFloat(amount) : amount;
    return "R " + num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
  };

  const getConfidenceLabel = (confidence: number) => {
    if (confidence >= 80) return "Likely match";
    if (confidence >= 50) return "Possible";
    return "Unlikely";
  };

  const getCategoryConfig = (category: CategorizedTransaction['category']) => {
    switch (category) {
      case 'quick_win':
        return { icon: Zap, label: "Quick Wins", color: "text-[#166534]", bg: "bg-[#DCFCE7] dark:bg-emerald-950/30", description: "High-confidence matches ready to confirm" };
      case 'investigate':
        return { icon: Search, label: "Investigate", color: "text-[#B45309]", bg: "bg-[#FEF9C3] dark:bg-amber-950/30", description: "Lower confidence - review carefully" };
      case 'no_match':
        return { icon: HelpCircle, label: "No Match Found", color: "text-[#B91C1C]", bg: "bg-[#FEE2E2] dark:bg-red-950/30", description: "Requires manual investigation" };
      case 'low_value':
        return { icon: Coins, label: "Low Value", color: "text-slate-500", bg: "bg-slate-100 dark:bg-slate-800", description: `Under ${formatCurrency(LOW_VALUE_THRESHOLD)} - likely test transactions` };
    }
  };

  if (unmatchedLoading || !periodId || !fuelData || !unmatchedData) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b bg-card sticky top-0 z-10">
          <div className="max-w-3xl mx-auto px-4 py-4">
            <div className="flex items-center gap-4">
              <Skeleton className="h-9 w-9" />
              <Skeleton className="h-6 w-48" />
            </div>
          </div>
        </header>
        <main className="max-w-3xl mx-auto px-4 py-8">
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link href={`/flow/${periodId}?mode=view`}>
              <Button variant="ghost" size="icon" data-testid="button-back">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div className="flex-1">
              <h1 className="text-xl font-semibold">Review Transactions</h1>
              <p className="text-sm text-muted-foreground">
                {totalUnresolved + flaggedTransactions.length} transaction{(totalUnresolved + flaggedTransactions.length) !== 1 ? "s" : ""} need your attention
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="flex gap-2">
            <button
              onClick={() => setFilterMode(filterMode === 'all' ? 'all' : 'all')}
              className={cn(
                "rounded-lg p-2.5 text-left transition-colors border flex-1",
                filterMode === 'all'
                  ? "border-[#B8860B]/30 bg-[#FEF9C3]"
                  : "border-[#E5E3DC]/50 bg-[#FAFAF6] hover:border-[#B8860B]/20"
              )}
            >
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">No Match Found</p>
              <p className={cn("text-lg font-semibold tabular-nums", filterMode === 'all' && totalUnresolved > 0 && "text-[#B45309]")}>{totalUnresolved}</p>
            </button>
            <button
              onClick={() => setFilterMode(filterMode === 'flagged' ? 'all' : 'flagged')}
              className={cn(
                "rounded-lg p-2.5 text-left transition-colors border flex-1",
                filterMode === 'flagged'
                  ? "border-[#B8860B]/30 bg-[#FEF9C3]"
                  : "border-[#E5E3DC]/50 bg-[#FAFAF6] hover:border-[#B8860B]/20"
              )}
            >
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">Investigate</p>
              <p className={cn("text-lg font-semibold tabular-nums", filterMode === 'flagged' && flaggedTransactions.length > 0 && "text-[#B45309]")}>{flaggedTransactions.length}</p>
            </button>
          </div>

          {/* Flagged Mode Content */}
          {filterMode === 'flagged' ? (
            <>
              {flaggedTransactions.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  No flagged transactions.
                </div>
              ) : (
                <Card>
                <CardContent className="pt-4 pb-4">
                <div className="space-y-2">
                  {flaggedTransactions.map(({ transaction, resolution }) => (
                    <div
                      key={transaction.id}
                      className="flex items-center justify-between p-3 border rounded-lg cursor-pointer hover:border-foreground/20"
                      onClick={() => openFlaggedModal(transaction.id)}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="tabular-nums font-bold">{formatCurrency(parseFloat(transaction.amount))}</span>
                          <span className="text-sm text-muted-foreground">{formatDate(transaction.transactionDate)}</span>
                          {transaction.transactionTime && (
                            <span className="text-sm text-muted-foreground flex items-center gap-0.5">
                              <Clock className="h-3 w-3" />
                              {transaction.transactionTime}
                            </span>
                          )}
                        </div>
                        {resolution?.notes && (
                          <p className="text-xs text-muted-foreground truncate mt-0.5">{resolution.notes}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 ml-2">
                        <Badge variant="outline" className="text-xs text-[#B45309]">Flagged</Badge>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>
                  ))}
                </div>
                </CardContent>
                </Card>
              )}
            </>
          ) : (
            <>
              {totalUnresolved === 0 && flaggedTransactions.length === 0 && unmatchedData ? (
              // All clear — no unresolved, no flagged
              <Card className="bg-[#FAFAF6] border-[#E5E3DC]" data-testid="card-all-clear">
                <CardContent className="pt-8 pb-8">
                  <div className="flex flex-col items-center justify-center text-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-[#DCFCE7] flex items-center justify-center">
                      <Check className="h-6 w-6 text-[#166534]" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-[#1A1200]">Review Complete</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        All transactions have been reviewed.
                      </p>
                    </div>

                    {resolutionCounts.total > 0 && (
                      <div className="w-full max-w-sm text-left space-y-1.5 px-4 text-sm text-muted-foreground">
                        {resolutionCounts.reviewed > 0 && (
                          <div className="flex items-center gap-2">
                            <Check className="h-3.5 w-3.5 text-[#166534]" />
                            <span>{resolutionCounts.reviewed} Resolved</span>
                          </div>
                        )}
                        {resolutionCounts.linked > 0 && (
                          <div className="flex items-center gap-2">
                            <Check className="h-3.5 w-3.5 text-[#166534]" />
                            <span>{resolutionCounts.linked} Linked to fuel records</span>
                          </div>
                        )}
                        {resolutionCounts.dismissed > 0 && (
                          <div className="flex items-center gap-2">
                            <Check className="h-3.5 w-3.5 text-[#166534]" />
                            <span>{resolutionCounts.dismissed} Dismissed</span>
                          </div>
                        )}
                      </div>
                    )}

                    <Link href={`/flow/${periodId}?mode=view`}>
                      <Button variant="outline" data-testid="button-back-results">Back to Results</Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
          ) : (
            <>
              {searchQuery && filteredTransactions.length === 0 ? (
                <Card>
                  <CardContent className="pt-6 pb-6 text-center">
                    <Search className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">
                      No transactions match "{searchQuery}"
                    </p>
                    <Button variant="link" size="sm" onClick={() => setSearchQuery("")}>
                      Clear search
                    </Button>
                  </CardContent>
                </Card>
              ) : (
              <>
              {/* Transaction List — flat, click to open modal */}
              <Card>
              <CardContent className="pt-4 pb-4 space-y-4">
              {/* Search Bar */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by amount, description, reference, or date..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                  data-testid="input-search-transactions"
                />
                {searchQuery && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                    onClick={() => setSearchQuery("")}
                    data-testid="button-clear-search"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
              <div className="space-y-2">
                {filteredTransactions.map((item) => {
                  const txn = item.transaction;
                  const categoryLabel = CATEGORY_LABELS[item.category] || item.category;
                  return (
                    <div
                      key={txn.id}
                      className="flex items-center justify-between p-3 border rounded-lg cursor-pointer hover:border-foreground/20"
                      onClick={() => openModal(txn.id)}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="tabular-nums font-bold">{formatCurrency(txn.amount)}</span>
                          <span className="text-sm text-muted-foreground">{formatDate(txn.transactionDate)}</span>
                          {txn.transactionTime && (
                            <span className="text-sm text-muted-foreground flex items-center gap-0.5">
                              <Clock className="h-3 w-3" />
                              {txn.transactionTime}
                            </span>
                          )}
                        </div>
                        {txn.description && (
                          <p className="text-xs text-muted-foreground truncate mt-0.5">{txn.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 ml-2">
                        <Badge variant="outline" className="text-xs">{categoryLabel}</Badge>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>
                  );
                })}
              </div>
              </CardContent>
              </Card>
              {false && (['quick_win', 'investigate', 'no_match', 'low_value'] as const).map((category) => {
                const items = groupedTransactions[category];
                if (items.length === 0) return null;

                const config = getCategoryConfig(category);
                const Icon = config.icon;
                const isExpanded = expandedCategories[category];

                return (
                  <Collapsible
                    key={category}
                    open={isExpanded}
                    onOpenChange={(open) => setExpandedCategories(prev => ({ ...prev, [category]: open }))}
                  >
                    <Card data-testid={`card-category-${category}`}>
                      <CollapsibleTrigger asChild>
                        <CardHeader className="cursor-pointer hover-elevate py-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className={cn("p-2 rounded-lg", config.bg)}>
                                <Icon className={cn("h-4 w-4", config.color)} />
                              </div>
                              <div>
                                <CardTitle className="text-base flex items-center gap-2">
                                  {config.label}
                                  <Badge variant="secondary">{items.length}</Badge>
                                </CardTitle>
                                <CardDescription className="text-xs">{config.description}</CardDescription>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {/* Confirm All for Quick Wins */}
                              {category === 'quick_win' && items.length > 0 && (
                                <Button
                                  size="sm"
                                  variant="default"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const matches = items
                                      .filter(i => i.bestMatch)
                                      .map(i => ({
                                        bankId: i.transaction.id,
                                        fuelId: i.bestMatch!.transaction.id,
                                      }));
                                    setPendingBulkAction({
                                      type: 'confirm',
                                      count: matches.length,
                                      action: () => bulkConfirmMutation.mutate(matches),
                                    });
                                  }}
                                  disabled={bulkConfirmMutation.isPending}
                                  data-testid="button-confirm-all"
                                >
                                  Confirm All
                                </Button>
                              )}
                              {/* Flag All for No Match */}
                              {category === 'no_match' && items.length > 0 && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const ids = items.map(i => i.transaction.id);
                                    setPendingBulkAction({
                                      type: 'flag',
                                      count: ids.length,
                                      action: () => bulkFlagMutation.mutate(ids),
                                    });
                                  }}
                                  disabled={bulkFlagMutation.isPending}
                                  data-testid="button-flag-all"
                                >
                                  Investigate All
                                </Button>
                              )}
                              {/* Dismiss All for Low Value */}
                              {category === 'low_value' && items.length > 0 && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const ids = items.map(i => i.transaction.id);
                                    setPendingBulkAction({
                                      type: 'dismiss',
                                      count: ids.length,
                                      action: () => bulkDismissMutation.mutate(ids),
                                    });
                                  }}
                                  disabled={bulkDismissMutation.isPending}
                                  data-testid="button-dismiss-all"
                                >
                                  Dismiss All
                                </Button>
                              )}
                              {isExpanded ? (
                                <ChevronDown className="h-5 w-5 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="h-5 w-5 text-muted-foreground" />
                              )}
                            </div>
                          </div>
                        </CardHeader>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <CardContent className="pt-0 space-y-3">
                          {items.map((item) => {
                            const isExpanded = expandedTxn === item.transaction.id;
                            const txn = item.transaction;

                            return (
                              <div
                                key={txn.id}
                                className={cn(
                                  "border rounded-lg overflow-hidden hover:border-foreground/20"
                                )}
                                data-testid={`card-txn-${txn.id}`}
                              >
                                {/* Transaction Header */}
                                <div
                                  className="flex items-center gap-3 p-3 cursor-pointer hover-elevate"
                                  onClick={() => openModal(txn.id)}
                                >
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="tabular-nums font-bold">
                                        {formatCurrency(txn.amount)}
                                      </span>
                                      <span className="text-sm text-muted-foreground">
                                        {formatDate(txn.transactionDate)}
                                      </span>
                                      {txn.transactionTime && (
                                        <span className="text-sm text-muted-foreground flex items-center gap-0.5">
                                          <Clock className="h-3 w-3" />
                                          {txn.transactionTime}
                                        </span>
                                      )}
                                    </div>
                                    {txn.description && (
                                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                                        {txn.description}
                                      </p>
                                    )}
                                  </div>

                                  {/* Quick action for quick wins */}
                                  {category === 'quick_win' && item.bestMatch && (
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs text-muted-foreground">
                                        → {formatCurrency(item.bestMatch.transaction.amount)}
                                        {item.bestMatch.transaction.transactionTime && ` @ ${item.bestMatch.transaction.transactionTime}`}
                                      </span>
                                      <Badge variant="default" className="text-xs">
                                        {Math.round(item.bestMatch.confidence)}%
                                      </Badge>
                                      <Button
                                        size="sm"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          createMatchMutation.mutate({
                                            bankId: txn.id,
                                            fuelId: item.bestMatch!.transaction.id,
                                          });
                                        }}
                                        disabled={createMatchMutation.isPending}
                                        data-testid={`button-confirm-${txn.id}`}
                                      >
                                        Confirm
                                      </Button>
                                    </div>
                                  )}

                                  {/* Badge for investigate */}
                                  {category === 'investigate' && item.bestMatch && (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Badge variant="secondary" className="text-xs cursor-help">
                                          {Math.round(item.bestMatch.confidence)}% match
                                        </Badge>
                                      </TooltipTrigger>
                                      <TooltipContent side="left" className="max-w-xs text-xs">
                                        Confidence is based on amount similarity, date proximity, time proximity, and card number match.
                                        80%+ = Quick Win, 50-80% = Needs Review.
                                      </TooltipContent>
                                    </Tooltip>
                                  )}

                                  {/* Badge for no match — with insight hint */}
                                  {category === 'no_match' && (
                                    item.insights.some(i => i.type === 'possible_tip') ? (
                                      <Badge variant="outline" className="text-xs text-[#B45309] border-[#B45309]/30 dark:text-amber-400 dark:border-amber-700">
                                        Possible tip
                                      </Badge>
                                    ) : item.insights.some(i => i.type === 'duplicate_charge') ? (
                                      <Badge variant="outline" className="text-xs text-[#B91C1C] border-[#B91C1C]/30 dark:text-red-400 dark:border-red-700">
                                        Duplicate?
                                      </Badge>
                                    ) : (
                                      <Badge variant="outline" className="text-xs text-muted-foreground">
                                        No match
                                      </Badge>
                                    )
                                  )}

                                  <ChevronRight className={cn(
                                    "h-4 w-4 text-muted-foreground transition-transform",
                                    isExpanded && "rotate-90"
                                  )} />
                                </div>

                                {/* Expanded Detail — now handled by InvestigateModal */}
                                {false && (
                                  <div className="border-t p-4 space-y-4 bg-muted/20">
                                    {/* Transaction Details */}
                                    <div className="grid grid-cols-2 gap-2 text-sm">
                                      <div>
                                        <span className="text-muted-foreground">Date:</span>{" "}
                                        <span>{formatDate(txn.transactionDate)}</span>
                                        {txn.transactionTime && <span> {txn.transactionTime}</span>}
                                      </div>
                                      <div>
                                        <span className="text-muted-foreground">Source:</span>{" "}
                                        <span>{txn.sourceName || "N/A"}</span>
                                      </div>
                                    </div>

                                    {/* Insights */}
                                    {item.insights.length > 0 && (
                                      <div className="space-y-2">
                                        {item.insights.map((insight, i) => (
                                          <div
                                            key={i}
                                            className={cn(
                                              "p-3 rounded-lg border text-sm",
                                              insight.type === 'possible_tip' && "bg-[#FEF9C3] dark:bg-amber-950/30 border-[#B45309]/20 dark:border-amber-800",
                                              insight.type === 'overfill' && "bg-[#F4F4F0] dark:bg-[#1A1200]/20 border-[#E5E3DC] dark:border-[#2A2218]",
                                              insight.type === 'duplicate_charge' && "bg-[#FEE2E2] dark:bg-red-950/30 border-[#B91C1C]/20 dark:border-red-700",
                                              insight.type === 'no_fuel_record' && "bg-slate-50 dark:bg-slate-900/30 border-slate-200 dark:border-slate-700",
                                            )}
                                          >
                                            <div className="flex items-start gap-2">
                                              {insight.type === 'possible_tip' && <Coins className="h-4 w-4 text-[#B45309] shrink-0 mt-0.5" />}
                                              {insight.type === 'overfill' && <Fuel className="h-4 w-4 text-[#C05A2A] shrink-0 mt-0.5" />}
                                              {insight.type === 'duplicate_charge' && <AlertTriangle className="h-4 w-4 text-[#B91C1C] shrink-0 mt-0.5" />}
                                              {insight.type === 'no_fuel_record' && <HelpCircle className="h-4 w-4 text-slate-500 shrink-0 mt-0.5" />}
                                              <div>
                                                <p className="font-medium">{insight.message}</p>
                                                {insight.detail && (
                                                  <p className="text-xs text-muted-foreground mt-1">{insight.detail}</p>
                                                )}
                                              </div>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    )}

                                    {/* Best Match (if exists) */}
                                    {item.bestMatch && (
                                      <div className="p-3 border rounded-lg bg-card">
                                        <p className="text-sm font-medium mb-2 flex items-center gap-2">
                                          <CheckCircle2 className="h-4 w-4 text-[#166534]" />
                                          Best Match Found
                                        </p>
                                        <div className="flex items-center justify-between">
                                          <div>
                                            <p className="tabular-nums font-bold flex items-center gap-2">
                                              {formatCurrency(item.bestMatch.transaction.amount)}
                                              {item.bestMatch.transaction.paymentType && (
                                                <Badge variant="outline" className="text-xs font-normal">{item.bestMatch.transaction.paymentType}</Badge>
                                              )}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                              Difference: {formatCurrency(item.bestMatch.amountDiff)} · {item.bestMatch.timeDiff}
                                              {txn.transactionTime && item.bestMatch.transaction.transactionTime && (
                                                <span className="ml-1">({txn.transactionTime} → {item.bestMatch.transaction.transactionTime})</span>
                                              )}
                                              {item.bestMatch.transaction.referenceNumber && (
                                                <span> · Inv: {item.bestMatch.transaction.referenceNumber}</span>
                                              )}
                                            </p>
                                            {(item.bestMatch.transaction.attendant || item.bestMatch.transaction.cashier || item.bestMatch.transaction.pump) && (
                                              <p className="text-xs text-muted-foreground">
                                                {item.bestMatch.transaction.attendant && <span>Attendant: <span className="font-medium text-foreground">{item.bestMatch.transaction.attendant}</span></span>}
                                                {item.bestMatch.transaction.cashier && <span>{item.bestMatch.transaction.attendant ? ' · ' : ''}Cashier: <span className="font-medium text-foreground">{item.bestMatch.transaction.cashier}</span></span>}
                                                {item.bestMatch.transaction.pump && <span>{(item.bestMatch.transaction.attendant || item.bestMatch.transaction.cashier) ? ' · ' : ''}Pump: <span className="font-medium text-foreground">{item.bestMatch.transaction.pump}</span></span>}
                                              </p>
                                            )}
                                          </div>
                                          <div className="flex items-center gap-2">
                                            <Badge variant={item.bestMatch.confidence >= 80 ? "default" : "secondary"}>
                                              {Math.round(item.bestMatch.confidence)}% — {getConfidenceLabel(item.bestMatch.confidence)}
                                            </Badge>
                                            <Button
                                              size="sm"
                                              onClick={() => createMatchMutation.mutate({
                                                bankId: txn.id,
                                                fuelId: item.bestMatch!.transaction.id,
                                              })}
                                              disabled={createMatchMutation.isPending}
                                              data-testid={`button-link-best-${txn.id}`}
                                            >
                                              <LinkIcon className="h-4 w-4 mr-1" />
                                              Link
                                            </Button>
                                          </div>
                                        </div>
                                      </div>
                                    )}

                                    {/* Other Matches */}
                                    {item.potentialMatches.length > 1 && (
                                      <div>
                                        <p className="text-sm text-muted-foreground mb-2">
                                          Other possibilities (lower confidence):
                                        </p>
                                        <div className="space-y-1">
                                          {item.potentialMatches.slice(1).map((match) => (
                                            <div
                                              key={match.transaction.id}
                                              className="flex items-center justify-between text-sm p-2 border rounded hover-elevate"
                                            >
                                              <span>
                                                {formatCurrency(match.transaction.amount)} ({Math.round(match.confidence)}%)
                                                — {formatCurrency(match.amountDiff)} diff
                                                {match.timeDiff && <span className="text-muted-foreground"> · {match.timeDiff}</span>}
                                                {match.transaction.transactionTime && <span className="text-muted-foreground"> @ {match.transaction.transactionTime}</span>}
                                                {match.transaction.attendant && <span className="text-muted-foreground"> · {match.transaction.attendant}</span>}
                                                {match.transaction.cashier && <span className="text-muted-foreground"> · {match.transaction.cashier}</span>}
                                                {match.transaction.pump && <span className="text-muted-foreground"> · Pump {match.transaction.pump}</span>}
                                              </span>
                                              <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => createMatchMutation.mutate({
                                                  bankId: txn.id,
                                                  fuelId: match.transaction.id,
                                                })}
                                                disabled={createMatchMutation.isPending}
                                                data-testid={`button-link-${match.transaction.id}`}
                                              >
                                                <LinkIcon className="h-3 w-3" />
                                              </Button>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}

                                    {/* No confident matches — show nearest by amount */}
                                    {item.potentialMatches.length === 0 && item.nearestByAmount.length > 0 && (() => {
                                      const bankDate = new Date(txn.transactionDate);
                                      const allOutsideWindow = item.nearestByAmount.every(m => {
                                        const fuelDate = new Date(m.transaction.transactionDate);
                                        const days = Math.abs((bankDate.getTime() - fuelDate.getTime()) / (1000 * 60 * 60 * 24));
                                        return days > dateWindowDays;
                                      });
                                      return (
                                      <div>
                                        {allOutsideWindow ? (
                                          <div className="p-3 rounded bg-[#FEF9C3] dark:bg-amber-950/30 text-[#B45309] dark:text-amber-400 text-xs space-y-1.5">
                                            <div className="flex items-center gap-2 font-medium text-sm">
                                              <AlertTriangle className="h-4 w-4 shrink-0" />
                                              No fuel records within matching window — likely missing from fuel system
                                            </div>
                                            <p className="ml-6 text-[#B45309] dark:text-amber-400">
                                              Auto-matching rules applied:
                                            </p>
                                            <div className="ml-6 flex flex-wrap gap-x-3 gap-y-0.5 text-[#B45309] dark:text-amber-400">
                                              <span>Date window: {dateWindowDays}d</span>
                                              <span>Amount tolerance: R{matchingRules?.amountTolerance ?? 2}</span>
                                              <span>Time window: {matchingRules?.timeWindowMinutes ?? 60}min</span>
                                              <span>Min confidence: {matchingRules?.minimumConfidence ?? 70}%</span>
                                              <span>Auto-match: {matchingRules?.autoMatchThreshold ?? 85}%</span>
                                              {matchingRules?.requireCardMatch && <span>Card match required</span>}
                                              {matchingRules?.groupByInvoice && <span>Grouped by invoice</span>}
                                            </div>
                                          </div>
                                        ) : (
                                          <>
                                        <p className="text-sm font-medium mb-2 flex items-center gap-2">
                                          <Search className="h-4 w-4 text-muted-foreground" />
                                          Nearest fuel transactions by amount
                                        </p>
                                        <div className="space-y-1">
                                          {item.nearestByAmount.map((match) => (
                                            <div
                                              key={match.transaction.id}
                                              className="flex items-center justify-between text-sm p-2 border rounded hover-elevate"
                                            >
                                              <div className="min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                  <span className="tabular-nums font-medium">
                                                    {formatCurrency(match.transaction.amount)}
                                                  </span>
                                                  <span className="text-muted-foreground">
                                                    {formatDate(match.transaction.transactionDate)}
                                                  </span>
                                                  <span className="text-xs text-muted-foreground">
                                                    {match.timeDiff}
                                                  </span>
                                                </div>
                                                <p className="text-xs text-muted-foreground">
                                                  Difference: {formatCurrency(match.amountDiff)}
                                                  {match.transaction.description && ` · ${match.transaction.description}`}
                                                </p>
                                              </div>
                                              <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => createMatchMutation.mutate({
                                                  bankId: txn.id,
                                                  fuelId: match.transaction.id,
                                                })}
                                                disabled={createMatchMutation.isPending}
                                              >
                                                <LinkIcon className="h-3 w-3 mr-1" />
                                                Link
                                              </Button>
                                            </div>
                                          ))}
                                        </div>
                                          </>
                                        )}
                                      </div>
                                      );
                                    })()}

                                    {/* Truly no fuel transactions at all */}
                                    {item.potentialMatches.length === 0 && item.nearestByAmount.length === 0 && (
                                      <div className="p-3 bg-muted/50 rounded-lg text-center">
                                        <XCircle className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                                        <p className="text-sm text-muted-foreground">
                                          No unmatched fuel transactions available.
                                        </p>
                                      </div>
                                    )}

                                    {/* Resolution Actions */}
                                    <div className="border-t pt-4">
                                      <p className="text-sm font-medium mb-3">Not a match? Resolve this transaction:</p>
                                      <div className="space-y-3">
                                        <div className="grid grid-cols-2 gap-2">
                                          <Select value={selectedReason} onValueChange={setSelectedReason}>
                                            <SelectTrigger data-testid="select-reason">
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
                                          <Button
                                            variant="outline"
                                            disabled={!selectedReason || createResolutionMutation.isPending}
                                            onClick={() => createResolutionMutation.mutate({
                                              transactionId: txn.id,
                                              resolutionType: 'reviewed',
                                              reason: selectedReason,
                                              notes: resolutionNotes,
                                            })}
                                            data-testid="button-mark-reviewed"
                                          >
                                            <CheckCircle2 className="h-4 w-4 mr-2" />
                                            Match
                                          </Button>
                                        </div>
                                        <Textarea
                                          placeholder="Optional notes..."
                                          value={resolutionNotes}
                                          onChange={(e) => setResolutionNotes(e.target.value)}
                                          className="h-16"
                                          data-testid="input-notes"
                                        />
                                        <div className="flex gap-2">
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => createResolutionMutation.mutate({
                                              transactionId: txn.id,
                                              resolutionType: 'flagged',
                                              notes: resolutionNotes || 'To investigate',
                                            })}
                                            disabled={createResolutionMutation.isPending}
                                            data-testid="button-flag"
                                          >
                                            <Flag className="h-4 w-4 mr-1" />
                                            Investigate
                                          </Button>
                                          {parseFloat(txn.amount) < LOW_VALUE_THRESHOLD && (
                                            <Button
                                              variant="outline"
                                              size="sm"
                                              onClick={() => createResolutionMutation.mutate({
                                                transactionId: txn.id,
                                                resolutionType: 'dismissed',
                                                reason: 'test_transaction',
                                              })}
                                              disabled={createResolutionMutation.isPending}
                                              data-testid="button-dismiss"
                                            >
                                              Dismiss
                                            </Button>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </CardContent>
                      </CollapsibleContent>
                    </Card>
                  </Collapsible>
                );
              })}

            </>
          )}
              </>
              )}
            </>
          )}
        </div>
      </main>

      {/* Bulk Action Confirmation Dialog */}
      <AlertDialog open={!!pendingBulkAction} onOpenChange={(open) => !open && setPendingBulkAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingBulkAction?.type === 'confirm' && 'Confirm All Quick Wins'}
              {pendingBulkAction?.type === 'flag' && 'Investigate All'}
              {pendingBulkAction?.type === 'dismiss' && 'Dismiss All Low Value'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingBulkAction?.type === 'confirm' && `This will confirm ${pendingBulkAction.count} matches. Each bank transaction will be linked to its best fuel match.`}
              {pendingBulkAction?.type === 'flag' && `This will flag ${pendingBulkAction.count} transactions for manager review.`}
              {pendingBulkAction?.type === 'dismiss' && `This will dismiss ${pendingBulkAction.count} low-value transactions as immaterial.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              pendingBulkAction?.action();
              setPendingBulkAction(null);
            }}>
              {pendingBulkAction?.type === 'confirm' && 'Confirm All'}
              {pendingBulkAction?.type === 'flag' && 'Investigate All'}
              {pendingBulkAction?.type === 'dismiss' && 'Dismiss All'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Investigate Modal */}
      <InvestigateModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        items={modalItems}
        initialIndex={modalInitialIndex}
        periodId={periodId}
        matchingRules={matchingRules}
        onResolved={() => {
          // Data refreshes via query invalidation in the modal
        }}
        hideInvestigateButton={filterMode === 'flagged'}
      />
    </div>
  );
}
