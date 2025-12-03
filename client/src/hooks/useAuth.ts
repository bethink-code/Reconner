import { useQuery } from "@tanstack/react-query";
import type { User } from "@shared/schema";

export function useAuth() {
  const { data: user, isLoading, error } = useQuery<User>({
    queryKey: ["/api/auth/user"],
    retry: false,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const is401Error = error?.message?.includes("401");
  
  return {
    user: is401Error ? null : user,
    isLoading: isLoading && !is401Error,
    isAuthenticated: !!user && !is401Error,
  };
}
