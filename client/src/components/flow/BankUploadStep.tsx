import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { 
  Building2, 
  Upload, 
  FileSpreadsheet, 
  Check, 
  ArrowRight,
  ArrowLeft,
  RefreshCw,
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
}

interface BankUploadStepProps {
  periodId: string;
  existingFile?: UploadedFile;
  onComplete: () => void;
  onBack: () => void;
}

type SubStep = "upload" | "quality" | "complete";

export function BankUploadStep({ periodId, existingFile, onComplete, onBack }: BankUploadStepProps) {
  const { toast } = useToast();
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [subStep, setSubStep] = useState<SubStep>(
    existingFile?.status === "processed" ? "complete" : "upload"
  );
  const [currentFile, setCurrentFile] = useState<UploadedFile | null>(existingFile || null);
  const [qualityReport, setQualityReport] = useState<DataQualityReport | null>(
    (existingFile?.qualityReport as DataQualityReport) || null
  );

  const uploadMutation = useMutation({
    mutationFn: async (file: File): Promise<UploadResponse> => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("sourceType", "bank");
      formData.append("sourceName", "Bank Statement");

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
      
      const response = await fetch(`/api/periods/${periodId}/files/${currentFile.id}/process`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ mapping: currentFile.columnMapping || {} }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error || "Processing failed");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/periods", periodId, "files"] });
      setSubStep("complete");
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

  if (subStep === "complete") {
    return (
      <Card className="max-w-2xl mx-auto" data-testid="card-bank-complete">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Check className="h-6 w-6 text-primary" />
          </div>
          <CardTitle>Bank Data Ready</CardTitle>
          <CardDescription>
            Your bank transactions are ready to be matched.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {currentFile && (
            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
              <FileSpreadsheet className="h-5 w-5 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{currentFile.fileName}</p>
                <p className="text-xs text-muted-foreground">
                  {currentFile.rowCount?.toLocaleString()} transactions imported
                </p>
              </div>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => setSubStep("upload")}
                data-testid="button-replace-bank"
              >
                <RefreshCw className="h-4 w-4 mr-1" />
                Replace
              </Button>
            </div>
          )}
          
          <div className="flex gap-3">
            <Button 
              variant="outline"
              onClick={onBack}
              data-testid="button-back-fuel"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <Button 
              className="flex-1" 
              onClick={onComplete}
              data-testid="button-continue-to-configure"
            >
              Continue to Configure Matching
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

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
          <CardTitle>Upload Bank Data</CardTitle>
          <CardDescription>
            Upload your bank statement to verify against your fuel records.
            These are the transactions we'll try to match.
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
              <p className="text-xs text-muted-foreground mt-4">
                Supported formats: Excel (.xlsx, .xls) or CSV
              </p>
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
          data-testid="button-back-fuel"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Fuel Data
        </Button>
      </div>
    </div>
  );
}
