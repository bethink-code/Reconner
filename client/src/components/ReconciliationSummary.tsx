import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, XCircle, AlertCircle, DollarSign } from "lucide-react";

interface ReconciliationSummaryProps {
  totalTransactions: number;
  matched: number;
  unmatched: number;
  partial: number;
  totalAmount: number;
  discrepancy: number;
}

export default function ReconciliationSummary({
  totalTransactions,
  matched,
  unmatched,
  partial,
  totalAmount,
  discrepancy,
}: ReconciliationSummaryProps) {
  const reconciliationRate = totalTransactions > 0 
    ? Math.round((matched / totalTransactions) * 100) 
    : 0;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-ZA', {
      style: 'currency',
      currency: 'ZAR',
    }).format(amount);
  };

  const stats = [
    {
      label: "Matched",
      value: matched,
      icon: CheckCircle2,
      color: "text-chart-2",
      bgColor: "bg-chart-2/10",
    },
    {
      label: "Unmatched",
      value: unmatched,
      icon: XCircle,
      color: "text-destructive",
      bgColor: "bg-destructive/10",
    },
    {
      label: "Partial Matches",
      value: partial,
      icon: AlertCircle,
      color: "text-chart-4",
      bgColor: "bg-chart-4/10",
    },
  ];

  return (
    <div className="space-y-6" data-testid="container-reconciliation-summary">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Reconciliation Progress</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Overall Completion</span>
              <span className="text-2xl font-bold">{reconciliationRate}%</span>
            </div>
            <Progress value={reconciliationRate} className="h-3" />
          </div>
          
          <div className="grid grid-cols-3 gap-4 pt-4">
            {stats.map((stat) => (
              <div 
                key={stat.label} 
                className={`${stat.bgColor} rounded-lg p-4`}
                data-testid={`stat-${stat.label.toLowerCase().replace(/\s/g, '-')}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <stat.icon className={`h-4 w-4 ${stat.color}`} />
                  <span className="text-xs font-medium text-muted-foreground">
                    {stat.label}
                  </span>
                </div>
                <p className="text-2xl font-bold">{stat.value}</p>
              </div>
            ))}
          </div>

          <div className="pt-4 border-t space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Total Transactions</span>
              <span className="text-sm font-semibold">{totalTransactions}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Total Amount</span>
              <span className="text-sm font-mono font-semibold">
                {formatCurrency(totalAmount)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Discrepancy</span>
              <span className={`text-sm font-mono font-semibold ${
                discrepancy !== 0 ? 'text-destructive' : 'text-chart-2'
              }`}>
                {formatCurrency(Math.abs(discrepancy))}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
