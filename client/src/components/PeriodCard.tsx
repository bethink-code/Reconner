import { Card, CardContent } from "@/components/ui/card";

interface PeriodCardProps {
  title: string;
  value: number;
  icon: "total" | "complete" | "inProgress" | "draft";
  subtitle?: string;
}

export default function PeriodCard({ title, value, subtitle }: PeriodCardProps) {
  return (
    <Card data-testid={`card-period-summary`}>
      <CardContent className="p-6">
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        <p className="text-3xl font-bold mt-2">{value}</p>
        {subtitle && (
          <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
        )}
      </CardContent>
    </Card>
  );
}
