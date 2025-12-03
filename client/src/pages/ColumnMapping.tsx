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

import { Calendar, Clock, DollarSign, Hash, FileText, CreditCard as CreditCardIcon, Tag } from "lucide-react";

// Field metadata with friendly names and explanations
const FIELD_METADATA: Record<string, { 
  title: string; 
  description: string; 
  matchTip: string;
  IconComponent: typeof Calendar;
}> = {
  date: {
    title: "Transaction Date",
    description: "When the transaction happened. This is essential for matching payments between your fuel system and bank statements.",
    matchTip: "Look for columns with dates like '2025-01-15' or '15/01/2025'",
    IconComponent: Calendar
  },
  time: {
    title: "Transaction Time",
    description: "The exact time of day the transaction occurred. Helps match transactions that happen on the same day.",
    matchTip: "Look for columns with times like '14:30' or '2:30 PM'",
    IconComponent: Clock
  },
  amount: {
    title: "Transaction Amount",
    description: "The Rand value of the transaction. This is critical for matching - amounts must match exactly.",
    matchTip: "Look for columns with money values like 'R 150.00' or '150.00'",
    IconComponent: DollarSign
  },
  reference: {
    title: "Reference Number",
    description: "A unique ID for the transaction. This helps identify and match specific payments.",
    matchTip: "Look for short codes or IDs, not long processor strings",
    IconComponent: Hash
  },
  description: {
    title: "Description",
    description: "Additional details about the transaction. Useful for manually identifying transactions.",
    matchTip: "Look for columns with text describing what was purchased",
    IconComponent: FileText
  },
  cardNumber: {
    title: "Card Number",
    description: "The last 4 digits of the payment card. Helps match card transactions between systems.",
    matchTip: "Look for columns showing '****1234' or just the last 4 digits",
    IconComponent: CreditCardIcon
  },
  paymentType: {
    title: "Payment Type",
    description: "Whether this was a card or cash payment. Only card payments are matched.",
    matchTip: "Look for columns with 'Card', 'Cash', 'Credit', etc.",
    IconComponent: Tag
  }
};

function getFieldLabel(field: string): string {
  return FIELD_METADATA[field]?.title || field;
}

function getFieldDescription(field: string): string {
  return FIELD_METADATA[field]?.description || "";
}

function getFieldTip(field: string): string {
  return FIELD_METADATA[field]?.matchTip || "";
}

