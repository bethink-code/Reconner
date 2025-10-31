import { useState } from "react";
import { Upload, File, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

interface UploadedFile {
  id: string;
  name: string;
  size: number;
  progress: number;
  status: "uploading" | "complete" | "error";
}

interface FileUploadZoneProps {
  label: string;
  accept?: string;
  onFilesSelected?: (files: File[]) => void;
}

export default function FileUploadZone({ label, accept = ".csv,.xlsx,.xls", onFilesSelected }: FileUploadZoneProps) {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  const handleFileSelect = (selectedFiles: FileList | null) => {
    if (!selectedFiles) return;

    const newFiles: UploadedFile[] = Array.from(selectedFiles).map((file, idx) => ({
      id: `${Date.now()}-${idx}`,
      name: file.name,
      size: file.size,
      progress: 0,
      status: "uploading" as const,
    }));

    setFiles((prev) => [...prev, ...newFiles]);

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

  return (
    <div className="space-y-4">
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
          Drag and drop your file here, or click to browse
        </p>
        <input
          type="file"
          accept={accept}
          multiple
          onChange={(e) => handleFileSelect(e.target.files)}
          className="hidden"
          id={`file-input-${label}`}
          data-testid={`input-file-${label.toLowerCase().replace(/\s/g, '-')}`}
        />
        <label htmlFor={`file-input-${label}`}>
          <Button type="button" variant="secondary" asChild>
            <span>Browse Files</span>
          </Button>
        </label>
        <p className="text-xs text-muted-foreground mt-2">
          Supported formats: CSV, Excel (.xlsx, .xls)
        </p>
      </div>

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
