import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Pencil, Trash2, Send } from "lucide-react";
import type { Lead, LeadNote } from "@shared/schema";

const STATUSES = ["new", "contacted", "qualified", "applied", "converted", "parked"] as const;
type LeadStatus = typeof STATUSES[number];

const STATUS_COLOURS: Record<LeadStatus, string> = {
  new: "bg-blue-100 text-blue-800",
  contacted: "bg-yellow-100 text-yellow-800",
  qualified: "bg-purple-100 text-purple-800",
  applied: "bg-orange-100 text-orange-800",
  converted: "bg-green-100 text-green-800",
  parked: "bg-gray-100 text-gray-600",
};

const NEXT_ACTIONS = [
  { value: "first_contact", label: "First contact" },
  { value: "follow_up", label: "Follow up" },
  { value: "send_pricing", label: "Send pricing" },
  { value: "set_up_pilot", label: "Set up pilot" },
  { value: "onboard", label: "Onboard" },
  { value: "check_in", label: "Check in" },
  { value: "convert", label: "Convert to customer" },
];

const NEXT_ACTION_LABELS: Record<string, string> = Object.fromEntries(
  NEXT_ACTIONS.map((a) => [a.value, a.label])
);

const SOURCE_LABELS: Record<string, string> = {
  website_contact: "Website",
  referral: "Referral",
  direct: "Direct",
  pilot_page: "Pilot page",
  other: "Other",
};

const BLANK_FORM = {
  name: "",
  businessName: "",
  email: "",
  phone: "",
  location: "",
  businessType: "" as string,
  interestedInPilot: false,
  nextAction: "" as string,
  nextActionDue: "" as string,
  source: "direct" as string,
  status: "new" as string,
  notes: "",
};

