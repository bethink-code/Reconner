import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { useWizard } from "@/contexts/WizardContext";
import { UploadPanel } from "./panels/UploadPanel";
import { QualityCheckPanel } from "./panels/QualityCheckPanel";
import { MappingPanel } from "./panels/MappingPanel";
import { PreviewPanel } from "./panels/PreviewPanel";
import { CompletionPanel } from "./panels/CompletionPanel";
import type { UploadedFile } from "@shared/schema";
import type { DataQualityReport } from "@/components/DataQualityWarnings";

interface UploadResponse {
  file: UploadedFile;
  qualityReport: DataQualityReport;
}

interface FuelStepProps {
  stepIndex: number;
  periodId: string;
}

export function FuelStep({ stepIndex, periodId }: FuelStepProps) {
  const { toast } = useToast();
  const { state, currentStep, updateFile, setSubStep, completeStep } = useWizard();
  
  const step = state.steps[stepIndex];
  if (!step) return null;
  
  const uploadMutation = useMutation({
    mutationFn: async (file: File): Promise<UploadResponse> => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("sourceType", "fuel");
      formData.append("sourceName", "Fuel Management System");
      
      const response = await fetch(`/api/periods/${periodId}/files/upload`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Upload failed");
      }
      
      return response.json();
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/periods", periodId, "files"] });
      updateFile(stepIndex, result.file, result.qualityReport);
      
      if (result.qualityReport?.hasCriticalIssues) {
        toast({
          title: "File needs attention",
          description: "We found some issues that need your review.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "File uploaded",
          description: `${result.file.fileName} uploaded successfully.`,
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  const handleFileSelected = (files: File[]) => {
    if (files.length > 0) {
      uploadMutation.mutate(files[0]);
    }
  };
  
  const handleQualityContinue = () => {
    setSubStep(stepIndex, "mapping");
  };
  
  const handleMappingComplete = () => {
    setSubStep(stepIndex, "preview");
  };
  
  const handlePreviewConfirm = () => {
    completeStep(stepIndex);
  };
  
  const handleBack = () => {
    const subStepOrder = ["upload", "quality", "mapping", "preview", "complete"] as const;
    const currentIndex = subStepOrder.indexOf(step.currentSubStep);
    if (currentIndex > 0) {
      setSubStep(stepIndex, subStepOrder[currentIndex - 1]);
    }
  };
  
  const fuelGuidance = {
    title: "Fuel Transactions",
    subtitle: "Your source of truth",
    description: "This file contains all transactions from your fuel management system — every sale at every pump, including:",
    bulletPoints: [
      "Card payments (we'll verify these against bank records)",
      "Cash payments",
      "Debtor accounts",
    ],
    hint: 'Usually called "Fuel Master Shifts" or "Transaction Export" from your fuel management system',
  };
  
  switch (step.currentSubStep) {
    case "upload":
      return (
        <UploadPanel
          guidance={fuelGuidance}
          existingFile={step.file}
          onFileSelected={handleFileSelected}
          isUploading={uploadMutation.isPending}
        />
      );
      
    case "quality":
      return (
        <QualityCheckPanel
          file={step.file!}
          qualityReport={step.qualityReport!}
          onContinue={handleQualityContinue}
          onBack={() => setSubStep(stepIndex, "upload")}
        />
      );
      
    case "mapping":
      return (
        <MappingPanel
          periodId={periodId}
          fileId={step.file!.id}
          stepIndex={stepIndex}
          sourceType="fuel"
          onComplete={handleMappingComplete}
          onBack={handleBack}
        />
      );
      
    case "preview":
      return (
        <PreviewPanel
          periodId={periodId}
          fileId={step.file!.id}
          sourceType="fuel"
          onConfirm={handlePreviewConfirm}
          onBack={handleBack}
        />
      );
      
    case "complete":
      return (
        <CompletionPanel
          title="Fuel Transactions Loaded"
          file={step.file!}
          nextStepLabel="Upload your first bank statement to verify these card transactions."
        />
      );
      
    default:
      return null;
  }
}
