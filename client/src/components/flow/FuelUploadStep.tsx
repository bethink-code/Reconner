import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Fuel,
  Upload,
  FileSpreadsheet,
  Check,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  RefreshCw,
  Lightbulb,
  Columns,
  Loader2
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
  const [suggestedMappings, setSuggestedMappings] = useState<Record<string, string> | null>(
    (existingFile?.columnMapping as Record<string, string>) || null
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
    setSubStep("mapping");
  };

  const handleMappingConfirm = () => {
    processMutation.mutate();
  };

  const FIELD_LABELS: Record<string, string> = {
    date: "Date",
    time: "Time",
    amount: "Amount",
    reference: "Reference",
    description: "Description",
    cardNumber: "Card Number",
    ignore: "Ignore",
  };

  const FIELD_OPTIONS = [
    { value: "date", label: "Date" },
    { value: "time", label: "Time" },
    { value: "amount", label: "Amount" },
    { value: "reference", label: "Reference" },
    { value: "description", label: "Description" },
    { value: "cardNumber", label: "Card Number" },
    { value: "paymentType", label: "Payment Type" },
    { value: "attendant", label: "Attendant" },
    { value: "cashier", label: "Cashier" },
    { value: "pump", label: "Pump" },
    { value: "ignore", label: "Ignore" },
  ];

  const updateMapping = (columnName: string, newField: string) => {
    setSuggestedMappings((prev) => {
      if (!prev) return prev;
      const updated = { ...prev };
      updated[columnName] = newField;
      return updated;
    });
  };

  const [showIgnored, setShowIgnored] = useState(false);

  const mappedFields = suggestedMappings
    ? Object.entries(suggestedMappings).filter(([_, field]) => field !== "ignore")
    : [];
  const ignoredCount = suggestedMappings
    ? Object.values(suggestedMappings).filter((f) => f === "ignore").length
    : 0;
  const hasDate = mappedFields.some(([_, f]) => f === "date");
  const hasAmount = mappedFields.some(([_, f]) => f === "amount");

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

  if (subStep === "mapping" && suggestedMappings) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <Card data-testid="card-column-mapping">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Columns className="h-5 w-5 text-primary" />
              Confirm Column Mapping
            </CardTitle>
            <CardDescription>
              We detected these columns from your file. Review and adjust if needed.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {mappedFields.length} mapped, {ignoredCount} ignored
              </p>
              {ignoredCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowIgnored(!showIgnored)}
                  className="text-xs h-7"
                >
                  {showIgnored ? "Hide" : "Show"} ignored ({ignoredCount})
                </Button>
              )}
            </div>
            <div className="space-y-2">
              {Object.entries(suggestedMappings)
                .filter(([_, fieldType]) => showIgnored || fieldType !== "ignore")
                .map(([columnName, fieldType]) => (
                <div
                  key={columnName}
                  className={`flex items-center gap-3 p-2 rounded-lg transition-colors ${
                    fieldType !== "ignore"
                      ? "bg-card border border-[#E5E3DC]"
                      : "bg-muted/20 opacity-60"
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm truncate ${
                      fieldType !== "ignore" ? "font-medium" : "text-muted-foreground"
                    }`}>{columnName}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="w-40">
                    <Select
                      value={fieldType}
                      onValueChange={(value) => updateMapping(columnName, value)}
                    >
                      <SelectTrigger className="h-8 text-sm" data-testid={`select-mapping-${columnName}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FIELD_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ))}
            </div>

            {(!hasDate || !hasAmount) && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>
                  {!hasDate && !hasAmount
                    ? "Date and Amount columns are required."
                    : !hasDate
                    ? "A Date column is required."
                    : "An Amount column is required."}
                </span>
              </div>
            )}

            <div className="flex gap-3 pt-2 border-t">
              <Button
                variant="outline"
                onClick={() => setSubStep("quality")}
                data-testid="button-back-quality"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <Button
                className="flex-1"
                onClick={handleMappingConfirm}
                disabled={!hasDate || !hasAmount || processMutation.isPending}
                data-testid="button-confirm-mapping"
              >
                {processMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Processing {qualityReport?.cleanRows?.toLocaleString() || ''} transactions...
                  </>
                ) : (
                  <>
                    Confirm & Process
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
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
              accept=".xlsx,.xls,.csv,.txt"
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
            <div className="mt-4 space-y-1">
              <p className="text-xs text-muted-foreground">
                Supported: Excel (.xlsx, .xls) or CSV
              </p>
              <p className="text-xs text-muted-foreground">
                File should include columns for: date, amount, reference/invoice number
              </p>
            </div>
          </div>
        )}

        <div className="flex items-start gap-2 p-3 bg-muted/50 rounded-lg">
          <Lightbulb className="h-4 w-4 text-[#F5C400] mt-0.5 shrink-0" />
          <p className="text-xs text-muted-foreground">
            Export your daily transaction report from your fuel management system.
            Make sure it includes the date, amount, and payment type for each sale.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
