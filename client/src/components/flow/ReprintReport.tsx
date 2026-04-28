import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatRand } from "@/lib/format";

export interface ReprintSlip {
  id: string;
  date: string;
  time: string;
  amount: number;
  cardNumber: string;
  cashier: string;
  attendant: string;
  reference: string;
  description: string;
}

export interface ReprintCashierGroup {
  cashier: string;
  count: number;
  amount: number;
  slips: ReprintSlip[];
}

export interface ReprintAnalysisResult {
  summary: {
    totalSlips: number;
    totalAmount: number;
    cashierCount: number;
    suspectCardTails: string[];
  };
  byCashier: ReprintCashierGroup[];
  slips: ReprintSlip[];
}

interface ReprintReportProps {
  data: ReprintAnalysisResult | undefined;
  isLoading: boolean;
}

export function ReprintReport({ data, isLoading }: ReprintReportProps) {
  if (isLoading || !data) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}
      </div>
    );
  }

  if (data.summary.totalSlips === 0) {
    return (
      <Card className="bg-section border-[#E5E3DC]">
        <CardContent className="pt-8 pb-8 text-center space-y-2">
          <ShieldCheck className="h-8 w-8 text-[#166534] mx-auto" />
          <p className="text-sm font-medium">No suspected reprint slips</p>
          <p className="text-xs text-muted-foreground">
            Every round-amount fuel sale in this period matched a bank settlement.
          </p>
        </CardContent>
      </Card>
    );
  }

  const suspectCardSet = new Set(data.summary.suspectCardTails);

  return (
    <div className="space-y-4">
      {/* Summary card */}
      <div className="rounded-xl bg-card border border-[#B91C1C]/30 p-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#B91C1C]/10 flex items-center justify-center shrink-0">
            <AlertTriangle className="h-5 w-5 text-[#B91C1C]" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-[#B91C1C]">{data.summary.totalSlips} suspected reprint slip{data.summary.totalSlips !== 1 ? 's' : ''}</h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              Round-amount fuel sales totalling <span className="font-semibold tabular-nums text-foreground">{formatRand(data.summary.totalAmount)}</span> across {data.summary.cashierCount} cashier{data.summary.cashierCount !== 1 ? 's' : ''} have no matching bank settlement.
            </p>
            <p className="text-xs text-muted-foreground/80 mt-2 leading-relaxed">
              These slips look authentic but the bank never received them. Likely sources: a rogue/test-mode terminal printing approved-looking slips, or old card slips re-used to claim cash.
            </p>
          </div>
        </div>

        {data.summary.suspectCardTails.length > 0 && (
          <>
            <Separator className="my-3" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70 mb-2">
                Cards used on multiple round-amount sales
              </p>
              <div className="flex flex-wrap gap-1.5">
                {data.summary.suspectCardTails.map(card => (
                  <span key={card} className="text-xs font-mono px-2 py-0.5 rounded-full bg-[#B91C1C]/10 text-[#B91C1C]">
                    {card}
                  </span>
                ))}
              </div>
              <p className="text-xs text-muted-foreground/60 mt-2 leading-relaxed">
                These card-tails appear on two or more round-amount fuel sales (matched + suspect). They may be legit repeat customers, or cards being cloned by a rogue terminal — verify against a few real customers.
              </p>
            </div>
          </>
        )}
      </div>

      {/* Per-cashier breakdown */}
      {data.byCashier.map(group => (
        <div key={group.cashier} className="rounded-lg bg-section p-3">
          <div className="flex items-center justify-between mb-2">
            <div>
              <span className="text-base font-semibold">{group.cashier}</span>
              <span className="text-xs text-muted-foreground ml-2">
                {group.count} suspected slip{group.count !== 1 ? 's' : ''}
              </span>
            </div>
            <span className="tabular-nums font-medium text-[#B91C1C]">{formatRand(group.amount)}</span>
          </div>

          <div className="space-y-1.5">
            {group.slips.map(slip => {
              const cardSuspect = slip.cardNumber && suspectCardSet.has(slip.cardNumber);
              return (
                <div key={slip.id} className="py-1.5 px-2 border-l-2 border-[#B91C1C]/40 bg-card/50 rounded-r">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground tabular-nums w-20">{slip.date} {slip.time}</span>
                      <span className="tabular-nums font-medium">{formatRand(slip.amount)}</span>
                      {slip.cardNumber && (
                        <span className={cn("text-xs font-mono px-1.5 py-0.5 rounded", cardSuspect ? "bg-[#B91C1C]/10 text-[#B91C1C]" : "bg-muted text-muted-foreground")}>
                          {slip.cardNumber}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      Pump attendant: <span className="text-foreground">{slip.attendant}</span>
                    </span>
                  </div>
                  {slip.reference && (
                    <div className="text-xs text-muted-foreground/70 mt-0.5 pl-23">
                      Ref: <span className="font-mono">{slip.reference}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
