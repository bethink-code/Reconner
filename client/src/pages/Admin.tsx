import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Shield, ShieldOff, Users, Loader2, ScrollText, ChevronLeft, ChevronRight, RefreshCw, UserPlus, Trash2, Mail, Inbox, Check, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { User, AuditLog, InvitedUser, AccessRequest } from "@shared/schema";
import { useAuth } from "@/hooks/useAuth";

const ACTION_LABELS: Record<string, string> = {
  "access.denied": "Access Denied",
  "period.delete": "Period Deleted",
  "file.upload": "File Uploaded",
  "file.delete": "File Deleted",
  "reconciliation.run": "Reconciliation Run",
  "match.manual": "Manual Match",
  "match.delete": "Match Deleted",
  "match.bulk_confirm": "Bulk Confirm Matches",
  "resolution.linked": "Linked Resolution",
  "resolution.reviewed": "Reviewed Resolution",
  "resolution.flagged": "Flagged Transaction",
  "resolution.dismissed": "Dismissed Transaction",
  "resolution.written_off": "Written Off",
  "resolution.bulk_dismiss": "Bulk Dismiss",
  "resolution.bulk_flag": "Bulk Flag",
  "data.export": "Data Export",
  "data.export_flagged": "Flagged Export",
  "admin.grant": "Admin Granted",
  "admin.revoke": "Admin Revoked",
};

const OUTCOME_STYLES: Record<string, string> = {
  success: "bg-emerald-50 text-emerald-700 border-emerald-200",
  denied: "bg-red-50 text-red-700 border-red-200",
  error: "bg-amber-50 text-amber-700 border-amber-200",
};

function formatDate(dateStr: string | Date | null) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" })
    + " " + d.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" });
}

