import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { formatRand } from "@/lib/format";
import { getBankColor } from "@/lib/bankColors";
import { DetailCard, DetailRow } from "./_DetailUI";

export interface DeclineData {
  summary: { totalDeclined: number; resubmittedCount: number; unrecoveredCount: number; netUnrecoveredAmount: number; totalDeclinedAmount: number };
  transactions: { id: string; date: string; time: string; amount: number; bank: string; cardNumber: string; description: string; type: string; note: string; recoveredAmount: number; isRecovered: boolean; attendant: string | null; cashier: string | null }[];
  suspicious: { pattern: string; severity: 'high' | 'medium' | 'low'; detail: string; cardNumber: string; amount: number; shortfall: number; attendant: string | null }[];
}

interface DeclinedReportProps {
  declineData: DeclineData | undefined;
  isLoading: boolean;
  hasDeclined: boolean;
}

export function DeclinedReport({ declineData, isLoading, hasDeclined }: DeclinedReportProps) {
  if (!hasDeclined) {
    return (
      <Card className="bg-section border-[#E5E3DC]">
        <CardContent className="pt-8 pb-8 text-center">
          <p className="text-sm text-muted-foreground">No declined or cancelled transactions in this period.</p>
        </CardContent>
      </Card>
    );
  }

  if (isLoading || !declineData) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}
      </div>
    );
  }

  // Group ALL declined-analysis transactions by bank
  const byBank = new Map<string, { count: number; amount: number }>();
  for (const tx of declineData.transactions) {
    const key = tx.bank || 'Unknown';
    const existing = byBank.get(key) ?? { count: 0, amount: 0 };
    existing.count += 1;
    existing.amount += tx.amount;
    byBank.set(key, existing);
  }

  // Group transactions by card number
  const byCard = new Map<string, typeof declineData.transactions>();
  for (const tx of declineData.transactions) {
    const key = tx.cardNumber || tx.id;
    if (!byCard.has(key)) byCard.set(key, []);
    byCard.get(key)!.push(tx);
  }
  const groups = Array.from(byCard.entries()).sort((a, b) => {
    const aUnrecovered = a[1].some(t => !t.isRecovered);
    const bUnrecovered = b[1].some(t => !t.isRecovered);
    if (aUnrecovered !== bUnrecovered) return aUnrecovered ? -1 : 1;
    return b[1].length - a[1].length;
  });

  const suspiciousByCard = new Map<string, Map<string, 'high' | 'medium' | 'low'>>();
  for (const s of declineData.suspicious) {
    if (!s.cardNumber) continue;
    if (!suspiciousByCard.has(s.cardNumber)) suspiciousByCard.set(s.cardNumber, new Map());
    const existing = suspiciousByCard.get(s.cardNumber)!.get(s.pattern);
    const rank = { high: 0, medium: 1, low: 2 };
    if (!existing || rank[s.severity] < rank[existing]) {
      suspiciousByCard.get(s.cardNumber)!.set(s.pattern, s.severity);
    }
  }
  const isLateNight = (time: string) => {
    if (!time) return false;
    const h = parseInt(time.split(':')[0]);
    return h >= 22 || h < 5;
  };
  const badgeColor = (sev: 'high' | 'medium' | 'low') =>
    sev === 'high' ? 'bg-[#B91C1C]/10 text-[#B91C1C]'
    : sev === 'medium' ? 'bg-[#B45309]/10 text-[#B45309]'
    : 'bg-muted text-muted-foreground';

  return (
    <>
      {/* Decline Summary — includes per-bank breakdown */}
      <DetailCard title="Decline summary" summary>
        <div className="space-y-0.5">
          <DetailRow label="Total declined / cancelled" count={declineData.summary.totalDeclined} amount={formatRand(declineData.summary.totalDeclinedAmount)} />
        </div>

        {Array.from(byBank.entries())
          .sort((a, b) => b[1].count - a[1].count)
          .map(([bankName, stats]) => (
            <div key={bankName} className="flex items-center justify-between pl-3 text-xs">
              <span className="text-muted-foreground flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: getBankColor(bankName) }} />
                {bankName}
              </span>
              <div className="flex items-center gap-4">
                <span className="tabular-nums text-muted-foreground w-10 text-right">{stats.count.toLocaleString()}</span>
                <span className="tabular-nums text-muted-foreground text-right min-w-[100px]">{formatRand(stats.amount)}</span>
              </div>
            </div>
          ))}

        <Separator className="my-3" />
        <div className="space-y-0.5">
          <DetailRow
            label="Resubmitted successfully"
            count={declineData.summary.resubmittedCount}
            amount={formatRand(declineData.summary.totalDeclinedAmount - declineData.summary.netUnrecoveredAmount)}
          />
        </div>
        <Separator className="my-3" />
        <DetailRow label="Net unrecovered" count={declineData.summary.unrecoveredCount} amount={formatRand(declineData.summary.netUnrecoveredAmount)} bold highlight={declineData.summary.netUnrecoveredAmount > 0} />
      </DetailCard>

      {/* Transaction Detail — grouped by card */}
      <div className="space-y-3">
        {groups.map(([card, txns]) => {
          const hasUnrecovered = txns.some(t => !t.isRecovered);
          const attendant = txns.find(t => t.attendant)?.attendant;
          const cardPatterns = Array.from(suspiciousByCard.get(card) ?? new Map<string, 'high' | 'medium' | 'low'>());
          if (txns.some(t => isLateNight(t.time))) cardPatterns.push(['Late-night decline', 'low']);
          return (
            <DetailCard key={card} title={`Card ${card}`}>
              <div className="flex items-center flex-wrap gap-2 mb-2">
                <span className="text-sm text-muted-foreground">
                  {txns[0].bank} · {txns.length} transaction{txns.length !== 1 ? 's' : ''}
                  {attendant && <> · Attendant: <span className="font-medium text-foreground">{attendant}</span></>}
                </span>
                {hasUnrecovered ? (
                  <span className="text-sm font-medium text-[#B45309]">Unrecovered</span>
                ) : (
                  <span className="text-sm font-medium text-[#166534]">Recovered</span>
                )}
                {cardPatterns.map(([pattern, severity]) => (
                  <span key={pattern} className={cn("text-xs font-medium px-2 py-0.5 rounded-full", badgeColor(severity))}>
                    {pattern}
                  </span>
                ))}
              </div>
              <div className="space-y-1">
                {txns.sort((a, b) => a.time.localeCompare(b.time)).map(tx => {
                  const shortfall = tx.amount - tx.recoveredAmount;
                  const isPartial = shortfall > 0.50 && tx.recoveredAmount > 0;
                  const outcomeLabel = isPartial
                    ? `${tx.note.split(' — shortfall')[0]} of ${formatRand(tx.recoveredAmount)}`
                    : tx.note;
                  return (
                    <div key={tx.id} className={cn("py-1 pl-2 border-l-2", tx.isRecovered ? "border-[#166534]/30" : "border-[#B45309]")}>
                      <div className="flex items-center justify-between text-sm">
                        <span className={cn(tx.isRecovered && "text-muted-foreground")}>
                          {tx.type} {formatRand(tx.amount)} at {tx.time}
                        </span>
                        <span className={cn("tabular-nums shrink-0 ml-3", tx.isRecovered ? "text-muted-foreground line-through" : "text-[#B45309] font-medium")}>
                          {formatRand(tx.amount)}
                        </span>
                      </div>
                      {tx.note && (
                        <div className="flex items-center justify-between text-sm font-semibold mt-1 pl-4">
                          <span>{outcomeLabel}</span>
                          {isPartial ? (
                            <span className="text-[#B45309] shrink-0 ml-3"><span className="text-xs mr-1">Shortfall</span><span className="tabular-nums">{formatRand(shortfall)}</span></span>
                          ) : tx.recoveredAmount > 0 ? (
                            <span className="text-[#166534] shrink-0 ml-3"><span className="text-xs mr-1">Recovered</span><span className="tabular-nums">{formatRand(tx.recoveredAmount)}</span></span>
                          ) : null}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </DetailCard>
          );
        })}
      </div>
    </>
  );
}
