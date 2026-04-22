import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { ReviewTab } from "@/components/flow/ReviewTab";
import { InvestigateTab } from "@/components/flow/InvestigateTab";

/**
 * Standalone page at /investigate — thin wrapper around ReviewTab / InvestigateTab.
 * Preserves deep-link compatibility: /investigate?periodId=X&side=bank|fuel&filter=flagged
 * Primary UX is now via the 5-tab ResultsDashboard; this page is for direct links.
 */
export default function InvestigateTransactions() {
  const [, setLocation] = useLocation();
  const [periodId, setPeriodId] = useState<string>("");
  const [side, setSide] = useState<'bank' | 'fuel'>('fuel');
  const [filter, setFilter] = useState<'all' | 'flagged'>('all');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("periodId");
    const sideParam = params.get("side");
    const filterParam = params.get("filter");
    if (id) {
      setPeriodId(id);
    } else {
      setLocation("/");
    }
    if (sideParam === 'bank') setSide('bank');
    if (filterParam === 'flagged') setFilter('flagged');
  }, [setLocation]);

  if (!periodId) return null;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link href={`/flow/${periodId}?mode=view`}>
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div className="flex-1">
              <h1 className="text-xl font-semibold">
                {filter === 'flagged' ? 'Investigate' : 'Review Transactions'}
              </h1>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
        {filter === 'flagged' ? (
          <InvestigateTab periodId={periodId} />
        ) : (
          <ReviewTab periodId={periodId} initialSide={side} />
        )}
      </main>
    </div>
  );
}
