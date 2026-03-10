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
import type { Transaction, TransactionResolution } from "@shared/schema";
import { RESOLUTION_REASONS } from "@shared/schema";

const LOW_VALUE_THRESHOLD = 50; // R50

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

interface CategorizedTransaction {
  transaction: Transaction;
  category: 'quick_win' | 'investigate' | 'no_match' | 'low_value';
  bestMatch?: PotentialMatch;
  potentialMatches: PotentialMatch[];
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
    enabled: !!periodId && filterMode === 'flagged',
  });

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
    if (!allBankData?.transactions || filterMode !== 'flagged') return [];
    
    return allBankData.transactions
      .filter(txn => flaggedTransactionIds.has(txn.id))
      .map(txn => {
        const resolution = flaggedResolutions.find(r => r.transactionId === txn.id);
        return { transaction: txn, resolution };
      })
      .sort((a, b) => parseFloat(b.transaction.amount) - parseFloat(a.transaction.amount));
  }, [allBankData, flaggedTransactionIds, flaggedResolutions, filterMode]);

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

    return unmatchedData.transactions
      .filter(txn => !resolvedIds.has(txn.id))
      .map((bankTxn): CategorizedTransaction => {
        const bankAmount = parseFloat(bankTxn.amount);
        const bankDate = new Date(bankTxn.transactionDate);

        // Find potential matches
        const potentialMatches = fuelTxns
          .map((fuelTxn): PotentialMatch => {
            const fuelAmount = parseFloat(fuelTxn.amount);
            const fuelDate = new Date(fuelTxn.transactionDate);
            const daysDiff = Math.abs(
              (bankDate.getTime() - fuelDate.getTime()) / (1000 * 60 * 60 * 24)
            );
            const amountDiff = Math.abs(bankAmount - fuelAmount);

            let confidence = 100;
            if (daysDiff > 0) confidence -= daysDiff * 10;
            if (amountDiff > 0) confidence -= amountDiff * 5;
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
          })
          .filter((m) => m.confidence > 20)
          .sort((a, b) => b.confidence - a.confidence)
          .slice(0, 5);

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

        return {
          transaction: bankTxn,
          category,
          bestMatch,
          potentialMatches,
        };
      })
      .sort((a, b) => parseFloat(b.transaction.amount) - parseFloat(a.transaction.amount));
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
        txn.reference?.toLowerCase().includes(q) ||
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

  const totalUnresolved = categorizedTransactions.length;
  const totalResolved = resolvedIds.size;
  const totalAll = totalUnresolved + totalResolved;
  const progressPercent = totalAll > 0 ? Math.round((totalResolved / totalAll) * 100) : 0;

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
    return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(num);
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
        return { icon: Zap, label: "Quick Wins", color: "text-green-600", bg: "bg-green-100 dark:bg-green-900/30", description: "High-confidence matches ready to confirm" };
      case 'investigate':
        return { icon: Search, label: "Investigate", color: "text-amber-600", bg: "bg-amber-100 dark:bg-amber-900/30", description: "Lower confidence - review carefully" };
      case 'no_match':
        return { icon: HelpCircle, label: "No Match Found", color: "text-red-600", bg: "bg-red-100 dark:bg-red-900/30", description: "Requires manual investigation" };
      case 'low_value':
        return { icon: Coins, label: "Low Value", color: "text-slate-500", bg: "bg-slate-100 dark:bg-slate-800", description: `Under ${formatCurrency(LOW_VALUE_THRESHOLD)} - likely test transactions` };
    }
  };

  if (unmatchedLoading || !periodId) {
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
              <h1 className="text-xl font-semibold">
                {filterMode === 'flagged' ? 'Flagged Transactions' : 'Review Transactions'}
              </h1>
              <p className="text-sm text-muted-foreground">
                {filterMode === 'flagged' 
                  ? `${flaggedTransactions.length} transaction${flaggedTransactions.length !== 1 ? "s" : ""} flagged for follow-up`
                  : `${totalUnresolved} transaction${totalUnresolved !== 1 ? "s" : ""} need your attention`
                }
              </p>
            </div>
            {filterMode === 'flagged' && (
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => {
                  setFilterMode('all');
                  setLocation(`/investigate?periodId=${periodId}`);
                }}
                data-testid="button-view-all"
              >
                View All
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
        <div className="space-y-6">
          {/* Filter Mode Indicator */}
          {filterMode === 'flagged' ? (
            <div className="flex items-center gap-2 px-3 py-2 bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 rounded-lg text-sm">
              <Flag className="h-4 w-4 text-orange-600" />
              <span className="text-orange-800 dark:text-orange-200">
                Showing only transactions flagged for manager/accountant review
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
              <Info className="h-3.5 w-3.5" />
              <span>
                Showing unmatched bank transactions within your fuel data date range. 
                Matched and outside-date-range transactions are not included.
              </span>
            </div>
          )}

          {/* Flagged Mode Content */}
          {filterMode === 'flagged' ? (
            <>
              {/* Flagged Transactions List */}
              {flaggedTransactions.length === 0 ? (
                <Card className="bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800">
                  <CardContent className="pt-6 pb-6">
                    <div className="flex flex-col items-center text-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/50 flex items-center justify-center">
                        <Check className="h-6 w-6 text-green-600" />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-green-800 dark:text-green-200">
                          No Flagged Items
                        </h3>
                        <p className="text-sm text-green-700 dark:text-green-300 mt-1">
                          All flagged transactions have been resolved.
                        </p>
                      </div>
                      <Link href={`/flow/${periodId}?mode=view`}>
                        <Button variant="outline" data-testid="button-back-results">
                          Back to Results
                        </Button>
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {flaggedTransactions.map(({ transaction, resolution }) => (
                    <Card key={transaction.id} className="border-orange-200 dark:border-orange-800" data-testid={`card-flagged-${transaction.id}`}>
                      <CardContent className="pt-4 pb-4">
                        <div className="flex items-start gap-4">
                          <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg shrink-0">
                            <Flag className="h-4 w-4 text-orange-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-lg font-semibold font-mono">
                                {formatCurrency(parseFloat(transaction.amount))}
                              </span>
                              <span className="text-sm text-muted-foreground">
                                {formatDate(transaction.transactionDate)}
                              </span>
                            </div>
                            {transaction.description && (
                              <p className="text-sm text-muted-foreground mt-1 truncate">
                                {transaction.description}
                              </p>
                            )}
                            {resolution && (
                              <div className="mt-2 text-xs text-muted-foreground space-y-1">
                                <div className="flex items-center gap-1">
                                  <span>Flagged by:</span>
                                  <span className="font-medium">{resolution.userName || resolution.userEmail || 'Unknown'}</span>
                                </div>
                                {resolution.notes && (
                                  <div className="flex items-start gap-1">
                                    <span>Notes:</span>
                                    <span className="italic">{resolution.notes}</span>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                          {expandedTxn !== transaction.id && (
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => {
                                setExpandedTxn(transaction.id);
                                setSelectedReason('');
                                setResolutionNotes('');
                              }}
                              data-testid={`button-resolve-${transaction.id}`}
                            >
                              Resolve
                            </Button>
                          )}
                          {expandedTxn === transaction.id && (
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => setExpandedTxn(null)}
                              data-testid={`button-collapse-${transaction.id}`}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                        
                        {/* Expanded Resolution Panel */}
                        {expandedTxn === transaction.id && (
                          <div className="mt-4 pt-4 border-t space-y-4">
                            <p className="text-sm font-medium">How do you want to resolve this transaction?</p>
                            
                            <div className="space-y-3">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <Select value={selectedReason} onValueChange={setSelectedReason}>
                                  <SelectTrigger data-testid="select-reason-flagged">
                                    <SelectValue placeholder="Select resolution" />
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
                              
                              <Textarea 
                                placeholder="Add notes (optional)..."
                                value={resolutionNotes}
                                onChange={(e) => setResolutionNotes(e.target.value)}
                                className="min-h-[80px]"
                                data-testid="input-notes-flagged"
                              />
                              
                              <div className="flex gap-2 flex-wrap">
                                <Button
                                  onClick={() => {
                                    if (selectedReason) {
                                      createResolutionMutation.mutate({
                                        transactionId: transaction.id,
                                        resolutionType: selectedReason as 'reviewed' | 'dismissed' | 'written_off',
                                        reason: selectedReason,
                                        notes: resolutionNotes || undefined,
                                      });
                                    }
                                  }}
                                  disabled={!selectedReason || createResolutionMutation.isPending}
                                  data-testid="button-confirm-resolution"
                                >
                                  <Check className="h-4 w-4 mr-2" />
                                  Confirm Resolution
                                </Button>
                                <Button
                                  variant="outline"
                                  onClick={() => setExpandedTxn(null)}
                                  data-testid="button-cancel-resolution"
                                >
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {/* Export button for flagged items */}
              {flaggedTransactions.length > 0 && (
                <div className="flex justify-center">
                  <Button 
                    variant="outline"
                    onClick={() => window.open(`/api/periods/${periodId}/export-flagged`, '_blank')}
                    data-testid="button-export-flagged-list"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Export Flagged Transactions
                  </Button>
                </div>
              )}
            </>
          ) : (
            <>
              {/* Progress Indicator - Normal Mode */}
              <Card data-testid="card-progress">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-muted-foreground">Progress</span>
                    <span className="text-sm font-medium" data-testid="text-progress">
                      {totalResolved} of {totalAll} resolved
                    </span>
                  </div>
                  <Progress value={progressPercent} className="h-2" />
                </CardContent>
              </Card>

              {totalUnresolved === 0 ? (
            resolutionCounts.flagged > 0 ? (
              // Items flagged - show summary with pending items
              <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20" data-testid="card-review-complete">
                <CardContent className="pt-6 pb-6">
                  <div className="flex flex-col items-center text-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center">
                      <AlertTriangle className="h-6 w-6 text-amber-600" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold">
                        Review Complete — {resolutionCounts.total} of {resolutionCounts.total} categorized
                      </h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        Some transactions need manager/accountant follow-up
                      </p>
                    </div>
                    
                    {/* Summary breakdown */}
                    <div className="w-full max-w-sm text-left space-y-2 px-4">
                      {resolutionCounts.linked > 0 && (
                        <div className="flex items-center gap-2 text-sm">
                          <Check className="h-4 w-4 text-green-600" />
                          <span>{resolutionCounts.linked} Linked to fuel records</span>
                        </div>
                      )}
                      {resolutionCounts.dismissed > 0 && (
                        <div className="flex items-center gap-2 text-sm">
                          <Check className="h-4 w-4 text-green-600" />
                          <span>{resolutionCounts.dismissed} Dismissed (low value)</span>
                        </div>
                      )}
                      {resolutionCounts.reviewed > 0 && (
                        <div className="flex items-center gap-2 text-sm">
                          <Check className="h-4 w-4 text-green-600" />
                          <span>{resolutionCounts.reviewed} Marked as reviewed</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-400">
                        <AlertTriangle className="h-4 w-4" />
                        <span>{resolutionCounts.flagged} Flagged for follow-up</span>
                      </div>
                    </div>

                    <p className="text-sm text-muted-foreground">
                      Next: {resolutionCounts.flagged} transaction{resolutionCounts.flagged !== 1 ? 's' : ''} need manager/accountant review
                    </p>

                    <div className="flex gap-2 flex-wrap justify-center">
                      <Button 
                        variant="outline"
                        onClick={() => setLocation(`/report?periodId=${periodId}&filter=flagged`)}
                        data-testid="button-export-flagged"
                      >
                        Export for Review
                      </Button>
                      <Link href={`/flow/${periodId}?mode=view`}>
                        <Button variant="outline" data-testid="button-back-results">Back to Results</Button>
                      </Link>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : (
              // All items closed - show success
              <Card className="bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800" data-testid="card-all-clear">
                <CardContent className="pt-6 pb-6">
                  <div className="flex flex-col items-center justify-center py-4 text-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/50 flex items-center justify-center">
                      <Check className="h-6 w-6 text-green-600" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-green-800 dark:text-green-200">All Clear!</h3>
                      <p className="text-sm text-green-700 dark:text-green-300 mt-1">
                        All transactions have been resolved.
                      </p>
                    </div>
                    
                    {/* Summary breakdown */}
                    {resolutionCounts.total > 0 && (
                      <div className="w-full max-w-sm text-left space-y-1.5 px-4 text-sm text-green-700 dark:text-green-300">
                        {resolutionCounts.linked > 0 && (
                          <div className="flex items-center gap-2">
                            <Check className="h-3.5 w-3.5" />
                            <span>{resolutionCounts.linked} Linked to fuel records</span>
                          </div>
                        )}
                        {resolutionCounts.dismissed > 0 && (
                          <div className="flex items-center gap-2">
                            <Check className="h-3.5 w-3.5" />
                            <span>{resolutionCounts.dismissed} Dismissed (low value)</span>
                          </div>
                        )}
                        {resolutionCounts.reviewed > 0 && (
                          <div className="flex items-center gap-2">
                            <Check className="h-3.5 w-3.5" />
                            <span>{resolutionCounts.reviewed} Marked as reviewed</span>
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
            )
          ) : (
            <>
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
              {/* Category Sections */}
              {(['quick_win', 'investigate', 'no_match', 'low_value'] as const).map((category) => {
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
                                  Flag All for Review
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
                                  "border rounded-lg overflow-hidden",
                                  isExpanded && "ring-2 ring-primary"
                                )}
                                data-testid={`card-txn-${txn.id}`}
                              >
                                {/* Transaction Header */}
                                <div
                                  className="flex items-center gap-3 p-3 cursor-pointer hover-elevate"
                                  onClick={() => setExpandedTxn(isExpanded ? null : txn.id)}
                                >
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="font-mono font-bold">
                                        {formatCurrency(txn.amount)}
                                      </span>
                                      <span className="text-sm text-muted-foreground">
                                        {formatDate(txn.transactionDate)}
                                      </span>
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

                                  {/* Badge for no match */}
                                  {category === 'no_match' && (
                                    <Badge variant="outline" className="text-xs text-muted-foreground">
                                      No match
                                    </Badge>
                                  )}

                                  <ChevronRight className={cn(
                                    "h-4 w-4 text-muted-foreground transition-transform",
                                    isExpanded && "rotate-90"
                                  )} />
                                </div>

                                {/* Expanded Detail */}
                                {isExpanded && (
                                  <div className="border-t p-4 space-y-4 bg-muted/20">
                                    {/* Transaction Details */}
                                    <div className="grid grid-cols-2 gap-2 text-sm">
                                      <div>
                                        <span className="text-muted-foreground">Date:</span>{" "}
                                        <span>{formatDate(txn.transactionDate)}</span>
                                        {txn.transactionTime && <span> {txn.transactionTime}</span>}
                                      </div>
                                      <div>
                                        <span className="text-muted-foreground">Ref:</span>{" "}
                                        <span>{txn.referenceNumber || "N/A"}</span>
                                      </div>
                                    </div>

                                    {/* Best Match (if exists) */}
                                    {item.bestMatch && (
                                      <div className="p-3 border rounded-lg bg-card">
                                        <p className="text-sm font-medium mb-2 flex items-center gap-2">
                                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                                          Best Match Found
                                        </p>
                                        <div className="flex items-center justify-between">
                                          <div>
                                            <p className="font-mono font-bold">
                                              {formatCurrency(item.bestMatch.transaction.amount)}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                              Difference: {formatCurrency(item.bestMatch.amountDiff)} · {item.bestMatch.timeDiff}
                                              {item.bestMatch.transaction.referenceNumber && (
                                                <span> · Inv: {item.bestMatch.transaction.referenceNumber}</span>
                                              )}
                                            </p>
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
                                                — {formatCurrency(match.amountDiff)} difference
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

                                    {/* No matches message */}
                                    {item.potentialMatches.length === 0 && (
                                      <div className="p-3 bg-muted/50 rounded-lg text-center">
                                        <XCircle className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                                        <p className="text-sm text-muted-foreground">
                                          No matching fuel transactions found within tolerance.
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
                                            Mark as Reviewed
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
                                              notes: resolutionNotes || 'Flagged for manager review',
                                            })}
                                            disabled={createResolutionMutation.isPending}
                                            data-testid="button-flag"
                                          >
                                            <Flag className="h-4 w-4 mr-1" />
                                            Flag for Review
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
              {pendingBulkAction?.type === 'flag' && 'Flag All for Review'}
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
              {pendingBulkAction?.type === 'flag' && 'Flag All'}
              {pendingBulkAction?.type === 'dismiss' && 'Dismiss All'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
