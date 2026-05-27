import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import {
  ROUND_TOLERANCE_OPTIONS,
  clusterReprints,
  type ReprintScamCardTail,
  type ReprintScamDayCluster,
  type ReprintScamItem,
  type ReprintScamReadModel,
  type ReprintScamRules,
  type ReprintScamSuspectGroup,
} from "@shared/reprintScam";
import { cn } from "@/lib/utils";
import { formatRand, formatDate } from "@/lib/format";

export function ReprintScamReport({ data }: { data: ReprintScamReadModel }) {
  const [tolerance, setTolerance] = useState(data.defaultRules.roundCentsTolerance);

  const rules: ReprintScamRules = { ...data.defaultRules, roundCentsTolerance: tolerance };
  const view = useMemo(() => clusterReprints(data.candidates, rules), [data.candidates, rules]);
  const { summary } = view;

  return (
    <div className="space-y-4">
      <ToleranceFilter
        value={tolerance}
        onChange={setTolerance}
        denomination={data.defaultRules.roundDenomination}
      />

      {view.state === "no_round_amounts" ? (
        <div className="rounded-xl border border-[#E5E3DC] bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No round-amount card sales match this filter. Loosen the tolerance above, or this period
            simply has none.
          </p>
        </div>
      ) : (
        <>
          <Section title="Round-amount summary" emphasised>
            <div className="space-y-0.5">
              <Row
                label="Round-amount card sales"
                count={summary.roundAmountCount}
                amount={formatRand(summary.roundAmountTotal)}
              />
              <Row label="Matched to bank" count={summary.matchedCount} />
              <Row
                label="No bank match"
                count={summary.unmatchedCount}
                amount={formatRand(summary.unmatchedAmount)}
                highlight={summary.unmatchedCount > 0}
              />
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground/70">
              Fakes prefer round amounts — no cash change is handed over, so the till stays closed.
              The strongest tell is the same amount rung up repeatedly by the same person without
              reaching the bank (top section). Use the filter above if a cents ending is normal here.
            </p>
          </Section>

          <Section
            title={`Strongest suspects (${summary.suspectGroupCount})`}
            subtitle="Same amount, same attendant + cashier, repeated — with sales that never reached the bank. The real tell."
          >
            {view.topSuspects.length === 0 ? (
              <p className="py-2 text-sm text-muted-foreground">
                No repeated identical amount by one person went unsettled. That is the good outcome.
              </p>
            ) : (
              <div className="space-y-3">
                {view.topSuspects.map((group, index) => (
                  <SuspectGroupCard key={`${group.attendant}-${group.cashier}-${group.amount}-${index}`} group={group} />
                ))}
              </div>
            )}
          </Section>

          <Section
            title={`Same-day clusters (${summary.clusterCount})`}
            subtitle={`Days with ${rules.minClusterSize}+ round-amount card sales, most suspicious first.`}
          >
            {view.dayClusters.length === 0 ? (
              <p className="py-2 text-sm text-muted-foreground">
                No day reached the cluster threshold of {rules.minClusterSize} round-amount sales.
              </p>
            ) : (
              <div className="space-y-3">
                {view.dayClusters.map((cluster) => (
                  <DayClusterCard key={cluster.date} cluster={cluster} />
                ))}
              </div>
            )}
          </Section>

          <Section
            title={`Suspect card numbers (${summary.suspectCardTailCount})`}
            subtitle={`Card numbers on ${rules.minCardTailReuse}+ round-amount sales — a rogue terminal may reuse a number.`}
          >
            {view.suspectCardTails.length === 0 ? (
              <p className="py-2 text-sm text-muted-foreground">
                No card number appeared on {rules.minCardTailReuse} or more round-amount sales.
              </p>
            ) : (
              <div className="space-y-0.5">
                {view.suspectCardTails.map((tail) => (
                  <CardTailRow key={tail.cardTail} tail={tail} />
                ))}
              </div>
            )}
          </Section>
        </>
      )}
    </div>
  );
}

