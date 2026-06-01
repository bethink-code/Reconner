import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface PeriodCardProps {
  title: string;
  value: number;
  icon: "total" | "complete" | "inProgress" | "draft";
  subtitle?: string;
  /** Show a skeleton in place of the value while the source query is loading (no "0" flash). */
  loading?: boolean;
}

export default function PeriodCard({ title, value, subtitle, loading }: PeriodCardProps) {
  return (
    <Card data-testid={`card-period-summary`}>
      <CardContent className="p-6">
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        {loading ? (
          <Skeleton className="mt-2 h-9 w-16" />
        ) : (
          <p className="text-3xl font-bold mt-2">{value}</p>
        )}
        {subtitle && !loading && (
          <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
        )}
      </CardContent>
    </Card>
  );
}
