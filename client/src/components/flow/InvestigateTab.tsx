import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Check,
  ChevronRight,
  Clock,
  Download,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Transaction, TransactionResolution } from "@shared/schema";

interface PaginatedResponse {
  transactions: Transaction[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface InvestigateTabProps {
  periodId: string;
}

export function InvestigateTab({ periodId }: InvestigateTabProps) {
  // Fetch resolutions to find flagged items
  const { data: resolutions, isLoading: resLoading } = useQuery<TransactionResolution[]>({
    queryKey: ["/api/periods", periodId, "resolutions"],
    enabled: !!periodId,
  });

  // Fetch all bank transactions to find flagged ones
  const { data: allBankData } = useQuery<PaginatedResponse>({
    queryKey: ["/api/periods", periodId, "transactions", "all", "bank"],
    queryFn: async () => {
      const params = new URLSearchParams({ page: "1", limit: "500", sourceType: "bank" });
      const response = await fetch(`/api/periods/${periodId}/transactions?${params}`);
      if (!response.ok) throw new Error("Failed to fetch bank transactions");
      return response.json();
    },
    enabled: !!periodId,
  });

  // Fetch all fuel transactions to find flagged ones
  const { data: allFuelData } = useQuery<PaginatedResponse>({
    queryKey: ["/api/periods", periodId, "transactions", "all", "fuel"],
    queryFn: async () => {
      const params = new URLSearchParams({ page: "1", limit: "500", sourceType: "fuel", isCardTransaction: "yes" });
      const response = await fetch(`/api/periods/${periodId}/transactions?${params}`);
      if (!response.ok) throw new Error("Failed to fetch fuel transactions");
      return response.json();
    },
    enabled: !!periodId,
  });

  const flaggedResolutions = useMemo(
    () => (resolutions || []).filter(r => r.resolutionType === 'flagged'),
    [resolutions]
  );

  const flaggedIds = useMemo(
    () => new Set(flaggedResolutions.map(r => r.transactionId)),
    [flaggedResolutions]
  );

  // Split flagged items by side
  const flaggedBank = useMemo(() => {
    if (!allBankData?.transactions) return [];
    return allBankData.transactions
      .filter(txn => flaggedIds.has(txn.id))
      .map(txn => ({
        transaction: txn,
        resolution: flaggedResolutions.find(r => r.transactionId === txn.id),
      }))
      .sort((a, b) => parseFloat(b.transaction.amount) - parseFloat(a.transaction.amount));
  }, [allBankData, flaggedIds, flaggedResolutions]);

  const flaggedFuel = useMemo(() => {
    if (!allFuelData?.transactions) return [];
    return allFuelData.transactions
      .filter(txn => flaggedIds.has(txn.id))
      .map(txn => ({
        transaction: txn,
        resolution: flaggedResolutions.find(r => r.transactionId === txn.id),
      }))
      .sort((a, b) => parseFloat(b.transaction.amount) - parseFloat(a.transaction.amount));
  }, [allFuelData, flaggedIds, flaggedResolutions]);

  const totalCount = flaggedBank.length + flaggedFuel.length;
  const totalAmount = [...flaggedBank, ...flaggedFuel].reduce((s, f) => s + parseFloat(f.transaction.amount), 0);
  const bankAmount = flaggedBank.reduce((s, f) => s + parseFloat(f.transaction.amount), 0);
  const fuelAmount = flaggedFuel.reduce((s, f) => s + parseFloat(f.transaction.amount), 0);

  const formatCurrency = (amount: number) =>
    "R " + amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
  };

  if (resLoading) {
    return (
      <div className="space-y-4 mx-auto">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════
  //  EMPTY STATE — Positive outcome
  // ═══════════════════════════════════════════════════════════
  if (totalCount === 0) {
    return (
      <div className="mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-heading font-semibold text-[#1A1200]">Investigate</h2>
            <p className="text-sm text-muted-foreground">Your real-world follow-up list</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => window.open(`/api/periods/${periodId}/export`, '_blank')}>
              <Download className="h-4 w-4 mr-2" />Download all
            </Button>
          </div>
        </div>

        <Card className="bg-section border-[#E5E3DC]">
          <CardContent className="pt-10 pb-10">
            <div className="flex flex-col items-center justify-center text-center gap-4">
              <div className="w-14 h-14 rounded-full bg-[#DCFCE7] flex items-center justify-center">
                <Check className="h-7 w-7 text-[#166534]" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-[#1A1200]">Nothing to follow up on</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  All transactions have been accounted for. No items need real-world investigation.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════
  //  INVESTIGATE LIST — Two sections
  // ═══════════════════════════════════════════════════════════
  return (
    <div className="mx-auto space-y-6">
      {/* Header + downloads */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-heading font-semibold text-[#1A1200]">Investigate</h2>
          <p className="text-sm text-muted-foreground">
            {totalCount} item{totalCount !== 1 ? 's' : ''} across both sides · {formatCurrency(totalAmount)} total · work through these offline
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => window.open(`/api/periods/${periodId}/export`, '_blank')}>
            <Download className="h-4 w-4 mr-2" />Download all
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.open(`/api/periods/${periodId}/export?type=investigate`, '_blank')}>
            <Download className="h-4 w-4 mr-2" />Download investigate list
          </Button>
        </div>
      </div>

      {/* Unmatched Bank section */}
      {flaggedBank.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[#1A1200]">Unmatched bank <span className="text-muted-foreground font-normal">{flaggedBank.length} items</span></h3>
            <span className="text-sm font-semibold text-[#B45309] tabular-nums">{formatCurrency(bankAmount)}</span>
          </div>
          <div className="space-y-2">
            {flaggedBank.map(({ transaction: txn, resolution }) => (
              <Card key={txn.id} className="hover:border-foreground/20 transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-base tabular-nums font-bold">{formatCurrency(parseFloat(txn.amount))}</span>
                        <span className="text-sm text-muted-foreground">{formatDate(txn.transactionDate)}</span>
                        {txn.transactionTime && (
                          <span className="text-sm text-muted-foreground flex items-center gap-0.5">
                            <Clock className="h-3 w-3" />{txn.transactionTime}
                          </span>
                        )}
                        {txn.sourceName && <span className="text-sm text-muted-foreground">· {txn.sourceName}</span>}
                      </div>
                      {txn.description && <p className="text-xs text-muted-foreground truncate mt-0.5">{txn.description}</p>}
                      {resolution?.notes && (
                        <p className="text-xs text-[#B45309] mt-1">{resolution.notes}</p>
                      )}
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 ml-2" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Unmatched Fuel section */}
      {flaggedFuel.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[#1A1200]">Unmatched fuel <span className="text-muted-foreground font-normal">{flaggedFuel.length} items</span></h3>
            <span className="text-sm font-semibold text-[#B45309] tabular-nums">{formatCurrency(fuelAmount)}</span>
          </div>
          <div className="space-y-2">
            {flaggedFuel.map(({ transaction: txn, resolution }) => (
              <Card key={txn.id} className="hover:border-foreground/20 transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-base tabular-nums font-bold">{formatCurrency(parseFloat(txn.amount))}</span>
                        <span className="text-sm text-muted-foreground">{formatDate(txn.transactionDate)}</span>
                        {txn.transactionTime && (
                          <span className="text-sm text-muted-foreground flex items-center gap-0.5">
                            <Clock className="h-3 w-3" />{txn.transactionTime}
                          </span>
                        )}
                      </div>
                      {txn.description && <p className="text-xs text-muted-foreground truncate mt-0.5">{txn.description}</p>}
                      {resolution?.notes && (
                        <p className="text-xs text-[#B45309] mt-1">{resolution.notes}</p>
                      )}
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 ml-2" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
