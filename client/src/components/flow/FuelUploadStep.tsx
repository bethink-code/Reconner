import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { 
  Fuel, 
  Upload, 
  FileSpreadsheet, 
  Check, 
  AlertCircle,
  ArrowRight,
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

interface FuelUploadStepProps {
  periodId: string;
  existingFile?: UploadedFile;
  onComplete: () => void;
}

type SubStep = "upload" | "quality" | "mapping" | "complete";

export function FuelUploadStep({ periodId, existingFile, onComplete }: FuelUploadStepProps) {
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
      formData.append("sourceType", "fuel");
      formData.append("sourceName", "Fuel Management System");

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
      
      // First, apply suggested column mapping if not already set
      const suggestedMapping = qualityReport?.suggestedMapping || currentFile.columnMapping;
      if (suggestedMapping && Object.keys(suggestedMapping).length > 0) {
        const mappingResponse = await fetch(`/api/files/${currentFile.id}/column-mapping`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ columnMapping: suggestedMapping }),
        });
        
        if (!mappingResponse.ok) {
          const errorData = await mappingResponse.json().catch(() => null);
          throw new Error(errorData?.error || "Failed to save column mapping");
        }
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
      <Card className="max-w-2xl mx-auto" data-testid="card-fuel-complete">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Check className="h-6 w-6 text-primary" />
          </div>
          <CardTitle>Fuel Data Ready</CardTitle>
          <CardDescription>
            Your fuel transactions have been imported successfully.
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
                data-testid="button-replace-fuel"
              >
                <RefreshCw className="h-4 w-4 mr-1" />
                Replace
              </Button>
            </div>
          )}
          
          <Button 
            className="w-full" 
            onClick={onComplete}
            data-testid="button-continue-to-bank"
          >
            Continue to Bank Data
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
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
              <Fuel className="h-5 w-5 text-primary" />
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
    <Card className="max-w-2xl mx-auto" data-testid="card-fuel-upload">
      <CardHeader className="text-center">
        <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
          <Fuel className="h-6 w-6 text-primary" />
        </div>
        <CardTitle>Upload Fuel Data</CardTitle>
        <CardDescription>
          Upload your fuel transactions first — this is your source of truth.
          We'll match your bank transactions against these records.
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
            data-testid="dropzone-fuel"
          >
            <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-4" />
            <p className="text-sm font-medium mb-1">
              Drag and drop your fuel export file here
            </p>
            <p className="text-xs text-muted-foreground mb-4">
              or click to browse
            </p>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileSelect}
              className="hidden"
              id="fuel-upload"
              data-testid="input-fuel-file"
            />
            <label htmlFor="fuel-upload">
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
            Export your daily transaction report from your fuel management system.
            Make sure it includes the date, amount, and payment type for each sale.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
