import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CheckCircle2, Plus, ArrowRight, Building2 } from "lucide-react";
import { useWizard } from "@/contexts/WizardContext";

const BANK_PRESETS = [
  { id: "fnb_merchant", name: "FNB Merchant", description: "First National Bank merchant statement" },
  { id: "absa_merchant", name: "ABSA Merchant", description: "ABSA Bank merchant statement" },
  { id: "standard_merchant", name: "Standard Bank Merchant", description: "Standard Bank merchant statement" },
  { id: "nedbank_merchant", name: "Nedbank Merchant", description: "Nedbank merchant statement" },
  { id: "capitec_merchant", name: "Capitec Merchant", description: "Capitec Bank merchant statement" },
  { id: "custom", name: "Other Bank", description: "Any other bank or custom format" },
];

interface AddBankPromptProps {
  periodId: string;
}

export function AddBankPrompt({ periodId }: AddBankPromptProps) {
  const [, setLocation] = useLocation();
  const { state, addBankStep, setAddingBank, hasAtLeastOneBank, allStepsComplete } = useWizard();
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState("");
  const [customName, setCustomName] = useState("");
  
  const completedBanks = state.steps.filter(s => s.type === "bank" && s.isComplete);
  const fuelStep = state.steps.find(s => s.type === "fuel");
  
  const handleAddBank = () => {
    const bankName = selectedPreset === "custom" 
      ? customName || "Custom Bank"
      : BANK_PRESETS.find(p => p.id === selectedPreset)?.name || "Bank Account";
    
    addBankStep(bankName);
    setShowAddForm(false);
    setSelectedPreset("");
    setCustomName("");
  };
  
  const handleContinueToReconcile = () => {
    setLocation(`/flow/${periodId}`);
  };
  
  const handleGoBack = () => {
    setAddingBank(false);
  };
  
  if (!hasAtLeastOneBank) {
    return (
      <Card className="max-w-2xl mx-auto" data-testid="card-no-banks">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Add Your First Bank Statement</CardTitle>
          <CardDescription>
            You need at least one bank statement to verify your fuel transactions.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          <Button onClick={() => setShowAddForm(true)} data-testid="button-add-first-bank">
            <Plus className="h-4 w-4 mr-2" />
            Add Bank Statement
          </Button>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Card className="border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/20" data-testid="card-banks-summary">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
            Ready to Reconcile
          </CardTitle>
          <CardDescription>
            Your files are ready. You can add more bank statements or start reconciliation.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3">
            {fuelStep?.isComplete && (
              <div className="flex items-center gap-3 p-3 bg-background rounded-lg">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">Fuel Transactions</p>
                  <p className="text-xs text-muted-foreground">
                    {fuelStep.file?.rowCount?.toLocaleString()} transactions
                  </p>
                </div>
              </div>
            )}
            
            {completedBanks.map((bank, idx) => (
              <div key={bank.id} className="flex items-center gap-3 p-3 bg-background rounded-lg">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <Building2 className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">{bank.sourceName}</p>
                  <p className="text-xs text-muted-foreground">
                    {bank.file?.rowCount?.toLocaleString()} transactions
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      
      {showAddForm ? (
        <Card data-testid="card-add-bank-form">
          <CardHeader>
            <CardTitle className="text-lg">Add Another Bank Statement</CardTitle>
            <CardDescription>
              Select your bank to auto-configure column mappings.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="bank-preset">Bank</Label>
              <Select value={selectedPreset} onValueChange={setSelectedPreset}>
                <SelectTrigger id="bank-preset" data-testid="select-bank-preset">
                  <SelectValue placeholder="Select your bank" />
                </SelectTrigger>
                <SelectContent>
                  {BANK_PRESETS.map(preset => (
                    <SelectItem key={preset.id} value={preset.id}>
                      {preset.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {selectedPreset === "custom" && (
              <div className="space-y-2">
                <Label htmlFor="custom-name">Bank Name</Label>
                <Input
                  id="custom-name"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="Enter bank name"
                  data-testid="input-custom-bank-name"
                />
              </div>
            )}
            
            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowAddForm(false);
                  setSelectedPreset("");
                  setCustomName("");
                }}
                data-testid="button-cancel-add-bank"
              >
                Cancel
              </Button>
              <Button
                onClick={handleAddBank}
                disabled={!selectedPreset || (selectedPreset === "custom" && !customName.trim())}
                data-testid="button-confirm-add-bank"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Bank
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            variant="outline"
            onClick={() => setShowAddForm(true)}
            className="flex-1"
            data-testid="button-add-another-bank"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Another Bank Statement
          </Button>
          
          <Button
            onClick={handleContinueToReconcile}
            className="flex-1"
            data-testid="button-continue-to-reconcile"
          >
            Continue to Reconciliation
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      )}
    </div>
  );
}