function ToleranceFilter({
  value,
  onChange,
  denomination,
}: {
  value: number;
  onChange: (value: number) => void;
  denomination: number;
}) {
  return (
    <div className="rounded-xl bg-section p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
            What counts as a round amount
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground/70">
            Multiples of R{denomination}. Tighten this if a cents ending is normal at this station.
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          {ROUND_TOLERANCE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                option.value === value
                  ? "bg-[#1A1200] text-white"
                  : "bg-card border border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function SuspectGroupCard({ group }: { group: ReprintScamSuspectGroup }) {
  const who = [group.attendant, group.cashier && `cashier ${group.cashier}`]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="rounded-xl border border-[#B45309]/40 bg-card p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{formatRand(group.amount)}</span>
        <span className="text-sm text-muted-foreground">× {group.count}</span>
        {who && <span className="text-sm text-muted-foreground">— {who || "Unknown"}</span>}
        <span className="rounded-full bg-[#B45309]/10 px-2 py-0.5 text-xs font-medium text-[#B45309]">
          {group.unmatchedCount} no bank match · {formatRand(group.unmatchedAmount)}
        </span>
      </div>
      <div className="space-y-1">
        {group.items.map((item) => (
          <ItemRow key={item.id} item={item} showPump />
        ))}
      </div>
    </div>
  );
}

function DayClusterCard({ cluster }: { cluster: ReprintScamDayCluster }) {
  return (
    <div className="rounded-xl border border-[#E5E3DC] bg-card p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{formatDate(cluster.date)}</span>
        <span className="text-sm text-muted-foreground">
          {cluster.count} round-amount sales · {formatRand(cluster.totalAmount)}
        </span>
        {cluster.unmatchedCount > 0 && (
          <span className="rounded-full bg-[#B45309]/10 px-2 py-0.5 text-xs font-medium text-[#B45309]">
            {cluster.unmatchedCount} no bank match
          </span>
        )}
        {cluster.matchedCount > 0 && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            {cluster.matchedCount} matched
          </span>
        )}
      </div>
      <div className="space-y-1">
        {cluster.items.map((item) => (
          <ItemRow key={item.id} item={item} showAmount showPump />
        ))}
      </div>
    </div>
  );
}

function ItemRow({
  item,
  showAmount,
  showPump,
}: {
  item: ReprintScamItem;
  showAmount?: boolean;
  showPump?: boolean;
}) {
  const who = [item.attendant, item.cashier && `cashier ${item.cashier}`]
    .filter(Boolean)
    .join(" · ");
  return (
    <div
      className={cn(
        "border-l-2 py-1 pl-2",
        item.matched ? "border-[#166534]/30" : "border-[#B45309]",
      )}
    >
      <div className="flex items-center justify-between text-sm">
        <span className={cn("tabular-nums", item.matched && "text-muted-foreground")}>
          {item.time || "—"}
          {showAmount && ` · ${formatRand(item.amount)}`}
        </span>
        <span
          className={cn(
            "ml-3 shrink-0 text-xs",
            item.matched ? "text-muted-foreground" : "font-medium text-[#B45309]",
          )}
        >
          {item.matched ? "matched" : "no bank match"}
        </span>
      </div>
      {(who || (showPump && item.pump) || item.cardTail) && (
        <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
          {who && <span>{who}</span>}
          {showPump && item.pump && <span>pump {item.pump}</span>}
          {item.cardTail && <span>card {item.cardTail}</span>}
        </div>
      )}
    </div>
  );
}

function CardTailRow({ tail }: { tail: ReprintScamCardTail }) {
  return (
    <div className="flex items-center justify-between py-1 text-sm">
      <span className="tabular-nums">card {tail.cardTail}</span>
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="tabular-nums">{tail.count} sales</span>
        {tail.unmatchedCount > 0 && (
          <span className="font-medium text-[#B45309]">{tail.unmatchedCount} no match</span>
        )}
        <span className="min-w-[90px] text-right tabular-nums">
          {formatRand(tail.totalAmount)}
        </span>
      </div>
    </div>
  );
}

function Section({
  title,
  subtitle,
  emphasised,
  children,
}: {
  title: string;
  subtitle?: string;
  emphasised?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={cn("rounded-xl p-4", emphasised ? "border border-[#E5E3DC] bg-card" : "bg-section")}>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
        {title}
      </h3>
      {subtitle ? (
        <p className="mb-3 mt-0.5 text-xs text-muted-foreground/70">{subtitle}</p>
      ) : (
        <div className="mb-3" />
      )}
      {children}
    </div>
  );
}

function Row({
  label,
  count,
  amount,
  highlight,
}: {
  label: string;
  count?: number;
  amount?: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-0.5 text-sm">
      <span>{label}</span>
      <div className="flex items-center gap-4">
        {count !== undefined && (
          <span className="w-10 text-right tabular-nums text-muted-foreground">
            {count.toLocaleString()}
          </span>
        )}
        {amount && (
          <span className={cn("min-w-[100px] text-right tabular-nums", highlight && "text-[#B45309]")}>
            {amount}
          </span>
        )}
      </div>
    </div>
  );
}
