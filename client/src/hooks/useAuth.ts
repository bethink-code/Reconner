import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import type { User, Organization, OrgRole, Property } from "@shared/schema";

export interface AuthUser extends User {
  organizations: (Organization & { role: OrgRole })[];
  currentOrg: Organization | null;
  currentOrgId: string | null;
  currentOrgRole: OrgRole | null;
  properties: Property[];
  currentProperty: Property | null;
  currentPropertyId: string | null;
}

export function useAuth() {
  const { data: user, isLoading } = useQuery<AuthUser | null>({
    queryKey: ["/api/auth/user"],
    queryFn: getQueryFn<AuthUser | null>({ on401: "returnNull" }),
    retry: false,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const role = user?.currentOrgRole ?? null;

  return {
    user: user ?? null,
    isLoading,
    isAuthenticated: !!user,
    currentOrg: user?.currentOrg ?? null,
    currentOrgId: user?.currentOrgId ?? null,
    currentOrgRole: role,
    organizations: user?.organizations ?? [],
    properties: user?.properties ?? [],
    currentProperty: user?.currentProperty ?? null,
    currentPropertyId: user?.currentPropertyId ?? null,
    isPlatformOwner: !!user?.isPlatformOwner,
    canWrite: role === "owner" || role === "admin",
    isViewer: role === "viewer",
  };
}
