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
import { ArrowLeft, ArrowRight, CheckCircle2, AlertCircle, Sparkles, Info, Eye, CreditCard, Banknote, Check, X } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
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

type DuplicateError = {
  field: string;
  columns: string[];
};

type MappingConflict = {
  field: string;
  columns: string[];
};

type ColumnQuality = {
  column: string;
  validCount: number;
  headerCount: number;
  emptyCount: number;
  recommendation: 'RECOMMENDED' | 'ACCEPTABLE' | 'NOT_RECOMMENDED';
  reason: string;
  sampleValues: string[];
};

function detectMappingConflicts(
  columnMapping: Record<string, string>
): MappingConflict[] {
  const fieldToColumns: Record<string, string[]> = {};
  
  for (const [column, field] of Object.entries(columnMapping)) {
    if (field === 'ignore' || field === '') continue;
    
    if (!fieldToColumns[field]) {
      fieldToColumns[field] = [];
    }
    fieldToColumns[field].push(column);
  }
  
  return Object.entries(fieldToColumns)
    .filter(([_, columns]) => columns.length > 1)
    .map(([field, columns]) => ({ field, columns }));
}

function analyzeColumnQuality(
  column: string,
  sampleRows: Record<string, unknown>[],
  field: string
): ColumnQuality {
  const values = sampleRows.map(row => row[column]);
  
  let validCount = 0;
  let headerCount = 0;
  let emptyCount = 0;
  const sampleValues: string[] = [];
  
  for (const val of values) {
    const str = String(val ?? '').trim();
    
    if (sampleValues.length < 5) {
      sampleValues.push(str || '(empty)');
    }
    
    if (!str) {
      emptyCount++;
      continue;
    }
    
    const headerKeywords = [
      'Date', 'Time', 'Date / Time', 'Amount', 
      'Reference', 'Description', 'Invoice', 'Card Number',
      'Transaction Date', 'Transaction Time', 'Ref', 'Ref No',
      'Card No', 'Card', 'Value', 'Total'
    ];
    const normalizedStr = str.toLowerCase();
    if (headerKeywords.some(h => h.toLowerCase() === normalizedStr)) {
      headerCount++;
      continue;
    }
    
    let isValid = false;
    switch (field) {
      case 'date':
        isValid = /^\d{4,5}(\.\d+)?$/.test(str) || 
                  /^\d{4}-\d{2}-\d{2}/.test(str) || 
                  /^\d{1,2}[\/\-]\d{1,2}/.test(str) ||
                  /^\d{1,2}\s+\w{3}/.test(str) ||
                  /^\w{3}\s+\d{1,2}/.test(str);
        break;
        
      case 'time':
        isValid = /^\d{1,2}:\d{2}(:\d{2})?/.test(str) ||
                  /^\d{4,5}(?:\.\d+)?$/.test(str);
        break;
        
      case 'amount':
        isValid = /^[R$€£]?\s?-?[\d,\s]+\.?\d*$/.test(str) ||
                  /^-?\d+([.,]\d+)?$/.test(str);
        break;
        
      case 'reference':
      case 'description':
        isValid = str.length > 0 && !headerKeywords.some(h => h.toLowerCase() === normalizedStr);
        break;
        
      case 'cardNumber':
        isValid = /^\*{4}\d{4}$/.test(str) || 
                  /^\d{4,19}$/.test(str) ||
                  /^\d{4}\s?\*+\s?\d{4}$/.test(str);
        break;
        
      case 'paymentType':
        isValid = str.length > 0;
        break;
        
      default:
        isValid = true;
    }
    
    if (isValid) {
      validCount++;
    }
  }
  
  const totalNonEmpty = values.length - emptyCount;
  const validPercent = totalNonEmpty > 0 ? (validCount / totalNonEmpty) * 100 : 0;
  
  let recommendation: ColumnQuality['recommendation'];
  let reason: string;
  
  if (validPercent > 80 && headerCount === 0) {
    recommendation = 'RECOMMENDED';
    reason = `${validPercent.toFixed(0)}% valid data`;
  } else if (validPercent > 50) {
    recommendation = 'ACCEPTABLE';
    reason = headerCount > 0 
      ? `${validPercent.toFixed(0)}% valid, ${headerCount} header rows` 
      : `${validPercent.toFixed(0)}% valid data`;
  } else {
    recommendation = 'NOT_RECOMMENDED';
    reason = headerCount > 0 
      ? `Only ${validPercent.toFixed(0)}% valid, ${headerCount} headers found` 
      : `Only ${validPercent.toFixed(0)}% valid data`;
  }
  
  return {
    column,
    validCount,
    headerCount,
    emptyCount,
    recommendation,
    reason,
    sampleValues
  };
}

