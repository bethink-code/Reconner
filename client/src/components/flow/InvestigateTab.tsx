import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Check, Download } from "lucide-react";
import { formatRand } from "@/lib/format";
import type { CategorizedTransaction, ReviewQueueReadModel } from "@/lib/reconciliation-types";
import { InvestigateModal } from "./InvestigateModal";
import { TransactionRow } from "./TransactionRow";

interface InvestigateTabProps {
  periodId: string;
  onJumpToAttendants?: () => void;
}

export function InvestigateTab({ periodId, onJumpToAttendants }: InvestigateTabProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [modalItems, setModalItems] = useState<CategorizedTransaction[]>([]);
  const [modalInitialIndex, setModalInitialIndex] = useState(0);
  const [modalSide, setModalSide] = useState<"bank" | "fuel">("bank");
  const { data: reviewModel, isLoading } = useQuery<ReviewQueueReadModel>({
    queryKey: ["/api/periods", periodId, "review-model"],
    queryFn: async () => {
      const response = await fetch(`/api/periods/${periodId}/review-model`);
      if (!response.ok) throw new Error("Failed to fetch investigate data");
      return response.json();
    },
    enabled: !!periodId,
    refetchOnMount: false,
  });

  const investigate = reviewModel?.investigate;

  const openModal = (side: "bank" | "fuel", transactionId: string) => {
    if (!investigate) return;
    const sideItems = side === "bank" ? investigate.bank : investigate.fuel;
    const index = sideItems.findIndex((item) => item.transaction.id === transactionId);
    if (index < 0) return;

    setModalSide(side);
    setModalItems(sideItems.map((item) => item.analysis));
    setModalInitialIndex(index);
    setModalOpen(true);
  };

  if (isLoading || !investigate) {
    return (
      <div className="mx-auto space-y-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (investigate.totalCount === 0) {
    return (
      <div className="mx-auto">
        <div className="mb-6 flex items-center justify-between px-3 py-4">
          <div>
            <h2 className="text-2xl font-heading font-semibold text-[#1A1200]">Investigate</h2>
            <p className="text-sm text-muted-foreground">Your real-world follow-up list</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => window.open(`/api/periods/${periodId}/export`, "_blank")}>
              <Download className="mr-2 h-4 w-4" />
              Download all
            </Button>
          </div>
        </div>

        <Card className="bg-section border-[#E5E3DC]">
          <CardContent className="pb-10 pt-10">
            <div className="flex flex-col items-center justify-center gap-4 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#DCFCE7]">
                <Check className="h-7 w-7 text-[#166534]" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-[#1A1200]">Nothing to follow up on</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  All transactions have been accounted for. No items need real-world investigation.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto space-y-6">
      <div className="flex items-center justify-between px-3 py-4">
        <div>
          <h2 className="text-2xl font-heading font-semibold text-[#1A1200]">Investigate</h2>
          <p className="text-sm text-muted-foreground">
            {investigate.totalCount} item{investigate.totalCount !== 1 ? "s" : ""} across both sides ·{" "}
            {formatRand(investigate.totalAmount)} total · work through these offline
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => window.open(`/api/periods/${periodId}/export`, "_blank")}>
            <Download className="mr-2 h-4 w-4" />
            Download all
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.open(`/api/periods/${periodId}/export-flagged`, "_blank")}
          >
            <Download className="mr-2 h-4 w-4" />
            Download investigate list
          </Button>
        </div>
      </div>

      {investigate.bank.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-3">
            <h3 className="text-sm font-semibold text-[#1A1200]">
              {investigate.bank.length} unmatched bank transaction{investigate.bank.length !== 1 ? "s" : ""}
            </h3>
            <span className="text-sm font-semibold tabular-nums text-[#B45309]">
              {formatRand(investigate.bankAmount)}
            </span>
          </div>
          <div className="space-y-2">
            {investigate.bank.map(({ transaction, resolution }) => (
              <TransactionRow
                key={transaction.id}
                transaction={transaction}
                onClick={() => openModal("bank", transaction.id)}
                subtitle={resolution?.notes || undefined}
                subtitleColor="text-[#B45309]"
              />
            ))}
          </div>
        </div>
      )}

      {investigate.fuel.length > 0 && (
        <div className="space-y-3">
          <div className="px-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[#1A1200]">
                {investigate.fuel.length} unmatched fuel card sales transaction
                {investigate.fuel.length !== 1 ? "s" : ""}
              </h3>
              <span className="text-sm font-semibold tabular-nums text-[#B45309]">
                {formatRand(investigate.fuelAmount)}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Unmatched fuel card sales transactions are allocated to relevant attendant.{" "}
              {onJumpToAttendants ? (
                <button type="button" onClick={onJumpToAttendants} className="text-[#E8601C] hover:underline">
                  View Attendant Report on Insights.
                </button>
              ) : (
                "View Attendant Report on Insights."
              )}
            </p>
          </div>
          <div className="space-y-2">
            {investigate.fuel.map(({ transaction, resolution }) => (
              <TransactionRow
                key={transaction.id}
                transaction={transaction}
                onClick={() => openModal("fuel", transaction.id)}
                subtitle={resolution?.notes || undefined}
                subtitleColor="text-[#B45309]"
              />
            ))}
          </div>
        </div>
      )}

      <InvestigateModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        items={modalItems}
        initialIndex={modalInitialIndex}
        periodId={periodId}
        matchingRules={reviewModel?.matchingRules}
        onResolved={() => {}}
        hideInvestigateButton
        side={modalSide}
      />
    </div>
  );
}
