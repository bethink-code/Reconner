import { Clock, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatRand, formatDate } from "@/lib/format";
import type { Transaction } from "@shared/schema";

interface TransactionRowProps {
  transaction: Transaction;
  onClick?: () => void;
  badge?: React.ReactNode;
  subtitle?: string;
  subtitleColor?: string;
  dimmed?: boolean;
  className?: string;
}

export function TransactionRow({ transaction: txn, onClick, badge, subtitle, subtitleColor, dimmed, className }: TransactionRowProps) {
  return (
    <div
      className={cn(
        "bg-card flex items-center justify-between p-3 border rounded-lg",
        onClick && "cursor-pointer hover:border-foreground/20",
        dimmed ? "border-[#166534]/20 opacity-75" : "border-[#E5E3DC]/50",
        className
      )}
      onClick={onClick}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn("tabular-nums font-bold", dimmed && "text-muted-foreground")}>{formatRand(txn.amount)}</span>
          <span className="text-sm text-muted-foreground">{formatDate(txn.transactionDate)}</span>
          {txn.transactionTime && (
            <span className="text-sm text-muted-foreground flex items-center gap-0.5">
              <Clock className="h-3 w-3" />{txn.transactionTime}
            </span>
          )}
        </div>
        {txn.description && <p className="text-xs text-muted-foreground truncate mt-0.5">{txn.description}</p>}
        {subtitle && <p className={cn("text-xs mt-0.5", subtitleColor || "text-muted-foreground")}>{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2 ml-2">
        {badge}
        {onClick && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
      </div>
    </div>
  );
}
