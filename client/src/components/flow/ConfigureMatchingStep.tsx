import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  Target,
  AlertTriangle,
  XCircle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { buildMatchingStages } from "@shared/matchingStages";

interface MatchingRules {
  amountTolerance: number;
  dateWindowDays: number;
  timeWindowMinutes: number;
  attendantSubmissionDelayMinutes: number;
  requireCardMatch: boolean;
  groupByInvoice: boolean;
  minimumConfidence: number;
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
      attendantSubmissionDelayMinutes: 120,
      minimumConfidence: 90,
      autoMatchThreshold: 95,
      groupByInvoice: true,
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
      attendantSubmissionDelayMinutes: 120,
      minimumConfidence: 60,
      autoMatchThreshold: 85,
      groupByInvoice: true,
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
      attendantSubmissionDelayMinutes: 120,
      minimumConfidence: 50,
      autoMatchThreshold: 75,
      groupByInvoice: true,
      requireCardMatch: false,
    },
  },
];

interface ConfigureMatchingStepProps {
  periodId: string;
  onStartMatching: () => void;
  onBack: () => void;
  isMatching: boolean;
  stepColor?: string;
}

export function ConfigureMatchingStep({
  periodId,
  onStartMatching,
  onBack,
  isMatching,
  stepColor
}: ConfigureMatchingStepProps) {
  const { toast } = useToast();

  // Fetch verification summary for data coverage
  const { data: verSummary, isLoading: verLoading } = useQuery<{
    overview: {
      fuelSystem: { totalSales: number; cardTransactions: number; cashTransactions: number };
      bankStatements: {
        totalTransactions: number;
        sources: { name: string; transactions: number; amount: number }[];
        dateRange: { earliest: string; latest: string; days: number };
      };
    };
    coverageAnalysis?: {
      fuelDateRange: { earliest: string; latest: string; days: number };
      bankDateRange: { earliest: string; latest: string; days: number };
    };
  }>({
    queryKey: ["/api/periods", periodId, "verification-summary"],
    enabled: !!periodId,
  });

  const { data: period } = useQuery<{ startDate: string; endDate: string; name: string }>({
    queryKey: ["/api/periods", periodId],
    enabled: !!periodId,
  });
  const [selectedPreset, setSelectedPreset] = useState<string>("moderate");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [customRules, setCustomRules] = useState<MatchingRules>({
    amountTolerance: 1.0,
    dateWindowDays: 3,
    timeWindowMinutes: 720,
    attendantSubmissionDelayMinutes: 120,
    requireCardMatch: false,
    groupByInvoice: true,
    minimumConfidence: 60,
    autoMatchThreshold: 85,
  });

  const { data: existingRules } = useQuery<MatchingRules>({
    queryKey: ["/api/periods", periodId, "matching-rules"],
    enabled: !!periodId,
  });

  // When saved rules arrive, hydrate local state + detect which preset matches
  useEffect(() => {
    if (!existingRules) return;
    setCustomRules(existingRules);
    const match = PRESETS.find(p =>
      p.rules.amountTolerance === existingRules.amountTolerance &&
      p.rules.dateWindowDays === existingRules.dateWindowDays &&
      p.rules.attendantSubmissionDelayMinutes === existingRules.attendantSubmissionDelayMinutes &&
      p.rules.minimumConfidence === existingRules.minimumConfidence &&
      p.rules.autoMatchThreshold === existingRules.autoMatchThreshold &&
      p.rules.groupByInvoice === existingRules.groupByInvoice &&
      p.rules.requireCardMatch === existingRules.requireCardMatch
    );
    setSelectedPreset(match ? match.id : "custom");
    if (!match) setShowAdvanced(true);
  }, [existingRules]);

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

  const matchingStages = buildMatchingStages(customRules);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="bg-section rounded-2xl p-8" data-testid="card-configure-matching">
        <div className="text-center mb-6">
          <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-card flex items-center justify-center">
            <Settings className="h-6 w-6 text-primary" />
          </div>
          <h2 className="text-2xl font-semibold tracking-tight">Configure Matching</h2>
          <p className="text-sm text-muted-foreground mt-1">How strict should we be when matching transactions?</p>
        </div>
        <div className="space-y-6">
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
                    "relative flex flex-col items-center p-4 rounded-xl transition-all text-center",
                    isSelected
                      ? "bg-card shadow-sm"
                      : "bg-transparent border border-border/50 hover:bg-card/50"
                  )}
                  data-testid={`preset-${preset.id}`}
                >
                  {isSelected && (
                    <>
                      <div className="absolute top-2 right-2">
                        <Check className="h-4 w-4 text-primary" />
                      </div>
                      <div className="absolute -bottom-0.5 left-4 right-4 h-0.5 rounded-full" style={stepColor ? { backgroundColor: stepColor } : undefined} />
                    </>
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

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold">Matching hierarchy</h3>
                <p className="text-xs text-muted-foreground">
                  These stages run in order. Earlier stages claim the cleanest matches first, and later stages only see what is left over.
                </p>
              </div>
            </div>
            <div className="space-y-3">
              {matchingStages.map((stage) => (
                <div
                  key={stage.id}
                  className="rounded-xl bg-card border border-border/60 p-4"
                  data-testid={`matching-stage-${stage.id}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Pass {stage.order}
                      </p>
                      <p className="text-sm font-semibold mt-1">{stage.name}</p>
                      <p className="text-xs text-muted-foreground mt-1">{stage.description}</p>
                    </div>
                    <Badge variant="secondary" className="shrink-0">
                      {stage.minimumConfidence}% min
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-3">
                    <Badge variant="outline">Amount +/- R{stage.maxAmountDiff.toFixed(2)}</Badge>
                    <Badge variant="outline">
                      {stage.boundaryMode === "boundary"
                        ? "Previous-day start / next-day end"
                        : stage.maxDateDiffDays === 0
                          ? "Same day only"
                          : `Up to ${stage.maxDateDiffDays} day lag`}
                    </Badge>
                      <Badge variant="outline">
                      {stage.requireExactAmount
                        ? `${customRules.attendantSubmissionDelayMinutes} min attendant submission delay`
                        : stage.maxTimeDiffMinutes === null
                          ? "No same-day time cap"
                          : `${stage.maxTimeDiffMinutes} min time window`}
                    </Badge>
                    <Badge variant="outline">
                      {stage.requireCardMatch ? "Card match required" : "Card match optional"}
                    </Badge>
                    {stage.requireExactAmount && (
                      <Badge variant="outline">Exact amount first</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Data Coverage Preview */}
          {verLoading && (
            <div className="rounded-lg bg-section p-4 space-y-2 animate-pulse">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">Data Coverage</p>
              <div className="h-4 bg-muted-foreground/10 rounded w-3/4" />
              <div className="h-4 bg-muted-foreground/10 rounded w-full" />
              <div className="h-4 bg-muted-foreground/10 rounded w-5/6" />
              <div className="h-4 bg-muted-foreground/10 rounded w-5/6" />
            </div>
          )}
          {verSummary && (() => {
            const fuelRange = verSummary.coverageAnalysis?.fuelDateRange;
            const periodStart = period?.startDate;
            const periodEnd = period?.endDate;

            // Determine coverage status for a date range against the period dates
            const getCoverageStatus = (earliest: string, latest: string) => {
              if (!periodStart || !periodEnd) return 'unknown';
              const hasOverlap = earliest <= periodEnd && latest >= periodStart;
              if (!hasOverlap) return 'miss';
              const covers = earliest <= periodStart && latest >= periodEnd;
              return covers ? 'match' : 'overlap';
            };

            const StatusIcon = ({ status }: { status: string }) => {
              if (status === 'match') return <span className="w-2 h-2 rounded-full bg-[#166534] inline-block" />;
              if (status === 'overlap') return <span className="w-2 h-2 rounded-full bg-[#B45309] inline-block" />;
              if (status === 'miss') return <span className="w-2 h-2 rounded-full bg-[#B91C1C] inline-block" />;
              return null;
            };

            const statusLabel = (status: string) => {
              if (status === 'match') return 'Covers fuel period';
              if (status === 'overlap') return 'Partial overlap';
              if (status === 'miss') return 'No overlap';
              return '';
            };

            return (
              <div className="rounded-lg bg-section p-4 space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">Data Coverage</p>
                {period && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Period</span>
                    <span className="font-medium">{periodStart} to {periodEnd}</span>
                  </div>
                )}
                {fuelRange && (() => {
                  const fuelStatus = getCoverageStatus(fuelRange.earliest, fuelRange.latest);
                  return (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Fuel data</span>
                      <span className="flex items-center gap-1.5 font-medium">
                        {fuelRange.earliest} to {fuelRange.latest}
                        <span className="text-muted-foreground">({verSummary.overview.fuelSystem.cardTransactions + verSummary.overview.fuelSystem.cashTransactions} txns)</span>
                        <StatusIcon status={fuelStatus} />
                      </span>
                    </div>
                  );
                })()}
                {verSummary.overview.bankStatements.sources.map((src, i) => {
                  // Prefer per-source date range; fall back to aggregate for older data
                  const earliest = (src as any).earliest || verSummary.overview.bankStatements.dateRange?.earliest;
                  const latest = (src as any).latest || verSummary.overview.bankStatements.dateRange?.latest;
                  const status = earliest && latest
                    ? getCoverageStatus(earliest, latest)
                    : 'unknown';
                  return (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{src.name}</span>
                      <span className="flex items-center gap-1.5 font-medium">
                        {earliest} to {latest}
                        <span className="text-muted-foreground">({src.transactions} txns)</span>
                        <StatusIcon status={status} />
                      </span>
                    </div>
                  );
                })}
                {(() => {
                  const bankRange = verSummary.overview.bankStatements.dateRange;
                  if (fuelRange && bankRange?.earliest && bankRange?.latest) {
                    const status = getCoverageStatus(bankRange.earliest, bankRange.latest);
                    if (status === 'miss') {
                      return (
                        <div className="rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 p-2 mt-2">
                          <p className="text-xs font-medium text-red-700 dark:text-red-400">
                            Date ranges don't overlap — matching will likely produce 0 results. Check your uploaded files.
                          </p>
                        </div>
                      );
                    }
                    if (status === 'overlap') {
                      return (
                        <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-2 mt-2">
                          <p className="text-xs font-medium text-[#B45309]">
                            Bank data only partially covers the fuel period — some transactions may not find matches.
                          </p>
                        </div>
                      );
                    }
                  }
                  return null;
                })()}
              </div>
            );
          })()}

          <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                className="w-full justify-between bg-muted/50 text-muted-foreground hover:bg-muted"
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
                    <Label>Attendant Submission Delay</Label>
                    <span className="text-sm font-mono">
                      {customRules.attendantSubmissionDelayMinutes} min
                    </span>
                  </div>
                  <Slider
                    value={[customRules.attendantSubmissionDelayMinutes]}
                    onValueChange={([v]) => updateRule("attendantSubmissionDelayMinutes", v)}
                    min={0}
                    max={480}
                    step={15}
                    data-testid="slider-attendant-delay"
                  />
                  <p className="text-xs text-muted-foreground">
                    How long after the fuel sale an attendant may still submit the slip to the cashier for an exact same-day match.
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Match Quality Threshold</Label>
                    <span className="text-sm font-mono">{customRules.minimumConfidence}%</span>
                  </div>
                  <Slider
                    value={[customRules.minimumConfidence]}
                    onValueChange={([v]) => updateRule("minimumConfidence", v)}
                    min={40}
                    max={95}
                    step={5}
                    data-testid="slider-min-confidence"
                  />
                  <p className="text-xs text-muted-foreground">
                    How sure should we be before pairing a fuel sale with a bank transaction? Lower = more matches but less accurate. Higher = fewer but more reliable.
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
                    checked={customRules.groupByInvoice}
                    onCheckedChange={(v) => updateRule("groupByInvoice", v)}
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
        </div>
      </div>
    </div>
  );
}
