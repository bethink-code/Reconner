import { useState, useEffect, useRef } from "react";
import { useRoute, useLocation, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, Loader2, CheckCircle2 } from "lucide-react";
import { ReconciliationStepper, type ReconciliationStep, type StepEligibility } from "@/components/ReconciliationStepper";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { ReconciliationPeriod, UploadedFile } from "@shared/schema";

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
  
  // Get mode from URL query params
  const urlParams = new URLSearchParams(window.location.search);
  const mode = urlParams.get("mode") || "edit"; // "view" or "edit"
  
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
  
  const hasInitialized = useRef(false);

  const periodId = params?.periodId || "";

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
            fuel: summary.overview?.fuelSystem?.cardTransactions || 0,
          });
        }
      } catch { /* non-critical */ }
      const response = await apiRequest("POST", `/api/periods/${periodId}/auto-match`, {});
      return await response.json();
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/periods", periodId, "summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/periods", periodId, "transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/periods"] });
      setIsAutoMatching(false);
      setMatchResult(result);
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
    if (!filesLoading && !hasInitialized.current) {
      hasInitialized.current = true;
      
      if (mode === "view") {
        // View mode: Go directly to results if matching was done
        if (fuelFile && bankFiles.length > 0) {
          // Mark all steps as completed to show results
          setCompletedSteps(["fuel", "bank", "configure"]);
          setCurrentStep("results");
        } else {
          // No data yet - redirect to edit mode
          setCurrentStep("fuel");
        }
      } else {
        // Edit mode: Always start at step 1 for review
        setCurrentStep("fuel");
      }
    }
  }, [filesLoading, fuelFile, bankFiles.length, mode]);

  // Keep completedSteps in sync with file state (does NOT change currentStep)
  // In view mode, preserve "configure" step completion for results access
  useEffect(() => {
    if (files.length > 0) {
      const newCompleted: ReconciliationStep[] = [];
      
      if (fuelFile) {
        newCompleted.push("fuel");
      }
      if (bankFiles.length > 0) {
        newCompleted.push("bank");
      }
      
      // In view mode with data, assume configure is complete to show results
      if (mode === "view" && fuelFile && bankFiles.length > 0) {
        newCompleted.push("configure");
      }

      setCompletedSteps(newCompleted);
    }
  }, [files, fuelFile, bankFiles.length, mode]);

  const handleStepClick = (step: ReconciliationStep) => {
    const fuelProcessed = !!fuelFile;
    const hasAnyBank = bankFiles.length > 0;
    
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
    setCurrentStep("configure");
  };

  const handleStartMatching = () => {
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

  if (periodLoading || filesLoading) {
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
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" size="icon" data-testid="button-back-home">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div className="flex-1">
              <h1 className="text-xl font-semibold">Reconciliation</h1>
              <p className="text-sm text-muted-foreground">
                {period?.name || "Loading..."}
              </p>
            </div>
          </div>
          
          <div className="mt-6 pb-2">
            <ReconciliationStepper
              currentStep={currentStep}
              completedSteps={completedSteps}
              stepEligibility={stepEligibility}
              onStepClick={handleStepClick}
            />
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        {isAutoMatching ? (
          <Card className="max-w-2xl mx-auto">
            <CardHeader className="text-center">
              <CardTitle>Matching Transactions</CardTitle>
              <CardDescription>
                Comparing your bank transactions against fuel records...
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative h-2 w-full overflow-hidden rounded-full bg-secondary">
                <div className="h-full w-1/3 rounded-full bg-primary animate-indeterminate" />
              </div>
              {txCounts && (
                <div className="grid grid-cols-2 gap-4 text-center">
                  <div className="rounded-lg bg-muted/50 p-3">
                    <p className="text-2xl font-semibold">{txCounts.bank}</p>
                    <p className="text-xs text-muted-foreground">Bank transactions</p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-3">
                    <p className="text-2xl font-semibold">{txCounts.fuel}</p>
                    <p className="text-xs text-muted-foreground">Fuel records</p>
                  </div>
                </div>
              )}
              <p className="text-sm text-muted-foreground text-center">
                This may take a moment depending on the number of transactions.
              </p>
            </CardContent>
          </Card>
        ) : matchResult ? (
          <Card className="max-w-2xl mx-auto">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4">
                <CheckCircle2 className="h-12 w-12 text-green-500" />
              </div>
              <CardTitle className="text-2xl">Matching Complete</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Hero: the answer to "how well did my period match?" */}
              <div className="text-center space-y-1">
                <p className="text-5xl font-bold text-green-600 dark:text-green-400">{matchResult.matchRate}</p>
                <p className="text-lg font-medium">of your {period?.name || "period"} bank transactions verified</p>
                <p className="text-sm text-muted-foreground">
                  {matchResult.matchesCreated} of {matchResult.bankTransactionsMatchable} transactions automatically matched to fuel records
                </p>
              </div>

              {/* Key stats */}
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-lg bg-green-50 dark:bg-green-950/30 p-3">
                  <p className="text-2xl font-semibold text-green-700 dark:text-green-400">{matchResult.matchesCreated}</p>
                  <p className="text-xs text-muted-foreground">Verified</p>
                </div>
                <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 p-3">
                  <p className="text-2xl font-semibold text-amber-700 dark:text-amber-400">{matchResult.bankTransactionsMatchable - matchResult.matchesCreated}</p>
                  <p className="text-xs text-muted-foreground">To Investigate</p>
                </div>
                <div className="rounded-lg bg-muted/50 p-3">
                  <p className="text-2xl font-semibold">{matchResult.invoicesCreated}</p>
                  <p className="text-xs text-muted-foreground">Fuel Invoices</p>
                </div>
              </div>

              {/* Secondary info: data outside range */}
              {matchResult.bankTransactionsUnmatchable > 0 && (
                <div className="rounded-lg border bg-muted/20 p-3 text-center">
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
              />
            )}

            {currentStep === "bank" && bankSubStep === "upload" && (
              <BankUploadStep
                periodId={periodId}
                bankName={currentBankName}
                existingFile={replacingFileId ? files.find(f => f.id === replacingFileId) : undefined}
                onBack={() => setBankSubStep("status")}
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
              />
            )}

            {currentStep === "results" && (
              <ResultsDashboard
                periodId={periodId}
                onRerunMatching={handleRerunMatching}
                onAddFuelData={handleAddFuelData}
                onAddBankData={handleAddBankData}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}
