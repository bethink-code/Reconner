import { useMutation } from "@tanstack/react-query";
import { Building2, Check, ChevronDown } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// Shows the current organization. For platform owners (Lekana staff) it's a dropdown
// switcher; for everyone else it's a static label since they only ever belong to one org.
export function OrgSwitcher() {
  const { currentOrg, currentOrgRole, organizations, isPlatformOwner } = useAuth();
  const { toast } = useToast();

  const switchMutation = useMutation({
    mutationFn: async (organizationId: string) => {
      await apiRequest("POST", "/api/me/switch-org", { organizationId });
    },
    onSuccess: () => {
      // Reset all server state — every query is org-scoped
      queryClient.invalidateQueries();
      toast({ title: "Switched organization" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to switch", description: err?.message, variant: "destructive" });
    },
  });

  if (!currentOrg) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground" data-testid="org-switcher-empty">
        <Building2 className="h-4 w-4" />
        <span>No organization</span>
      </div>
    );
  }

  // Non-platform owner: static label only.
  if (!isPlatformOwner || organizations.length <= 1) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium" data-testid="org-switcher-static">
        <Building2 className="h-4 w-4 text-muted-foreground" />
        <span>{currentOrg.name}</span>
        {currentOrgRole === "viewer" && (
          <Badge variant="outline" className="text-[10px]">Viewer</Badge>
        )}
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-9" data-testid="button-org-switcher">
          <Building2 className="h-4 w-4 mr-2" />
          <span className="font-medium">{currentOrg.name}</span>
          <ChevronDown className="h-3.5 w-3.5 ml-2 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-xs uppercase tracking-wide text-muted-foreground">
          Switch organization
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {organizations.map((org) => (
          <DropdownMenuItem
            key={org.id}
            onClick={() => switchMutation.mutate(org.id)}
            disabled={switchMutation.isPending}
            className="cursor-pointer"
            data-testid={`org-option-${org.slug}`}
          >
            <div className="flex items-center justify-between w-full">
              <div className="flex flex-col">
                <span className="font-medium">{org.name}</span>
                <span className="text-xs text-muted-foreground capitalize">{org.role}</span>
              </div>
              {org.id === currentOrg.id && <Check className="h-4 w-4 ml-2" />}
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
