import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, AlertTriangle, Plus, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";

interface CoverageData {
  periodStart: Date;
  periodEnd: Date;
  fuelDateRange?: { min: string; max: string };
  bankDateRange?: { min: string; max: string };
  unmatchableCount?: number;
}

interface PeriodCoverageTimelineProps {
  periodName: string;
  data: CoverageData;
  onAddFuelData?: () => void;
  className?: string;
}

export function PeriodCoverageTimeline({ 
  periodName, 
  data, 
  onAddFuelData,
  className 
}: PeriodCoverageTimelineProps) {
  const { periodStart, periodEnd, fuelDateRange, bankDateRange, unmatchableCount } = data;

  const formatDate = (date: Date | string) => {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
  };

  const getMonthName = (date: Date) => {
    return date.toLocaleDateString("en-ZA", { month: "long", year: "numeric" });
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
  const bankStart = bankDateRange ? new Date(bankDateRange.min) : null;
  const bankEnd = bankDateRange ? new Date(bankDateRange.max) : null;

  const fuelHasStartGap = fuelStart && fuelStart > periodStart;
  const fuelHasEndGap = fuelEnd && fuelEnd < periodEnd;
  const bankHasStartGap = bankStart && bankStart > periodStart;
  const bankHasEndGap = bankEnd && bankEnd < periodEnd;

  const hasGaps = fuelHasStartGap || fuelHasEndGap || bankHasStartGap || bankHasEndGap;

  return (
    <Card className={cn("", className)} data-testid="card-period-coverage">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium">
              Period Coverage — {getMonthName(periodStart)}
            </CardTitle>
          </div>
          {hasGaps ? (
            <Badge variant="outline" className="text-amber-600 border-amber-300">
              <AlertTriangle className="h-3 w-3 mr-1" />
              Gaps detected
            </Badge>
          ) : (
            <Badge variant="outline" className="text-green-600 border-green-300">
              <Check className="h-3 w-3 mr-1" />
              Full coverage
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          <div className="text-xs text-muted-foreground flex justify-between">
            <span>Reporting Period: {formatDate(periodStart)} — {formatDate(periodEnd)}</span>
          </div>
          
          <div className="relative h-2 bg-muted rounded-full">
            <div 
              className="absolute h-full bg-primary/20 rounded-full"
              style={{ left: '0%', width: '100%' }}
            />
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">Fuel Data</span>
            {fuelDateRange ? (
              <span className="text-xs text-muted-foreground">
                {formatDate(fuelDateRange.min)} — {formatDate(fuelDateRange.max)}
              </span>
            ) : (
              <Badge variant="outline" className="text-red-600">No data</Badge>
            )}
          </div>
          {fuelDateRange && (
            <div className="relative h-3 bg-muted/50 rounded-full overflow-hidden">
              <div 
                className={cn(
                  "absolute h-full rounded-full",
                  (fuelHasStartGap || fuelHasEndGap) ? "bg-amber-500" : "bg-green-500"
                )}
                style={{ 
                  left: `${getPositionPercent(fuelStart!)}%`, 
                  width: `${getPositionPercent(fuelEnd!) - getPositionPercent(fuelStart!)}%` 
                }}
              />
              {(fuelHasStartGap || fuelHasEndGap) && (
                <div className="absolute right-0 top-1/2 -translate-y-1/2 pr-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 px-1 text-xs"
                    onClick={onAddFuelData}
                    data-testid="button-add-fuel-gap"
                  >
                    <Plus className="h-3 w-3 mr-0.5" />
                    Add
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">Bank Data</span>
            {bankDateRange ? (
              <span className="text-xs text-muted-foreground">
                {formatDate(bankDateRange.min)} — {formatDate(bankDateRange.max)}
              </span>
            ) : (
              <Badge variant="outline" className="text-red-600">No data</Badge>
            )}
          </div>
          {bankDateRange && (
            <div className="relative h-3 bg-muted/50 rounded-full overflow-hidden">
              <div 
                className={cn(
                  "absolute h-full rounded-full",
                  (bankHasStartGap || bankHasEndGap) ? "bg-amber-500" : "bg-green-500"
                )}
                style={{ 
                  left: `${getPositionPercent(bankStart!)}%`, 
                  width: `${getPositionPercent(bankEnd!) - getPositionPercent(bankStart!)}%` 
                }}
              />
            </div>
          )}
        </div>

        {unmatchableCount && unmatchableCount > 0 && (
          <div className="pt-2 border-t">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                Excluded (outside period):
              </span>
              <span className="font-medium">{unmatchableCount} transactions</span>
            </div>
          </div>
        )}

        {hasGaps && (
          <div className="flex items-center gap-2 pt-2 border-t text-amber-600">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-sm">Data gaps may affect matching accuracy</span>
            {onAddFuelData && (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={onAddFuelData}
                className="ml-auto"
                data-testid="button-add-missing-data"
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Missing Data
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
