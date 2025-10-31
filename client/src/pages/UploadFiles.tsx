import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight } from "lucide-react";
import FileUploadZone from "@/components/FileUploadZone";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import type { UploadedFile } from "@shared/schema";

export default function UploadFiles() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [periodId, setPeriodId] = useState<string>("");
  const [uploadedFileIds, setUploadedFileIds] = useState<{
    fuel: string[];
    bank1: string[];
    bank2: string[];
  }>({
    fuel: [],
    bank1: [],
    bank2: [],
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('periodId');
    if (id) {
      setPeriodId(id);
    } else {
      setLocation('/');
    }
  }, [setLocation]);

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
    onSuccess: (uploadedFile, variables) => {
      const sourceKey = variables.sourceType as 'fuel' | 'bank1' | 'bank2';
      setUploadedFileIds(prev => ({
        ...prev,
        [sourceKey]: [...prev[sourceKey], uploadedFile.id],
      }));
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

  const canContinue = uploadedFileIds.fuel.length > 0 && 
    (uploadedFileIds.bank1.length > 0 || uploadedFileIds.bank2.length > 0);

  const handleContinue = () => {
    setLocation(`/mapping?periodId=${periodId}`);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center gap-4">
            <Link href="/create">
              <Button variant="ghost" size="icon" data-testid="button-back">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div className="flex-1">
              <h1 className="text-2xl font-semibold">Upload Transaction Files</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Upload files from your fuel management system and bank accounts
              </p>
            </div>
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
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        <div className="space-y-6">
          <FileUploadZone
            label="Upload Fuel Management Transactions"
            onFilesSelected={handleFilesSelected('fuel', 'Fuel Management System')}
          />

          <FileUploadZone
            label="Upload Bank Account 1 Transactions"
            onFilesSelected={handleFilesSelected('bank1', 'Bank Account 1')}
          />

          <FileUploadZone
            label="Upload Bank Account 2 Transactions (Optional)"
            onFilesSelected={handleFilesSelected('bank2', 'Bank Account 2')}
          />
        </div>
      </main>
    </div>
  );
}
