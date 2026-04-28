import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft,
  ChevronRight,
  FileText,
  Users,
  MinusCircle,
  TrendingUp,
  BarChart3,
  AlertTriangle,
} from "lucide-react";
import { formatRand } from "@/lib/format";
import { AttendantReport, type AttendantSummaryRow } from "./AttendantReport";
import { CashierReport, type CashierSummaryRow } from "./CashierReport";
import { DetailReport } from "./DetailReport";
import { DeclinedReport, type DeclineData } from "./DeclinedReport";
import { ReprintReport, type ReprintAnalysisResult } from "./ReprintReport";
import type { PeriodSummary } from "@/lib/reconciliation-types";
import { deriveSummaryStats } from "@/lib/reconciliation-utils";

type InsightsView = 'landing' | 'detail' | 'attendants' | 'cashiers' | 'declined' | 'reprint';

interface InsightsTabProps {
  periodId: string;
  initialView?: InsightsView;
}

export function InsightsTab({ periodId, initialView }: InsightsTabProps) {
  const [view, setView] = useState<InsightsView>(initialView || 'landing');

  const { data: summary, isLoading } = useQuery<PeriodSummary>({
    queryKey: ["/api/periods", periodId, "summary"],
    enabled: !!periodId,
  });

  const { data: attendantData, isLoading: attendantLoading } = useQuery<AttendantSummaryRow[]>({
    queryKey: ["/api/periods", periodId, "attendant-summary"],
    enabled: !!periodId,
  });

  const { data: cashierData, isLoading: cashierLoading } = useQuery<CashierSummaryRow[]>({
    queryKey: ["/api/periods", periodId, "cashier-summary"],
    enabled: !!periodId,
  });

  const { data: declineData, isLoading: declineLoading } = useQuery<DeclineData>({
    queryKey: ["/api/periods", periodId, "decline-analysis"],
    enabled: !!periodId,
  });

  const { data: reprintData, isLoading: reprintLoading } = useQuery<ReprintAnalysisResult>({
    queryKey: ["/api/periods", periodId, "reprint-analysis"],
    enabled: !!periodId,
  });

  if (isLoading || !summary) {
    return (
      <div className="space-y-4 mx-auto">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-48 w-full" />)}
        </div>
      </div>
    );
  }

  const banks = summary.perBankBreakdown || [];
  const declinedTotalCount = banks.reduce((acc, b) => acc + b.declinedCount + b.cancelledCount, 0);
  const { unmatchedBank } = deriveSummaryStats(summary);

  const BackHeader = ({ title, description }: { title: string; description?: string }) => (
    <div className="mb-4">
      <Button variant="secondary" size="sm" onClick={() => setView('landing')} className="mb-3">
        <ArrowLeft className="h-4 w-4 mr-1" />
        Back to Insights
      </Button>
      <div className="px-3 py-4">
        <h2 className="text-2xl font-heading font-semibold text-[#1A1200]">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
    </div>
  );

  if (view === 'landing') {
    return (
      <div className="mx-auto space-y-6">
        <div className="px-3 py-4">
          <h2 className="text-2xl font-heading font-semibold text-[#1A1200]">Insights</h2>
          <p className="text-sm text-muted-foreground">Reports and analysis for this reconciliation period</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <ReportCard
            icon={FileText}
            title="Reconciliation overview"
            description="Fuel card sales reconciliation, surplus/shortfall analysis, and full transaction-level breakdown."
            onClick={() => setView('detail')}
          />
          <ReportCard
            icon={Users}
            title="Cashiers"
            description="Per-cashier accountability — verified sales, shortfalls, and suspected reprint slips."
            onClick={() => setView('cashiers')}
          />
          <ReportCard
            icon={Users}
            title="Attendants"
            description="Performance by attendant. Sales totals, match rates, and flagged transactions per person."
            onClick={() => setView('attendants')}
          />
          <ReportCard
            icon={AlertTriangle}
            title="Suspected reprint slips"
            description="Round-amount fuel sales with no bank settlement. Possible attendant/cashier reprint fraud."
            onClick={() => setView('reprint')}
          />
          <ReportCard
            icon={MinusCircle}
            title="Declined card transactions"
            description="Transactions declined at point of sale. Patterns by card type, pump, time of day."
            onClick={() => setView('declined')}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <ComingSoonCard icon={TrendingUp} title="Trends" description="Match rate and discrepancy patterns over time across periods." />
          <ComingSoonCard icon={BarChart3} title="Pump performance" description="Sales and discrepancies broken down by pump number." />
        </div>
      </div>
    );
  }

  if (view === 'detail') {
    return (
      <div className="mx-auto space-y-4">
        <BackHeader
          title="Reconciliation overview"
          description="Fuel card sales reconciliation, surplus/shortfall analysis, and full transaction-level breakdown."
        />
        <DetailReport summary={summary} />
      </div>
    );
  }

  if (view === 'attendants') {
    return (
      <div className="mx-auto">
        <BackHeader
          title="Attendants"
          description="Performance by attendant. Sales totals, match rates, and flagged transactions per person."
        />
        <AttendantReport
          data={attendantData}
          isLoading={attendantLoading}
          formatRandExact={formatRand}
          periodId={periodId}
          unmatchedBankCount={unmatchedBank}
          unmatchedBankAmount={summary.unmatchedBankAmount || 0}
          declineTransactions={declineData?.transactions}
          onJumpToDeclined={() => setView('declined')}
        />
      </div>
    );
  }

  if (view === 'cashiers') {
    return (
      <div className="mx-auto">
        <BackHeader
          title="Cashiers"
          description="Per-cashier accountability. Cashiers close transactions and assign payment type — they are the accountability unit for cash handling."
        />
        <CashierReport
          data={cashierData}
          isLoading={cashierLoading}
          formatRandExact={formatRand}
          onJumpToReprint={() => setView('reprint')}
        />
      </div>
    );
  }

  if (view === 'declined') {
    return (
      <div className="mx-auto space-y-4">
        <BackHeader
          title="Declined card transactions"
          description="Transactions declined at point of sale. Patterns by card type, pump, time of day."
        />
        <DeclinedReport
          declineData={declineData}
          isLoading={declineLoading}
          hasDeclined={declinedTotalCount > 0}
        />
      </div>
    );
  }

  if (view === 'reprint') {
    return (
      <div className="mx-auto space-y-4">
        <BackHeader
          title="Suspected reprint slips"
          description="Round-amount fuel sales with no bank settlement — possible reprint/phantom-slip fraud. Surfaced by the round-amount FIFO matcher."
        />
        <ReprintReport data={reprintData} isLoading={reprintLoading} />
      </div>
    );
  }

  return null;
}

function ReportCard({ icon: Icon, title, description, onClick }: {
  icon: typeof FileText;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <Card className="cursor-pointer hover:border-foreground/20 transition-colors" onClick={onClick}>
      <CardContent className="p-5 space-y-3">
        <div className="w-10 h-10 rounded-lg bg-section flex items-center justify-center">
          <Icon className="h-5 w-5 text-muted-foreground" />
        </div>
        <div>
          <h3 className="font-semibold">{title}</h3>
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        </div>
        <div className="flex items-center gap-1 text-sm font-medium text-[#B45309]">
          View report <ChevronRight className="h-4 w-4" />
        </div>
      </CardContent>
    </Card>
  );
}

function ComingSoonCard({ icon: Icon, title, description }: {
  icon: typeof FileText;
  title: string;
  description: string;
}) {
  return (
    <Card className="opacity-60">
      <CardContent className="p-5 space-y-3">
        <div className="w-10 h-10 rounded-lg bg-section flex items-center justify-center">
          <Icon className="h-5 w-5 text-muted-foreground" />
        </div>
        <div>
          <h3 className="font-semibold">{title}</h3>
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        </div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Coming Soon</p>
      </CardContent>
    </Card>
  );
}
