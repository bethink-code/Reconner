import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, AlertTriangle, Plus, Calendar, Building2, Fuel, CreditCard } from "lucide-react";
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

const BANK_COLORS = [
  { bar: "bg-blue-500", track: "bg-blue-100 dark:bg-blue-950" },
  { bar: "bg-purple-500", track: "bg-purple-100 dark:bg-purple-950" },
  { bar: "bg-teal-500", track: "bg-teal-100 dark:bg-teal-950" },
  { bar: "bg-indigo-500", track: "bg-indigo-100 dark:bg-indigo-950" },
  { bar: "bg-cyan-500", track: "bg-cyan-100 dark:bg-cyan-950" },
];

export function PeriodCoverageTimeline({ 
  periodName, 
  data, 
  onAddFuelData,
  className 
}: PeriodCoverageTimelineProps) {
  const { periodStart, periodEnd, fuelDateRange, bankAccountRanges, unmatchableCount } = data;

  const formatDate = (date: Date | string) => {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
  };

  const totalDays = useMemo(() => {
    return Math.ceil((periodEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24));
  }, [periodStart, periodEnd]);

  const getPositionPercent = (date: Date) => {
    const dayOffset = (date.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24);
    return Math.max(0, Math.min(100, (dayOffset / totalDays) * 100));
  };

  const fuelStart = fuelDateRange ? new Date(fuelDateRange.min) : null;
  const fuelEnd = fuelDateRange ? new Date(fuelDateRange.max) : null;

  const fuelHasStartGap = fuelStart && fuelStart > periodStart;
  const fuelHasEndGap = fuelEnd && fuelEnd < periodEnd;

  const bankRangesWithGaps = useMemo(() => {
    if (!bankAccountRanges || bankAccountRanges.length === 0) return [];
    
    return bankAccountRanges.map((account, index) => {
      const start = new Date(account.min);
      const end = new Date(account.max);
      const hasStartGap = start > periodStart;
      const hasEndGap = end < periodEnd;
      const colorIndex = index % BANK_COLORS.length;
      
      return {
        ...account,
        start,
        end,
        hasStartGap,
        hasEndGap,
        hasGap: hasStartGap || hasEndGap,
        colors: BANK_COLORS[colorIndex],
        displayName: account.bankName || account.sourceName || `Bank Account ${index + 1}`,
      };
    });
  }, [bankAccountRanges, periodStart, periodEnd]);

  const hasAnyGaps = fuelHasStartGap || fuelHasEndGap || bankRangesWithGaps.some(b => b.hasGap);

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
            <Badge variant="outline" className="text-amber-600 border-amber-300" data-testid="badge-gaps-detected">
              <AlertTriangle className="h-3 w-3 mr-1" />
              Gaps detected
            </Badge>
          ) : (
            <Badge variant="outline" className="text-green-600 border-green-300" data-testid="badge-full-coverage">
              <Check className="h-3 w-3 mr-1" />
              Full coverage
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-1 pt-0">
        {/* Reporting Period Reference Row */}
        <TimelineRow
          icon={<Calendar className="h-3.5 w-3.5" />}
          label="Reporting Period"
          dateRange={`${formatDate(periodStart)} — ${formatDate(periodEnd)}`}
          barColor="bg-primary/30"
          trackColor="bg-muted"
          startPercent={0}
          widthPercent={100}
          isReference
        />
        
        {/* Fuel Data Row */}
        {fuelDateRange ? (
          <TimelineRow
            icon={<Fuel className="h-3.5 w-3.5" />}
            label="Fuel System"
            dateRange={`${formatDate(fuelDateRange.min)} — ${formatDate(fuelDateRange.max)}`}
            barColor={fuelHasStartGap || fuelHasEndGap ? "bg-amber-500" : "bg-green-500"}
            trackColor="bg-orange-100 dark:bg-orange-950"
            startPercent={getPositionPercent(fuelStart!)}
            widthPercent={getPositionPercent(fuelEnd!) - getPositionPercent(fuelStart!)}
            hasGap={!!(fuelHasStartGap || fuelHasEndGap)}
            onAddData={onAddFuelData}
          />
        ) : (
          <TimelineRow
            icon={<Fuel className="h-3.5 w-3.5" />}
            label="Fuel System"
            isEmpty
            trackColor="bg-orange-100 dark:bg-orange-950"
          />
        )}
        
        {/* Individual Bank Account Rows */}
        {bankRangesWithGaps.length > 0 ? (
          bankRangesWithGaps.map((account, index) => (
            <TimelineRow
              key={account.fileId || index}
              icon={<Building2 className="h-3.5 w-3.5" />}
              label={account.displayName}
              dateRange={`${formatDate(account.min)} — ${formatDate(account.max)}`}
              barColor={account.hasGap ? "bg-amber-500" : account.colors.bar}
              trackColor={account.colors.track}
              startPercent={getPositionPercent(account.start)}
              widthPercent={getPositionPercent(account.end) - getPositionPercent(account.start)}
              hasGap={account.hasGap}
              txCount={account.txCount}
              data-testid={`timeline-bank-${index}`}
            />
          ))
        ) : (
          <TimelineRow
            icon={<Building2 className="h-3.5 w-3.5" />}
            label="Bank Data"
            isEmpty
            trackColor="bg-blue-100 dark:bg-blue-950"
          />
        )}

        {/* Summary Footer */}
        {(unmatchableCount && unmatchableCount > 0) || hasAnyGaps ? (
          <div className="pt-3 mt-2 border-t space-y-2">
            {unmatchableCount && unmatchableCount > 0 && (
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>Excluded (outside fuel date range):</span>
                <span className="font-medium">{unmatchableCount} transactions</span>
              </div>
            )}
            
            {hasAnyGaps && onAddFuelData && (
              <div className="flex items-center gap-2 text-amber-600 text-sm">
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
        ) : null}
      </CardContent>
    </Card>
  );
}

interface TimelineRowProps {
  icon: React.ReactNode;
  label: string;
  dateRange?: string;
  barColor?: string;
  trackColor: string;
  startPercent?: number;
  widthPercent?: number;
  hasGap?: boolean;
  isEmpty?: boolean;
  isReference?: boolean;
  onAddData?: () => void;
  txCount?: number;
}

function TimelineRow({
  icon,
  label,
  dateRange,
  barColor,
  trackColor,
  startPercent = 0,
  widthPercent = 100,
  hasGap,
  isEmpty,
  isReference,
  onAddData,
  txCount,
}: TimelineRowProps) {
  return (
    <div className={cn(
      "grid grid-cols-[140px_1fr_100px] gap-2 items-center py-1.5",
      isReference && "pb-2 mb-1 border-b border-dashed"
    )}>
      {/* Label Column */}
      <div className="flex items-center gap-1.5 text-sm min-w-0">
        <span className="text-muted-foreground shrink-0">{icon}</span>
        <span className={cn(
          "truncate",
          isReference ? "font-medium" : "text-muted-foreground"
        )}>
          {label}
        </span>
      </div>
      
      {/* Bar Column */}
      <div className="relative h-5">
        <div className={cn("absolute inset-0 rounded-md", trackColor)} />
        {!isEmpty && barColor && (
          <div 
            className={cn(
              "absolute h-full rounded-md transition-all",
              barColor,
              hasGap && "opacity-90"
            )}
            style={{ 
              left: `${startPercent}%`, 
              width: `${Math.max(widthPercent, 2)}%` 
            }}
          />
        )}
        {isEmpty && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Badge variant="outline" className="text-red-600 text-xs h-5 px-1.5">
              No data
            </Badge>
          </div>
        )}
        {hasGap && onAddData && (
          <div className="absolute right-1 top-1/2 -translate-y-1/2">
            <Button
              variant="ghost"
              size="sm"
              className="h-4 px-1 text-xs hover:bg-transparent"
              onClick={onAddData}
              data-testid="button-add-fuel-gap"
            >
              <Plus className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>
      
      {/* Date Range Column */}
      <div className="text-xs text-right text-muted-foreground whitespace-nowrap">
        {dateRange || (isEmpty ? "" : "")}
        {txCount !== undefined && txCount > 0 && (
          <span className="ml-1 text-muted-foreground/70">({txCount})</span>
        )}
      </div>
    </div>
  );
}