export default function Admin() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user: currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState<"users" | "audit" | "invites" | "requests">("users");
  const [auditPage, setAuditPage] = useState(0);
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [outcomeFilter, setOutcomeFilter] = useState<string>("all");
  const [inviteEmail, setInviteEmail] = useState("");
  const AUDIT_LIMIT = 50;

  const { data: users, isLoading, error } = useQuery<User[]>({
    queryKey: ["/api/admin/users"],
    retry: false,
  });

  const { data: invites, isLoading: invitesLoading } = useQuery<InvitedUser[]>({
    queryKey: ["/api/admin/invites"],
    enabled: activeTab === "invites",
    retry: false,
  });

  const inviteMutation = useMutation({
    mutationFn: async (email: string) => {
      return await apiRequest("POST", "/api/admin/invites", { email });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/invites"] });
      setInviteEmail("");
      toast({ title: "Invite sent", description: "User has been invited to Lekana." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to invite user", variant: "destructive" });
    },
  });

  const revokeInviteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/admin/invites/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/invites"] });
      toast({ title: "Invite revoked", description: "User can no longer log in." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to revoke invite", variant: "destructive" });
    },
  });

  const { data: accessRequests, isLoading: requestsLoading } = useQuery<AccessRequest[]>({
    queryKey: ["/api/admin/access-requests"],
    enabled: activeTab === "requests",
    retry: false,
  });

  const handleRequestMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "approved" | "declined" }) => {
      return await apiRequest("PATCH", `/api/admin/access-requests/${id}`, { status });
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/access-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/invites"] });
      toast({
        title: variables.status === "approved" ? "Request approved" : "Request declined",
        description: variables.status === "approved" ? "User has been invited and can now log in." : "Request has been declined.",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to update request", variant: "destructive" });
    },
  });

  const pendingRequests = accessRequests?.filter(r => r.status === "pending") || [];

  const { data: auditData, isLoading: auditLoading } = useQuery<{
    logs: AuditLog[];
    total: number;
    limit: number;
    offset: number;
  }>({
    queryKey: ["/api/admin/audit-logs", auditPage, actionFilter, outcomeFilter],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: String(AUDIT_LIMIT),
        offset: String(auditPage * AUDIT_LIMIT),
      });
      if (actionFilter !== "all") params.set("action", actionFilter);
      if (outcomeFilter !== "all") params.set("outcome", outcomeFilter);
      const res = await fetch(`/api/admin/audit-logs?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch audit logs");
      return res.json();
    },
    enabled: activeTab === "audit",
    retry: false,
  });

  const toggleAdminMutation = useMutation({
    mutationFn: async ({ userId, isAdmin }: { userId: string; isAdmin: boolean }) => {
      return await apiRequest("PATCH", `/api/admin/users/${userId}/admin`, { isAdmin });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({
        title: "User updated",
        description: "Admin status has been changed successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update user",
        variant: "destructive",
      });
    },
  });

  const getInitials = (user: User) => {
    const first = user.firstName?.[0] || "";
    const last = user.lastName?.[0] || "";
    return (first + last).toUpperCase() || user.email?.[0]?.toUpperCase() || "?";
  };

  const getDisplayName = (user: User) => {
    if (user.firstName || user.lastName) {
      return `${user.firstName || ""} ${user.lastName || ""}`.trim();
    }
    return user.email || "Unknown User";
  };

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <Shield className="w-12 h-12 mx-auto text-destructive mb-4" />
            <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
            <p className="text-muted-foreground mb-4">
              You don't have permission to access this page.
            </p>
            <Button onClick={() => setLocation("/")} data-testid="button-back-home">
              Back to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const totalAuditPages = auditData ? Math.ceil(auditData.total / AUDIT_LIMIT) : 0;

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation("/")}
            data-testid="button-back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-admin-title">Admin Console</h1>
            <p className="text-muted-foreground">User management and audit trail</p>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex gap-2 border-b pb-2">
          <Button
            variant={activeTab === "users" ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveTab("users")}
          >
            <Users className="h-4 w-4 mr-2" />
            Users
          </Button>
          <Button
            variant={activeTab === "audit" ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveTab("audit")}
          >
            <ScrollText className="h-4 w-4 mr-2" />
            Audit Log
          </Button>
          <Button
            variant={activeTab === "invites" ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveTab("invites")}
          >
            <UserPlus className="h-4 w-4 mr-2" />
            Invites
          </Button>
          <Button
            variant={activeTab === "requests" ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveTab("requests")}
          >
            <Inbox className="h-4 w-4 mr-2" />
            Requests
            {pendingRequests.length > 0 && (
              <Badge variant="destructive" className="ml-1.5 text-[10px] px-1.5 py-0">{pendingRequests.length}</Badge>
            )}
          </Button>
        </div>

        {/* Users tab */}
        {activeTab === "users" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                All Users
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : users && users.length > 0 ? (
                <div className="space-y-4">
                  {users.map((user) => (
                    <div
                      key={user.id}
                      className="flex items-center justify-between p-4 rounded-lg border bg-card"
                      data-testid={`row-user-${user.id}`}
                    >
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={user.profileImageUrl || undefined} alt={getDisplayName(user)} />
                          <AvatarFallback>{getInitials(user)}</AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium" data-testid={`text-user-name-${user.id}`}>
                              {getDisplayName(user)}
                            </span>
                            {user.isAdmin && (
                              <Badge variant="default" className="text-xs" data-testid={`badge-admin-${user.id}`}>
                                Admin
                              </Badge>
                            )}
                            {user.id === currentUser?.id && (
                              <Badge variant="secondary" className="text-xs">
                                You
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground" data-testid={`text-user-email-${user.id}`}>
                            {user.email}
                          </p>
                        </div>
                      </div>
                      <div>
                        {user.id === currentUser?.id ? (
                          <Button variant="ghost" size="sm" disabled>
                            <Shield className="h-4 w-4 mr-2" />
                            Admin
                          </Button>
                        ) : user.isAdmin ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => toggleAdminMutation.mutate({ userId: user.id, isAdmin: false })}
                            disabled={toggleAdminMutation.isPending}
                            data-testid={`button-remove-admin-${user.id}`}
                          >
                            {toggleAdminMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <>
                                <ShieldOff className="h-4 w-4 mr-2" />
                                Remove Admin
                              </>
                            )}
                          </Button>
                        ) : (
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => toggleAdminMutation.mutate({ userId: user.id, isAdmin: true })}
                            disabled={toggleAdminMutation.isPending}
                            data-testid={`button-make-admin-${user.id}`}
                          >
                            {toggleAdminMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <>
                                <Shield className="h-4 w-4 mr-2" />
                                Make Admin
                              </>
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No users found
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Audit Log tab */}
        {activeTab === "audit" && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-4">
                <CardTitle className="flex items-center gap-2">
                  <ScrollText className="h-5 w-5" />
                  Audit Log
                  {auditData && (
                    <span className="text-sm font-normal text-muted-foreground ml-2">
                      ({auditData.total} events)
                    </span>
                  )}
                </CardTitle>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8"
                    onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/admin/audit-logs"] })}
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </Button>
                  <Select value={actionFilter} onValueChange={(v) => { setActionFilter(v); setAuditPage(0); }}>
                    <SelectTrigger className="w-[160px] h-8 text-xs">
                      <SelectValue placeholder="All actions" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All actions</SelectItem>
                      <SelectItem value="access.denied">Access Denied</SelectItem>
                      <SelectItem value="period.delete">Period Deleted</SelectItem>
                      <SelectItem value="file.upload">File Upload</SelectItem>
                      <SelectItem value="file.delete">File Deleted</SelectItem>
                      <SelectItem value="reconciliation.run">Reconciliation</SelectItem>
                      <SelectItem value="match.manual">Manual Match</SelectItem>
                      <SelectItem value="match.bulk_confirm">Bulk Confirm</SelectItem>
                      <SelectItem value="match.delete">Match Deleted</SelectItem>
                      <SelectItem value="resolution.bulk_dismiss">Bulk Dismiss</SelectItem>
                      <SelectItem value="resolution.bulk_flag">Bulk Flag</SelectItem>
                      <SelectItem value="data.export">Data Export</SelectItem>
                      <SelectItem value="data.export_flagged">Flagged Export</SelectItem>
                      <SelectItem value="admin.grant">Admin Granted</SelectItem>
                      <SelectItem value="admin.revoke">Admin Revoked</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={outcomeFilter} onValueChange={(v) => { setOutcomeFilter(v); setAuditPage(0); }}>
                    <SelectTrigger className="w-[120px] h-8 text-xs">
                      <SelectValue placeholder="All outcomes" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All outcomes</SelectItem>
                      <SelectItem value="success">Success</SelectItem>
                      <SelectItem value="denied">Denied</SelectItem>
                      <SelectItem value="error">Error</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {auditLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : auditData && auditData.logs.length > 0 ? (
                <div className="space-y-2">
                  {auditData.logs.map((log) => (
                    <div
                      key={log.id}
                      className="flex items-start justify-between gap-4 p-3 rounded-lg border bg-card text-sm"
                    >
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium border ${OUTCOME_STYLES[log.outcome] || "bg-gray-50 text-gray-700 border-gray-200"}`}>
                            {log.outcome}
                          </span>
                          <span className="font-medium">
                            {ACTION_LABELS[log.action] || log.action}
                          </span>
                          {log.resourceType && (
                            <span className="text-muted-foreground text-xs">
                              {log.resourceType}
                              {log.resourceId && `: ${log.resourceId.slice(0, 8)}...`}
                            </span>
                          )}
                        </div>
                        {log.detail && (
                          <p className="text-xs text-muted-foreground truncate">{log.detail}</p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {log.userEmail || "System"} {log.ipAddress && `(${log.ipAddress})`}
                        </p>
                      </div>
                      <div className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatDate(log.createdAt)}
                      </div>
                    </div>
                  ))}

                  {/* Pagination */}
                  {totalAuditPages > 1 && (
                    <div className="flex items-center justify-between pt-4">
                      <p className="text-xs text-muted-foreground">
                        Page {auditPage + 1} of {totalAuditPages}
                      </p>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setAuditPage((p) => Math.max(0, p - 1))}
                          disabled={auditPage === 0}
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setAuditPage((p) => p + 1)}
                          disabled={auditPage >= totalAuditPages - 1}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No audit events recorded yet
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Invites tab */}
        {activeTab === "invites" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserPlus className="h-5 w-5" />
                Invited Users
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Invite form */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (inviteEmail.trim()) inviteMutation.mutate(inviteEmail.trim());
                }}
                className="flex gap-2"
              >
                <div className="relative flex-1">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="email"
                    placeholder="name@gmail.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={inviteMutation.isPending || !inviteEmail.trim()}
                >
                  {inviteMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <UserPlus className="h-4 w-4 mr-2" />
                      Invite
                    </>
                  )}
                </Button>
              </form>

              {/* Invite list */}
              {invitesLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : invites && invites.length > 0 ? (
                <div className="space-y-2">
                  {invites.map((invite) => {
                    // Check if this invited email has a matching user account
                    const matchedUser = users?.find(u => u.email?.toLowerCase() === invite.email.toLowerCase());
                    return (
                      <div
                        key={invite.id}
                        className="flex items-center justify-between p-3 rounded-lg border bg-card"
                      >
                        <div className="flex items-center gap-3">
                          {matchedUser ? (
                            <Avatar className="h-8 w-8">
                              <AvatarImage src={matchedUser.profileImageUrl || undefined} />
                              <AvatarFallback className="text-xs">
                                {(matchedUser.firstName?.[0] || "") + (matchedUser.lastName?.[0] || "") || invite.email[0].toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                          ) : (
                            <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                              <Mail className="h-4 w-4 text-muted-foreground" />
                            </div>
                          )}
                          <div>
                            <p className="text-sm font-medium">{invite.email}</p>
                            <p className="text-xs text-muted-foreground">
                              {matchedUser ? (
                                <span className="text-emerald-600">Active user</span>
                              ) : (
                                "Invited — not yet logged in"
                              )}
                              {" · "}{formatDate(invite.createdAt)}
                            </p>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => revokeInviteMutation.mutate(invite.id)}
                          disabled={revokeInviteMutation.isPending}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No users invited yet. Add a Google email above to get started.
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Requests tab */}
        {activeTab === "requests" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Inbox className="h-5 w-5" />
                Access Requests
                {pendingRequests.length > 0 && (
                  <Badge variant="destructive" className="text-xs">{pendingRequests.length} pending</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {requestsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : accessRequests && accessRequests.length > 0 ? (
                <div className="space-y-3">
                  {accessRequests.map((req) => (
                    <div
                      key={req.id}
                      className={`flex items-start justify-between gap-4 p-4 rounded-lg border bg-card ${req.status === "pending" ? "border-amber-200 bg-amber-50/30" : ""}`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{req.name}</span>
                          {req.status === "pending" && (
                            <Badge variant="outline" className="text-xs text-amber-700 border-amber-300 bg-amber-50">Pending</Badge>
                          )}
                          {req.status === "approved" && (
                            <Badge variant="outline" className="text-xs text-emerald-700 border-emerald-300 bg-emerald-50">Approved</Badge>
                          )}
                          {req.status === "declined" && (
                            <Badge variant="outline" className="text-xs text-red-700 border-red-300 bg-red-50">Declined</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{req.email}</p>
                        <p className="text-xs text-muted-foreground">{req.cell} · {formatDate(req.createdAt)}</p>
                      </div>
                      {req.status === "pending" && (
                        <div className="flex gap-2">
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => handleRequestMutation.mutate({ id: req.id, status: "approved" })}
                            disabled={handleRequestMutation.isPending}
                          >
                            <Check className="h-4 w-4 mr-1" />
                            Approve
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRequestMutation.mutate({ id: req.id, status: "declined" })}
                            disabled={handleRequestMutation.isPending}
                          >
                            <X className="h-4 w-4 mr-1" />
                            Decline
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No access requests yet
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
