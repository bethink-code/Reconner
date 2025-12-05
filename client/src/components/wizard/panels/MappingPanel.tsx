import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ArrowLeft, ArrowRight, Sparkles, AlertCircle, CheckCircle2, Loader2, Lightbulb } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useWizard } from "@/contexts/WizardContext";

interface FilePreview {
  headers: string[];
  rows: Record<string, unknown>[];
  totalRows: number;
  suggestedMappings: Record<string, string>;
  currentMapping: Record<string, string> | null;
  detectedPreset: { name: string; description: string } | null;
  columnLabels: Record<string, string>;
}

interface MappingPanelProps {
  periodId: string;
  fileId: string;
  stepIndex: number;
  sourceType: "fuel" | "bank";
  bankPreset?: string;
  onComplete: () => void;
  onBack: () => void;
}

interface FieldDefinition {
  key: string;
  label: string;
  tip: string;
  examples: string[];
}

const REQUIRED_FIELDS: FieldDefinition[] = [
  { 
    key: "date", 
    label: "Transaction Date",
    tip: "The date when the transaction occurred",
    examples: ["Transaction Date", "Date", "Posted Date", "Trans Date"]
  },
  { 
    key: "amount", 
    label: "Amount (Rands)",
    tip: "The transaction value. Bank statements may show debits as negative",
    examples: ["Amount", "Total", "Value", "Debit", "Credit"]
  },
  { 
    key: "reference", 
    label: "Reference Number",
    tip: "A unique identifier for matching transactions",
    examples: ["Reference", "Ref No", "Invoice", "Receipt", "Trans ID"]
  },
];

const OPTIONAL_FIELDS: FieldDefinition[] = [
  { 
    key: "time", 
    label: "Time",
    tip: "Time of day, if shown separately from the date",
    examples: ["Time", "Trans Time", "Posted Time"]
  },
  { 
    key: "description", 
    label: "Description",
    tip: "Additional transaction details or notes",
    examples: ["Description", "Details", "Narrative", "Memo"]
  },
  { 
    key: "cardNumber", 
    label: "Card Number",
    tip: "Last 4 digits of the card - helps match fuel sales to bank records",
    examples: ["Card No", "Card", "Card Number", "PAN"]
  },
  { 
    key: "paymentType", 
    label: "Payment Type",
    tip: "How the customer paid (Card, Cash, Account)",
    examples: ["Payment Type", "Pay Method", "Tender", "Type"]
  },
];

