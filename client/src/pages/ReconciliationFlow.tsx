import { useState, useEffect } from "react";
import { useRoute, useLocation, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Loader2, Plus, CheckCircle2, Building2 } from "lucide-react";
import { ReconciliationStepper, type ReconciliationStep, type StepEligibility } from "@/components/ReconciliationStepper";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { ReconciliationPeriod, UploadedFile } from "@shared/schema";

import { FuelUploadStep } from "@/components/flow/FuelUploadStep";
import { BankUploadStep } from "@/components/flow/BankUploadStep";
import { ConfigureMatchingStep } from "@/components/flow/ConfigureMatchingStep";
import { ResultsDashboard } from "@/components/flow/ResultsDashboard";

type BankSubStep = "select" | "upload";

export default function ReconciliationFlow() {
  const [, setLocation] = useLocation();
  const [match, params] = useRoute("/flow/:periodId");
  const { toast } = useToast();
  
  const [currentStep, setCurrentStep] = useState<ReconciliationStep>("fuel");
  const [completedSteps, setCompletedSteps] = useState<ReconciliationStep[]>([]);
  const [isAutoMatching, setIsAutoMatching] = useState(false);
  
  const [bankSubStep, setBankSubStep] = useState<BankSubStep>("select");
  const [currentBankName, setCurrentBankName] = useState<string>("");

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
      const newCompleted: ReconciliationStep[] = [];
      
      if (fuelFile) {
        newCompleted.push("fuel");
      }
      if (bankFiles.length > 0) {
        newCompleted.push("bank");
      }

      setCompletedSteps(newCompleted);

      if (!fuelFile) {
        setCurrentStep("fuel");
      } else if (bankFiles.length === 0) {
        setCurrentStep("bank");
        setBankSubStep("select");
      } else if (!newCompleted.includes("configure")) {
        setCurrentStep("bank");
        setBankSubStep("select");
      }
    }
  }, [files]);

  const handleStepClick = (step: ReconciliationStep) => {
    const fuelProcessed = !!fuelFile;
    const hasAnyBank = bankFiles.length > 0;
    
    if (step === "fuel") {
      setCurrentStep(step);
      return;
    }
    
    if (step === "bank" && fuelProcessed) {
      setCurrentStep(step);
      setBankSubStep("select");
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
    setBankSubStep("select");
  };

  const handleSelectBank = (bankName: string) => {
    setCurrentBankName(bankName);
    setBankSubStep("upload");
  };

  const handleBankUploadComplete = () => {
    setCompletedSteps((prev) => [...prev.filter(s => s !== "bank"), "bank"]);
    setBankSubStep("select");
    setCurrentBankName("");
    queryClient.invalidateQueries({ queryKey: ["/api/periods", periodId, "files"] });
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

  const renderBankSelection = () => (
    <Card className="max-w-2xl mx-auto" data-testid="card-bank-selection">
      <CardHeader>
        <CardTitle>Bank Statements</CardTitle>
        <CardDescription>
          Upload bank statements to verify your fuel transactions. You can add multiple bank accounts.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {bankFiles.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground">Uploaded Bank Statements</h3>
            {bankFiles.map((file) => (
              <div
                key={file.id}
                className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30"
                data-testid={`bank-file-${file.id}`}
              >
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <div className="flex-1">
                  <p className="font-medium">{file.bankName || file.sourceName || file.fileName}</p>
                  <p className="text-sm text-muted-foreground">
                    {file.rowCount?.toLocaleString()} transactions
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground">
            {bankFiles.length === 0 ? "Select a bank to upload" : "Add another bank"}
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <Button
              variant="outline"
              className="h-auto py-4 flex flex-col items-center gap-2"
              onClick={() => handleSelectBank("FNB")}
              data-testid="button-select-fnb"
            >
              <Building2 className="h-6 w-6" />
              <span>FNB</span>
            </Button>
            <Button
              variant="outline"
              className="h-auto py-4 flex flex-col items-center gap-2"
              onClick={() => handleSelectBank("ABSA")}
              data-testid="button-select-absa"
            >
              <Building2 className="h-6 w-6" />
              <span>ABSA</span>
            </Button>
            <Button
              variant="outline"
              className="h-auto py-4 flex flex-col items-center gap-2"
              onClick={() => handleSelectBank("Standard Bank")}
              data-testid="button-select-standard"
            >
              <Building2 className="h-6 w-6" />
              <span>Standard Bank</span>
            </Button>
            <Button
              variant="outline"
              className="h-auto py-4 flex flex-col items-center gap-2"
              onClick={() => handleSelectBank("Nedbank")}
              data-testid="button-select-nedbank"
            >
              <Building2 className="h-6 w-6" />
              <span>Nedbank</span>
            </Button>
          </div>
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => handleSelectBank("Other")}
            data-testid="button-select-other"
          >
            <Plus className="h-4 w-4 mr-2" />
            Other Bank
          </Button>
        </div>

        <div className="flex justify-between pt-4 border-t">
          <Button
            variant="outline"
            onClick={() => setCurrentStep("fuel")}
            data-testid="button-back-fuel"
          >
            Back
          </Button>
          {bankFiles.length > 0 && (
            <Button 
              onClick={handleContinueToMatching}
              data-testid="button-continue-matching"
            >
              Continue to Matching Rules
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );

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

            {currentStep === "bank" && bankSubStep === "select" && (
              renderBankSelection()
            )}

            {currentStep === "bank" && bankSubStep === "upload" && (
              <BankUploadStep
                periodId={periodId}
                bankName={currentBankName}
                existingFile={undefined}
                onComplete={handleBankUploadComplete}
                onBack={() => setBankSubStep("select")}
              />
            )}

            {currentStep === "configure" && (
              <ConfigureMatchingStep
                periodId={periodId}
                onStartMatching={handleStartMatching}
                onBack={() => {
                  setCurrentStep("bank");
                  setBankSubStep("select");
                }}
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
