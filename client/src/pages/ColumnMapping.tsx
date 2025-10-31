import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, ArrowRight, CheckCircle2, AlertCircle } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { UploadedFile } from "@shared/schema";

type FilePreview = {
  headers: string[];
  rows: any[][];
  totalRows: number;
  suggestedMappings: Record<string, string>;
  currentMapping: Record<string, string> | null;
};

function FileMappingCard({ file }: { file: UploadedFile }) {
  const { toast } = useToast();
  const [columnMappings, setColumnMappings] = useState<Record<string, string>>({});
  const [isConfirmed, setIsConfirmed] = useState(false);

  const { data: preview, isLoading } = useQuery<FilePreview>({
    queryKey: ['/api/files', file.id, 'preview'],
  });

  useEffect(() => {
    if (preview) {
      setColumnMappings(preview.currentMapping || preview.suggestedMappings);
    }
  }, [preview]);

  const saveColumnMappingMutation = useMutation({
    mutationFn: async (columnMapping: Record<string, string>) => {
      const response = await apiRequest("POST", `/api/files/${file.id}/column-mapping`, { columnMapping });
      return await response.json();
    },
    onSuccess: async () => {
      setIsConfirmed(true);
      await queryClient.invalidateQueries({ queryKey: ['/api/periods', file.periodId, 'files'] });
      toast({
        title: "Mapping saved",
        description: `Column mapping for ${file.fileName} has been saved.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to save mapping",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleMappingChange = (header: string, value: string) => {
    setColumnMappings(prev => ({ ...prev, [header]: value }));
  };

  const handleConfirm = () => {
    saveColumnMappingMutation.mutate(columnMappings);
  };

  const requiredFields = ["date", "amount", "reference"];
  const mappedFields = Object.values(columnMappings).filter(v => v !== "ignore" && v !== "");
  const hasAllRequired = requiredFields.every(field => mappedFields.includes(field));

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{file.sourceName} - {file.fileName}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Loading preview...</p>
        </CardContent>
      </Card>
    );
  }

  if (!preview) {
    return null;
  }

  return (
    <Card data-testid={`card-mapping-${file.id}`}>
      <CardHeader>
        <CardTitle className="text-lg">
          {file.sourceName} - {file.fileName}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Map detected columns to required fields ({preview.totalRows} rows)
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4 pb-2 border-b text-sm font-semibold">
            <div>Detected Column</div>
            <div>Map To</div>
            <div>Sample Data</div>
          </div>

          {preview.headers.map((header, index) => (
            <div key={header} className="grid grid-cols-3 gap-4 items-start" data-testid={`row-mapping-${index}`}>
              <div className="text-sm font-medium pt-2">{header}</div>
              <Select 
                value={columnMappings[header] || ""} 
                onValueChange={(value) => handleMappingChange(header, value)}
                disabled={isConfirmed}
              >
                <SelectTrigger data-testid={`select-mapping-${index}`}>
                  <SelectValue placeholder="Select field" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="date">Date</SelectItem>
                  <SelectItem value="amount">Amount</SelectItem>
                  <SelectItem value="reference">Reference</SelectItem>
                  <SelectItem value="description">Description</SelectItem>
                  <SelectItem value="ignore">Ignore</SelectItem>
                </SelectContent>
              </Select>
              <div className="text-sm text-muted-foreground font-mono">
                {preview.rows.slice(0, 2).map(row => row[index]).join(", ")}...
              </div>
            </div>
          ))}

          <div className="flex items-center justify-between pt-4 border-t">
            <div className="flex items-center gap-2 text-sm">
              {hasAllRequired ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span className="text-green-600">All required fields mapped</span>
                </>
              ) : (
                <>
                  <AlertCircle className="h-4 w-4 text-amber-600" />
                  <span className="text-amber-600">Map date, amount, and reference fields</span>
                </>
              )}
            </div>
            <Button 
              onClick={handleConfirm}
              disabled={!hasAllRequired || isConfirmed || saveColumnMappingMutation.isPending}
              data-testid={`button-confirm-mapping-${file.id}`}
            >
              {isConfirmed ? "Mapping Confirmed" : saveColumnMappingMutation.isPending ? "Saving..." : "Confirm Mapping"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ColumnMapping() {
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

  const { data: files = [], isLoading } = useQuery<UploadedFile[]>({
    queryKey: ['/api/periods', periodId, 'files'],
    enabled: !!periodId,
  });

  const processFileMutation = useMutation({
    mutationFn: async (fileId: string) => {
      const response = await apiRequest("POST", `/api/files/${fileId}/process`, {});
      return await response.json();
    },
  });

  const allFilesMapped = files.every(f => f.status === 'mapped' || f.status === 'processed');
  const canContinue = files.length > 0 && allFilesMapped;

  const handleContinue = async () => {
    try {
      for (const file of files) {
        if (file.status === 'mapped') {
          await processFileMutation.mutateAsync(file.id);
        }
      }
      
      await queryClient.invalidateQueries({ queryKey: ['/api/periods', periodId, 'files'] });
      toast({
        title: "Files processed",
        description: "All files have been processed. Starting reconciliation...",
      });
      setLocation(`/reconcile?periodId=${periodId}`);
    } catch (error) {
      toast({
        title: "Processing failed",
        description: error instanceof Error ? error.message : "Failed to process files",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center gap-4">
            <Link href={`/upload?periodId=${periodId}`}>
              <Button variant="ghost" size="icon" data-testid="button-back">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div className="flex-1">
              <h1 className="text-2xl font-semibold">Map Data Columns</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Confirm field mappings for uploaded files
              </p>
            </div>
            <Button 
              onClick={handleContinue}
              disabled={!canContinue || processFileMutation.isPending}
              data-testid="button-start-reconciliation"
            >
              {processFileMutation.isPending ? "Processing..." : "Start Reconciliation"}
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {isLoading ? (
          <p className="text-muted-foreground">Loading files...</p>
        ) : files.length === 0 ? (
          <p className="text-muted-foreground">No files uploaded yet.</p>
        ) : (
          <div className="space-y-6">
            {files.map(file => (
              <FileMappingCard key={file.id} file={file} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