function getFieldLabel(field: string): string {
  const labels: Record<string, string> = {
    date: "Date",
    time: "Time",
    amount: "Amount",
    reference: "Reference",
    description: "Description",
    cardNumber: "Card Number",
    paymentType: "Payment Type",
  };
  return labels[field] || field;
}

interface ConflictResolutionModalProps {
  open: boolean;
  conflicts: MappingConflict[];
  sampleRows: Record<string, unknown>[];
  onResolve: (resolutions: Record<string, string>) => void;
  onCancel: () => void;
}

function ConflictResolutionModal({
  open,
  conflicts,
  sampleRows,
  onResolve,
  onCancel
}: ConflictResolutionModalProps) {
  const [resolutions, setResolutions] = useState<Record<string, string>>({});
  
  useEffect(() => {
    if (open) {
      const autoResolutions: Record<string, string> = {};
      for (const conflict of conflicts) {
        const analyses = conflict.columns.map(col => 
          analyzeColumnQuality(col, sampleRows, conflict.field)
        );
        const recommended = analyses.find(a => a.recommendation === 'RECOMMENDED')?.column ||
                            analyses.sort((a, b) => b.validCount - a.validCount)[0]?.column;
        if (recommended) {
          autoResolutions[conflict.field] = recommended;
        }
      }
      setResolutions(autoResolutions);
    }
  }, [open, conflicts, sampleRows]);
  
  const allResolved = conflicts.every(c => resolutions[c.field]);
  
  const handleApply = () => {
    onResolve(resolutions);
  };
  
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" data-testid="dialog-conflict-resolution">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-amber-500" />
            Resolve Mapping Conflicts
          </DialogTitle>
          <DialogDescription>
            Multiple columns are mapped to the same field. We've analyzed your data to recommend the best column for each field.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          {conflicts.map((conflict) => {
            const analyses = conflict.columns.map(col => 
              analyzeColumnQuality(col, sampleRows, conflict.field)
            );
            const recommended = analyses.find(a => a.recommendation === 'RECOMMENDED')?.column ||
                                analyses.sort((a, b) => b.validCount - a.validCount)[0]?.column;
            
            return (
              <div key={conflict.field} className="space-y-3">
                <h3 className="font-semibold text-lg">
                  {getFieldLabel(conflict.field)} Field
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {analyses.map(analysis => {
                    const isRecommended = analysis.column === recommended;
                    const isSelected = resolutions[conflict.field] === analysis.column;
                    
                    return (
                      <Card 
                        key={analysis.column}
                        className={`cursor-pointer transition-all ${
                          isSelected 
                            ? 'ring-2 ring-primary border-primary' 
                            : isRecommended 
                              ? 'border-green-500/50' 
                              : ''
                        }`}
                        onClick={() => setResolutions(prev => ({ ...prev, [conflict.field]: analysis.column }))}
                        data-testid={`card-column-option-${analysis.column}`}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <span className="font-medium truncate" title={analysis.column}>
                                {analysis.column}
                              </span>
                              {isRecommended && (
                                <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
                                  Recommended
                                </Badge>
                              )}
                            </div>
                            {isSelected && (
                              <div className="h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                                <Check className="h-3 w-3 text-primary-foreground" />
                              </div>
                            )}
                          </div>
                          
                          <div className="space-y-3">
                            <div>
                              <p className="text-xs text-muted-foreground mb-1">Sample data:</p>
                              <div className="bg-muted/50 rounded p-2 font-mono text-xs max-h-20 overflow-y-auto">
                                {analysis.sampleValues.slice(0, 3).map((val, i) => (
                                  <div key={i} className="truncate" title={val}>{val}</div>
                                ))}
                              </div>
                            </div>
                            
                            <div className="grid grid-cols-3 gap-2 text-xs">
                              <div className="bg-muted/30 rounded p-2 text-center">
                                <div className="font-semibold text-green-600">{analysis.validCount}</div>
                                <div className="text-muted-foreground">Valid</div>
                              </div>
                              <div className="bg-muted/30 rounded p-2 text-center">
                                <div className="font-semibold text-amber-600">{analysis.headerCount}</div>
                                <div className="text-muted-foreground">Headers</div>
                              </div>
                              <div className="bg-muted/30 rounded p-2 text-center">
                                <div className="font-semibold text-muted-foreground">{analysis.emptyCount}</div>
                                <div className="text-muted-foreground">Empty</div>
                              </div>
                            </div>
                            
                            <Alert 
                              className={`py-2 ${
                                analysis.recommendation === 'RECOMMENDED' 
                                  ? 'border-green-500/50 bg-green-50 dark:bg-green-950' 
                                  : analysis.recommendation === 'ACCEPTABLE'
                                    ? 'border-blue-500/50 bg-blue-50 dark:bg-blue-950'
                                    : 'border-red-500/50 bg-red-50 dark:bg-red-950'
                              }`}
                            >
                              <AlertDescription className={`text-xs ${
                                analysis.recommendation === 'RECOMMENDED' 
                                  ? 'text-green-700 dark:text-green-300' 
                                  : analysis.recommendation === 'ACCEPTABLE'
                                    ? 'text-blue-700 dark:text-blue-300'
                                    : 'text-red-700 dark:text-red-300'
                              }`}>
                                {analysis.reason}
                              </AlertDescription>
                            </Alert>
                            
                            <Button 
                              variant={isSelected ? "default" : "outline"}
                              size="sm"
                              className="w-full"
                              onClick={(e) => {
                                e.stopPropagation();
                                setResolutions(prev => ({ ...prev, [conflict.field]: analysis.column }));
                              }}
                              data-testid={`button-select-column-${analysis.column}`}
                            >
                              {isSelected ? (
                                <>
                                  <Check className="h-4 w-4 mr-1" />
                                  Selected
                                </>
                              ) : (
                                'Use This Column'
                              )}
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onCancel} data-testid="button-cancel-resolution">
            Cancel
          </Button>
          <Button 
            onClick={handleApply}
            disabled={!allResolved}
            data-testid="button-apply-resolution"
          >
            Apply and Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FileMappingCard({ file }: { file: UploadedFile }) {
  const { toast } = useToast();
  const [columnMappings, setColumnMappings] = useState<Record<string, string>>({});
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [duplicateErrors, setDuplicateErrors] = useState<DuplicateError[]>([]);
  const [showConflictModal, setShowConflictModal] = useState(false);
  const [conflicts, setConflicts] = useState<MappingConflict[]>([]);

  const { data: preview, isLoading } = useQuery<FilePreview>({
    queryKey: ['/api/files', file.id, 'preview'],
  });

  useEffect(() => {
    if (preview) {
      setColumnMappings(preview.currentMapping || preview.suggestedMappings);
    }
  }, [preview]);

  const getColumnsWithErrors = (): Set<string> => {
    const errorColumns = new Set<string>();
    duplicateErrors.forEach(err => {
      err.columns.forEach(col => errorColumns.add(col));
    });
    return errorColumns;
  };

  const getFieldLabelLocal = (field: string): string => {
    const labels: Record<string, string> = {
      date: "Date",
      time: "Time",
      amount: "Amount",
      reference: "Reference",
      description: "Description",
      cardNumber: "Card Number",
      paymentType: "Payment Type",
    };
    return labels[field] || field;
  };

  const saveColumnMappingMutation = useMutation({
    mutationFn: async (columnMapping: Record<string, string>) => {
      const response = await fetch(`/api/files/${file.id}/column-mapping`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ columnMapping }),
        credentials: "include",
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        if (errorData.duplicates) {
          throw { isDuplicateError: true, duplicates: errorData.duplicates };
        }
        throw new Error(errorData.message || errorData.error || "Failed to save mapping");
      }
      return await response.json();
    },
    onSuccess: async () => {
      setIsConfirmed(true);
      setDuplicateErrors([]);
      await queryClient.invalidateQueries({ queryKey: ['/api/periods', file.periodId, 'files'] });
      toast({
        title: "Mapping saved",
        description: `Column mapping for ${file.fileName} has been saved.`,
      });
    },
    onError: (error: unknown) => {
      if (typeof error === 'object' && error !== null && 'isDuplicateError' in error) {
        const dupError = error as { isDuplicateError: boolean; duplicates: DuplicateError[] };
        setDuplicateErrors(dupError.duplicates);
        const fieldNames = dupError.duplicates.map(d => getFieldLabelLocal(d.field)).join(", ");
        toast({
          title: "Duplicate mappings found",
          description: `Each field can only be mapped to ONE column. Please fix: ${fieldNames}`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Failed to save mapping",
          description: error instanceof Error ? error.message : "Unknown error",
          variant: "destructive",
        });
      }
    },
  });

  const handleMappingChange = (header: string, value: string) => {
    setColumnMappings(prev => ({ ...prev, [header]: value }));
  };

  const handleConfirm = () => {
    const detectedConflicts = detectMappingConflicts(columnMappings);
    
    if (detectedConflicts.length > 0) {
      setConflicts(detectedConflicts);
      setShowConflictModal(true);
    } else {
      saveColumnMappingMutation.mutate(columnMappings);
    }
  };

  const handleResolveConflicts = (resolutions: Record<string, string>) => {
    const updatedMappings = { ...columnMappings };
    
    for (const [field, chosenColumn] of Object.entries(resolutions)) {
      const conflictingColumns = Object.keys(updatedMappings).filter(
        col => updatedMappings[col] === field
      );
      
      for (const col of conflictingColumns) {
        if (col !== chosenColumn) {
          updatedMappings[col] = 'ignore';
        }
      }
    }
    
    setColumnMappings(updatedMappings);
    setShowConflictModal(false);
    saveColumnMappingMutation.mutate(updatedMappings);
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
            const errorColumns = getColumnsWithErrors();
            const hasError = errorColumns.has(header);
            const errorForColumn = duplicateErrors.find(e => e.columns.includes(header));
            
            return (
              <div 
                key={header} 
                className={`grid grid-cols-[1fr_150px_1fr] gap-4 items-center py-2 rounded px-2 -mx-2 transition-colors ${
                  hasError 
                    ? "bg-destructive/10 border border-destructive/50" 
                    : "hover:bg-muted/30"
                }`}
                data-testid={`row-mapping-${index}`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {hasError && <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0" />}
                    <span className={`text-sm font-medium truncate ${hasError ? "text-destructive" : ""}`} title={header}>
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
                  {hasError && errorForColumn && (
                    <p className="text-xs text-destructive mt-1">
                      "{getFieldLabel(errorForColumn.field)}" is also mapped to: {errorForColumn.columns.filter(c => c !== header).join(", ")}
                    </p>
                  )}
                </div>
                <Select 
                  value={columnMappings[header] || ""} 
                  onValueChange={(value) => {
                    handleMappingChange(header, value);
                    if (hasError) setDuplicateErrors([]);
                  }}
                  disabled={isConfirmed}
                >
                  <SelectTrigger 
                    data-testid={`select-mapping-${index}`} 
                    className={`h-9 ${hasError ? "border-destructive ring-destructive/20" : ""}`}
                  >
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
      
      {showConflictModal && (
        <ConflictResolutionModal
          open={showConflictModal}
          conflicts={conflicts}
          sampleRows={preview?.rows || []}
          onResolve={handleResolveConflicts}
          onCancel={() => setShowConflictModal(false)}
        />
      )}
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
