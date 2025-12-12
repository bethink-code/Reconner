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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
  const [expandedTxn, setExpandedTxn] = useState<string | null>(null);
  const [selectedReason, setSelectedReason] = useState<string>("");
  const [resolutionNotes, setResolutionNotes] = useState<string>("");
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({
    quick_win: true,
    investigate: true,
    no_match: true,
    low_value: false,
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("periodId");
    if (id) {
      setPeriodId(id);
    } else {
      setLocation("/");
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

  const resolvedIds = useMemo(() => {
    return new Set(resolutions?.map(r => r.transactionId) || []);
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

  // Group by category
  const groupedTransactions = useMemo(() => {
    const groups: Record<CategorizedTransaction['category'], CategorizedTransaction[]> = {
      quick_win: [],
      investigate: [],
      no_match: [],
      low_value: [],
    };
    categorizedTransactions.forEach(ct => {
      groups[ct.category].push(ct);
    });
    return groups;
  }, [categorizedTransactions]);

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
    mutationFn: async (transactionIds: string[]) => {
      return await apiRequest("POST", "/api/resolutions/bulk-dismiss", {
        transactionIds,
        periodId,
      });
    },
    onSuccess: (data: { count: number }) => {
      toast({ title: "Transactions dismissed", description: `${data.count} low-value transactions dismissed.` });
      // Invalidate all related queries to ensure UI updates
      queryClient.invalidateQueries({ queryKey: ["/api/periods", periodId, "summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/periods", periodId, "transactions", "unmatched", "bank"] });
      queryClient.invalidateQueries({ queryKey: ["/api/periods", periodId, "transactions", "unmatched", "fuel"] });
      queryClient.invalidateQueries({ queryKey: ["/api/periods", periodId, "resolutions"] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to dismiss", description: error.message, variant: "destructive" });
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
            <Link href={`/flow/${periodId}`}>
              <Button variant="ghost" size="icon" data-testid="button-back">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div className="flex-1">
              <h1 className="text-xl font-semibold">Review Transactions</h1>
              <p className="text-sm text-muted-foreground">
                {totalUnresolved} transaction{totalUnresolved !== 1 ? "s" : ""} need your attention
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
        <div className="space-y-6">
          {/* Filter Explanation */}
          <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
            <Info className="h-3.5 w-3.5" />
            <span>
              Showing unmatched bank transactions within your fuel data date range. 
              Matched and outside-date-range transactions are not included.
            </span>
          </div>

          {/* Progress Indicator */}
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
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-4">
                    <Check className="h-6 w-6 text-green-600" />
                  </div>
                  <h3 className="font-semibold mb-1">All Clear!</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    All transactions have been reviewed.
                  </p>
                  <Link href={`/flow/${periodId}`}>
                    <Button variant="outline" data-testid="button-back-results">Back to Results</Button>
                  </Link>
                </div>
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
                              {category === 'low_value' && items.length > 0 && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    bulkDismissMutation.mutate(items.map(i => i.transaction.id));
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
                                    <Badge variant="secondary" className="text-xs">
                                      {Math.round(item.bestMatch.confidence)}% match
                                    </Badge>
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
        </div>
      </main>
    </div>
  );
}
