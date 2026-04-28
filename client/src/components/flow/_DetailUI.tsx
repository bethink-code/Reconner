import { cn } from "@/lib/utils";

export function DetailCard({ title, children, summary }: { title: string; children: React.ReactNode; summary?: boolean }) {
  return (
    <div className={cn("rounded-xl p-4", summary ? "bg-card border border-[#E5E3DC]" : "bg-section")}>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70 mb-3">{title}</h3>
      {children}
    </div>
  );
}

export function DetailRow({ label, count, amount, value, bold, highlight, muted }: {
  label: string;
  count?: number;
  amount?: string;
  value?: string;
  bold?: boolean;
  highlight?: boolean;
  muted?: boolean;
}) {
  return (
    <div className={cn("flex items-center justify-between text-sm py-0.5", bold && "font-medium", muted && "text-muted-foreground")}>
      <span className={cn(muted && "text-muted-foreground")}>{label}</span>
      <div className="flex items-center gap-4">
        {count !== undefined && <span className="tabular-nums text-muted-foreground w-10 text-right">{count.toLocaleString()}</span>}
        {amount && <span className={cn("tabular-nums text-right min-w-[100px]", highlight && "text-[#B45309] dark:text-amber-400")}>{amount}</span>}
        {value && <span className="tabular-nums text-right min-w-[100px]">{value}</span>}
      </div>
    </div>
  );
}