export default function LeadsTab() {
  const { toast } = useToast();
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ ...BLANK_FORM });
  const [deleteConfirm, setDeleteConfirm] = useState<Lead | null>(null);
  const [newNote, setNewNote] = useState("");

  const { data: leadsData = [], isLoading } = useQuery<Lead[]>({
    queryKey: ["/api/leads"],
  });

  const { data: notesData = [] } = useQuery<LeadNote[]>({
    queryKey: [`/api/leads/${editingLead?.id}/notes`],
    enabled: !!editingLead,
  });

  const invalidateLeads = () => queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
  const invalidateNotes = () =>
    queryClient.invalidateQueries({ queryKey: [`/api/leads/${editingLead?.id}/notes`] });

  const createMutation = useMutation({
    mutationFn: (data: typeof BLANK_FORM) => apiRequest("POST", "/api/leads", data),
    onSuccess: () => { invalidateLeads(); setShowAdd(false); setForm({ ...BLANK_FORM }); },
    onError: () => toast({ title: "Failed to add lead", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: typeof BLANK_FORM }) =>
      apiRequest("PATCH", `/api/leads/${id}`, data),
    onSuccess: () => { invalidateLeads(); setEditingLead(null); },
    onError: () => toast({ title: "Failed to update lead", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/leads/${id}`),
    onSuccess: () => { invalidateLeads(); setDeleteConfirm(null); },
    onError: () => toast({ title: "Failed to delete lead", variant: "destructive" }),
  });

  const addNoteMutation = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) =>
      apiRequest("POST", `/api/leads/${id}/notes`, { note }),
    onSuccess: () => { invalidateNotes(); setNewNote(""); },
    onError: () => toast({ title: "Failed to add note", variant: "destructive" }),
  });

  function openEdit(lead: Lead) {
    setEditingLead(lead);
    setNewNote("");
    setForm({
      name: lead.name,
      businessName: lead.businessName ?? "",
      email: lead.email ?? "",
      phone: lead.phone ?? "",
      location: lead.location ?? "",
      businessType: lead.businessType ?? "",
      interestedInPilot: lead.interestedInPilot ?? false,
      nextAction: lead.nextAction ?? "",
      nextActionDue: lead.nextActionDue ? new Date(lead.nextActionDue).toISOString().slice(0, 10) : "",
      source: lead.source,
      status: lead.status,
      notes: lead.notes ?? "",
    });
  }

  const formField = (key: keyof typeof BLANK_FORM, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const formatDate = (d: string | Date | null | undefined) => {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
  };

  const formatDateTime = (d: string | Date | null | undefined) => {
    if (!d) return "";
    return new Date(d).toLocaleString("en-ZA", {
      day: "numeric", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  };

  const isOverdue = (due: string | Date | null | undefined) => {
    if (!due) return false;
    return new Date(due) < new Date();
  };

  const LeadFormFields = (
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-1">
        <Label>Name *</Label>
        <Input value={form.name} onChange={(e) => formField("name", e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label>Business name</Label>
        <Input value={form.businessName} onChange={(e) => formField("businessName", e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label>Cell *</Label>
        <Input value={form.phone} onChange={(e) => formField("phone", e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label>Email</Label>
        <Input type="email" value={form.email} onChange={(e) => formField("email", e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label>Town / location</Label>
        <Input value={form.location} onChange={(e) => formField("location", e.target.value)} placeholder="e.g. Pretoria" />
      </div>
      <div className="space-y-1">
        <Label>Business type</Label>
        <Select value={form.businessType || "_none"} onValueChange={(v) => formField("businessType", v === "_none" ? "" : v)}>
          <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="_none">Unknown</SelectItem>
            <SelectItem value="fuel">Fuel</SelectItem>
            <SelectItem value="retail">Retail</SelectItem>
            <SelectItem value="other">Other</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="col-span-2 flex items-center gap-2 pt-1">
        <Checkbox
          id="pilot-flag"
          checked={form.interestedInPilot}
          onCheckedChange={(v) => setForm((prev) => ({ ...prev, interestedInPilot: !!v }))}
        />
        <Label htmlFor="pilot-flag" className="cursor-pointer">Interested in pilot</Label>
      </div>
      <div className="space-y-1">
        <Label>Next action</Label>
        <Select value={form.nextAction || "_none"} onValueChange={(v) => formField("nextAction", v === "_none" ? "" : v)}>
          <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="_none">None</SelectItem>
            {NEXT_ACTIONS.map((a) => (
              <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label>Due by</Label>
        <Input type="date" value={form.nextActionDue} onChange={(e) => formField("nextActionDue", e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label>Source</Label>
        <Select value={form.source} onValueChange={(v) => formField("source", v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="direct">Direct</SelectItem>
            <SelectItem value="website_contact">Website</SelectItem>
            <SelectItem value="pilot_page">Pilot page</SelectItem>
            <SelectItem value="referral">Referral</SelectItem>
            <SelectItem value="other">Other</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label>Status</Label>
        <Select value={form.status} onValueChange={(v) => formField("status", v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="col-span-2 space-y-1">
        <Label>Description</Label>
        <Textarea rows={2} value={form.notes} onChange={(e) => formField("notes", e.target.value)} placeholder="Quick summary about this lead…" />
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">Leads</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Everyone who has expressed interest in Lekana.</p>
        </div>
        <Button size="sm" onClick={() => { setForm({ ...BLANK_FORM }); setShowAdd(true); }}>
          <Plus className="h-4 w-4 mr-1" />
          Add lead
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : leadsData.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">No leads yet.</div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/40 border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                <th className="text-left px-4 py-2.5">Name</th>
                <th className="text-left px-4 py-2.5 hidden sm:table-cell">Contact</th>
                <th className="text-left px-4 py-2.5 hidden md:table-cell">Type</th>
                <th className="text-left px-4 py-2.5 hidden md:table-cell">Pilot</th>
                <th className="text-left px-4 py-2.5">Status</th>
                <th className="text-left px-4 py-2.5 hidden lg:table-cell">Next step</th>
                <th className="text-left px-4 py-2.5 hidden lg:table-cell">Added</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {leadsData.map((lead, i) => (
                <tr
                  key={lead.id}
                  className={`border-b border-border last:border-0 hover:bg-muted/20 ${i % 2 === 1 ? "bg-muted/10" : ""}`}
                >
                  <td className="px-4 py-3 font-medium">
                    {lead.name}
                    {lead.businessName && <p className="text-xs text-muted-foreground font-normal">{lead.businessName}</p>}
                    {lead.location && <p className="text-xs text-muted-foreground font-normal">{lead.location}</p>}
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell text-muted-foreground">
                    <div>{lead.phone}</div>
                    {lead.email && <div className="text-xs">{lead.email}</div>}
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell text-muted-foreground capitalize">
                    {lead.businessType ?? "—"}
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    {lead.interestedInPilot
                      ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">Yes</span>
                      : <span className="text-muted-foreground text-xs">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOURS[lead.status as LeadStatus] ?? "bg-gray-100 text-gray-600"}`}>
                      {lead.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    {lead.nextAction ? (
                      <div>
                        <span className="text-sm">{NEXT_ACTION_LABELS[lead.nextAction] ?? lead.nextAction}</span>
                        {lead.nextActionDue && (
                          <p className={`text-xs ${isOverdue(lead.nextActionDue) ? "text-red-600 font-medium" : "text-muted-foreground"}`}>
                            {formatDate(lead.nextActionDue)}
                            {isOverdue(lead.nextActionDue) ? " — overdue" : ""}
                          </p>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell text-muted-foreground text-xs">
                    {formatDate(lead.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 justify-end">
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(lead)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => setDeleteConfirm(lead)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add dialog */}
      <Dialog open={showAdd} onOpenChange={(o) => { if (!o) setShowAdd(false); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Add lead</DialogTitle></DialogHeader>
          <div className="space-y-4">{LeadFormFields}</div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button
              onClick={() => createMutation.mutate(form)}
              disabled={!form.name || !form.phone || createMutation.isPending}
            >
              {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Add lead
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog — wider to accommodate notes log */}
      <Dialog open={!!editingLead} onOpenChange={(o) => { if (!o) setEditingLead(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingLead?.name}{editingLead?.businessName ? ` — ${editingLead.businessName}` : ""}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">{LeadFormFields}</div>

          {/* Notes log */}
          <div className="pt-4 border-t border-border space-y-3">
            <h4 className="text-sm font-semibold">Notes</h4>
            <div className="flex gap-2">
              <Textarea
                rows={2}
                className="flex-1 text-sm"
                placeholder="Add a note…"
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && newNote.trim() && editingLead) {
                    addNoteMutation.mutate({ id: editingLead.id, note: newNote.trim() });
                  }
                }}
              />
              <Button
                size="sm"
                className="self-end"
                disabled={!newNote.trim() || addNoteMutation.isPending}
                onClick={() => editingLead && addNoteMutation.mutate({ id: editingLead.id, note: newNote.trim() })}
              >
                {addNoteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>

            {notesData.length > 0 ? (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {notesData.map((n) => (
                  <div key={n.id} className="bg-muted/30 rounded-lg px-3 py-2">
                    <p className="text-xs text-muted-foreground mb-1">{formatDateTime(n.createdAt)}</p>
                    <p className="text-sm whitespace-pre-wrap">{n.note}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No notes yet.</p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingLead(null)}>Cancel</Button>
            <Button
              onClick={() => editingLead && updateMutation.mutate({ id: editingLead.id, data: form })}
              disabled={!form.name || !form.phone || updateMutation.isPending}
            >
              {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!deleteConfirm} onOpenChange={(o) => { if (!o) setDeleteConfirm(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Remove lead?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">This will permanently delete <strong>{deleteConfirm?.name}</strong> from the pipeline.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirm && deleteMutation.mutate(deleteConfirm.id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
