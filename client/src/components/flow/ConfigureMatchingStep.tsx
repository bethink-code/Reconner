import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { 
  Settings, 
  Zap,
  ArrowLeft,
  ChevronDown,
  Check,
  Shield,
  Scale,
  Target
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

interface MatchingRules {
  amountTolerance: number;
  dateWindowDays: number;
  timeWindowMinutes: number;
  requireCardMatch: boolean;
  invoiceGrouping: boolean;
  minConfidence: number;
  autoMatchThreshold: number;
}

interface PresetConfig {
  id: string;
  name: string;
  description: string;
  icon: React.ElementType;
  tolerance: string;
  confidence: string;
  rules: Partial<MatchingRules>;
}

const PRESETS: PresetConfig[] = [
  {
    id: "conservative",
    name: "Conservative",
    description: "Exact amounts, same day only",
    icon: Shield,
    tolerance: "±R0.01",
    confidence: "90%",
    rules: {
      amountTolerance: 0.01,
      dateWindowDays: 1,
      timeWindowMinutes: 480,
      minConfidence: 90,
      autoMatchThreshold: 95,
      invoiceGrouping: true,
      requireCardMatch: false,
    },
  },
  {
    id: "moderate",
    name: "Moderate",
    description: "Balanced for most stations",
    icon: Scale,
    tolerance: "±R1.00",
    confidence: "60%",
    rules: {
      amountTolerance: 1.0,
      dateWindowDays: 3,
      timeWindowMinutes: 720,
      minConfidence: 60,
      autoMatchThreshold: 85,
      invoiceGrouping: true,
      requireCardMatch: false,
    },
  },
  {
    id: "aggressive",
    name: "Aggressive",
    description: "Maximum match rate",
    icon: Target,
    tolerance: "±R2.00",
    confidence: "50%",
    rules: {
      amountTolerance: 2.0,
      dateWindowDays: 5,
      timeWindowMinutes: 1440,
      minConfidence: 50,
      autoMatchThreshold: 75,
      invoiceGrouping: true,
      requireCardMatch: false,
    },
  },
];

interface ConfigureMatchingStepProps {
  periodId: string;
  onStartMatching: () => void;
  onBack: () => void;
  isMatching: boolean;
}

export function ConfigureMatchingStep({ 
  periodId, 
  onStartMatching, 
  onBack,
  isMatching 
}: ConfigureMatchingStepProps) {
  const { toast } = useToast();
  const [selectedPreset, setSelectedPreset] = useState<string>("moderate");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [customRules, setCustomRules] = useState<MatchingRules>({
    amountTolerance: 1.0,
    dateWindowDays: 3,
    timeWindowMinutes: 720,
    requireCardMatch: false,
    invoiceGrouping: true,
    minConfidence: 60,
    autoMatchThreshold: 85,
  });

  const { data: existingRules } = useQuery<MatchingRules>({
    queryKey: ["/api/periods", periodId, "matching-rules"],
    enabled: !!periodId,
  });

  const saveMutation = useMutation({
    mutationFn: async (rules: MatchingRules) => {
      const response = await apiRequest("POST", `/api/periods/${periodId}/matching-rules`, rules);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/periods", periodId, "matching-rules"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to save rules",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handlePresetSelect = (presetId: string) => {
    setSelectedPreset(presetId);
    const preset = PRESETS.find((p) => p.id === presetId);
    if (preset) {
      setCustomRules({ ...customRules, ...preset.rules });
    }
  };

  const handleStartMatching = async () => {
    try {
      await saveMutation.mutateAsync(customRules);
      onStartMatching();
    } catch (error) {
      // Error already handled by mutation's onError, don't proceed
    }
  };

  const updateRule = <K extends keyof MatchingRules>(key: K, value: MatchingRules[K]) => {
    setCustomRules((prev) => ({ ...prev, [key]: value }));
    setSelectedPreset("custom");
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Card data-testid="card-configure-matching">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Settings className="h-6 w-6 text-primary" />
          </div>
          <CardTitle>Configure Matching</CardTitle>
          <CardDescription>
            How strict should we be when matching transactions?
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-3 gap-3">
            {PRESETS.map((preset) => {
              const Icon = preset.icon;
              const isSelected = selectedPreset === preset.id;
              
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handlePresetSelect(preset.id)}
                  className={cn(
                    "relative flex flex-col items-center p-4 rounded-lg border-2 transition-all text-center",
                    isSelected
                      ? "border-primary bg-primary/5"
                      : "border-muted hover:border-primary/50"
                  )}
                  data-testid={`preset-${preset.id}`}
                >
                  {isSelected && (
                    <div className="absolute top-2 right-2">
                      <Check className="h-4 w-4 text-primary" />
                    </div>
                  )}
                  <Icon className={cn(
                    "h-6 w-6 mb-2",
                    isSelected ? "text-primary" : "text-muted-foreground"
                  )} />
                  <p className="font-medium text-sm">{preset.name}</p>
                  <p className="text-xs text-muted-foreground mt-1">{preset.description}</p>
                  <div className="mt-3 space-y-1">
                    <p className="text-xs font-mono">{preset.tolerance}</p>
                    <p className="text-xs text-muted-foreground">{preset.confidence} min</p>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="p-3 bg-muted/50 rounded-lg">
            <p className="text-sm text-center">
              {selectedPreset === "conservative" && (
                <>
                  <span className="font-medium">Conservative</span> requires exact matches.
                  Best for high-accuracy reconciliation with minimal false positives.
                </>
              )}
              {selectedPreset === "moderate" && (
                <>
                  <span className="font-medium">Moderate</span> is recommended for most fuel stations.
                  It handles small price variations while maintaining accuracy.
                </>
              )}
              {selectedPreset === "aggressive" && (
                <>
                  <span className="font-medium">Aggressive</span> maximizes match rate.
                  Use when transactions often have timing or amount variations.
                </>
              )}
              {!selectedPreset && (
                <>
                  Select a preset above or customize the settings below.
                </>
              )}
            </p>
          </div>

          <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
            <CollapsibleTrigger asChild>
              <Button 
                variant="ghost" 
                className="w-full justify-between"
                data-testid="button-toggle-advanced"
              >
                <span>Advanced Settings</span>
                <ChevronDown className={cn(
                  "h-4 w-4 transition-transform",
                  showAdvanced && "rotate-180"
                )} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-6 pt-4">
              <div className="space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Amount Tolerance</Label>
                    <span className="text-sm font-mono">
                      ±R{customRules.amountTolerance.toFixed(2)}
                    </span>
                  </div>
                  <Slider
                    value={[customRules.amountTolerance]}
                    onValueChange={([v]) => updateRule("amountTolerance", v)}
                    min={0}
                    max={10}
                    step={0.1}
                    data-testid="slider-tolerance"
                  />
                  <p className="text-xs text-muted-foreground">
                    How much can amounts differ and still match?
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Date Window</Label>
                    <span className="text-sm font-mono">
                      ±{customRules.dateWindowDays} days
                    </span>
                  </div>
                  <Slider
                    value={[customRules.dateWindowDays]}
                    onValueChange={([v]) => updateRule("dateWindowDays", v)}
                    min={1}
                    max={7}
                    step={1}
                    data-testid="slider-date-window"
                  />
                  <p className="text-xs text-muted-foreground">
                    How many days can transactions differ?
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Minimum Confidence</Label>
                    <span className="text-sm font-mono">{customRules.minConfidence}%</span>
                  </div>
                  <Slider
                    value={[customRules.minConfidence]}
                    onValueChange={([v]) => updateRule("minConfidence", v)}
                    min={40}
                    max={95}
                    step={5}
                    data-testid="slider-min-confidence"
                  />
                  <p className="text-xs text-muted-foreground">
                    Matches below this confidence are ignored.
                  </p>
                </div>

                <div className="flex items-center justify-between gap-4 pt-2">
                  <div className="space-y-1">
                    <Label>Invoice Grouping</Label>
                    <p className="text-xs text-muted-foreground">
                      Group fuel transactions by invoice before matching
                    </p>
                  </div>
                  <Switch
                    checked={customRules.invoiceGrouping}
                    onCheckedChange={(v) => updateRule("invoiceGrouping", v)}
                    data-testid="switch-invoice-grouping"
                  />
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>

          <div className="flex gap-3 pt-4 border-t">
            <Button 
              variant="outline"
              onClick={onBack}
              disabled={isMatching}
              data-testid="button-back-bank"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <Button 
              className="flex-1"
              onClick={handleStartMatching}
              disabled={isMatching || saveMutation.isPending}
              data-testid="button-start-reconciliation"
            >
              <Zap className="h-4 w-4 mr-2" />
              {isMatching ? "Matching..." : "Start Reconciliation"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
