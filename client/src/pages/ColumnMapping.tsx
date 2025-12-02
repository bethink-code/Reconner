import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, ArrowRight, CheckCircle2, AlertCircle, Sparkles, Info, Eye, CreditCard, Banknote } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { UploadedFile } from "@shared/schema";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type NormalizedTransaction = {
  transactionDate: string;
  transactionTime: string;
  amount: string;
  referenceNumber: string;
  description: string;
  cardNumber: string;
  paymentType: string;
  isCardTransaction: 'yes' | 'no' | 'unknown';
};

type FilePreview = {
  headers: string[];
  rows: Record<string, unknown>[];
  totalRows: number;
  suggestedMappings: Record<string, string>;
  currentMapping: Record<string, string> | null;
  detectedPreset: { name: string; description: string } | null;
  columnLabels: Record<string, string>;
  normalizedPreview: NormalizedTransaction[];
};

function FileMappingCard({ file }: { file: UploadedFile }) {
  const { toast } = useToast();
  const [columnMappings, setColumnMappings] = useState<Record<string, string>>({});
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

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

  // Helper to get display label for a column
  const getColumnDisplayLabel = (header: string) => {
    if (preview?.columnLabels && preview.columnLabels[header] !== header) {
      return preview.columnLabels[header];
    }
    return null;
  };

  // Helper to get sample values formatted nicely
  const getSampleValues = (header: string, headerIndex: number) => {
    if (!preview?.rows) return '';
    const samples = preview.rows
      .slice(0, 3)
      .map(row => {
        // Row is an object keyed by header name
        const rowObj = row as Record<string, unknown>;
        const val = rowObj[header];
        if (val === null || val === undefined || val === '') return null;
        return String(val).substring(0, 30);
      })
      .filter(Boolean);
    return samples.length > 0 ? samples.join(' | ') : '(empty)';
  };

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
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-lg">
              {file.sourceName} - {file.fileName}
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Map detected columns to required fields ({preview.totalRows} rows)
            </p>
          </div>
          {preview.detectedPreset && (
            <Badge variant="secondary" className="flex items-center gap-1 whitespace-nowrap">
              <Sparkles className="h-3 w-3" />
              {preview.detectedPreset.name} detected
            </Badge>
          )}
        </div>
        {preview.detectedPreset && (
          <p className="text-xs text-muted-foreground mt-2 bg-muted/50 p-2 rounded">
            Auto-configured for {preview.detectedPreset.description}. Review and adjust if needed.
          </p>
        )}
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="grid grid-cols-[1fr_150px_1fr] gap-4 pb-2 border-b text-sm font-semibold">
            <div>Column</div>
            <div>Map To</div>
            <div>Sample Values</div>
          </div>

          {preview.headers.map((header, index) => {
            const displayLabel = getColumnDisplayLabel(header);
            const sampleValues = getSampleValues(header, index);
            
            return (
              <div 
                key={header} 
                className="grid grid-cols-[1fr_150px_1fr] gap-4 items-center py-1 hover:bg-muted/30 rounded px-1 -mx-1" 
                data-testid={`row-mapping-${index}`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate" title={header}>
                      {header}
                    </span>
                    {displayLabel && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs">
                          <p className="text-xs">{displayLabel}</p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                  {displayLabel && (
                    <p className="text-xs text-muted-foreground truncate" title={displayLabel}>
                      {displayLabel}
                    </p>
                  )}
                </div>
                <Select 
                  value={columnMappings[header] || ""} 
                  onValueChange={(value) => handleMappingChange(header, value)}
                  disabled={isConfirmed}
                >
                  <SelectTrigger data-testid={`select-mapping-${index}`} className="h-9">
                    <SelectValue placeholder="Select field" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="date">Date</SelectItem>
                    <SelectItem value="time">Time</SelectItem>
                    <SelectItem value="amount">Amount</SelectItem>
                    <SelectItem value="reference">Reference</SelectItem>
                    <SelectItem value="description">Description</SelectItem>
                    <SelectItem value="cardNumber">Card Number</SelectItem>
                    <SelectItem value="paymentType">Payment Type</SelectItem>
                    <SelectItem value="ignore">Ignore</SelectItem>
                  </SelectContent>
                </Select>
                <div 
                  className="text-xs text-muted-foreground font-mono truncate bg-muted/30 px-2 py-1 rounded" 
                  title={sampleValues}
                >
                  {sampleValues}
                </div>
              </div>
            );
          })}

          {/* Preview Panel - Show how normalized transactions will look */}
          {hasAllRequired && preview.normalizedPreview && preview.normalizedPreview.length > 0 && (
            <Collapsible open={showPreview} onOpenChange={setShowPreview} className="pt-4 border-t">
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="w-full justify-start gap-2" data-testid={`button-preview-toggle-${file.id}`}>
                  <Eye className="h-4 w-4" />
                  {showPreview ? "Hide" : "Show"} Normalized Preview
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-3">
                <div className="border rounded-md overflow-hidden">
                  <div className="bg-muted/50 p-2 text-xs font-medium text-muted-foreground">
                    Preview of how transactions will be imported (showing first 3 rows):
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/30">
                        <tr>
                          <th className="p-2 text-left font-medium">Date</th>
                          <th className="p-2 text-left font-medium">Time</th>
                          <th className="p-2 text-right font-medium">Amount</th>
                          <th className="p-2 text-left font-medium">Reference</th>
                          <th className="p-2 text-left font-medium">Card #</th>
                          <th className="p-2 text-left font-medium">Description</th>
                          <th className="p-2 text-left font-medium">Type</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.normalizedPreview.slice(0, 3).map((tx, idx) => {
                          const isCard = tx.isCardTransaction === 'yes';
                          const isCash = tx.isCardTransaction === 'no';
                          
                          return (
                            <tr key={idx} className="border-t border-muted/30">
                              <td className="p-2 font-mono">{tx.transactionDate || '-'}</td>
                              <td className="p-2 font-mono">{tx.transactionTime || '-'}</td>
                              <td className="p-2 text-right font-mono">R {tx.amount || '0.00'}</td>
                              <td className="p-2 font-mono truncate max-w-[100px]" title={tx.referenceNumber}>{tx.referenceNumber || '-'}</td>
                              <td className="p-2 font-mono text-xs truncate max-w-[80px]" title={tx.cardNumber}>{tx.cardNumber || '-'}</td>
                              <td className="p-2 truncate max-w-[150px]" title={tx.description}>{tx.description || '-'}</td>
                              <td className="p-2">
                                <div className="flex items-center gap-1">
                                  {isCard && (
                                    <>
                                      <CreditCard className="h-3 w-3 text-green-600" />
                                      <span className="text-green-600">Card</span>
                                    </>
                                  )}
                                  {isCash && (
                                    <>
                                      <Banknote className="h-3 w-3 text-amber-600" />
                                      <span className="text-amber-600">Cash</span>
                                    </>
                                  )}
                                  {!isCard && !isCash && (
                                    <span className="text-muted-foreground">Unknown</span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="bg-muted/30 p-2 text-xs text-muted-foreground">
                    {file.sourceType === 'fuel' ? (
                      <span>
                        <CreditCard className="h-3 w-3 inline mr-1 text-green-600" />
                        Card transactions will be matched with bank records. 
                        <Banknote className="h-3 w-3 inline ml-2 mr-1 text-amber-600" />
                        Cash/Unknown transactions will appear in reports but won't be matched.
                      </span>
                    ) : (
                      <span>All bank transactions are considered card payments and will be matched with fuel card transactions.</span>
                    )}
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}

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
