import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft,
  Search,
  Link as LinkIcon,
  X,
  AlertTriangle,
  HelpCircle,
  Check,
  ChevronDown,
  ChevronRight,
  Calendar,
  DollarSign,
  Clock,
  Building2,
  Fuel,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import type { Transaction } from "@shared/schema";

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

export default function InvestigateTransactions() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [periodId, setPeriodId] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"all" | "no_match" | "ambiguous">("all");
  const [expandedTxn, setExpandedTxn] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 20;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("periodId");
    if (id) {
      setPeriodId(id);
    } else {
      setLocation("/");
    }
  }, [setLocation]);

  const { data: unmatchedData, isLoading: unmatchedLoading } = useQuery<PaginatedResponse>({
    queryKey: ["/api/periods", periodId, "transactions", "unmatched", "bank", currentPage],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: ITEMS_PER_PAGE.toString(),
        matchStatus: "unmatched",
        sourceType: "bank",
      });
      const response = await fetch(`/api/periods/${periodId}/transactions?${params}`);
      if (!response.ok) throw new Error("Failed to fetch transactions");
      return response.json();
    },
    enabled: !!periodId,
  });

  const { data: potentialMatches, isLoading: matchesLoading } = useQuery<PotentialMatch[]>({
    queryKey: ["/api/periods", periodId, "transactions", "unmatched", "fuel", expandedTxn],
    queryFn: async (): Promise<PotentialMatch[]> => {
      if (!expandedTxn) return [];
      const bankTxn = unmatchedData?.transactions.find((t) => t.id === expandedTxn);
      if (!bankTxn) return [];

      const params = new URLSearchParams({
        page: "1",
        limit: "50",
        matchStatus: "unmatched",
        sourceType: "fuel",
        isCardTransaction: "yes",
      });
      const response = await fetch(`/api/periods/${periodId}/transactions?${params}`);
      if (!response.ok) throw new Error("Failed to fetch fuel transactions");
      const data: PaginatedResponse = await response.json();

      const bankAmount = parseFloat(bankTxn.amount);
      const bankDate = new Date(bankTxn.transactionDate);

      return data.transactions
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
          confidence = Math.max(0, confidence);

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
        .slice(0, 10);
    },
    enabled: !!periodId && !!expandedTxn,
  });

  const createMatchMutation = useMutation({
    mutationFn: async ({
      bankId,
      fuelId,
    }: {
      bankId: string;
      fuelId: string;
    }) => {
      const response = await apiRequest("POST", "/api/matches/manual", {
        periodId,
        bankTransactionId: bankId,
        fuelTransactionId: fuelId,
      });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Match created",
        description: "The transactions have been linked.",
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/periods", periodId, "transactions"],
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/periods", periodId, "summary"],
      });
      setExpandedTxn(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create match",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const formatCurrency = (amount: string | number) => {
    const num = typeof amount === "string" ? parseFloat(amount) : amount;
    return new Intl.NumberFormat("en-ZA", {
      style: "currency",
      currency: "ZAR",
    }).format(num);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-ZA", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  const transactions = unmatchedData?.transactions || [];
  const totalPages = unmatchedData?.totalPages || 1;
  const total = unmatchedData?.total || 0;

  if (unmatchedLoading || !periodId) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b bg-card sticky top-0 z-10">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4">
            <div className="flex items-center gap-4">
              <Skeleton className="h-9 w-9" />
              <Skeleton className="h-6 w-48" />
            </div>
          </div>
        </header>
        <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
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
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center gap-4">
            <Link href={`/flow/${periodId}`}>
              <Button variant="ghost" size="icon" data-testid="button-back">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div className="flex-1">
              <h1 className="text-xl font-semibold">Investigate Unmatched</h1>
              <p className="text-sm text-muted-foreground">
                {total} bank transaction{total !== 1 ? "s" : ""} need review
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="space-y-6">
          {transactions.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-4">
                    <Check className="h-6 w-6 text-green-600" />
                  </div>
                  <h3 className="font-semibold mb-1">All Clear!</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    All bank transactions within the data range have been matched.
                  </p>
                  <Link href={`/flow/${periodId}`}>
                    <Button variant="outline">Back to Results</Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {transactions.map((txn) => {
                const isExpanded = expandedTxn === txn.id;

                return (
                  <Card
                    key={txn.id}
                    className={cn(isExpanded && "ring-2 ring-primary")}
                    data-testid={`card-txn-${txn.id}`}
                  >
                    <CardContent className="pt-4">
                      <div
                        className="flex items-start gap-4 cursor-pointer"
                        onClick={() => setExpandedTxn(isExpanded ? null : txn.id)}
                      >
                        <div className="p-2 bg-muted rounded-lg shrink-0">
                          <Building2 className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium">
                              {formatDate(txn.transactionDate)}
                            </span>
                            {txn.transactionTime && (
                              <span className="text-sm text-muted-foreground">
                                {txn.transactionTime}
                              </span>
                            )}
                            <span className="font-mono font-bold">
                              {formatCurrency(txn.amount)}
                            </span>
                          </div>
                          <div className="text-sm text-muted-foreground mt-1">
                            {txn.referenceNumber && (
                              <span>Ref: {txn.referenceNumber}</span>
                            )}
                            {txn.description && (
                              <span className="ml-2">{txn.description}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            No Match
                          </Badge>
                          {isExpanded ? (
                            <ChevronDown className="h-5 w-5 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-5 w-5 text-muted-foreground" />
                          )}
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="mt-4 pt-4 border-t space-y-4">
                          <div className="p-3 bg-muted/50 rounded-lg">
                            <div className="flex items-start gap-2">
                              <HelpCircle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                              <div className="text-sm text-muted-foreground">
                                <p className="font-medium text-foreground mb-1">
                                  Why didn't this match?
                                </p>
                                <ul className="list-disc list-inside space-y-1">
                                  <li>No fuel card transaction found with similar amount</li>
                                  <li>Check if transaction was recorded as Cash instead of Card</li>
                                  <li>Could be from a different merchant account</li>
                                </ul>
                              </div>
                            </div>
                          </div>

                          <div>
                            <p className="text-sm font-medium mb-3">
                              <Search className="h-4 w-4 inline-block mr-1" />
                              Potential Fuel Matches
                            </p>

                            {matchesLoading ? (
                              <div className="space-y-2">
                                <Skeleton className="h-16 w-full" />
                                <Skeleton className="h-16 w-full" />
                              </div>
                            ) : potentialMatches?.length === 0 ? (
                              <div className="p-4 bg-muted/30 rounded-lg text-center">
                                <X className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                                <p className="text-sm text-muted-foreground">
                                  No matching fuel transactions found within tolerance.
                                </p>
                              </div>
                            ) : (
                              <div className="space-y-2">
                                {potentialMatches?.map((match) => (
                                  <div
                                    key={match.transaction.id}
                                    className="flex items-center gap-3 p-3 border rounded-lg hover-elevate"
                                  >
                                    <div className="p-2 bg-primary/10 rounded-lg shrink-0">
                                      <Fuel className="h-4 w-4 text-primary" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2">
                                        <span className="font-medium">
                                          {formatDate(match.transaction.transactionDate)}
                                        </span>
                                        <span className="font-mono">
                                          {formatCurrency(match.transaction.amount)}
                                        </span>
                                      </div>
                                      <div className="text-xs text-muted-foreground flex items-center gap-3 mt-1">
                                        <span className="flex items-center gap-1">
                                          <Clock className="h-3 w-3" />
                                          {match.timeDiff}
                                        </span>
                                        <span className="flex items-center gap-1">
                                          <DollarSign className="h-3 w-3" />
                                          {match.amountDiff === 0
                                            ? "Exact amount"
                                            : `±${formatCurrency(match.amountDiff)}`}
                                        </span>
                                        {match.transaction.referenceNumber && (
                                          <span>Inv: {match.transaction.referenceNumber}</span>
                                        )}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <Badge
                                        variant={
                                          match.confidence >= 80
                                            ? "default"
                                            : match.confidence >= 50
                                              ? "secondary"
                                              : "outline"
                                        }
                                      >
                                        {match.confidence}%
                                      </Badge>
                                      <Button
                                        size="sm"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          createMatchMutation.mutate({
                                            bankId: txn.id,
                                            fuelId: match.transaction.id,
                                          });
                                        }}
                                        disabled={createMatchMutation.isPending}
                                        data-testid={`button-link-${match.transaction.id}`}
                                      >
                                        <LinkIcon className="h-4 w-4 mr-1" />
                                        Link
                                      </Button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          <div className="flex justify-end gap-2 pt-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setExpandedTxn(null)}
                            >
                              Close
                            </Button>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
              <p className="text-sm text-muted-foreground">
                Page {currentPage} of {totalPages} ({total} transactions)
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
