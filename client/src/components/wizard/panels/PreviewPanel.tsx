import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowLeft, Check, Loader2, AlertCircle, CreditCard, Banknote, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface NormalizedTransaction {
  transactionDate: string;
  transactionTime: string;
  amount: string;
  referenceNumber: string;
  description: string;
  cardNumber: string;
  paymentType: string;
  isCardTransaction: "yes" | "no" | "unknown";
}

interface FilePreview {
  headers: string[];
  rows: Record<string, unknown>[];
  totalRows: number;
  normalizedPreview: NormalizedTransaction[];
}

interface PreviewPanelProps {
  periodId: string;
  fileId: string;
  sourceType: "fuel" | "bank";
  onConfirm: () => void;
  onBack: () => void;
}

export function PreviewPanel({
  periodId,
  fileId,
  sourceType,
  onConfirm,
  onBack,
}: PreviewPanelProps) {
  const { toast } = useToast();
  
  const { data: preview, isLoading } = useQuery<FilePreview>({
    queryKey: ["/api/files", fileId, "preview"],
    enabled: !!fileId,
  });
  
  const processFileMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/files/${fileId}/process`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/periods", periodId, "files"] });
      queryClient.invalidateQueries({ queryKey: ["/api/periods", periodId, "transactions"] });
      toast({
        title: "File processed",
        description: "Transactions have been imported successfully.",
      });
      onConfirm();
    },
    onError: (error: Error) => {
      toast({
        title: "Processing failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  if (isLoading) {
    return (
      <Card className="max-w-3xl mx-auto" data-testid="card-preview-loading">
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }
  
  if (!preview) {
    return (
      <Card className="max-w-3xl mx-auto" data-testid="card-preview-error">
        <CardContent className="text-center py-12">
          <AlertCircle className="h-8 w-8 mx-auto text-destructive mb-2" />
          <p className="text-muted-foreground">Failed to load preview</p>
        </CardContent>
      </Card>
    );
  }
  
  const normalized = preview.normalizedPreview || [];
  const cardTransactions = normalized.filter(t => t.isCardTransaction === "yes");
  const cashTransactions = normalized.filter(t => t.isCardTransaction === "no");
  const unknownTransactions = normalized.filter(t => t.isCardTransaction === "unknown");
  
  const totalAmount = normalized.reduce((sum, t) => {
    const amount = parseFloat(t.amount.replace(/[^0-9.-]/g, "")) || 0;
    return sum + amount;
  }, 0);
  
  const cardAmount = cardTransactions.reduce((sum, t) => {
    const amount = parseFloat(t.amount.replace(/[^0-9.-]/g, "")) || 0;
    return sum + amount;
  }, 0);
  
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-ZA", {
      style: "currency",
      currency: "ZAR",
    }).format(amount);
  };
  
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Card data-testid="card-preview-summary">
        <CardHeader>
          <CardTitle>Preview Your Data</CardTitle>
          <CardDescription>
            Here's how your data will be imported. Check that it looks correct before continuing.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 bg-muted/50 rounded-lg text-center">
              <p className="text-2xl font-bold">{preview.totalRows.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">Total Rows</p>
            </div>
            <div className="p-4 bg-muted/50 rounded-lg text-center">
              <p className="text-2xl font-bold">{formatCurrency(totalAmount)}</p>
              <p className="text-xs text-muted-foreground">Total Value</p>
            </div>
            {sourceType === "fuel" && (
              <>
                <div className="p-4 bg-primary/5 rounded-lg text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <CreditCard className="h-4 w-4 text-primary" />
                    <span className="text-2xl font-bold text-primary">{cardTransactions.length.toLocaleString()}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Card Transactions</p>
                </div>
                <div className="p-4 bg-muted/50 rounded-lg text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <Banknote className="h-4 w-4 text-muted-foreground" />
                    <span className="text-2xl font-bold">{cashTransactions.length.toLocaleString()}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Cash/Other</p>
                </div>
              </>
            )}
          </div>
          
          {sourceType === "fuel" && cardTransactions.length > 0 && (
            <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
              <p className="text-sm">
                <strong className="text-primary">{cardTransactions.length.toLocaleString()}</strong> card transactions 
                ({formatCurrency(cardAmount)}) will be matched against your bank records.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
      
      <Card data-testid="card-preview-table">
        <CardHeader>
          <CardTitle className="text-base">Sample Rows</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  {sourceType === "fuel" && <TableHead>Type</TableHead>}
                  {normalized.some(t => t.cardNumber) && <TableHead>Card</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {normalized.slice(0, 5).map((tx, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="whitespace-nowrap">
                      {tx.transactionDate}
                      {tx.transactionTime && (
                        <span className="text-muted-foreground ml-1">{tx.transactionTime}</span>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-sm">{tx.referenceNumber || "-"}</TableCell>
                    <TableCell className="text-right font-mono">{tx.amount}</TableCell>
                    {sourceType === "fuel" && (
                      <TableCell>
                        {tx.isCardTransaction === "yes" ? (
                          <Badge className="bg-primary/10 text-primary">Card</Badge>
                        ) : tx.isCardTransaction === "no" ? (
                          <Badge variant="secondary">Cash</Badge>
                        ) : (
                          <Badge variant="outline">Unknown</Badge>
                        )}
                      </TableCell>
                    )}
                    {normalized.some(t => t.cardNumber) && (
                      <TableCell className="font-mono text-sm">
                        {tx.cardNumber || "-"}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {preview.totalRows > 5 && (
            <p className="text-xs text-muted-foreground text-center mt-4">
              Showing 5 of {preview.totalRows.toLocaleString()} rows
            </p>
          )}
        </CardContent>
      </Card>
      
      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack} data-testid="button-back-preview">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Mapping
        </Button>
        
        <Button
          onClick={() => processFileMutation.mutate()}
          disabled={processFileMutation.isPending}
          data-testid="button-confirm-import"
        >
          {processFileMutation.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Check className="h-4 w-4 mr-2" />
          )}
          Confirm & Continue
        </Button>
      </div>
    </div>
  );
}
