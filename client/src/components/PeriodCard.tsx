import { Card, CardContent } from "@/components/ui/card";
import { FileText, CheckCircle2, AlertCircle, Clock } from "lucide-react";

interface PeriodCardProps {
  title: string;
  value: number;
  icon: "total" | "complete" | "inProgress" | "draft";
  subtitle?: string;
}

export default function PeriodCard({ title, value, icon, subtitle }: PeriodCardProps) {
  const icons = {
    total: FileText,
    complete: CheckCircle2,
    inProgress: Clock,
    draft: AlertCircle,
  };

  const iconColors = {
    total: "text-primary",
    complete: "text-chart-2",
    inProgress: "text-chart-4",
    draft: "text-muted-foreground",
  };

  const Icon = icons[icon];

  return (
    <Card data-testid={`card-period-${icon}`}>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-3xl font-bold mt-2">{value}</p>
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
            )}
          </div>
          <div className={`${iconColors[icon]}`}>
            <Icon className="h-8 w-8" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
