import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Building2, 
  CheckCircle2, 
  ArrowRight, 
  ArrowLeft, 
  RefreshCw,
  X,
  Plus,
  FileSpreadsheet
} from "lucide-react";
import { WizardStepLayout } from "./WizardStepLayout";
import type { UploadedFile } from "@shared/schema";

interface BankStatusScreenProps {
  bankFiles: UploadedFile[];
  onSelectBank: (bankName: string) => void;
  onReplaceBank: (fileId: string, bankName: string) => void;
  onRemoveBank: (fileId: string) => void;
  onContinue: () => void;
  onBack: () => void;
  isRemoving?: boolean;
  stepColor?: string;
}

const STANDARD_BANKS = ["FNB", "ABSA", "Standard Bank", "Nedbank"];

export function BankStatusScreen({
  bankFiles,
  onSelectBank,
  onReplaceBank,
  onRemoveBank,
  onContinue,
  onBack,
  isRemoving = false,
}: BankStatusScreenProps) {
  const [showOtherInput, setShowOtherInput] = useState(false);
  const [otherBankName, setOtherBankName] = useState("");

  const uploadedBankNames = bankFiles.map(f => f.bankName || f.sourceName || "");
  const availableBanks = STANDARD_BANKS.filter(bank => !uploadedBankNames.includes(bank));
  const hasUploads = bankFiles.length > 0;

  const handleOtherBankSubmit = () => {
    if (otherBankName.trim()) {
      onSelectBank(otherBankName.trim());
      setOtherBankName("");
      setShowOtherInput(false);
    }
  };

  const statusSection = hasUploads ? (
    <div className="space-y-2">
      {bankFiles.map((file) => (
        <div
          key={file.id}
          className="flex items-center gap-3 p-3 rounded-lg border border-border/50 bg-card"
          data-testid={`status-bank-file-${file.id}`}
        >
          <CheckCircle2 className="h-5 w-5 text-[#166534] dark:text-emerald-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-medium truncate">
              {file.bankName || file.sourceName || file.fileName}
            </p>
            <p className="text-sm text-muted-foreground">
              {file.rowCount?.toLocaleString()} rows &middot; {file.fileName}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onReplaceBank(file.id, file.bankName || file.sourceName || "Bank")}
              data-testid={`button-replace-bank-${file.id}`}
            >
              <RefreshCw className="h-4 w-4" />
              <span className="sr-only">Replace</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onRemoveBank(file.id)}
              disabled={isRemoving}
              data-testid={`button-remove-bank-${file.id}`}
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Remove</span>
            </Button>
          </div>
        </div>
      ))}
    </div>
  ) : null;

  const actionsSection = (
    <div className="space-y-4">
      <h3 className="text-sm font-medium text-muted-foreground">
        {hasUploads ? "Add Another Bank (optional)" : "Select a Bank to Upload"}
      </h3>
      
      {availableBanks.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {availableBanks.map((bank) => (
            <Button
              key={bank}
              variant="outline"
              className="h-auto py-4 flex flex-col items-center gap-2"
              onClick={() => onSelectBank(bank)}
              data-testid={`button-select-${bank.toLowerCase().replace(/\s+/g, "-")}`}
            >
              <Building2 className="h-6 w-6" />
              <span>{bank}</span>
            </Button>
          ))}
        </div>
      )}

      {showOtherInput ? (
        <div className="space-y-3 p-4 border rounded-lg bg-muted/20">
          <Label htmlFor="other-bank-name">Bank Name</Label>
          <div className="flex gap-2">
            <Input
              id="other-bank-name"
              placeholder="e.g. Capitec, Investec"
              value={otherBankName}
              onChange={(e) => setOtherBankName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleOtherBankSubmit()}
              data-testid="input-other-bank-name"
              autoFocus
            />
            <Button 
              onClick={handleOtherBankSubmit}
              disabled={!otherBankName.trim()}
              data-testid="button-confirm-other-bank"
            >
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Upload
            </Button>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setShowOtherInput(false);
              setOtherBankName("");
            }}
            data-testid="button-cancel-other-bank"
          >
            Cancel
          </Button>
        </div>
      ) : (
        <Button
          variant="ghost"
          className="w-full"
          onClick={() => setShowOtherInput(true)}
          data-testid="button-select-other"
        >
          <Plus className="h-4 w-4 mr-2" />
          Other Bank
        </Button>
      )}
    </div>
  );

  const navigationSection = (
    <>
      <Button
        variant="outline"
        onClick={onBack}
        data-testid="button-back-fuel"
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back to Fuel Data
      </Button>
      
      {hasUploads ? (
        <Button
          onClick={onContinue}
          data-testid="button-continue-matching"
        >
          Continue to Configure Matching
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      ) : (
        <Button disabled data-testid="button-continue-disabled">
          Upload at least one bank file
        </Button>
      )}
    </>
  );

  return (
    <WizardStepLayout
      icon={Building2}
      title="Bank Statements"
      description="Upload bank statements to verify your fuel transactions."
      statusSection={statusSection}
      actionsSection={actionsSection}
      navigationSection={navigationSection}
    />
  );
}
