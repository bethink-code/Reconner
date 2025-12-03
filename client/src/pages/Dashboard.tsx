import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, FileText, MoreVertical, Trash2, Eye, Pencil, FileBarChart, LogOut, User, Shield } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import PeriodCard from "@/components/PeriodCard";
import StatusBadge from "@/components/StatusBadge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import type { ReconciliationPeriod } from "@shared/schema";

interface DisplayPeriod {
  id: string;
  name: string;
  dateRange: string;
  status: "draft" | "in_progress" | "complete";
  progress: number;
  lastModified: string;
}

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { data: periods = [], isLoading } = useQuery<ReconciliationPeriod[]>({
    queryKey: ["/api/periods"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/periods/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/periods"] });
    },
  });

  const displayPeriods: DisplayPeriod[] = periods.map(period => ({
    id: period.id,
    name: period.name,
    dateRange: `${period.startDate} to ${period.endDate}`,
    status: period.status as "draft" | "in_progress" | "complete",
    progress: 0,
    lastModified: period.updatedAt ? new Date(period.updatedAt).toLocaleDateString() : 
                   new Date(period.createdAt!).toLocaleDateString(),
  }));

  const completedCount = displayPeriods.filter(p => p.status === "complete").length;
  const inProgressCount = displayPeriods.filter(p => p.status === "in_progress").length;
  const draftCount = displayPeriods.filter(p => p.status === "draft").length;

  const handleEdit = (id: string) => {
    setLocation(`/upload?periodId=${id}`);
  };

  const handleViewReport = (id: string) => {
    setLocation(`/report?periodId=${id}`);
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this period? This will also delete all associated files and transactions.")) {
      deleteMutation.mutate(id);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold">Pieter's Pomp Stasie Reconner</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Manage and track your reconciliation periods
              </p>
            </div>
            <div className="flex items-center gap-4">
              <Link href="/create">
                <Button data-testid="button-create-period">
                  <Plus className="h-4 w-4 mr-2" />
                  New Reconciliation
                </Button>
              </Link>
              
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="relative h-9 w-9 rounded-full" data-testid="button-user-menu">
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={user?.profileImageUrl || undefined} alt={user?.firstName || "User"} />
                      <AvatarFallback>
                        {user?.firstName?.[0] || user?.email?.[0]?.toUpperCase() || <User className="h-4 w-4" />}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <div className="flex items-center justify-start gap-2 p-2">
                    <div className="flex flex-col space-y-1 leading-none">
                      <div className="flex items-center gap-2">
                        {user?.firstName && (
                          <p className="font-medium">{user.firstName} {user.lastName}</p>
                        )}
                        {user?.isAdmin && (
                          <Badge variant="default" className="text-xs" data-testid="badge-admin">Admin</Badge>
                        )}
                      </div>
                      {user?.email && (
                        <p className="text-sm text-muted-foreground">{user.email}</p>
                      )}
                    </div>
                  </div>
                  <DropdownMenuSeparator />
                  {user?.isAdmin && (
                    <>
                      <DropdownMenuItem asChild>
                        <Link href="/admin" className="cursor-pointer" data-testid="link-admin">
                          <Shield className="mr-2 h-4 w-4" />
                          <span>User Management</span>
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </>
                  )}
                  <DropdownMenuItem asChild>
                    <a href="/api/logout" className="cursor-pointer" data-testid="button-logout">
                      <LogOut className="mr-2 h-4 w-4" />
                      <span>Log out</span>
                    </a>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <PeriodCard title="Total Periods" value={displayPeriods.length} icon="total" />
          <PeriodCard 
            title="Completed" 
            value={completedCount} 
            icon="complete"
            subtitle={displayPeriods.length > 0 ? `${Math.round((completedCount / displayPeriods.length) * 100)}% of total` : undefined}
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

            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <p className="text-muted-foreground">Loading periods...</p>
              </div>
            ) : displayPeriods.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-4">
                <p className="text-muted-foreground">No reconciliation periods yet</p>
                <Link href="/create">
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Create First Period
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-muted/50">
                      <tr className="border-b">
                        <th className="text-left p-4 text-sm font-semibold">Period Name</th>
                        <th className="text-left p-4 text-sm font-semibold">Date Range</th>
                        <th className="text-left p-4 text-sm font-semibold">Status</th>
                        <th className="text-left p-4 text-sm font-semibold">Last Modified</th>
                        <th className="text-right p-4 text-sm font-semibold">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayPeriods.map((period) => (
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
                              <DropdownMenuItem onClick={() => handleEdit(period.id)}>
                                <Pencil className="h-4 w-4 mr-2" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleViewReport(period.id)}>
                                <FileBarChart className="h-4 w-4 mr-2" />
                                View Report
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
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
