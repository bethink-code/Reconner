import { useEffect } from "react";
import { useLocation, useRoute, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Check, Fuel, Building2, Loader2 } from "lucide-react";
import { WizardProvider, useWizard, type FileStep } from "@/contexts/WizardContext";
import type { UploadedFile, ReconciliationPeriod } from "@shared/schema";
import { FuelStep } from "@/components/wizard/FuelStep";
import { BankStep } from "@/components/wizard/BankStep";
import { AddBankPrompt } from "@/components/wizard/AddBankPrompt";
import { motion, AnimatePresence } from "framer-motion";

interface StepIndicatorProps {
  steps: FileStep[];
  currentIndex: number;
  onStepClick: (index: number) => void;
}

function StepProgressIndicator({ steps, currentIndex, onStepClick }: StepIndicatorProps) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-2">
      {steps.map((step, index) => {
        const isCurrent = index === currentIndex;
        const isComplete = step.isComplete;
        const isPast = index < currentIndex;
        const isClickable = isComplete || isPast || index === currentIndex;
        
        const Icon = step.type === "fuel" ? Fuel : Building2;
        const label = step.type === "fuel" 
          ? "Fuel Data" 
          : step.sourceName || `Bank ${index}`;
        
        return (
          <div key={step.id} className="flex items-center gap-2">
            {index > 0 && (
              <div 
                className={`h-px w-6 sm:w-10 transition-colors duration-300 ${
                  isPast || isComplete ? "bg-primary" : "bg-border"
                }`} 
              />
            )}
            <button
              onClick={() => isClickable && onStepClick(index)}
              disabled={!isClickable}
              className={`
                flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-200
                ${isCurrent 
                  ? "bg-primary text-primary-foreground shadow-sm" 
                  : isComplete 
                    ? "bg-primary/10 text-primary hover-elevate cursor-pointer" 
                    : "bg-muted text-muted-foreground"
                }
                ${!isClickable ? "cursor-not-allowed opacity-50" : ""}
              `}
              data-testid={`step-indicator-${index}`}
            >
              <div className={`
                h-6 w-6 rounded-full flex items-center justify-center text-xs font-medium
                ${isComplete && !isCurrent
                  ? "bg-primary text-primary-foreground" 
                  : isCurrent 
                    ? "bg-primary-foreground/20" 
                    : "bg-background"
                }
              `}>
                {isComplete && !isCurrent ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <Icon className="h-3.5 w-3.5" />
                )}
              </div>
              <span className="text-sm font-medium whitespace-nowrap hidden sm:inline">
                {label}
              </span>
            </button>
          </div>
        );
      })}
    </div>
  );
}

function SubStepIndicator({ step }: { step: FileStep }) {
  const subSteps = [
    { key: "upload", label: "Upload" },
    { key: "quality", label: "Check" },
    { key: "mapping", label: "Map" },
    { key: "preview", label: "Preview" },
  ];
  
  const currentIndex = subSteps.findIndex(s => s.key === step.currentSubStep);
  
  if (step.currentSubStep === "complete") {
    return null;
  }
  
  return (
    <div className="flex items-center gap-1 text-xs text-muted-foreground">
      {subSteps.map((subStep, index) => {
        const isCurrent = subStep.key === step.currentSubStep;
        const isPast = index < currentIndex;
        
        return (
          <div key={subStep.key} className="flex items-center gap-1">
            {index > 0 && (
              <div className={`h-px w-3 ${isPast ? "bg-primary" : "bg-border"}`} />
            )}
            <span className={`
              px-1.5 py-0.5 rounded transition-colors
              ${isCurrent ? "bg-primary/10 text-primary font-medium" : ""}
              ${isPast ? "text-primary" : ""}
            `}>
              {subStep.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function WizardContent({ periodId }: { periodId: string }) {
  const [, setLocation] = useLocation();
  const { 
    state, 
    currentStep, 
    init, 
    setStep, 
    allStepsComplete,
    hasAtLeastOneBank 
  } = useWizard();
  
  const { data: period, isLoading: periodLoading } = useQuery<ReconciliationPeriod>({
    queryKey: ["/api/periods", periodId],
    enabled: !!periodId,
  });
  
  const { data: existingFiles = [], isLoading: filesLoading } = useQuery<UploadedFile[]>({
    queryKey: ["/api/periods", periodId, "files"],
    enabled: !!periodId,
  });
  
  useEffect(() => {
    if (periodId && !filesLoading) {
      init(periodId, existingFiles);
    }
  }, [periodId, existingFiles, filesLoading, init]);
  
  if (periodLoading || filesLoading || state.steps.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  
  const handleContinueToReconcile = () => {
    setLocation(`/reconcile?periodId=${periodId}`);
  };
  
  const pageVariants = {
    initial: { opacity: 0, x: 20 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -20 },
  };
  
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex items-center gap-4">
              <Link href="/">
                <Button variant="ghost" size="icon" data-testid="button-back-home">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </Link>
              <div>
                <h1 className="text-xl font-semibold">Reconciliation Setup</h1>
                <p className="text-sm text-muted-foreground">
                  {period?.name || "Loading..."}
                </p>
              </div>
            </div>
            
            <div className="flex-1 flex justify-end">
              {allStepsComplete && hasAtLeastOneBank && (
                <Button onClick={handleContinueToReconcile} data-testid="button-start-reconciliation">
                  Start Reconciliation
                </Button>
              )}
            </div>
          </div>
          
          <div className="mt-4">
            <StepProgressIndicator 
              steps={state.steps} 
              currentIndex={state.currentStepIndex}
              onStepClick={setStep}
            />
          </div>
        </div>
      </header>
      
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        {currentStep && (
          <div className="mb-4">
            <SubStepIndicator step={currentStep} />
          </div>
        )}
        
        <AnimatePresence mode="wait">
          {state.isAddingBank ? (
            <motion.div
              key="add-bank-prompt"
              initial="initial"
              animate="animate"
              exit="exit"
              variants={pageVariants}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              <AddBankPrompt periodId={periodId} />
            </motion.div>
          ) : currentStep?.type === "fuel" ? (
            <motion.div
              key={`step-${state.currentStepIndex}`}
              initial="initial"
              animate="animate"
              exit="exit"
              variants={pageVariants}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              <FuelStep stepIndex={state.currentStepIndex} periodId={periodId} />
            </motion.div>
          ) : currentStep?.type === "bank" ? (
            <motion.div
              key={`step-${state.currentStepIndex}`}
              initial="initial"
              animate="animate"
              exit="exit"
              variants={pageVariants}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              <BankStep stepIndex={state.currentStepIndex} periodId={periodId} />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </main>
    </div>
  );
}

export default function ReconciliationSetupWizard() {
  const [, setLocation] = useLocation();
  const [match, params] = useRoute("/setup/:periodId");
  
  useEffect(() => {
    if (!match || !params?.periodId) {
      const searchParams = new URLSearchParams(window.location.search);
      const periodIdFromQuery = searchParams.get("periodId");
      if (periodIdFromQuery) {
        setLocation(`/setup/${periodIdFromQuery}`, { replace: true });
      } else {
        setLocation("/");
      }
    }
  }, [match, params, setLocation]);
  
  if (!match || !params?.periodId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  
  return (
    <WizardProvider>
      <WizardContent periodId={params.periodId} />
    </WizardProvider>
  );
}
