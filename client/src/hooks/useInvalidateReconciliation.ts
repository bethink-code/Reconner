import { useCallback } from "react";
import { queryClient } from "@/lib/queryClient";

export function useInvalidateReconciliation(periodId: string) {
  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["/api/periods", periodId, "summary"] });
    queryClient.invalidateQueries({ queryKey: ["/api/periods", periodId, "transactions"] });
    queryClient.invalidateQueries({ queryKey: ["/api/periods", periodId, "resolutions"] });
    queryClient.invalidateQueries({ queryKey: ["/api/periods", periodId, "matches"] });
    queryClient.invalidateQueries({ queryKey: ["/api/periods", periodId, "verification-summary"] });
  }, [periodId]);
  return invalidateAll;
}
