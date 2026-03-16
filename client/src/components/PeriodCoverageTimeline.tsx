import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, AlertTriangle, Plus, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";

interface BankAccountRange {
  fileId: string;
  sourceName: string;
  bankName: string | null;
  min: string;
  max: string;
  txCount: number;
}

interface CoverageData {
  periodStart: Date;
  periodEnd: Date;
  fuelDateRange?: { min: string; max: string };
  bankDateRange?: { min: string; max: string };
  bankAccountRanges?: BankAccountRange[];
  unmatchableCount?: number;
}

interface PeriodCoverageTimelineProps {
  periodName: string;
  data: CoverageData;
  onAddFuelData?: () => void;
  className?: string;
}

/** Bank-accurate data viz colors — slots 1-15 */
const BANK_COLORS = [
  "#007C7F",  // FNB teal
  "#C0334E",  // ABSA red
  "#2E8A5A",  // Nedbank green
  "#1A4B9C",  // Std Bank navy
  "#7B4FA0",  // Deep violet
  "#C47A1E",  // Warm gold
  "#1E6B8C",  // Steel blue
  "#8C3A3A",  // Burgundy
  "#2E7A6B",  // Forest teal
  "#A05030",  // Rust
  "#4A6FA0",  // Slate blue
  "#7A3A6B",  // Berry
  "#5A7A2E",  // Olive
  "#A04A1E",  // Burnt amber
  "#2E4A8C",  // Ink blue
];

const FUEL_COLOR = "#C05A2A";
const PERIOD_DOT_COLOR = "#C4C2B8";

export function PeriodCoverageTimeline({
  periodName,
  data,
  onAddFuelData,
  className,
}: PeriodCoverageTimelineProps) {
  const { periodStart, periodEnd, fuelDateRange, bankAccountRanges, unmatchableCount } = data;

  const formatDate = (date: Date | string) => {
    const d = typeof date === "string" ? new Date(date) : date;
    return d.toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
  };

  const totalMs = periodEnd.getTime() - periodStart.getTime();

  const getPercent = (date: Date | string) => {
    const d = typeof date === "string" ? new Date(date) : date;
    const offset = d.getTime() - periodStart.getTime();
    return Math.max(0, Math.min(100, (offset / totalMs) * 100));
  };

  const fuelStart = fuelDateRange ? new Date(fuelDateRange.min) : null;
  const fuelEnd = fuelDateRange ? new Date(fuelDateRange.max) : null;
  const fuelHasGap = fuelStart && fuelEnd && (fuelStart > periodStart || fuelEnd < periodEnd);

  const bankRows = useMemo(() => {
    if (!bankAccountRanges || bankAccountRanges.length === 0) return [];
    return bankAccountRanges.map((account, index) => {
      const start = new Date(account.min);
      const end = new Date(account.max);
      return {
        ...account,
        start,
        end,
        hasGap: start > periodStart || end < periodEnd,
        color: BANK_COLORS[index % BANK_COLORS.length],
        displayName: account.bankName || account.sourceName || `Bank ${index + 1}`,
      };
    });
  }, [bankAccountRanges, periodStart, periodEnd]);

  const hasAnyGaps = !!fuelHasGap || bankRows.some((b) => b.hasGap);

  // Build rows for the Gantt
  interface GanttRow {
    label: string;
    color: string;
    startPct: number;
    widthPct: number;
    dateLabel: string;
    count: number | null;
    hasGap: boolean;
    isPeriod?: boolean;
  }

  const rows: GanttRow[] = [];

  // Period reference row
  rows.push({
    label: "Period",
    color: PERIOD_DOT_COLOR,
    startPct: 0,
    widthPct: 100,
    dateLabel: `${formatDate(periodStart)} — ${formatDate(periodEnd)}`,
    count: null,
    hasGap: false,
    isPeriod: true,
  });

  // Fuel row
  if (fuelDateRange && fuelStart && fuelEnd) {
    rows.push({
      label: "Fuel",
      color: FUEL_COLOR,
      startPct: getPercent(fuelStart),
      widthPct: getPercent(fuelEnd) - getPercent(fuelStart),
      dateLabel: `${formatDate(fuelDateRange.min)} — ${formatDate(fuelDateRange.max)}`,
      count: null,
      hasGap: !!fuelHasGap,
    });
  }

  // Bank rows
  bankRows.forEach((account) => {
    rows.push({
      label: account.displayName,
      color: account.color,
      startPct: getPercent(account.start),
      widthPct: getPercent(account.end) - getPercent(account.start),
      dateLabel: `${formatDate(account.min)} — ${formatDate(account.max)}`,
      count: account.txCount,
      hasGap: account.hasGap,
    });
  });

  return (
    <Card className={cn("", className)} data-testid="card-period-coverage">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium" data-testid="text-period-coverage-title">
              Period Coverage — {periodName}
            </CardTitle>
          </div>
          {hasAnyGaps ? (
            <Badge variant="outline" className="text-[#B45309] border-[#B45309]/30" data-testid="badge-gaps-detected">
              <AlertTriangle className="h-3 w-3 mr-1" />
              Gaps detected
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[#166534] border-[#166534]/30" data-testid="badge-full-coverage">
              <Check className="h-3 w-3 mr-1" />
              Full coverage
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-0">
          {rows.map((row, i) => (
            <div
              key={i}
              className={cn(
                "grid items-center py-2",
                i < rows.length - 1 && "border-b border-[#E5E3DC]"
              )}
              style={{ gridTemplateColumns: "90px 1fr 110px 48px" }}
            >
              {/* Source dot + label */}
              <div className="flex items-center gap-2 min-w-0">
                <div
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: row.isPeriod ? PERIOD_DOT_COLOR : row.color }}
                />
                <span className="text-xs text-muted-foreground truncate">
                  {row.label}
                </span>
              </div>

              {/* Gantt track */}
              <div className="relative h-5 mx-2">
                {/* Period extent reference fill */}
                <div className="absolute inset-0 rounded bg-[#ECEAE2] dark:bg-[#2A2218]" />
                {/* Source bar */}
                {!row.isPeriod && (
                  <div
                    className="absolute rounded-full"
                    style={{
                      backgroundColor: row.color,
                      left: `${row.startPct}%`,
                      width: `${Math.max(row.widthPct, 1.5)}%`,
                      height: "6px",
                      top: "7px",
                    }}
                  />
                )}
              </div>

              {/* Date range */}
              <div className="text-[11px] text-muted-foreground text-right whitespace-nowrap">
                {row.dateLabel}
              </div>

              {/* Count */}
              <div className="text-[11px] text-muted-foreground text-right tabular-nums">
                {row.count != null ? row.count : "—"}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        {((unmatchableCount && unmatchableCount > 0) || hasAnyGaps) && (
          <div className="pt-3 mt-2 border-t border-[#E5E3DC] space-y-2">
            {unmatchableCount && unmatchableCount > 0 && (
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>Excluded (outside fuel date range):</span>
                <span className="font-medium">{unmatchableCount} transactions</span>
              </div>
            )}
            {hasAnyGaps && onAddFuelData && (
              <div className="flex items-center gap-2 text-[#B45309] text-sm">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span className="flex-1">Data gaps may affect matching accuracy</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onAddFuelData}
                  data-testid="button-add-missing-data"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Data
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
