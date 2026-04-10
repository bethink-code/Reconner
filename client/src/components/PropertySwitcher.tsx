import { useMutation } from "@tanstack/react-query";
import { Check, ChevronDown, MapPin } from "lucide-react";
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

// Property switcher — sits next to OrgSwitcher in the header.
// Renders nothing if the org has zero or one property (nothing to switch).
export function PropertySwitcher() {
  const { properties, currentProperty } = useAuth();
  const { toast } = useToast();

  const switchMutation = useMutation({
    mutationFn: async (propertyId: string) => {
      await apiRequest("POST", "/api/me/switch-property", { propertyId });
    },
    onSuccess: () => {
      // Periods are property-scoped, so invalidate all server state
      queryClient.invalidateQueries();
      toast({ title: "Switched property" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to switch", description: err?.message, variant: "destructive" });
    },
  });

  if (!properties || properties.length === 0) return null;
  if (!currentProperty) return null;

  // Single property: static label, no menu.
  if (properties.length === 1) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 text-sm" data-testid="property-switcher-static">
        <MapPin className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium">{currentProperty.name}</span>
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-9" data-testid="button-property-switcher">
          <MapPin className="h-4 w-4 mr-2" />
          <span className="font-medium">{currentProperty.name}</span>
          <ChevronDown className="h-3.5 w-3.5 ml-2 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-xs uppercase tracking-wide text-muted-foreground">
          Switch property
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {properties.map((p) => (
          <DropdownMenuItem
            key={p.id}
            onClick={() => switchMutation.mutate(p.id)}
            disabled={switchMutation.isPending}
            className="cursor-pointer"
            data-testid={`property-option-${p.id}`}
          >
            <div className="flex items-center justify-between w-full">
              <div className="flex flex-col">
                <span className="font-medium">{p.name}</span>
                {p.code && <span className="text-xs text-muted-foreground">{p.code}</span>}
              </div>
              {p.id === currentProperty.id && <Check className="h-4 w-4 ml-2" />}
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
