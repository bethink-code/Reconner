import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useRoute, useLocation, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Loader2, Check } from "lucide-react";
import { ReconciliationStepper, STEP_CANVAS_COLORS, type ReconciliationStep, type StepEligibility } from "@/components/ReconciliationStepper";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useInvalidateReconciliation } from "@/hooks/useInvalidateReconciliation";
import { formatPeriodRange } from "@/lib/format";
import type { ReconciliationPeriod, UploadedFile } from "@shared/schema";
import { Eye } from "lucide-react";

import { FuelUploadStep } from "@/components/flow/FuelUploadStep";
import { BankUploadStep } from "@/components/flow/BankUploadStep";
import { BankStatusScreen } from "@/components/flow/BankStatusScreen";
import { ConfigureMatchingStep } from "@/components/flow/ConfigureMatchingStep";
import { ResultsDashboard } from "@/components/flow/ResultsDashboard";

type BankSubStep = "status" | "upload";

export default function ReconciliationFlow() {
  const [, setLocation] = useLocation();
  const [match, params] = useRoute("/flow/:periodId");
  const { toast } = useToast();
  const { isViewer } = useAuth();
  
  const [currentStep, setCurrentStep] = useState<ReconciliationStep>("fuel");
  const [completedSteps, setCompletedSteps] = useState<ReconciliationStep[]>([]);
  const [isAutoMatching, setIsAutoMatching] = useState(false);
  const [matchResult, setMatchResult] = useState<{
    matchesCreated: number;
    bankTransactionsTotal: number;
    bankTransactionsMatchable: number;
    bankTransactionsUnmatchable: number;
    cardTransactionsProcessed: number;
    invoicesCreated: number;
    matchRate: string;
    warnings: string[];
  } | null>(null);
  const [txCounts, setTxCounts] = useState<{ bank: number; fuel: number } | null>(null);

  const [bankSubStep, setBankSubStep] = useState<BankSubStep>("status");
  const [currentBankName, setCurrentBankName] = useState<string>("");
  const [replacingFileId, setReplacingFileId] = useState<string | null>(null);
  
  const [hasInitialized, setHasInitialized] = useState(false);

  const periodId = params?.periodId || "";
  const invalidateAll = useInvalidateReconciliation(periodId);

  const { data: period, isLoading: periodLoading } = useQuery<ReconciliationPeriod>({
    queryKey: ["/api/periods", periodId],
    enabled: !!periodId,
  });

  const { data: files = [], isLoading: filesLoading } = useQuery<UploadedFile[]>({
    queryKey: ["/api/periods", periodId, "files"],
    enabled: !!periodId,
  });

  const bankFiles = files.filter((f) => f.sourceType === "bank" && f.status === "processed");
  const fuelFile = files.find((f) => f.sourceType === "fuel" && f.status === "processed");

  // Fetch verification summary for fuel breakdown on matching complete screen
  const { data: verSummary } = useQuery<{
    overview: {
      fuelSystem: { totalSales: number; cardSales: number; cardTransactions: number; cashSales: number; cashTransactions: number };
    };
    fuelBreakdown?: { debtorTransactions: number; debtorAmount: number };
  }>({
    queryKey: ["/api/periods", periodId, "verification-summary"],
    enabled: !!periodId && !!matchResult,
  });

  const autoMatchMutation = useMutation({
    mutationFn: async () => {
      setIsAutoMatching(true);
      setMatchResult(null);
      // Fetch transaction counts for progress display
      try {
        const summaryRes = await fetch(`/api/periods/${periodId}/verification-summary`, { credentials: "include" });
        if (summaryRes.ok) {
          const summary = await summaryRes.json();
          setTxCounts({
            bank: summary.overview?.bankStatements?.totalTransactions || 0,
            fuel: summary.overview?.fuelSystem?.matchableInvoices || summary.overview?.fuelSystem?.cardTransactions || 0,
          });
        }
      } catch { /* non-critical */ }
      const response = await apiRequest("POST", `/api/periods/${periodId}/auto-match`, {});
      return await response.json();
    },
    onSuccess: () => {
      invalidateAll();
      queryClient.invalidateQueries({ queryKey: ["/api/periods"] });
      setIsAutoMatching(false);
      setMatchResult(null);
      setCompletedSteps(prev => [...prev.filter(s => s !== "configure"), "configure"]);
      setCurrentStep("results");
    },
    onError: (error: Error) => {
      setIsAutoMatching(false);
      setTxCounts(null);
      toast({
        title: "Matching failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteFileMutation = useMutation({
    mutationFn: async (fileId: string) => {
      await apiRequest("DELETE", `/api/files/${fileId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/periods", periodId, "files"] });
      toast({
        title: "Bank file removed",
        description: "The bank statement has been removed.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to remove file",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (!match || !periodId) {
      setLocation("/");
      return;
    }
  }, [match, periodId, setLocation]);

  // Initialize on mount - mark as initialized once files query completes
  useEffect(() => {
    if (!filesLoading && !periodLoading && !hasInitialized) {
      setHasInitialized(true);

      // Check URL for explicit step override (e.g. ?step=fuel for "Edit Data")
      const urlParams = new URLSearchParams(window.location.search);
      const rawStep = urlParams.get("step");
      const validSteps: ReconciliationStep[] = ["fuel", "bank", "configure", "results"];
      const requestedStep = rawStep && validSteps.includes(rawStep as ReconciliationStep)
        ? (rawStep as ReconciliationStep)
        : null;

      // Completed periods go straight to results (no re-running reconciliation)
      if (period?.status === "complete" && !requestedStep) {
        setCompletedSteps(["fuel", "bank", "configure"]);
        setCurrentStep("results");
      } else if (fuelFile && bankFiles.length > 0) {
        // Both data sources uploaded
        // If going to results (default), matching must have run — mark configure complete
        // If explicitly navigating to an earlier step, don't assume matching ran
        if (requestedStep === "fuel" || requestedStep === "bank" || requestedStep === "configure") {
          setCompletedSteps(["fuel", "bank"]);
          setCurrentStep(requestedStep);
          if (requestedStep === "bank") setBankSubStep("status");
        } else {
          // Default to results — matching has run before
          setCompletedSteps(["fuel", "bank", "configure"]);
          setCurrentStep("results");
        }
      } else if (fuelFile) {
        // Fuel uploaded, need bank data
        setCompletedSteps(["fuel"]);
        // Only honour requested step if eligible
        if (requestedStep === "fuel") {
          setCurrentStep("fuel");
        } else {
          setCurrentStep("bank");
          setBankSubStep("status");
        }
      } else {
        // Fresh start — ignore any requested step since nothing is uploaded
        setCurrentStep("fuel");
      }
    }
  }, [filesLoading, periodLoading, period?.status, fuelFile, bankFiles.length]);

  // Keep completedSteps in sync with file state (does NOT change currentStep)
  // Note: "configure" is only marked complete when matching actually runs (see matchResult handler)
  useEffect(() => {
    if (files.length > 0) {
      setCompletedSteps((prev) => {
        const newCompleted: ReconciliationStep[] = [];

        if (fuelFile) {
          newCompleted.push("fuel");
        }
        if (bankFiles.length > 0) {
          newCompleted.push("bank");
        }

        // Preserve configure completion if it was already set (from matching)
        if (prev.includes("configure")) {
          newCompleted.push("configure");
        }

        return newCompleted;
      });
    }
  }, [files, fuelFile, bankFiles.length]);

  const handleStepClick = (step: ReconciliationStep) => {
    const fuelProcessed = !!fuelFile;
    const hasAnyBank = bankFiles.length > 0;

    // Clear matching result screen when navigating away
    if (step !== "configure") {
      setMatchResult(null);
      setIsAutoMatching(false);
    }

    if (step === "fuel") {
      setCurrentStep(step);
      return;
    }
    
    if (step === "bank" && fuelProcessed) {
      setCurrentStep(step);
      setBankSubStep("status");
      return;
    }
    
    if (step === "configure" && fuelProcessed && hasAnyBank) {
      setCurrentStep(step);
      return;
    }
    
    if (step === "results" && fuelProcessed && hasAnyBank && completedSteps.includes("configure")) {
      setCurrentStep(step);
      return;
    }
  };

  const handleFuelComplete = () => {
    setCompletedSteps((prev) => [...prev.filter(s => s !== "fuel"), "fuel"]);
    setCurrentStep("bank");
    setBankSubStep("status");
  };

  const handleSelectBank = (bankName: string) => {
    setCurrentBankName(bankName);
    setReplacingFileId(null);
    setBankSubStep("upload");
  };

  const handleReplaceBank = (fileId: string, bankName: string) => {
    setCurrentBankName(bankName);
    setReplacingFileId(fileId);
    setBankSubStep("upload");
  };

  const handleRemoveBank = (fileId: string) => {
    deleteFileMutation.mutate(fileId);
  };

  const handleContinueToMatching = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/periods", periodId, "files"] });
    queryClient.invalidateQueries({ queryKey: ["/api/periods", periodId] });
    setCurrentStep("configure");
  };

  const handleStartMatching = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/periods", periodId, "files"] });
    autoMatchMutation.mutate();
  };

  const handleRerunMatching = () => {
    setCurrentStep("configure");
  };

  const handleAddFuelData = () => {
    setCurrentStep("fuel");
  };

  const handleAddBankData = () => {
    setBankSubStep("upload");
    setCurrentStep("bank");
  };

  const fuelProcessed = !!fuelFile;
  const hasAnyBank = bankFiles.length > 0;
  const configureCompleted = completedSteps.includes("configure");

  const stepEligibility: StepEligibility = {
    fuel: true,
    bank: fuelProcessed,
    configure: fuelProcessed && hasAnyBank,
    results: fuelProcessed && hasAnyBank && configureCompleted,
  };

  if (!match || !periodId) {
    return null;
  }

  if (periodLoading || filesLoading || !hasInitialized) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b bg-card sticky top-0 z-10">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4">
            <div className="flex items-center gap-4">
              <Skeleton className="h-9 w-9" />
              <div className="flex-1">
                <Skeleton className="h-6 w-48 mb-2" />
                <Skeleton className="h-4 w-32" />
              </div>
            </div>
            <div className="mt-6">
              <Skeleton className="h-16 w-full" />
            </div>
          </div>
        </header>
        <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
          <Skeleton className="h-64 w-full" />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {isViewer && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 text-sm py-2 px-4 text-center" data-testid="viewer-banner">
          <Eye className="h-4 w-4 inline mr-2" />
          Viewer mode — you can browse but not change anything
        </div>
      )}
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" size="icon" data-testid="button-back-home">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-heading font-semibold">Reconciliation</h1>
                <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                  Step {(['fuel', 'bank', 'configure', 'results'] as const).indexOf(currentStep) + 1} of 4
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                {period ? (
                  <>
                    {period.name}
                    {period.startDate && period.endDate && (
                      <span className="ml-2 text-muted-foreground/70">· {formatPeriodRange(period.startDate, period.endDate)}</span>
                    )}
                  </>
                ) : "Loading..."}
              </p>
            </div>
          </div>
        </div>
      </header>

      <div
        className="transition-colors duration-300"
        style={{ backgroundColor: STEP_CANVAS_COLORS[currentStep] }}
      >
        <div className="max-w-5xl mx-auto">
          <ReconciliationStepper
            currentStep={currentStep}
            completedSteps={completedSteps}
            stepEligibility={stepEligibility}
            onStepClick={handleStepClick}
          />
        </div>
      </div>

      <main className="flex-1 px-4 sm:px-6 py-8">
        {isAutoMatching ? (
          <Card className="max-w-2xl mx-auto bg-section">
            <CardHeader className="text-center">
              <CardTitle>Matching Transactions</CardTitle>
              <CardDescription>
                Comparing your bank transactions against fuel records...
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative h-2 w-full overflow-hidden rounded-full bg-[#E5E3DC] dark:bg-[#2A2218]">
                <div className="h-full w-1/3 rounded-full bg-[#F5C400] animate-indeterminate" />
              </div>
              {txCounts && (
                <div className="grid grid-cols-2 gap-4 text-center">
                  <div className="rounded-lg bg-muted/50 p-3">
                    <p className="text-2xl font-semibold">{txCounts.bank}</p>
                    <p className="text-xs text-muted-foreground">Bank transactions</p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-3">
                    <p className="text-2xl font-semibold">{txCounts.fuel}</p>
                    <p className="text-xs text-muted-foreground">Fuel card transactions</p>
                  </div>
                </div>
              )}
              <p className="text-sm text-muted-foreground text-center">
                This may take a moment depending on the number of transactions.
              </p>
            </CardContent>
          </Card>
        ) : matchResult ? (
          <Card className="max-w-2xl mx-auto bg-section">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 flex items-center justify-center">
                <Check className="h-5 w-5 text-[#1A1200]" />
              </div>
              <CardTitle className="text-2xl">Matching Complete</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Hero: the answer to "how well did my period match?" */}
              <div className="text-center space-y-1">
                <p className="text-5xl font-heading font-bold text-[#1A1200] dark:text-[#F0EAE0]">{matchResult.matchRate}</p>
                <p className="text-lg font-medium">of your {period?.name || "period"} bank transactions verified</p>
                {matchResult.bankTransactionsMatchable - matchResult.matchesCreated > 0 ? (
                  <p className="text-base font-medium text-[#B45309]">
                    {matchResult.matchesCreated} of {matchResult.bankTransactionsMatchable} transactions automatically matched — {matchResult.bankTransactionsMatchable - matchResult.matchesCreated} need review
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {matchResult.matchesCreated} of {matchResult.bankTransactionsMatchable} transactions automatically matched to fuel records
                  </p>
                )}
              </div>

              {/* Fuel sales breakdown */}
              {verSummary && (
                <div className="rounded-xl bg-section p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 mb-3">Period Fuel Sales</p>
                  <div className="flex divide-x divide-border/50">
                    {[
                      { label: "All", count: verSummary.overview.fuelSystem.cardTransactions + verSummary.overview.fuelSystem.cashTransactions, amount: verSummary.overview.fuelSystem.totalSales },
                      { label: "Card", count: verSummary.overview.fuelSystem.cardTransactions - (verSummary.fuelBreakdown?.debtorTransactions || 0), amount: verSummary.overview.fuelSystem.cardSales - (verSummary.fuelBreakdown?.debtorAmount || 0) },
                      { label: "Cash", count: verSummary.overview.fuelSystem.cashTransactions, amount: verSummary.overview.fuelSystem.cashSales },
                      ...((verSummary.fuelBreakdown?.debtorTransactions || 0) > 0 ? [{ label: "Debtors", count: verSummary.fuelBreakdown!.debtorTransactions, amount: verSummary.fuelBreakdown!.debtorAmount }] : []),
                    ].map((seg) => (
                      <div key={seg.label} className="flex-1 py-2 px-3 text-center">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">{seg.label}</p>
                        <p className="text-base font-semibold tabular-nums">{seg.count}</p>
                        <p className="text-[10px] text-muted-foreground tabular-nums">R {seg.amount.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Key stats */}
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className={cn(
                  "rounded-lg p-3",
                  matchResult.matchesCreated > 0
                    ? "bg-[#DCFCE7] dark:bg-emerald-950/30"
                    : "bg-section"
                )}>
                  <p className={cn(
                    "text-2xl font-semibold",
                    matchResult.matchesCreated > 0
                      ? "text-[#166534] dark:text-emerald-400"
                      : "text-[#1A1200] dark:text-foreground"
                  )}>{matchResult.matchesCreated}</p>
                  <p className="text-xs text-muted-foreground">Verified</p>
                </div>
                <div className="rounded-lg bg-[#FEF9C3] dark:bg-amber-950/30 p-3">
                  <p className="text-2xl font-semibold text-[#B45309] dark:text-amber-400">{matchResult.bankTransactionsMatchable - matchResult.matchesCreated}</p>
                  <p className="text-xs text-muted-foreground">To Investigate</p>
                </div>
                <div className="rounded-lg bg-muted/50 p-3">
                  <p className="text-2xl font-semibold">{matchResult.invoicesCreated}</p>
                  <p className="text-xs text-muted-foreground">Fuel Invoices</p>
                </div>
              </div>

              {/* Secondary info: data outside range */}
              {matchResult.bankTransactionsUnmatchable > 0 && (
                <div className="rounded-lg bg-muted/20 p-3 text-center">
                  <p className="text-sm text-muted-foreground">
                    {matchResult.bankTransactionsUnmatchable} bank transaction{matchResult.bankTransactionsUnmatchable !== 1 ? 's' : ''} from your upload fell outside the period dates
                    {period ? ` (${period.startDate} to ${period.endDate})` : ''} and were excluded.
                  </p>
                </div>
              )}

              <div className="flex justify-center pt-2">
                <Button onClick={() => {
                  setMatchResult(null);
                  setTxCounts(null);
                  setCompletedSteps((prev) => [...prev.filter(s => s !== "configure"), "configure"]);
                  setCurrentStep("results");
                }}>
                  View Results Dashboard
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            {currentStep === "fuel" && (
              <FuelUploadStep
                periodId={periodId}
                existingFile={files.find((f) => f.sourceType === "fuel")}
                onComplete={handleFuelComplete}
                stepColor={STEP_CANVAS_COLORS[currentStep]}
              />
            )}

            {currentStep === "bank" && bankSubStep === "status" && (
              <BankStatusScreen
                bankFiles={bankFiles}
                onSelectBank={handleSelectBank}
                onReplaceBank={handleReplaceBank}
                onRemoveBank={handleRemoveBank}
                onContinue={handleContinueToMatching}
                onBack={() => setCurrentStep("fuel")}
                isRemoving={deleteFileMutation.isPending}
                stepColor={STEP_CANVAS_COLORS[currentStep]}
              />
            )}

            {currentStep === "bank" && bankSubStep === "upload" && (
              <BankUploadStep
                periodId={periodId}
                bankName={currentBankName}
                existingFile={replacingFileId ? files.find(f => f.id === replacingFileId) : undefined}
                onBack={() => setBankSubStep("status")}
                stepColor={STEP_CANVAS_COLORS[currentStep]}
              />
            )}

            {currentStep === "configure" && (
              <ConfigureMatchingStep
                periodId={periodId}
                onStartMatching={handleStartMatching}
                onBack={() => {
                  setCurrentStep("bank");
                  setBankSubStep("status");
                }}
                isMatching={autoMatchMutation.isPending}
                stepColor={STEP_CANVAS_COLORS[currentStep]}
              />
            )}

            {currentStep === "results" && (
              <ResultsDashboard
                periodId={periodId}
                onRerunMatching={handleRerunMatching}
                onAddFuelData={handleAddFuelData}
                onAddBankData={handleAddBankData}
                stepColor={STEP_CANVAS_COLORS[currentStep]}
              />
            )}
          </>
        )}
      </main>

      <footer className="bg-footer text-white/70">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 text-center text-sm">
          lekana · a Bethink product
        </div>
      </footer>
    </div>
  );
}
