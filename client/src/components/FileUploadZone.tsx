import { useState, useEffect, useRef } from "react";
import { Upload, File, X, CheckCircle2, RefreshCw, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";

interface LocalUploadedFile {
  id: string;
  name: string;
  size: number;
  progress: number;
  status: "uploading" | "complete" | "error";
}

interface ExistingFile {
  id: string;
  fileName: string;
  fileSize: number;
  rowCount: number | null;
  status: string;
  columnMapping: Record<string, string> | null;
}

interface FileUploadZoneProps {
  label: string;
  accept?: string;
  existingFile?: ExistingFile | null;
  onFilesSelected?: (files: File[]) => void;
}

export default function FileUploadZone({ label, accept = ".csv,.xlsx,.xls,.pdf", existingFile, onFilesSelected }: FileUploadZoneProps) {
  const [files, setFiles] = useState<LocalUploadedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [showReplaceUpload, setShowReplaceUpload] = useState(false);
  const prevExistingFileId = useRef<string | null>(null);

  // Reset local state when existingFile changes (after successful upload/refetch)
  useEffect(() => {
    if (existingFile && existingFile.id !== prevExistingFileId.current) {
      // File was uploaded/replaced successfully, reset local upload state
      setFiles([]);
      setShowReplaceUpload(false);
      prevExistingFileId.current = existingFile.id;
    }
  }, [existingFile]);

  const handleFileSelect = (selectedFiles: FileList | null) => {
    if (!selectedFiles) return;

    const newFiles: LocalUploadedFile[] = Array.from(selectedFiles).map((file, idx) => ({
      id: `${Date.now()}-${idx}`,
      name: file.name,
      size: file.size,
      progress: 0,
      status: "uploading" as const,
    }));

    setFiles(newFiles); // Replace files, not append
    setShowReplaceUpload(false);

    // Simulate upload progress
    newFiles.forEach((file, idx) => {
      setTimeout(() => {
        let progress = 0;
        const interval = setInterval(() => {
          progress += 10;
          setFiles((prev) =>
            prev.map((f) =>
              f.id === file.id
                ? { ...f, progress, status: progress >= 100 ? "complete" : "uploading" }
                : f
            )
          );
          if (progress >= 100) clearInterval(interval);
        }, 100);
      }, idx * 200);
    });

    if (onFilesSelected) {
      onFilesSelected(Array.from(selectedFiles));
    }
  };

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  // Show existing file card if we have one and no active upload
  const showExistingFile = existingFile && files.length === 0 && !showReplaceUpload;

  return (
    <div className="space-y-4">
      {/* Show existing file info */}
      {showExistingFile && (
        <Card className="p-4 border-[#166534]/20 dark:border-emerald-800 bg-[#DCFCE7]/50 dark:bg-emerald-950/20" data-testid={`existing-file-${existingFile.id}`}>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-[#DCFCE7] dark:bg-emerald-950/30 flex items-center justify-center flex-shrink-0">
              <CheckCircle2 className="h-5 w-5 text-[#166534] dark:text-emerald-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-sm font-medium">{label}</h3>
                <Badge variant="secondary" className="text-xs">Uploaded</Badge>
              </div>
              <div className="flex items-center gap-2">
                <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                <p className="text-sm text-muted-foreground truncate" title={existingFile.fileName}>
                  {existingFile.fileName}
                </p>
              </div>
              <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                <span>{formatFileSize(existingFile.fileSize)}</span>
                {existingFile.rowCount && <span>{existingFile.rowCount.toLocaleString()} rows</span>}
                {existingFile.columnMapping && (
                  <Badge variant="outline" className="text-xs py-0">Mapped</Badge>
                )}
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowReplaceUpload(true)}
              data-testid={`button-replace-${existingFile.id}`}
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Replace
            </Button>
          </div>
        </Card>
      )}

      {/* Show upload zone if no existing file or replacing */}
      {(!existingFile || showReplaceUpload) && (
        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
            isDragging ? "border-primary bg-primary/5" : "border-border"
          }`}
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
          data-testid={`dropzone-${label.toLowerCase().replace(/\s/g, '-')}`}
        >
          <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">{label}</h3>
          <p className="text-sm text-muted-foreground mb-4">
            {showReplaceUpload ? "Upload a new file to replace the existing one" : "Drag and drop your file here, or click to browse"}
          </p>
          <input
            type="file"
            accept={accept}
            onChange={(e) => handleFileSelect(e.target.files)}
            className="hidden"
            id={`file-input-${label}`}
            data-testid={`input-file-${label.toLowerCase().replace(/\s/g, '-')}`}
          />
          <div className="flex items-center justify-center gap-2">
            <label htmlFor={`file-input-${label}`}>
              <Button type="button" variant="secondary" asChild>
                <span>Browse Files</span>
              </Button>
            </label>
            {showReplaceUpload && (
              <Button type="button" variant="ghost" onClick={() => setShowReplaceUpload(false)}>
                Cancel
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Supported formats: CSV, Excel (.xlsx, .xls), PDF
          </p>
        </div>
      )}

      {/* Show uploading files */}
      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((file) => (
            <Card key={file.id} className="p-4" data-testid={`file-card-${file.id}`}>
              <div className="flex items-center gap-3">
                <File className="h-5 w-5 text-primary flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <p className="text-sm font-medium truncate">{file.name}</p>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatFileSize(file.size)}
                    </span>
                  </div>
                  {file.status === "uploading" && (
                    <Progress value={file.progress} className="h-2" />
                  )}
                  {file.status === "complete" && (
                    <p className="text-xs text-chart-2">Upload complete</p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeFile(file.id)}
                  data-testid={`button-remove-${file.id}`}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
