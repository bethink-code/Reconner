import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { X, Check } from "lucide-react";
import StatusBadge from "./StatusBadge";

interface Transaction {
  id: string;
  date: string;
  amount: number;
  reference: string;
  description?: string;
  source: string;
}

interface SuggestedMatch {
  transaction: Transaction;
  confidence: number;
}

interface ManualMatchPanelProps {
  transaction: Transaction;
  suggestedMatches: SuggestedMatch[];
  onMatch?: (transactionId: string, matchId: string, notes: string) => void;
  onReject?: () => void;
  onClose?: () => void;
}

export default function ManualMatchPanel({
  transaction,
  suggestedMatches,
  onMatch,
  onReject,
  onClose,
}: ManualMatchPanelProps) {
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");

  const formatCurrency = (amount: number) => {
    return "R " + amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const handleConfirmMatch = () => {
    if (selectedMatchId) {
      onMatch?.(transaction.id, selectedMatchId, notes);
      onClose?.();
    }
  };

  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-background border-l shadow-xl overflow-y-auto z-50" data-testid="panel-manual-match">
      <Card className="rounded-none border-0">
        <CardHeader className="border-b">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Review Transaction</CardTitle>
            <Button variant="ghost" size="icon" onClick={onClose} data-testid="button-close-panel">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        
        <CardContent className="p-6 space-y-6">
          {/* Current Transaction */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Current Transaction</h3>
            <div className="bg-muted/30 rounded-lg p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">ID</span>
                <span className="text-sm font-mono">{transaction.id}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Date</span>
                <span className="text-sm">{transaction.date}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Amount</span>
                <span className="text-sm font-mono font-semibold">
                  {formatCurrency(transaction.amount)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Reference</span>
                <span className="text-sm font-mono">{transaction.reference}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Source</span>
                <span className="text-sm">{transaction.source}</span>
              </div>
              {transaction.description && (
                <div className="pt-2 border-t">
                  <span className="text-xs text-muted-foreground">Description</span>
                  <p className="text-sm mt-1">{transaction.description}</p>
                </div>
              )}
            </div>
          </div>

          {/* Suggested Matches */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">
              Suggested Matches ({suggestedMatches.length})
            </h3>
            <div className="space-y-2">
              {suggestedMatches.map((match) => (
                <div
                  key={match.transaction.id}
                  className={`border rounded-lg p-3 cursor-pointer transition-colors ${
                    selectedMatchId === match.transaction.id
                      ? "border-primary bg-primary/5"
                      : "hover-elevate"
                  }`}
                  onClick={() => setSelectedMatchId(match.transaction.id)}
                  data-testid={`match-suggestion-${match.transaction.id}`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <span className="text-xs font-mono">{match.transaction.id}</span>
                    <Badge variant="secondary" className="text-xs">
                      {match.confidence}% match
                    </Badge>
                  </div>
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Date:</span>
                      <span>{match.transaction.date}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Amount:</span>
                      <span className="font-mono">
                        {formatCurrency(match.transaction.amount)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Ref:</span>
                      <span className="font-mono">{match.transaction.reference}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Notes & Adjustments</h3>
            <Textarea
              placeholder="Add notes about this match or any adjustments made..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="min-h-24"
              data-testid="textarea-notes"
            />
          </div>

          {/* Actions */}
          <div className="space-y-2 pt-4 border-t">
            <Button
              className="w-full"
              disabled={!selectedMatchId}
              onClick={handleConfirmMatch}
              data-testid="button-confirm-match"
            >
              <Check className="h-4 w-4 mr-2" />
              Confirm Match
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                onReject?.();
              }}
              data-testid="button-reject-match"
            >
              <X className="h-4 w-4 mr-2" />
              Reject All Matches
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
