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

interface BankStepProps {
  stepIndex: number;
  periodId: string;
}

export function BankStep({ stepIndex, periodId }: BankStepProps) {
  const { toast } = useToast();
  const { state, updateFile, setSubStep, completeStep, updateBankPreset } = useWizard();
  
  const step = state.steps[stepIndex];
  if (!step) return null;
  
  const bankNumber = state.steps.filter((s, idx) => s.type === "bank" && idx <= stepIndex).length;
  
  const uploadMutation = useMutation({
    mutationFn: async (file: File): Promise<UploadResponse> => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("sourceType", step.sourceType);
      formData.append("sourceName", step.sourceName);
      
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
  
  const fuelStep = state.steps.find(s => s.type === "fuel");
  const fuelCardCount = fuelStep?.file?.rowCount || 0;
  
  const bankGuidance = {
    title: `Bank Statement ${bankNumber > 1 ? `#${bankNumber}` : ""}`,
    subtitle: bankNumber === 1 ? "Verification data" : "Additional verification",
    description: bankNumber === 1 
      ? "This bank statement will be matched against your fuel system's card transactions to verify payments were received."
      : "Add another bank statement if you have card transactions processed through multiple merchant accounts.",
    bulletPoints: [
      `We'll match card transactions against your ${fuelCardCount.toLocaleString()} fuel records`,
      "Only card payments are matched — cash stays separate",
      "Amounts must match within your configured tolerance",
    ],
    hint: "Download from your bank's online portal — look for 'Merchant Statement' or 'Card Transactions'",
  };
  
  switch (step.currentSubStep) {
    case "upload":
      return (
        <UploadPanel
          guidance={bankGuidance}
          existingFile={step.file}
          onFileSelected={handleFileSelected}
          isUploading={uploadMutation.isPending}
          showBankPresets
          selectedPreset={step.bankPreset}
          onPresetSelect={(preset: string) => updateBankPreset(stepIndex, preset)}
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
          sourceType="bank"
          bankPreset={step.bankPreset}
          onComplete={handleMappingComplete}
          onBack={handleBack}
        />
      );
      
    case "preview":
      return (
        <PreviewPanel
          periodId={periodId}
          fileId={step.file!.id}
          sourceType="bank"
          onConfirm={handlePreviewConfirm}
          onBack={handleBack}
        />
      );
      
    case "complete":
      return (
        <CompletionPanel
          title={`Bank Statement ${bankNumber > 1 ? `#${bankNumber} ` : ""}Loaded`}
          file={step.file!}
          nextStepLabel="You can add more bank statements or continue to reconciliation."
        />
      );
      
    default:
      return null;
  }
}