// Generate a friendly reason why a column is recommended
function getFriendlyRecommendation(analysis: ColumnQuality, field: string): string {
  const { validCount, headerCount, emptyCount, sampleValues, recommendation } = analysis;
  const total = validCount + headerCount + emptyCount;
  
  if (recommendation === 'RECOMMENDED') {
    // Check the sample data to give a more specific reason
    if (field === 'reference' && sampleValues[0]?.length < 15) {
      return "Short, clean reference codes - perfect for matching";
    }
    if (field === 'amount' && sampleValues.some(v => v.includes('R') || /^\d/.test(v))) {
      return "Contains proper Rand amounts - ready to use";
    }
    if (field === 'date') {
      return "Contains valid dates that can be matched";
    }
    return `${validCount} of ${total} rows have valid data`;
  }
  
  if (recommendation === 'ACCEPTABLE') {
    if (headerCount > 0) {
      return `Usable, but contains ${headerCount} header row(s) mixed in`;
    }
    return "Data is usable but some values may not parse correctly";
  }
  
  // NOT_RECOMMENDED
  if (field === 'reference' && sampleValues[0]?.length > 30) {
    return "Contains long processor codes - harder to read and match";
  }
  if (emptyCount > validCount) {
    return "Too many empty values - may cause matching issues";
  }
  if (headerCount > 1) {
    return "Contains multiple header rows mixed with data";
  }
  return "Data quality is low - consider using another column";
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
  const [currentStep, setCurrentStep] = useState(0);
  const [resolutions, setResolutions] = useState<Record<string, string>>({});
  const [showSummary, setShowSummary] = useState(false);
  
  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setCurrentStep(0);
      setShowSummary(false);
      
      // Pre-select recommended columns
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
  
  const totalSteps = conflicts.length;
  const currentConflict = conflicts[currentStep];
  const isLastStep = currentStep === totalSteps - 1;
  const isFirstStep = currentStep === 0;
  
  const handleNext = () => {
    if (isLastStep) {
      setShowSummary(true);
    } else {
      setCurrentStep(prev => prev + 1);
    }
  };
  
  const handleBack = () => {
    if (showSummary) {
      setShowSummary(false);
    } else if (!isFirstStep) {
      setCurrentStep(prev => prev - 1);
    }
  };
  
  const handleApply = () => {
    onResolve(resolutions);
  };
  
  const handleSelectColumn = (column: string) => {
    setResolutions(prev => ({ ...prev, [currentConflict.field]: column }));
  };
  
  // Summary view
  if (showSummary) {
    return (
      <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
        <DialogContent className="max-w-lg" data-testid="dialog-conflict-summary">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              Review Your Choices
            </DialogTitle>
            <DialogDescription>
              Here's a summary of the columns you've chosen. Click "Apply" to save, or go back to make changes.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-3 py-4">
            {conflicts.map((conflict, idx) => {
              const chosenColumn = resolutions[conflict.field];
              const FieldIcon = FIELD_METADATA[conflict.field]?.IconComponent;
              return (
                <div 
                  key={conflict.field}
                  className="flex items-center justify-between p-3 bg-muted/30 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                      {FieldIcon && <FieldIcon className="h-4 w-4 text-primary" />}
                    </div>
                    <div>
                      <div className="font-medium text-sm">{getFieldLabel(conflict.field)}</div>
                      <div className="text-xs text-muted-foreground">
                        Using: <span className="font-mono">{chosenColumn}</span>
                      </div>
                    </div>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => {
                      setShowSummary(false);
                      setCurrentStep(idx);
                    }}
                    data-testid={`button-edit-${conflict.field}`}
                  >
                    Edit
                  </Button>
                </div>
              );
            })}
          </div>
          
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={handleBack} data-testid="button-back-to-steps">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
            <Button onClick={handleApply} data-testid="button-apply-resolution">
              <Check className="h-4 w-4 mr-1" />
              Apply and Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
  
  // Stepper view - one conflict at a time
  if (!currentConflict) return null;
  
  const analyses = currentConflict.columns.map(col => 
    analyzeColumnQuality(col, sampleRows, currentConflict.field)
  );
  const recommended = analyses.find(a => a.recommendation === 'RECOMMENDED')?.column ||
                      analyses.sort((a, b) => b.validCount - a.validCount)[0]?.column;
  const selectedColumn = resolutions[currentConflict.field];
  
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col" data-testid="dialog-conflict-resolution">
        <DialogHeader className="shrink-0">
          <div className="flex items-center justify-between mb-2">
            <Badge variant="outline" className="text-xs">
              Step {currentStep + 1} of {totalSteps}
            </Badge>
            {/* Progress dots */}
            <div className="flex gap-1.5">
              {conflicts.map((_, idx) => (
                <div 
                  key={idx}
                  className={`h-2 w-2 rounded-full transition-colors ${
                    idx === currentStep 
                      ? 'bg-primary' 
                      : idx < currentStep 
                        ? 'bg-green-500' 
                        : 'bg-muted'
                  }`}
                />
              ))}
            </div>
          </div>
          <DialogTitle className="flex items-center gap-2 text-xl">
            {(() => {
              const StepIcon = FIELD_METADATA[currentConflict.field]?.IconComponent;
              return StepIcon ? <StepIcon className="h-6 w-6 text-primary" /> : null;
            })()}
            Choose Your {getFieldLabel(currentConflict.field)} Column
          </DialogTitle>
          <DialogDescription className="text-sm mt-1">
            {getFieldDescription(currentConflict.field)}
          </DialogDescription>
        </DialogHeader>
        
        {/* Scrollable content area */}
        <div className="flex-1 overflow-y-auto pr-1 space-y-3">
          {/* Tip box */}
          <Alert className="border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950">
            <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <AlertDescription className="text-blue-700 dark:text-blue-300 text-sm">
              <strong>Tip:</strong> {getFieldTip(currentConflict.field)}
            </AlertDescription>
          </Alert>
          
          <p className="text-sm text-muted-foreground">
            Your file has {analyses.length} columns that could be used. Choose the best one:
          </p>
          
          {analyses.map(analysis => {
            const isRecommended = analysis.column === recommended;
            const isSelected = selectedColumn === analysis.column;
            const friendlyReason = getFriendlyRecommendation(analysis, currentConflict.field);
            
            return (
              <Card 
                key={analysis.column}
                className={`cursor-pointer transition-all hover-elevate ${
                  isSelected 
                    ? 'ring-2 ring-primary border-primary' 
                    : ''
                }`}
                onClick={() => handleSelectColumn(analysis.column)}
                data-testid={`card-column-option-${analysis.column}`}
              >
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-3">
                    {/* Left side - column info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-sm truncate" title={analysis.column}>
                          Column: "{analysis.column}"
                        </span>
                        {isRecommended && (
                          <Badge className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 shrink-0 text-xs">
                            Best Choice
                          </Badge>
                        )}
                      </div>
                      
                      {/* Sample data preview - more compact */}
                      <div className="bg-muted/50 rounded p-2 font-mono text-xs mb-1">
                        <div className="text-muted-foreground text-xs mb-0.5">Sample values from your file:</div>
                        {analysis.sampleValues.slice(0, 2).map((val, i) => (
                          <div key={i} className="truncate" title={val}>
                            {val}
                          </div>
                        ))}
                      </div>
                      
                      {/* Friendly recommendation */}
                      <p className={`text-xs ${
                        analysis.recommendation === 'RECOMMENDED' 
                          ? 'text-green-700 dark:text-green-400' 
                          : analysis.recommendation === 'ACCEPTABLE'
                            ? 'text-blue-700 dark:text-blue-400'
                            : 'text-amber-700 dark:text-amber-400'
                      }`}>
                        {analysis.recommendation === 'RECOMMENDED' && "✓ "}
                        {analysis.recommendation === 'NOT_RECOMMENDED' && "⚠ "}
                        {friendlyReason}
                      </p>
                    </div>
                    
                    {/* Right side - selection indicator */}
                    <div className="shrink-0">
                      {isSelected ? (
                        <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center">
                          <Check className="h-5 w-5 text-primary-foreground" />
                        </div>
                      ) : (
                        <div className="h-8 w-8 rounded-full border-2 border-muted" />
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
        
        <DialogFooter className="gap-2 pt-4 shrink-0 border-t">
          <Button 
            variant="outline" 
            onClick={isFirstStep ? onCancel : handleBack}
            data-testid="button-back-step"
          >
            {isFirstStep ? (
              <>
                <X className="h-4 w-4 mr-1" />
                Cancel
              </>
            ) : (
              <>
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back
              </>
            )}
          </Button>
          <Button 
            onClick={handleNext}
            disabled={!selectedColumn}
            data-testid="button-next-step"
          >
            {isLastStep ? (
              <>
                Review Choices
                <ArrowRight className="h-4 w-4 ml-1" />
              </>
            ) : (
              <>
                Next Step
                <ArrowRight className="h-4 w-4 ml-1" />
              </>
            )}
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
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const errorData = await response.json();
          if (errorData.duplicates) {
            throw { isDuplicateError: true, duplicates: errorData.duplicates };
          }
          throw new Error(errorData.message || errorData.error || "Failed to save mapping");
        }
        throw new Error(`Server error: ${response.status} ${response.statusText}`);
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
