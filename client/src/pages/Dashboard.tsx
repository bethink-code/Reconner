import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, FileText, MoreVertical, Trash2, Eye, Pencil, FileBarChart, LogOut, User, Shield, Search, Copy, Loader2 } from "lucide-react";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import type { ReconciliationPeriod, AccessRequest } from "@shared/schema";
import PreAlphaModal from "@/components/PreAlphaModal";
import { OrgSwitcher } from "@/components/OrgSwitcher";
import { PropertySwitcher } from "@/components/PropertySwitcher";

interface DisplayPeriod {
  id: string;
  name: string;
  dateRange: string;
  status: "in_progress" | "complete";
  lastModified: string;
}

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { user, canWrite, isViewer, currentPropertyId, currentProperty, properties } = useAuth();
  const { toast } = useToast();
  const [deleteTarget, setDeleteTarget] = useState<DisplayPeriod | null>(null);
  const [editTarget, setEditTarget] = useState<ReconciliationPeriod | null>(null);
  const [editForm, setEditForm] = useState({ name: "", description: "", startDate: "", endDate: "" });
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createForm, setCreateForm] = useState({ name: "", description: "", startDate: "", endDate: "", propertyId: "" });
  const [templateSourceId, setTemplateSourceId] = useState<string | null>(null);
  const [showPreAlpha, setShowPreAlpha] = useState(false);

  const { data: periods = [], isLoading } = useQuery<ReconciliationPeriod[]>({
    queryKey: ["/api/periods"],
  });

  // Pending access requests count (admin only)
  const { data: pendingRequests } = useQuery<AccessRequest[]>({
    queryKey: ["/api/admin/access-requests"],
    enabled: !!user?.isAdmin,
    refetchInterval: 60000, // Poll every 60s
  });
  const pendingCount = pendingRequests?.filter(r => r.status === "pending").length || 0;

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/periods/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/periods"] });
      setDeleteTarget(null);
    },
  });

  const editMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { name: string; description?: string; startDate: string; endDate: string } }) => {
      await apiRequest("PATCH", `/api/periods/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/periods"] });
      setEditTarget(null);
      toast({ title: "Period updated" });
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof createForm & { sourceId?: string | null }) => {
      const { sourceId, ...periodData } = data;
      const response = await apiRequest("POST", "/api/periods", periodData);
      const period = await response.json() as ReconciliationPeriod;
      // Copy matching rules from source period if creating from template
      if (sourceId) {
        try {
          const rulesRes = await fetch(`/api/periods/${sourceId}/matching-rules`, { credentials: "include" });
          if (rulesRes.ok) {
            const rules = await rulesRes.json();
            await apiRequest("POST", `/api/periods/${period.id}/matching-rules`, rules);
          }
        } catch { /* non-critical — period still created */ }
      }
      return period;
    },
    onSuccess: (period) => {
      queryClient.invalidateQueries({ queryKey: ["/api/periods"] });
      setShowCreateDialog(false);
      setCreateForm({ name: "", description: "", startDate: "", endDate: "", propertyId: currentPropertyId || "" });
      setTemplateSourceId(null);
      const msg = templateSourceId
        ? `${period.name} created with matching rules from previous period.`
        : `${period.name} has been created successfully.`;
      toast({ title: "Period created", description: msg });
      setLocation(`/flow/${period.id}`);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create period", description: error.message, variant: "destructive" });
    },
  });

  const createDateError = createForm.startDate && createForm.endDate && createForm.endDate < createForm.startDate
    ? "End date must be on or after the start date" : "";

  const displayPeriods: DisplayPeriod[] = periods.map(period => ({
    id: period.id,
    name: period.name,
    dateRange: `${period.startDate} to ${period.endDate}`,
    status: period.status as "in_progress" | "complete",
    lastModified: period.updatedAt ? new Date(period.updatedAt).toLocaleDateString() :
                   new Date(period.createdAt!).toLocaleDateString(),
  }));

  const filteredPeriods = displayPeriods.filter(p => {
    if (statusFilter !== "all" && p.status !== statusFilter) return false;
    if (searchQuery && !p.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const completedCount = displayPeriods.filter(p => p.status === "complete").length;
  const inProgressCount = displayPeriods.filter(p => p.status === "in_progress").length;

  const handleNewFromPrevious = (period: DisplayPeriod) => {
    setTemplateSourceId(period.id);

    // Compute next period dates and name from the source period
    const source = periods.find(p => p.id === period.id);
    let nextName = "";
    let nextStart = "";
    let nextEnd = "";

    if (source?.startDate && source?.endDate) {
      const start = new Date(source.startDate + "T00:00:00");
      const end = new Date(source.endDate + "T00:00:00");
      const durationMs = end.getTime() - start.getTime();

      // Next period starts the day after the previous ends
      const newStart = new Date(end.getTime() + 86400000);
      const newEnd = new Date(newStart.getTime() + durationMs);

      nextStart = newStart.toISOString().split("T")[0];
      nextEnd = newEnd.toISOString().split("T")[0];

      // Generate name: use month format like "April 2026" if roughly monthly
      const monthNames = ["January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"];
      nextName = `${monthNames[newStart.getMonth()]} ${newStart.getFullYear()}`;
    }

    setCreateForm({
      name: nextName,
      description: `Based on matching rules from: ${period.name}`,
      startDate: nextStart,
      endDate: nextEnd,
    });
    setShowCreateDialog(true);
  };

  const handleEdit = (id: string) => {
    setLocation(`/flow/${id}?step=fuel`);
  };

  const handleView = (id: string) => {
    setLocation(`/flow/${id}`);
  };

  const handleViewReport = (id: string) => {
    window.open(`/api/periods/${id}/export`, '_blank');
  };

  return (
    <div className="min-h-screen bg-background">
      {isViewer && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 text-sm py-2 px-4 text-center">
          Viewer mode — read-only access. Contact your administrator for write access.
        </div>
      )}
      {/* Header */}
      <header className="border-b bg-card">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-2xl font-heading font-normal tracking-tight">lekana</h1>
                <button
                  onClick={() => setShowPreAlpha(true)}
                  className="inline-flex items-center px-2 py-0.5 bg-[#F5EDE6] text-[#1A1200] rounded-full font-heading font-semibold text-[10px] tracking-wide hover:bg-[#EDE5DE] transition-colors border-none cursor-pointer"
                >
                  Pre-alpha
                </button>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Manage and track your reconciliation periods
              </p>
            </div>
            <div className="flex items-center gap-4">
              <OrgSwitcher />
              <PropertySwitcher />
              <Button variant="outline" onClick={() => setLocation("/convert")} className="text-sm">
                <FileBarChart className="h-4 w-4 mr-2" />
                PDF Converter
              </Button>
              {canWrite && (
                <Button data-testid="button-create-period" onClick={() => { setTemplateSourceId(null); setCreateForm({ name: "", description: "", startDate: "", endDate: "", propertyId: currentPropertyId || "" }); setShowCreateDialog(true); }}>
                  <Plus className="h-4 w-4 mr-2" />
                  New Reconciliation
                </Button>
              )}

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="relative h-9 w-9 rounded-full" data-testid="button-user-menu">
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={user?.profileImageUrl || undefined} alt={user?.firstName || "User"} />
                      <AvatarFallback>
                        {user?.firstName?.[0] || user?.email?.[0]?.toUpperCase() || <User className="h-4 w-4" />}
                      </AvatarFallback>
                    </Avatar>
                    {pendingCount > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-red-500 text-[10px] font-bold text-white flex items-center justify-center ring-2 ring-background">
                        {pendingCount}
                      </span>
                    )}
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
                        <Link href="/admin" className="cursor-pointer flex items-center" data-testid="link-admin">
                          <Shield className="mr-2 h-4 w-4" />
                          <span>Admin Console</span>
                          {pendingCount > 0 && (
                            <Badge variant="destructive" className="ml-auto text-[10px] px-1.5 py-0">{pendingCount}</Badge>
                          )}
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <PeriodCard title="Total Periods" value={displayPeriods.length} icon="total" />
          <PeriodCard
            title="Completed"
            value={completedCount}
            icon="complete"
            subtitle={displayPeriods.length > 0 ? `${Math.round((completedCount / displayPeriods.length) * 100)}% of total` : undefined}
          />
          <PeriodCard title="In Progress" value={inProgressCount} icon="inProgress" />
        </div>

        {/* Periods Table */}
        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
              <h2 className="text-lg font-semibold">Reconciliation Periods</h2>
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <div className="relative flex-1 sm:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search periods..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                    data-testid="input-search-periods"
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-36" data-testid="select-status-filter">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="complete">Complete</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <p className="text-muted-foreground">Loading periods...</p>
              </div>
            ) : filteredPeriods.length === 0 && displayPeriods.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-4">
                <p className="text-muted-foreground">No reconciliation periods yet</p>
                <Button onClick={() => setShowCreateDialog(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create First Period
                </Button>
              </div>
            ) : filteredPeriods.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <p className="text-muted-foreground">No periods match your search</p>
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
                      {filteredPeriods.map((period) => (
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
                              {period.status === "complete" && (
                                <DropdownMenuItem onClick={() => handleView(period.id)} data-testid={`button-view-${period.id}`}>
                                  <Eye className="h-4 w-4 mr-2" />
                                  View Results
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem onClick={() => handleEdit(period.id)} data-testid={`button-edit-${period.id}`}>
                                <FileText className="h-4 w-4 mr-2" />
                                Edit Data
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => {
                                const p = periods.find(pp => pp.id === period.id);
                                if (p) {
                                  setEditTarget(p);
                                  setEditForm({
                                    name: p.name,
                                    description: p.description || "",
                                    startDate: p.startDate,
                                    endDate: p.endDate,
                                  });
                                }
                              }}>
                                <Pencil className="h-4 w-4 mr-2" />
                                Edit Name & Period
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              {period.status === "complete" && (
                                <DropdownMenuItem onClick={() => handleViewReport(period.id)} data-testid={`button-report-${period.id}`}>
                                  <FileBarChart className="h-4 w-4 mr-2" />
                                  Download Excel
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem onClick={() => handleNewFromPrevious(period)} data-testid={`button-template-${period.id}`}>
                                <Copy className="h-4 w-4 mr-2" />
                                New from This Period
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => setDeleteTarget(period)}
                                data-testid={`button-delete-${period.id}`}
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

      {/* Edit Period Dialog */}
      <Dialog open={!!editTarget} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Period</DialogTitle>
            <DialogDescription>Update the period details</DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => {
            e.preventDefault();
            if (editTarget && editForm.name.trim() && editForm.startDate && editForm.endDate) {
              editMutation.mutate({ id: editTarget.id, data: editForm });
            }
          }} className="space-y-4">
            <div>
              <label className="text-sm font-medium">Period Name *</label>
              <Input
                value={editForm.name}
                onChange={(e) => setEditForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g., January 2024 Reconciliation"
                autoFocus
              />
            </div>
            <div>
              <label className="text-sm font-medium">Description</label>
              <textarea
                className="w-full min-h-[60px] px-3 py-2 text-sm border rounded-md bg-background"
                value={editForm.description}
                onChange={(e) => setEditForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Optional description"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Start Date *</label>
                <Input
                  type="date"
                  value={editForm.startDate}
                  onChange={(e) => setEditForm(f => ({ ...f, startDate: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-sm font-medium">End Date *</label>
                <Input
                  type="date"
                  value={editForm.endDate}
                  onChange={(e) => setEditForm(f => ({ ...f, endDate: e.target.value }))}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditTarget(null)}>Cancel</Button>
              <Button
                type="submit"
                disabled={!editForm.name.trim() || !editForm.startDate || !editForm.endDate || editMutation.isPending}
              >
                {editMutation.isPending ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Saving...</> : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Reconciliation Period</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteTarget?.name}"? This will permanently delete all associated files, transactions, and matches. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
              Delete Period
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Create Period Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={(open) => { setShowCreateDialog(open); if (!open) setTemplateSourceId(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{templateSourceId ? "New Period from Template" : "New Reconciliation Period"}</DialogTitle>
            <DialogDescription>
              {templateSourceId
                ? "Matching rules will be copied from the previous period"
                : "Define the period details for your reconciliation"}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => {
            e.preventDefault();
            if (createDateError) return;
            if (!createForm.propertyId) {
              toast({ title: "Pick a property", description: "Choose which site this period is for", variant: "destructive" });
              return;
            }
            createMutation.mutate({ ...createForm, sourceId: templateSourceId });
          }} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="create-property">Property *</Label>
              <Select
                value={createForm.propertyId}
                onValueChange={(v) => setCreateForm(prev => ({ ...prev, propertyId: v }))}
              >
                <SelectTrigger id="create-property" data-testid="select-property">
                  <SelectValue placeholder="Select a property" />
                </SelectTrigger>
                <SelectContent>
                  {properties.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}{p.code ? ` (${p.code})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {properties.length === 0 && (
                <p className="text-xs text-amber-700">
                  No properties yet. Add one in Admin → Properties first.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-name">Period Name *</Label>
              <Input
                id="create-name"
                placeholder="e.g., January 2024 Reconciliation"
                value={createForm.name}
                onChange={(e) => setCreateForm(prev => ({ ...prev, name: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-description">Description</Label>
              <Textarea
                id="create-description"
                placeholder="Optional description"
                value={createForm.description}
                onChange={(e) => setCreateForm(prev => ({ ...prev, description: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="create-start">Start Date *</Label>
                <Input
                  id="create-start"
                  type="date"
                  value={createForm.startDate}
                  onChange={(e) => setCreateForm(prev => ({ ...prev, startDate: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-end">End Date *</Label>
                <Input
                  id="create-end"
                  type="date"
                  value={createForm.endDate}
                  onChange={(e) => setCreateForm(prev => ({ ...prev, endDate: e.target.value }))}
                  required
                />
              </div>
            </div>
            {createDateError && (
              <p className="text-sm text-destructive">{createDateError}</p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreateDialog(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending || !!createDateError}>
                {createMutation.isPending ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Creating...</> : "Create & Continue"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <PreAlphaModal open={showPreAlpha} onClose={() => setShowPreAlpha(false)} />
    </div>
  );
}
