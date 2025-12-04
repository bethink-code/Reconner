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
import { ArrowLeft, ArrowRight, Sparkles, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
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

const REQUIRED_FIELDS = [
  { key: "date", label: "Transaction Date", description: "When the transaction happened" },
  { key: "amount", label: "Amount", description: "Transaction value in Rands" },
  { key: "reference", label: "Reference Number", description: "Unique transaction ID" },
];

const OPTIONAL_FIELDS = [
  { key: "time", label: "Transaction Time", description: "Time of day (if separate from date)" },
  { key: "description", label: "Description", description: "Additional details" },
  { key: "cardNumber", label: "Card Number", description: "Last 4 digits of card" },
  { key: "paymentType", label: "Payment Type", description: "Card, Cash, etc." },
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
  };
  
  const applyAutoMapping = () => {
    if (preview?.suggestedMappings) {
      const uiMapping = invertMapping(preview.suggestedMappings);
      setMapping(uiMapping);
      toast({
        title: "Auto-mapping applied",
        description: "Column mappings have been suggested based on your data.",
      });
    }
  };
  
  const requiredComplete = REQUIRED_FIELDS.every(field => mapping[field.key]);
  
  if (isLoading) {
    return (
      <Card className="max-w-2xl mx-auto" data-testid="card-mapping-loading">
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }
  
  if (!preview) {
    return (
      <Card className="max-w-2xl mx-auto" data-testid="card-mapping-error">
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
      .slice(0, 3)
      .map(row => String(row[column] || ""))
      .filter(Boolean);
    return values.join(", ");
  };
  
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Card data-testid="card-mapping-panel">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Map Your Columns</CardTitle>
              <CardDescription>
                Tell us which columns contain which data. We've made some suggestions based on your file.
              </CardDescription>
            </div>
            {preview.detectedPreset && (
              <Badge variant="secondary" className="shrink-0">
                <Sparkles className="h-3 w-3 mr-1" />
                {preview.detectedPreset.name}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {Object.keys(preview.suggestedMappings || {}).length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={applyAutoMapping}
              className="w-full"
              data-testid="button-auto-map"
            >
              <Sparkles className="h-4 w-4 mr-2" />
              Apply Suggested Mapping
            </Button>
          )}
          
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="text-sm font-semibold">Required Fields</h3>
              {requiredComplete ? (
                <Badge className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Complete
                </Badge>
              ) : (
                <Badge variant="secondary">
                  {REQUIRED_FIELDS.filter(f => mapping[f.key]).length} of {REQUIRED_FIELDS.length}
                </Badge>
              )}
            </div>
            
            {REQUIRED_FIELDS.map(field => (
              <div key={field.key} className="space-y-1.5" data-testid={`field-${field.key}`}>
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">{field.label}</label>
                  {mapping[field.key] && (
                    <span className="text-xs text-muted-foreground">
                      Sample: {getColumnSample(mapping[field.key])}
                    </span>
                  )}
                </div>
                <Select
                  value={mapping[field.key] || ""}
                  onValueChange={(value) => handleFieldChange(field.key, value)}
                >
                  <SelectTrigger data-testid={`select-${field.key}`}>
                    <SelectValue placeholder={`Select ${field.label.toLowerCase()} column`} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ignore">-- Not mapped --</SelectItem>
                    {preview.headers.map(header => (
                      <SelectItem key={header} value={header}>
                        {preview.columnLabels?.[header] || header}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{field.description}</p>
              </div>
            ))}
          </div>
          
          <div className="space-y-4 pt-4 border-t">
            <h3 className="text-sm font-semibold text-muted-foreground">Optional Fields</h3>
            
            {OPTIONAL_FIELDS.map(field => (
              <div key={field.key} className="space-y-1.5" data-testid={`field-${field.key}`}>
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-muted-foreground">{field.label}</label>
                  {mapping[field.key] && (
                    <span className="text-xs text-muted-foreground">
                      Sample: {getColumnSample(mapping[field.key])}
                    </span>
                  )}
                </div>
                <Select
                  value={mapping[field.key] || ""}
                  onValueChange={(value) => handleFieldChange(field.key, value)}
                >
                  <SelectTrigger data-testid={`select-${field.key}`}>
                    <SelectValue placeholder="Not mapped (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ignore">-- Not mapped --</SelectItem>
                    {preview.headers.map(header => (
                      <SelectItem key={header} value={header}>
                        {preview.columnLabels?.[header] || header}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
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
