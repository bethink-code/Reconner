import { useState, useEffect } from "react";
import { useRoute, useLocation, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Loader2 } from "lucide-react";
import { ReconciliationStepper, type ReconciliationStep, type StepEligibility } from "@/components/ReconciliationStepper";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { ReconciliationPeriod, UploadedFile } from "@shared/schema";

import { FuelUploadStep } from "@/components/flow/FuelUploadStep";
import { BankUploadStep } from "@/components/flow/BankUploadStep";
import { ConfigureMatchingStep } from "@/components/flow/ConfigureMatchingStep";
import { ResultsDashboard } from "@/components/flow/ResultsDashboard";

export default function ReconciliationFlow() {
  const [, setLocation] = useLocation();
  const [match, params] = useRoute("/flow/:periodId");
  const { toast } = useToast();
  
  const [currentStep, setCurrentStep] = useState<ReconciliationStep>("fuel");
  const [completedSteps, setCompletedSteps] = useState<ReconciliationStep[]>([]);
  const [isAutoMatching, setIsAutoMatching] = useState(false);

  const periodId = params?.periodId || "";

  const { data: period, isLoading: periodLoading } = useQuery<ReconciliationPeriod>({
    queryKey: ["/api/periods", periodId],
    enabled: !!periodId,
  });

  const { data: files = [], isLoading: filesLoading } = useQuery<UploadedFile[]>({
    queryKey: ["/api/periods", periodId, "files"],
    enabled: !!periodId,
  });

  const autoMatchMutation = useMutation({
    mutationFn: async () => {
      setIsAutoMatching(true);
      const response = await apiRequest("POST", `/api/periods/${periodId}/auto-match`, {});
      return await response.json();
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/periods", periodId, "summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/periods", periodId, "transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/periods"] });
      setIsAutoMatching(false);
      
      setCompletedSteps((prev) => [...prev.filter(s => s !== "configure"), "configure"]);
      setCurrentStep("results");
      
      toast({
        title: "Matching complete",
        description: `Found ${result.matchesCreated} matches. Review your results below.`,
      });
    },
    onError: (error: Error) => {
      setIsAutoMatching(false);
      toast({
        title: "Matching failed",
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

  useEffect(() => {
    if (files.length > 0) {
      const fuelFile = files.find((f) => f.sourceType === "fuel" && f.status === "processed");
      const bankFile = files.find((f) => f.sourceType === "bank" && f.status === "processed");

      const newCompleted: ReconciliationStep[] = [];
      
      if (fuelFile) {
        newCompleted.push("fuel");
      }
      if (bankFile) {
        newCompleted.push("bank");
      }

      setCompletedSteps(newCompleted);

      if (!fuelFile) {
        setCurrentStep("fuel");
      } else if (!bankFile) {
        setCurrentStep("bank");
      } else if (!newCompleted.includes("configure")) {
        setCurrentStep("configure");
      }
    }
  }, [files]);

  const handleStepClick = (step: ReconciliationStep) => {
    const stepOrder: ReconciliationStep[] = ["fuel", "bank", "configure", "results"];
    const targetIndex = stepOrder.indexOf(step);
    
    // Check if all prerequisite steps are completed
    const fuelProcessed = files.some((f) => f.sourceType === "fuel" && f.status === "processed");
    const bankProcessed = files.some((f) => f.sourceType === "bank" && f.status === "processed");
    
    // Can always go to fuel step
    if (step === "fuel") {
      setCurrentStep(step);
      return;
    }
    
    // Need fuel processed to go to bank
    if (step === "bank" && fuelProcessed) {
      setCurrentStep(step);
      return;
    }
    
    // Need both files processed to go to configure
    if (step === "configure" && fuelProcessed && bankProcessed) {
      setCurrentStep(step);
      return;
    }
    
    // Need both files processed and configure completed for results
    if (step === "results" && fuelProcessed && bankProcessed && completedSteps.includes("configure")) {
      setCurrentStep(step);
      return;
    }
  };

  const handleFuelComplete = () => {
    setCompletedSteps((prev) => [...prev.filter(s => s !== "fuel"), "fuel"]);
    setCurrentStep("bank");
  };

  const handleBankComplete = () => {
    setCompletedSteps((prev) => [...prev.filter(s => s !== "bank"), "bank"]);
    setCurrentStep("configure");
  };

  const handleStartMatching = () => {
    autoMatchMutation.mutate();
  };

  const handleRerunMatching = () => {
    setCurrentStep("configure");
  };

  const fuelProcessed = files.some((f) => f.sourceType === "fuel" && f.status === "processed");
  const bankProcessed = files.some((f) => f.sourceType === "bank" && f.status === "processed");
  const configureCompleted = completedSteps.includes("configure");

  const stepEligibility: StepEligibility = {
    fuel: true,
    bank: fuelProcessed,
    configure: fuelProcessed && bankProcessed,
    results: fuelProcessed && bankProcessed && configureCompleted,
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
              <div className="mx-auto mb-4">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
              </div>
              <CardTitle>Matching Transactions</CardTitle>
              <CardDescription>
                Comparing your bank transactions against fuel records...
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              <p className="text-sm text-muted-foreground">
                This may take a moment depending on the number of transactions.
              </p>
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

            {currentStep === "bank" && (
              <BankUploadStep
                periodId={periodId}
                existingFile={files.find((f) => f.sourceType === "bank")}
                onComplete={handleBankComplete}
                onBack={() => setCurrentStep("fuel")}
              />
            )}

            {currentStep === "configure" && (
              <ConfigureMatchingStep
                periodId={periodId}
                onStartMatching={handleStartMatching}
                onBack={() => setCurrentStep("bank")}
                isMatching={autoMatchMutation.isPending}
              />
            )}

            {currentStep === "results" && (
              <ResultsDashboard
                periodId={periodId}
                onRerunMatching={handleRerunMatching}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}
