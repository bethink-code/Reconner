import { useCallback } from "react";
import { queryClient } from "@/lib/queryClient";

export function useInvalidateReconciliation(periodId: string) {
  const invalidateAll = useCallback(() => {
    queryClient.resetQueries({ queryKey: ["/api/periods", periodId, "dashboard"] });
    queryClient.resetQueries({ queryKey: ["/api/periods", periodId, "insights"] });
    queryClient.resetQueries({ queryKey: ["/api/periods", periodId, "review-model"] });
    queryClient.resetQueries({ queryKey: ["/api/periods", periodId, "summary"] });
    queryClient.resetQueries({ queryKey: ["/api/periods", periodId, "transactions"] });
    queryClient.resetQueries({ queryKey: ["/api/periods", periodId, "resolutions"] });
    queryClient.resetQueries({ queryKey: ["/api/periods", periodId, "matches"] });
    queryClient.resetQueries({ queryKey: ["/api/periods", periodId, "verification-summary"] });
    queryClient.resetQueries({ queryKey: ["/api/periods", periodId, "matching-rules"] });
  }, [periodId]);
  return invalidateAll;
}
