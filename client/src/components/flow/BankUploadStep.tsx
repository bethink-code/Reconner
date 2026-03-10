import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { 
  Building2, 
  Upload, 
  FileSpreadsheet, 
  ArrowLeft,
  Lightbulb
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { DataQualityWarnings } from "@/components/DataQualityWarnings";
import type { UploadedFile } from "@shared/schema";
import type { DataQualityReport } from "@/components/DataQualityWarnings";

interface UploadResponse {
  file: UploadedFile;
  qualityReport: DataQualityReport;
  suggestedMappings: Record<string, string>; // Format: { columnName: fieldType }
}

interface BankUploadStepProps {
  periodId: string;
  bankName: string;
  existingFile?: UploadedFile;
  onBack: () => void;
}

type SubStep = "upload" | "quality";

export function BankUploadStep({ periodId, bankName, existingFile, onBack }: BankUploadStepProps) {
  const { toast } = useToast();
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [subStep, setSubStep] = useState<SubStep>("upload");
  const [currentFile, setCurrentFile] = useState<UploadedFile | null>(existingFile || null);
  const [qualityReport, setQualityReport] = useState<DataQualityReport | null>(
    (existingFile?.qualityReport as DataQualityReport) || null
  );
  const [suggestedMappings, setSuggestedMappings] = useState<Record<string, string> | null>(
    (existingFile?.columnMapping as Record<string, string>) || null
  );

  const uploadMutation = useMutation({
    mutationFn: async (file: File): Promise<UploadResponse> => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("sourceType", "bank");
      formData.append("sourceName", bankName || "Bank Statement");
      formData.append("bankName", bankName);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 180000);

      setUploadProgress(0);
      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => Math.min(prev + 5, 90));
      }, 200);

      try {
        const response = await fetch(`/api/periods/${periodId}/files/upload`, {
          method: "POST",
          body: formData,
          credentials: "include",
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        clearInterval(progressInterval);
        setUploadProgress(100);

        if (!response.ok) {
          const errorData = await response.json().catch(() => null);
          throw new Error(errorData?.error || `Upload failed (Error ${response.status})`);
        }

        return response.json();
      } catch (error) {
        clearTimeout(timeoutId);
        clearInterval(progressInterval);
        throw error;
      }
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/periods", periodId, "files"] });
      setCurrentFile(result.file);
      setQualityReport(result.qualityReport);
      setSuggestedMappings(result.suggestedMappings);
      setSubStep("quality");
      toast({
        title: "File uploaded",
        description: `${result.file.fileName} uploaded successfully.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const processMutation = useMutation({
    mutationFn: async () => {
      if (!currentFile) throw new Error("No file to process");
      
      // Build mapping from available sources (in priority order):
      // 1. suggestedMappings from upload response (correct format: {columnName: fieldType})
      // 2. Existing columnMapping on file
      // 3. Invert qualityReport.suggestedMapping (fieldType -> columnName)
      // 4. Fetch file preview to get fresh suggestedMappings
      let mappingToApply = suggestedMappings || (currentFile.columnMapping as Record<string, string>);
      
      // If still no mapping, try inverting qualityReport.suggestedMapping
      if ((!mappingToApply || Object.keys(mappingToApply).length === 0) && qualityReport?.suggestedMapping) {
        const inverted: Record<string, string> = {};
        for (const [fieldType, columnName] of Object.entries(qualityReport.suggestedMapping)) {
          if (typeof columnName === 'string' && columnName && fieldType !== 'ignore') {
            inverted[columnName] = fieldType;
          }
        }
        if (Object.keys(inverted).length > 0) {
          mappingToApply = inverted;
        }
      }
      
      // Last resort: fetch file preview to get fresh suggestedMappings
      if (!mappingToApply || Object.keys(mappingToApply).length === 0) {
        const previewResponse = await fetch(`/api/files/${currentFile.id}/preview`, {
          credentials: "include",
        });
        if (previewResponse.ok) {
          const previewData = await previewResponse.json();
          if (previewData.suggestedMappings && Object.keys(previewData.suggestedMappings).length > 0) {
            mappingToApply = previewData.suggestedMappings;
          }
        }
      }
      
      if (!mappingToApply || Object.keys(mappingToApply).length === 0) {
        throw new Error("Could not detect column mappings. Please try re-uploading the file.");
      }
      
      // Apply column mapping
      const mappingResponse = await fetch(`/api/files/${currentFile.id}/column-mapping`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ columnMapping: mappingToApply }),
      });
      
      if (!mappingResponse.ok) {
        const errorData = await mappingResponse.json().catch(() => null);
        throw new Error(errorData?.message || errorData?.error || "Failed to save column mapping");
      }
      
      // Then process the file
      const response = await fetch(`/api/periods/${periodId}/files/${currentFile.id}/process`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error || "Processing failed");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/periods", periodId, "files"] });
      toast({
        title: "Bank data imported",
        description: "Your bank transactions have been processed successfully.",
      });
      // Return to BankStatusScreen so user can add more banks or proceed
      onBack();
    },
    onError: (error: Error) => {
      toast({
        title: "Processing failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      uploadMutation.mutate(files[0]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      uploadMutation.mutate(files[0]);
    }
  };

  const handleQualityContinue = () => {
    processMutation.mutate();
  };

  if (subStep === "quality" && qualityReport) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <Card data-testid="card-quality-check">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              Checking Your File
            </CardTitle>
            <CardDescription>{currentFile?.fileName}</CardDescription>
          </CardHeader>
          <CardContent>
            <DataQualityWarnings
              report={qualityReport}
              fileName={currentFile?.fileName || ""}
              onContinue={handleQualityContinue}
              isProcessing={processMutation.isPending}
            />
          </CardContent>
        </Card>
        
        <div className="flex justify-start">
          <Button 
            variant="outline" 
            onClick={() => setSubStep("upload")}
            data-testid="button-back-upload"
          >
            Choose Different File
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="max-w-2xl mx-auto" data-testid="card-bank-upload">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Building2 className="h-6 w-6 text-primary" />
          </div>
          <CardTitle>Upload {bankName} Statement</CardTitle>
          <CardDescription>
            Upload your {bankName} bank statement to verify against your fuel records.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {uploadMutation.isPending ? (
            <div className="space-y-4 p-8">
              <div className="text-center">
                <p className="text-sm font-medium mb-2">Uploading file...</p>
                <Progress value={uploadProgress} className="h-2" />
                <p className="text-xs text-muted-foreground mt-2">{uploadProgress}%</p>
              </div>
            </div>
          ) : (
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                isDragging
                  ? "border-primary bg-primary/5"
                  : "border-muted-foreground/25 hover:border-primary/50"
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              data-testid="dropzone-bank"
            >
              <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-4" />
              <p className="text-sm font-medium mb-1">
                Drag and drop your bank statement here
              </p>
              <p className="text-xs text-muted-foreground mb-4">
                or click to browse
              </p>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileSelect}
                className="hidden"
                id="bank-upload"
                data-testid="input-bank-file"
              />
              <label htmlFor="bank-upload">
                <Button variant="outline" asChild>
                  <span>
                    <FileSpreadsheet className="h-4 w-4 mr-2" />
                    Select File
                  </span>
                </Button>
              </label>
              <div className="mt-4 space-y-1">
                <p className="text-xs text-muted-foreground">
                  Supported: Excel (.xlsx, .xls) or CSV
                </p>
                <p className="text-xs text-muted-foreground">
                  Bank statement should include: date, amount, and reference/description
                </p>
              </div>
            </div>
          )}

          <div className="flex items-start gap-2 p-3 bg-muted/50 rounded-lg">
            <Lightbulb className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground">
              Download your merchant statement from your bank's online portal.
              Make sure it includes the date, amount, and reference for each transaction.
            </p>
          </div>
        </CardContent>
      </Card>
      
      <div className="max-w-2xl mx-auto">
        <Button 
          variant="outline"
          onClick={onBack}
          data-testid="button-back-bank-status"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Bank Selection
        </Button>
      </div>
    </div>
  );
}
