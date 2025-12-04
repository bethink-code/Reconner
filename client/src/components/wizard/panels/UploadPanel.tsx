import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Upload, FileText, Loader2, CheckCircle2, Fuel, Building2, Lightbulb, RefreshCw } from "lucide-react";
import type { UploadedFile } from "@shared/schema";

const BANK_PRESETS = [
  { id: "fnb_merchant", name: "FNB Merchant", description: "First National Bank merchant statement" },
  { id: "absa_merchant", name: "ABSA Merchant", description: "ABSA Bank merchant statement" },
  { id: "standard_merchant", name: "Standard Bank Merchant", description: "Standard Bank merchant statement" },
  { id: "nedbank_merchant", name: "Nedbank Merchant", description: "Nedbank merchant statement" },
  { id: "capitec_merchant", name: "Capitec Merchant", description: "Capitec Bank merchant statement" },
  { id: "custom", name: "Other Bank", description: "Any other bank or custom format" },
];

interface UploadGuidance {
  title: string;
  subtitle: string;
  description: string;
  bulletPoints: string[];
  hint: string;
}

interface UploadPanelProps {
  guidance: UploadGuidance;
  existingFile?: UploadedFile | null;
  onFileSelected: (files: File[]) => void;
  isUploading?: boolean;
  showBankPresets?: boolean;
  selectedPreset?: string;
  onPresetSelect?: (preset: string) => void;
}

export function UploadPanel({
  guidance,
  existingFile,
  onFileSelected,
  isUploading = false,
  showBankPresets = false,
  selectedPreset,
  onPresetSelect,
}: UploadPanelProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showReplace, setShowReplace] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  useEffect(() => {
    if (isUploading) {
      setUploadProgress(0);
      const interval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 90) {
            clearInterval(interval);
            return prev;
          }
          return prev + 10;
        });
      }, 100);
      return () => clearInterval(interval);
    } else {
      setUploadProgress(100);
    }
  }, [isUploading]);
  
  const handleFileSelect = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    onFileSelected(Array.from(files));
    setShowReplace(false);
  };
  
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };
  
  const Icon = guidance.title.toLowerCase().includes("fuel") ? Fuel : Building2;
  
  if (existingFile && !showReplace) {
    return (
      <Card className="max-w-2xl mx-auto" data-testid="card-existing-file">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Icon className="h-5 w-5 text-primary" />
            {guidance.title}
          </CardTitle>
          <CardDescription>{guidance.subtitle}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 p-4 bg-green-50/50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg">
            <div className="h-12 w-12 rounded-full bg-green-100 dark:bg-green-900/50 flex items-center justify-center">
              <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium truncate">{existingFile.fileName}</span>
                <Badge variant="secondary" className="text-xs">Uploaded</Badge>
              </div>
              <div className="flex gap-4 text-sm text-muted-foreground">
                <span>{formatFileSize(existingFile.fileSize)}</span>
                {existingFile.rowCount && (
                  <span>{existingFile.rowCount.toLocaleString()} rows</span>
                )}
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowReplace(true)}
              data-testid="button-replace-file"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Replace
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <Card className="max-w-2xl mx-auto" data-testid="card-upload-panel">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className="h-5 w-5 text-primary" />
          {guidance.title}
        </CardTitle>
        <CardDescription>{guidance.subtitle}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="text-sm text-muted-foreground">
          <p className="mb-3">{guidance.description}</p>
          <ul className="space-y-1.5">
            {guidance.bulletPoints.map((point, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="text-primary mt-1.5 h-1.5 w-1.5 rounded-full bg-current shrink-0" />
                {point}
              </li>
            ))}
          </ul>
        </div>
        
        {showBankPresets && onPresetSelect && (
          <div className="space-y-2">
            <label className="text-sm font-medium">Bank Type (for auto-mapping)</label>
            <Select value={selectedPreset} onValueChange={onPresetSelect}>
              <SelectTrigger data-testid="select-bank-type">
                <SelectValue placeholder="Select your bank (optional)" />
              </SelectTrigger>
              <SelectContent>
                {BANK_PRESETS.map(preset => (
                  <SelectItem key={preset.id} value={preset.id}>
                    {preset.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        
        <div
          className={`
            border-2 border-dashed rounded-lg p-8 text-center transition-all
            ${isDragging ? "border-primary bg-primary/5" : "border-border"}
            ${isUploading ? "pointer-events-none opacity-50" : ""}
          `}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            handleFileSelect(e.dataTransfer.files);
          }}
          data-testid="dropzone-upload"
        >
          {isUploading ? (
            <div className="space-y-4">
              <Loader2 className="h-12 w-12 mx-auto text-primary animate-spin" />
              <p className="text-sm font-medium">Uploading file...</p>
              <Progress value={uploadProgress} className="max-w-xs mx-auto" />
            </div>
          ) : (
            <>
              <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-lg font-medium mb-2">Drop your file here</p>
              <p className="text-sm text-muted-foreground mb-4">or click to browse</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={(e) => handleFileSelect(e.target.files)}
                className="hidden"
                data-testid="input-file-upload"
              />
              <div className="flex justify-center gap-2">
                <Button
                  variant="secondary"
                  onClick={() => fileInputRef.current?.click()}
                  data-testid="button-browse-files"
                >
                  Browse Files
                </Button>
                {showReplace && (
                  <Button
                    variant="ghost"
                    onClick={() => setShowReplace(false)}
                    data-testid="button-cancel-replace"
                  >
                    Cancel
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-4">
                Supported formats: Excel (.xlsx, .xls) or CSV
              </p>
            </>
          )}
        </div>
        
        <div className="flex items-start gap-2 p-3 bg-muted/50 rounded-lg">
          <Lightbulb className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
          <p className="text-xs text-muted-foreground">{guidance.hint}</p>
        </div>
      </CardContent>
    </Card>
  );
}
