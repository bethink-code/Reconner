import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Settings, Zap, Shield, Target, RefreshCw, Save } from "lucide-react";
import type { MatchingRulesConfig } from "@shared/schema";

interface MatchingRulesPanelProps {
  periodId: string;
  onRulesChanged?: () => void;
}

const PRESETS: Record<string, MatchingRulesConfig> = {
  conservative: {
    amountTolerance: 0.01,
    dateWindowDays: 1,
    timeWindowMinutes: 30,
    groupByInvoice: true,
    requireCardMatch: true,
    minimumConfidence: 90,
    autoMatchThreshold: 95,
  },
  moderate: {
    amountTolerance: 1.00,  // Handle fuel price variations and rounding
    dateWindowDays: 3,
    timeWindowMinutes: 60,
    groupByInvoice: true,
    requireCardMatch: false,
    minimumConfidence: 60,
    autoMatchThreshold: 85,
  },
  aggressive: {
    amountTolerance: 2.00,  // Very lenient for high match rates
    dateWindowDays: 5,
    timeWindowMinutes: 120,
    groupByInvoice: true,
    requireCardMatch: false,
    minimumConfidence: 50,
    autoMatchThreshold: 70,
  },
};

export default function MatchingRulesPanel({ periodId, onRulesChanged }: MatchingRulesPanelProps) {
  const { toast } = useToast();
  const [rules, setRules] = useState<MatchingRulesConfig>(PRESETS.moderate);
  const [hasChanges, setHasChanges] = useState(false);
  const [activePreset, setActivePreset] = useState<string | null>("moderate");

  const { data: savedRules, isLoading } = useQuery<MatchingRulesConfig>({
    queryKey: ['/api/periods', periodId, 'matching-rules'],
    enabled: !!periodId,
  });

  useEffect(() => {
    if (savedRules) {
      setRules(savedRules);
      
      const matchedPreset = Object.entries(PRESETS).find(([, preset]) =>
        preset.amountTolerance === savedRules.amountTolerance &&
        preset.dateWindowDays === savedRules.dateWindowDays &&
        preset.minimumConfidence === savedRules.minimumConfidence
      );
      setActivePreset(matchedPreset ? matchedPreset[0] : null);
    }
  }, [savedRules]);

  const saveMutation = useMutation({
    mutationFn: async (newRules: MatchingRulesConfig) => {
      const response = await apiRequest("POST", `/api/periods/${periodId}/matching-rules`, newRules);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/periods', periodId, 'matching-rules'] });
      setHasChanges(false);
      toast({
        title: "Rules saved",
        description: "Matching rules have been updated. Run auto-match to apply them.",
      });
      onRulesChanged?.();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save matching rules",
        variant: "destructive",
      });
    },
  });

  const updateRule = <K extends keyof MatchingRulesConfig>(key: K, value: MatchingRulesConfig[K]) => {
    setRules(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
    setActivePreset(null);
  };

  const applyPreset = (presetName: string) => {
    const preset = PRESETS[presetName];
    if (preset) {
      setRules(preset);
      setActivePreset(presetName);
      setHasChanges(true);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Matching Rules
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-muted rounded" />
            <div className="h-8 bg-muted rounded" />
            <div className="h-8 bg-muted rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Settings className="w-5 h-5" />
          Matching Rules
        </CardTitle>
        <CardDescription>
          Configure how transactions are matched. Invoice grouping is key for high match rates.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <Label className="text-sm font-medium">Presets</Label>
          <div className="flex gap-2 flex-wrap">
            <Button
              size="sm"
              variant={activePreset === "conservative" ? "default" : "outline"}
              onClick={() => applyPreset("conservative")}
              className="gap-1"
              data-testid="button-preset-conservative"
            >
              <Shield className="w-3.5 h-3.5" />
              Conservative
            </Button>
            <Button
              size="sm"
              variant={activePreset === "moderate" ? "default" : "outline"}
              onClick={() => applyPreset("moderate")}
              className="gap-1"
              data-testid="button-preset-moderate"
            >
              <Target className="w-3.5 h-3.5" />
              Moderate
            </Button>
            <Button
              size="sm"
              variant={activePreset === "aggressive" ? "default" : "outline"}
              onClick={() => applyPreset("aggressive")}
              className="gap-1"
              data-testid="button-preset-aggressive"
            >
              <Zap className="w-3.5 h-3.5" />
              Aggressive
            </Button>
          </div>
          {activePreset && (
            <p className="text-xs text-muted-foreground">
              {activePreset === "conservative" && "Strict matching: exact amounts, same day, requires card match"}
              {activePreset === "moderate" && "Balanced: ±R1.00 (handles fuel price variations), 3-day window, groups by invoice (recommended)"}
              {activePreset === "aggressive" && "Lenient: ±R2.00, 5-day window, lower confidence threshold"}
            </p>
          )}
        </div>

        <div className="space-y-4 pt-2 border-t">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-1">
              <Label className="text-sm font-medium">Group by Invoice</Label>
              <p className="text-xs text-muted-foreground">
                Combine multi-line purchases (fuel + snacks) into single totals
              </p>
            </div>
            <Switch
              checked={rules.groupByInvoice}
              onCheckedChange={(checked) => updateRule("groupByInvoice", checked)}
              data-testid="switch-group-by-invoice"
            />
          </div>
          {rules.groupByInvoice && (
            <Badge variant="secondary" className="text-xs">
              Critical for high match rates
            </Badge>
          )}
        </div>

        <div className="space-y-4 pt-2 border-t">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Amount Tolerance</Label>
              <span className="text-sm font-mono bg-muted px-2 py-0.5 rounded" data-testid="text-amount-tolerance">
                R{rules.amountTolerance.toFixed(2)}
              </span>
            </div>
            <Slider
              value={[rules.amountTolerance * 100]}
              onValueChange={([v]) => updateRule("amountTolerance", v / 100)}
              min={0}
              max={100}
              step={1}
              className="w-full"
              data-testid="slider-amount-tolerance"
            />
            <p className="text-xs text-muted-foreground">
              Allows matching when amounts differ by up to R{rules.amountTolerance.toFixed(2)}
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Date Window</Label>
              <span className="text-sm font-mono bg-muted px-2 py-0.5 rounded" data-testid="text-date-window">
                {rules.dateWindowDays} days
              </span>
            </div>
            <Slider
              value={[rules.dateWindowDays]}
              onValueChange={([v]) => updateRule("dateWindowDays", v)}
              min={0}
              max={7}
              step={1}
              className="w-full"
              data-testid="slider-date-window"
            />
            <p className="text-xs text-muted-foreground">
              Bank transactions can appear up to {rules.dateWindowDays} days after fuel transactions
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Time Window</Label>
              <span className="text-sm font-mono bg-muted px-2 py-0.5 rounded" data-testid="text-time-window">
                {rules.timeWindowMinutes} min
              </span>
            </div>
            <Slider
              value={[rules.timeWindowMinutes]}
              onValueChange={([v]) => updateRule("timeWindowMinutes", v)}
              min={15}
              max={180}
              step={15}
              className="w-full"
              data-testid="slider-time-window"
            />
            <p className="text-xs text-muted-foreground">
              For same-day matches, times can differ by up to {rules.timeWindowMinutes} minutes
            </p>
          </div>
        </div>

        <div className="space-y-4 pt-2 border-t">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-1">
              <Label className="text-sm font-medium">Require Card Match</Label>
              <p className="text-xs text-muted-foreground">
                Only match if card numbers (last 4 digits) are identical
              </p>
            </div>
            <Switch
              checked={rules.requireCardMatch}
              onCheckedChange={(checked) => updateRule("requireCardMatch", checked)}
              data-testid="switch-require-card-match"
            />
          </div>
        </div>

        <div className="space-y-4 pt-2 border-t">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Minimum Confidence</Label>
              <span className="text-sm font-mono bg-muted px-2 py-0.5 rounded" data-testid="text-min-confidence">
                {rules.minimumConfidence}%
              </span>
            </div>
            <Slider
              value={[rules.minimumConfidence]}
              onValueChange={([v]) => updateRule("minimumConfidence", v)}
              min={30}
              max={100}
              step={5}
              className="w-full"
              data-testid="slider-min-confidence"
            />
            <p className="text-xs text-muted-foreground">
              Skip matches below {rules.minimumConfidence}% confidence
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Auto-Match Threshold</Label>
              <span className="text-sm font-mono bg-muted px-2 py-0.5 rounded" data-testid="text-auto-threshold">
                {rules.autoMatchThreshold}%
              </span>
            </div>
            <Slider
              value={[rules.autoMatchThreshold]}
              onValueChange={([v]) => updateRule("autoMatchThreshold", v)}
              min={50}
              max={100}
              step={5}
              className="w-full"
              data-testid="slider-auto-threshold"
            />
            <p className="text-xs text-muted-foreground">
              Matches above {rules.autoMatchThreshold}% are auto-approved; below need review
            </p>
          </div>
        </div>

        <div className="flex gap-2 pt-4 border-t">
          <Button
            onClick={() => saveMutation.mutate(rules)}
            disabled={!hasChanges || saveMutation.isPending}
            className="flex-1 gap-2"
            data-testid="button-save-rules"
          >
            {saveMutation.isPending ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Save Rules
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
