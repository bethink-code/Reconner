import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Banknote, ArrowLeft, ArrowRight, Plus, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useInvalidateReconciliation } from "@/hooks/useInvalidateReconciliation";
import { formatRand } from "@/lib/format";

interface CashSpentItem {
  id: string;
  amount: number;
  paymentDate: string;
  reason: string;
  userName: string | null;
  createdAt: string;
}

interface CashData {
  received: number | null;
  spent: CashSpentItem[];
}

interface CashInputStepProps {
  periodId: string;
  periodStart: string;
  periodEnd: string;
  onBack: () => void;
  onContinue: () => void;
  stepColor?: string;
  readOnly?: boolean;
}

export function CashInputStep({
  periodId,
  periodStart,
  periodEnd,
  onBack,
  onContinue,
  readOnly = false,
}: CashInputStepProps) {
  const { toast } = useToast();
  const invalidateAll = useInvalidateReconciliation(periodId);

  const { data: cashData, isLoading } = useQuery<CashData>({
    queryKey: ["/api/periods", periodId, "cash"],
    enabled: !!periodId,
  });

  const [receivedDraft, setReceivedDraft] = useState<string>("");
  const [receivedSaving, setReceivedSaving] = useState(false);

  // Hydrate draft from server data once
  useEffect(() => {
    if (cashData && receivedDraft === "") {
      setReceivedDraft(cashData.received === null ? "" : String(cashData.received));
    }
  }, [cashData]); // eslint-disable-line react-hooks/exhaustive-deps

  const setReceivedMutation = useMutation({
    mutationFn: async (amount: number | null) => {
      setReceivedSaving(true);
      try {
        const res = await apiRequest("PUT", `/api/periods/${periodId}/cash/received`, { amount });
        return await res.json();
      } finally {
        setReceivedSaving(false);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/periods", periodId, "cash"] });
      invalidateAll();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to save cash received",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  function handleReceivedBlur() {
    if (readOnly) return;
    const trimmed = receivedDraft.trim();
    const parsed = trimmed === "" ? null : Number(trimmed);
    if (parsed !== null && (Number.isNaN(parsed) || parsed < 0)) {
      toast({ title: "Cash received must be a positive number", variant: "destructive" });
      return;
    }
    if (parsed === cashData?.received) return;
    setReceivedMutation.mutate(parsed);
  }

  return (
    <div className="max-w-2xl mx-auto bg-section rounded-2xl p-8" data-testid="cash-input-step">
      <div className="text-center pb-6">
        <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-card flex items-center justify-center">
          <Banknote className="h-6 w-6 text-primary" />
        </div>
        <p className="text-sm text-muted-foreground mb-1">Right, let's sort out your cash.</p>
        <h2 className="text-2xl font-semibold tracking-tight">Enter the cash you actually received this period</h2>
        <p className="text-sm text-muted-foreground mt-1">
          We compare this to what your point of sale rang up as cash, to find the gap.
        </p>
      </div>

      <div className="space-y-6">
        {isLoading ? (
          <div className="space-y-6" data-testid="cash-input-loading">
            <div className="space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-9 w-[200px]" />
              <Skeleton className="h-3 w-full max-w-md" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-9 w-44" />
            </div>
          </div>
        ) : (
        <>
        <section className="space-y-2" data-testid="received-section">
          <Label htmlFor="cash-received" className="text-sm font-medium">
            Cash received this period
          </Label>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">R</span>
            <Input
              id="cash-received"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={receivedDraft}
              onChange={(e) => setReceivedDraft(e.target.value)}
              onBlur={handleReceivedBlur}
              disabled={isLoading || readOnly}
              className="bg-card max-w-[200px]"
              data-testid="input-cash-received"
            />
            {receivedSaving && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>
          <p className="text-xs text-muted-foreground">
            The total cash you actually got for this period, wherever it ended up (banked, on hand,
            or in transit). We compare this to what your point of sale rang up as cash to find the gap.
          </p>
        </section>

        <section className="space-y-3" data-testid="spent-section">
          <div>
            <h3 className="text-sm font-medium">Cash spent</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Anything you paid for in cash straight from the drawer (food, Uber, supplies). This
              explains where received cash went. It doesn't change the gap.
            </p>
          </div>
          <CashSpentList
            periodId={periodId}
            spent={cashData?.spent ?? []}
            periodStart={periodStart}
            periodEnd={periodEnd}
            readOnly={readOnly}
          />
        </section>

        <CashInHandPreview cashData={cashData} />
        </>
        )}

        <div className="flex justify-between gap-3 pt-2">
          <Button variant="outline" onClick={onBack} data-testid="button-back">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onContinue} data-testid="button-skip">
              Skip for now
            </Button>
            <Button onClick={onContinue} data-testid="button-continue">
              Continue
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface CashSpentListProps {
  periodId: string;
  spent: CashSpentItem[];
  periodStart: string;
  periodEnd: string;
  readOnly: boolean;
}

function CashSpentList({ periodId, spent, periodStart, periodEnd, readOnly }: CashSpentListProps) {
  const { toast } = useToast();
  const invalidateAll = useInvalidateReconciliation(periodId);
  const [showForm, setShowForm] = useState(false);
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(periodEnd);
  const [reason, setReason] = useState("");

  const createMutation = useMutation({
    mutationFn: async (payload: { amount: number; paymentDate: string; reason: string }) => {
      const res = await apiRequest("POST", `/api/periods/${periodId}/cash/payments`, payload);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/periods", periodId, "cash"] });
      invalidateAll();
      setAmount("");
      setReason("");
      setPaymentDate(periodEnd);
      setShowForm(false);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to add cash spent item", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/cash-payments/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/periods", periodId, "cash"] });
      invalidateAll();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to remove cash spent item", description: error.message, variant: "destructive" });
    },
  });

  function handleAdd() {
    const parsed = Number(amount);
    if (Number.isNaN(parsed) || parsed <= 0) {
      toast({ title: "Amount must be greater than zero", variant: "destructive" });
      return;
    }
    if (!reason.trim()) {
      toast({ title: "Reason is required", variant: "destructive" });
      return;
    }
    createMutation.mutate({ amount: parsed, paymentDate, reason: reason.trim() });
  }

  return (
    <div className="space-y-2">
      {spent.length === 0 && !showForm && (
        <p className="text-xs text-muted-foreground">No cash spent items yet.</p>
      )}

      {spent.length > 0 && (
        <ul className="space-y-1.5">
          {spent.map((p) => (
            <li
              key={p.id}
              className="flex items-center gap-3 bg-card rounded-lg px-3 py-2"
              data-testid={`spent-item-${p.id}`}
            >
              <span className="text-sm font-medium tabular-nums w-24">{formatRand(p.amount)}</span>
              <span className="text-xs text-muted-foreground w-24">{p.paymentDate}</span>
              <span className="text-sm flex-1 truncate" title={p.reason}>
                {p.reason}
              </span>
              {!readOnly && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => deleteMutation.mutate(p.id)}
                  disabled={deleteMutation.isPending}
                  data-testid={`button-delete-${p.id}`}
                >
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {showForm && (
        <div className="bg-card rounded-lg p-3 space-y-2" data-testid="spent-form">
          <div className="flex gap-2">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">R</span>
              <Input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="max-w-[120px]"
                data-testid="input-spent-amount"
              />
            </div>
            <Input
              type="date"
              min={periodStart}
              max={periodEnd}
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              className="max-w-[170px]"
              data-testid="input-spent-date"
            />
          </div>
          <Input
            type="text"
            placeholder="What was it for? (e.g. food, Uber)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            data-testid="input-spent-reason"
          />
          <div className="flex justify-end gap-2 pt-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowForm(false);
                setAmount("");
                setReason("");
                setPaymentDate(periodEnd);
              }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleAdd}
              disabled={createMutation.isPending}
              data-testid="button-save-spent"
            >
              {createMutation.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Add
            </Button>
          </div>
        </div>
      )}

      {!showForm && !readOnly && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowForm(true)}
          data-testid="button-add-spent"
        >
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Add cash spent item
        </Button>
      )}
    </div>
  );
}

// Preview shown on the input step: cash in hand (received − spent). The full leak (POS cash −
// received) needs the till data, so it surfaces in the Insights → Cash gap report.
function CashInHandPreview({ cashData }: { cashData?: CashData }) {
  if (!cashData || cashData.received === null) return null;
  const spentTotal = cashData.spent.reduce((sum, s) => sum + s.amount, 0);
  const received = cashData.received;
  const cashInHand = received - spentTotal;

  return (
    <div className="bg-card rounded-lg p-3 text-xs text-muted-foreground" data-testid="cash-preview">
      <span className="font-medium text-foreground">Cash in hand: {formatRand(cashInHand)}</span>
      <span> · received {formatRand(received)} − spent {formatRand(spentTotal)} ({cashData.spent.length})</span>
    </div>
  );
}