export function MappingPanel({
  periodId,
  fileId,
  stepIndex,
  sourceType,
  bankPreset,
  onComplete,
  onBack,
}: MappingPanelProps) {
  const { toast } = useToast();
  const { updateMapping } = useWizard();
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [suggestedFields, setSuggestedFields] = useState<Set<string>>(new Set());
  
  const { data: preview, isLoading } = useQuery<FilePreview>({
    queryKey: ["/api/files", fileId, "preview"],
    enabled: !!fileId,
  });
  
  const invertMapping = (m: Record<string, string>): Record<string, string> => {
    const inverted: Record<string, string> = {};
    for (const [key, value] of Object.entries(m)) {
      if (value && value !== 'ignore') {
        inverted[value] = key;
      }
    }
    return inverted;
  };
  
  useEffect(() => {
    if (preview) {
      const serverMapping = preview.currentMapping || preview.suggestedMappings || {};
      const uiMapping = invertMapping(serverMapping);
      setMapping(uiMapping);
      
      if (preview.suggestedMappings && !preview.currentMapping) {
        const suggested = new Set(Object.values(preview.suggestedMappings));
        setSuggestedFields(suggested);
      }
    }
  }, [preview]);
  
  const saveMappingMutation = useMutation({
    mutationFn: async () => {
      const serverMapping = invertMapping(mapping);
      return apiRequest("POST", `/api/files/${fileId}/column-mapping`, { columnMapping: serverMapping });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/files", fileId, "preview"] });
      queryClient.invalidateQueries({ queryKey: ["/api/periods", periodId, "files"] });
      updateMapping(stepIndex, mapping);
      onComplete();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to save mapping",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  const handleFieldChange = (field: string, column: string) => {
    setMapping(prev => {
      const newMapping = { ...prev };
      Object.keys(newMapping).forEach(key => {
        if (newMapping[key] === column && key !== field) {
          delete newMapping[key];
        }
      });
      if (column === "ignore") {
        delete newMapping[field];
      } else {
        newMapping[field] = column;
      }
      return newMapping;
    });
    setSuggestedFields(prev => {
      const next = new Set(prev);
      next.delete(field);
      return next;
    });
  };
  
  const applyAutoMapping = () => {
    if (preview?.suggestedMappings) {
      const uiMapping = invertMapping(preview.suggestedMappings);
      setMapping(uiMapping);
      setSuggestedFields(new Set(Object.values(preview.suggestedMappings)));
      toast({
        title: "Suggestions applied",
        description: "We've filled in the mappings based on your column names. Review and adjust as needed.",
      });
    }
  };
  
  const requiredComplete = REQUIRED_FIELDS.every(field => mapping[field.key]);
  
  if (isLoading) {
    return (
      <Card className="max-w-3xl mx-auto" data-testid="card-mapping-loading">
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }
  
  if (!preview) {
    return (
      <Card className="max-w-3xl mx-auto" data-testid="card-mapping-error">
        <CardContent className="text-center py-12">
          <AlertCircle className="h-8 w-8 mx-auto text-destructive mb-2" />
          <p className="text-muted-foreground">Failed to load file preview</p>
        </CardContent>
      </Card>
    );
  }
  
  const getColumnSample = (column: string): string => {
    if (!preview.rows.length) return "";
    const values = preview.rows
      .slice(0, 2)
      .map(row => String(row[column] || ""))
      .filter(Boolean);
    return values.join(", ");
  };
  
  const isJunkColumn = (header: string): boolean => {
    if (header.startsWith("_")) return true;
    if (header.match(/^_\d+$/)) return true;
    if (header.trim() === "") return true;
    return false;
  };
  
  const isColumnMapped = (header: string): boolean => {
    return Object.values(mapping).includes(header);
  };
  
  const getValidHeaders = (): string[] => {
    return preview.headers.filter(h => !isJunkColumn(h));
  };

  const isSuggested = (fieldKey: string): boolean => {
    return suggestedFields.has(fieldKey) && !!mapping[fieldKey];
  };

  const renderFieldRow = (field: FieldDefinition, isRequired: boolean) => {
    const currentValue = mapping[field.key] || "";
    const sample = currentValue ? getColumnSample(currentValue) : "";
    const suggested = isSuggested(field.key);
    
    return (
      <div 
        key={field.key} 
        className="flex items-center gap-3 py-3 border-b last:border-b-0"
        data-testid={`field-${field.key}`}
      >
        <div className="w-48 shrink-0">
          <div className="flex items-center gap-1.5">
            <span className={`text-sm font-medium ${isRequired ? '' : 'text-muted-foreground'}`}>
              {field.label}
            </span>
            {isRequired && <span className="text-destructive">*</span>}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {field.tip}
          </p>
        </div>
        
        <div className="flex-1 flex items-center gap-2">
          <Select
            value={currentValue}
            onValueChange={(value) => handleFieldChange(field.key, value)}
          >
            <SelectTrigger 
              className="w-full"
              data-testid={`select-${field.key}`}
            >
              <SelectValue placeholder="Select column..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ignore">-- Not mapped --</SelectItem>
              {getValidHeaders().map(header => {
                const isMapped = isColumnMapped(header) && mapping[field.key] !== header;
                const sample = getColumnSample(header);
                const displayName = preview.columnLabels?.[header] || header;
                return (
                  <SelectItem 
                    key={header} 
                    value={header}
                    disabled={isMapped}
                    className={isMapped ? "opacity-50" : ""}
                  >
                    <div className="flex items-center justify-between w-full gap-3">
                      <span className={isMapped ? "line-through" : ""}>{displayName}</span>
                      {sample && (
                        <span className="text-xs text-muted-foreground truncate max-w-32">
                          ({sample.slice(0, 20)}{sample.length > 20 ? "..." : ""})
                        </span>
                      )}
                    </div>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          
          {suggested && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className="shrink-0 text-amber-600 border-amber-300 bg-amber-50 dark:bg-amber-950 dark:border-amber-800">
                  <Lightbulb className="h-3 w-3 mr-1" />
                  Suggested
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                <p>We detected this based on column name. Please confirm it's correct.</p>
              </TooltipContent>
            </Tooltip>
          )}
          
          {currentValue && !suggested && (
            <Badge variant="outline" className="shrink-0 text-green-600 border-green-300 bg-green-50 dark:bg-green-950 dark:border-green-800">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Confirmed
            </Badge>
          )}
        </div>
        
        {sample && (
          <div className="w-36 shrink-0 text-right">
            <span className="text-xs text-muted-foreground truncate block" title={sample}>
              e.g. {sample}
            </span>
          </div>
        )}
      </div>
    );
  };
  
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Card data-testid="card-mapping-panel">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle>Map Your Columns</CardTitle>
              <CardDescription>
                Match each field to the correct column in your file
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {preview.detectedPreset && (
                <Badge variant="secondary" className="shrink-0">
                  <Sparkles className="h-3 w-3 mr-1" />
                  {preview.detectedPreset.name}
                </Badge>
              )}
              {requiredComplete ? (
                <Badge className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Ready
                </Badge>
              ) : (
                <Badge variant="secondary">
                  {REQUIRED_FIELDS.filter(f => mapping[f.key]).length} of {REQUIRED_FIELDS.length} required
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-6">
          {Object.keys(preview.suggestedMappings || {}).length > 0 && suggestedFields.size === 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={applyAutoMapping}
              className="w-full"
              data-testid="button-auto-map"
            >
              <Sparkles className="h-4 w-4 mr-2" />
              Apply Suggested Mappings
            </Button>
          )}
          
          <div>
            <div className="mb-3 pb-2 border-b">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Required Fields</span>
              <p className="text-xs text-muted-foreground mt-1">
                These fields are needed to match transactions between your fuel data and bank records.
              </p>
            </div>
            <div className="divide-y">
              {REQUIRED_FIELDS.map(field => renderFieldRow(field, true))}
            </div>
          </div>
          
          <div>
            <div className="mb-3 pb-2 border-b">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Optional Fields</span>
              <p className="text-xs text-muted-foreground mt-1">
                Improves reporting and helps with manual review. Card Number boosts match confidence.
              </p>
            </div>
            <div className="divide-y">
              {OPTIONAL_FIELDS.map(field => renderFieldRow(field, false))}
            </div>
          </div>
        </CardContent>
      </Card>
      
      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack} data-testid="button-back-mapping">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        
        <Button
          onClick={() => saveMappingMutation.mutate()}
          disabled={!requiredComplete || saveMappingMutation.isPending}
          data-testid="button-preview-data"
        >
          {saveMappingMutation.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : null}
          Preview Data
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}
