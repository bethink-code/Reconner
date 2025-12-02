import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight } from "lucide-react";
import FileUploadZone from "@/components/FileUploadZone";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import type { UploadedFile } from "@shared/schema";

export default function UploadFiles() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [periodId, setPeriodId] = useState<string>("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('periodId');
    if (id) {
      setPeriodId(id);
    } else {
      setLocation('/');
    }
  }, [setLocation]);

  // Fetch existing files for this period
  const { data: existingFiles = [] } = useQuery<UploadedFile[]>({
    queryKey: ['/api/periods', periodId, 'files'],
    enabled: !!periodId,
  });

  // Find existing files by source type
  const fuelFile = existingFiles.find(f => f.sourceType === 'fuel');
  const bank1File = existingFiles.find(f => f.sourceType === 'bank1');
  const bank2File = existingFiles.find(f => f.sourceType === 'bank2');

  const uploadMutation = useMutation({
    mutationFn: async ({ file, sourceType, sourceName }: { file: File; sourceType: string; sourceName: string }) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('sourceType', sourceType);
      formData.append('sourceName', sourceName);

      const response = await fetch(`/api/periods/${periodId}/files/upload`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Upload failed');
      }

      const result = await response.json();
      return result.file as UploadedFile;
    },
    onSuccess: (uploadedFile) => {
      // Refresh the files list
      queryClient.invalidateQueries({ queryKey: ['/api/periods', periodId, 'files'] });
      toast({
        title: "File uploaded",
        description: `${uploadedFile.fileName} uploaded successfully.`,
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

  const handleFilesSelected = (source: 'fuel' | 'bank1' | 'bank2', sourceName: string) => async (files: File[]) => {
    if (!periodId) return;
    
    for (const file of files) {
      uploadMutation.mutate({
        file,
        sourceType: source,
        sourceName,
      });
    }
  };

  // Check if we have at least fuel + one bank file (from existing or newly uploaded)
  const canContinue = !!fuelFile && (!!bank1File || !!bank2File);

  const handleContinue = () => {
    setLocation(`/mapping?periodId=${periodId}`);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" size="icon" data-testid="button-back">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div className="flex-1">
              <h1 className="text-2xl font-semibold">Upload Transaction Files</h1>
              <p className="text-sm text-muted-foreground mt-1">
                {existingFiles.length > 0 
                  ? "Review or replace your uploaded files" 
                  : "Upload files from your fuel management system and bank accounts"}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {!canContinue && !uploadMutation.isPending && (
                <span className="text-xs text-muted-foreground">
                  {!fuelFile ? "Upload fuel file to continue" : "Upload at least one bank file to continue"}
                </span>
              )}
              <Button 
                onClick={handleContinue}
                disabled={!canContinue || uploadMutation.isPending}
                data-testid="button-continue"
              >
                {uploadMutation.isPending ? "Uploading..." : "Continue to Mapping"}
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        <div className="space-y-6">
          <FileUploadZone
            label="Fuel Management Transactions"
            existingFile={fuelFile ? {
              id: fuelFile.id,
              fileName: fuelFile.fileName,
              fileSize: fuelFile.fileSize,
              rowCount: fuelFile.rowCount,
              status: fuelFile.status,
              columnMapping: fuelFile.columnMapping as Record<string, string> | null,
            } : null}
            onFilesSelected={handleFilesSelected('fuel', 'Fuel Management System')}
          />

          <FileUploadZone
            label="Bank Account 1 Transactions"
            existingFile={bank1File ? {
              id: bank1File.id,
              fileName: bank1File.fileName,
              fileSize: bank1File.fileSize,
              rowCount: bank1File.rowCount,
              status: bank1File.status,
              columnMapping: bank1File.columnMapping as Record<string, string> | null,
            } : null}
            onFilesSelected={handleFilesSelected('bank1', 'Bank Account 1')}
          />

          <FileUploadZone
            label="Bank Account 2 Transactions (Optional)"
            existingFile={bank2File ? {
              id: bank2File.id,
              fileName: bank2File.fileName,
              fileSize: bank2File.fileSize,
              rowCount: bank2File.rowCount,
              status: bank2File.status,
              columnMapping: bank2File.columnMapping as Record<string, string> | null,
            } : null}
            onFilesSelected={handleFilesSelected('bank2', 'Bank Account 2')}
          />
        </div>
      </main>
    </div>
  );
}
