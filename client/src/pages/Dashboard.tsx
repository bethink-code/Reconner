import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, FileText, MoreVertical, Trash2, Eye } from "lucide-react";
import PeriodCard from "@/components/PeriodCard";
import StatusBadge from "@/components/StatusBadge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Link } from "wouter";

interface ReconciliationPeriod {
  id: string;
  name: string;
  dateRange: string;
  status: "draft" | "in_progress" | "complete";
  progress: number;
  lastModified: string;
  totalTransactions: number;
  matchedCount: number;
}

export default function Dashboard() {
  // todo: remove mock functionality
  const [periods, setPeriods] = useState<ReconciliationPeriod[]>([
    {
      id: "1",
      name: "January 2024 Reconciliation",
      dateRange: "Jan 1 - Jan 31, 2024",
      status: "complete",
      progress: 100,
      lastModified: "2024-01-31",
      totalTransactions: 245,
      matchedCount: 240,
    },
    {
      id: "2",
      name: "February 2024 Reconciliation",
      dateRange: "Feb 1 - Feb 29, 2024",
      status: "in_progress",
      progress: 68,
      lastModified: "2024-02-25",
      totalTransactions: 198,
      matchedCount: 135,
    },
    {
      id: "3",
      name: "March 2024 Reconciliation",
      dateRange: "Mar 1 - Mar 31, 2024",
      status: "draft",
      progress: 0,
      lastModified: "2024-03-01",
      totalTransactions: 0,
      matchedCount: 0,
    },
  ]);

  const completedCount = periods.filter(p => p.status === "complete").length;
  const inProgressCount = periods.filter(p => p.status === "in_progress").length;
  const draftCount = periods.filter(p => p.status === "draft").length;

  const handleDelete = (id: string) => {
    console.log('Delete period:', id);
    setPeriods(periods.filter(p => p.id !== id));
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold">Fuel Station Reconciliation</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Manage and track your reconciliation periods
              </p>
            </div>
            <Link href="/create">
              <Button data-testid="button-create-period">
                <Plus className="h-4 w-4 mr-2" />
                New Reconciliation
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <PeriodCard title="Total Periods" value={periods.length} icon="total" />
          <PeriodCard 
            title="Completed" 
            value={completedCount} 
            icon="complete"
            subtitle={`${Math.round((completedCount / periods.length) * 100)}% of total`}
          />
          <PeriodCard title="In Progress" value={inProgressCount} icon="inProgress" />
          <PeriodCard title="Draft" value={draftCount} icon="draft" />
        </div>

        {/* Periods Table */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold">Reconciliation Periods</h2>
            </div>

            <div className="border rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-muted/50">
                    <tr className="border-b">
                      <th className="text-left p-4 text-sm font-semibold">Period Name</th>
                      <th className="text-left p-4 text-sm font-semibold">Date Range</th>
                      <th className="text-left p-4 text-sm font-semibold">Status</th>
                      <th className="text-left p-4 text-sm font-semibold">Progress</th>
                      <th className="text-left p-4 text-sm font-semibold">Transactions</th>
                      <th className="text-left p-4 text-sm font-semibold">Last Modified</th>
                      <th className="text-right p-4 text-sm font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {periods.map((period) => (
                      <tr 
                        key={period.id} 
                        className="border-b hover-elevate"
                        data-testid={`row-period-${period.id}`}
                      >
                        <td className="p-4">
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">{period.name}</span>
                          </div>
                        </td>
                        <td className="p-4 text-sm text-muted-foreground">
                          {period.dateRange}
                        </td>
                        <td className="p-4">
                          <StatusBadge status={period.status} />
                        </td>
                        <td className="p-4">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 bg-muted rounded-full h-2 max-w-24">
                              <div
                                className="bg-primary rounded-full h-2 transition-all"
                                style={{ width: `${period.progress}%` }}
                              />
                            </div>
                            <span className="text-sm font-medium">{period.progress}%</span>
                          </div>
                        </td>
                        <td className="p-4 text-sm">
                          {period.totalTransactions > 0 ? (
                            <span>
                              {period.matchedCount} / {period.totalTransactions}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                        <td className="p-4 text-sm text-muted-foreground">
                          {period.lastModified}
                        </td>
                        <td className="p-4 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button 
                                variant="ghost" 
                                size="icon"
                                data-testid={`button-actions-${period.id}`}
                              >
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem>
                                <Eye className="h-4 w-4 mr-2" />
                                View Details
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                className="text-destructive"
                                onClick={() => handleDelete(period.id)}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
