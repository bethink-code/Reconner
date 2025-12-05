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
import { ArrowLeft, Check, Loader2, AlertCircle, CreditCard, Banknote, AlertTriangle, XCircle } from "lucide-react";
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

interface FullAnalysisStats {
  totalRows: number;
  validTransactions: number;
  cardTransactions: number;
  cashTransactions: number;
  unknownPaymentType: number;
  skippedRows: {
    headerRows: number;
    emptyDate: number;
    zeroOrInvalidAmount: number;
    pageBreaks: number;
    other: number;
  };
}

interface FilePreview {
  headers: string[];
  rows: Record<string, unknown>[];
  totalRows: number;
  normalizedPreview: NormalizedTransaction[];
  fullAnalysisStats?: FullAnalysisStats;
}

interface ProcessingResult {
  transactionsCreated: number;
}

interface PreviewPanelProps {
  periodId: string;
  fileId: string;
  sourceType: "fuel" | "bank";
  onConfirm: (result: ProcessingResult) => void;
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
    mutationFn: async (): Promise<{ transactionsCreated: number }> => {
      const response = await apiRequest("POST", `/api/files/${fileId}/process`);
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/periods", periodId, "files"] });
      queryClient.invalidateQueries({ queryKey: ["/api/periods", periodId, "transactions"] });
      toast({
        title: "File processed",
        description: `${data.transactionsCreated} transactions imported successfully.`,
      });
      onConfirm({ transactionsCreated: data.transactionsCreated });
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
              <p className="text-2xl font-bold">
                {preview.fullAnalysisStats?.validTransactions?.toLocaleString() || normalized.length.toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground">Valid Transactions</p>
            </div>
            {sourceType === "fuel" && (
              <>
                <div className="p-4 bg-primary/5 rounded-lg text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <CreditCard className="h-4 w-4 text-primary" />
                    <span className="text-2xl font-bold text-primary">
                      {preview.fullAnalysisStats?.cardTransactions?.toLocaleString() || cardTransactions.length.toLocaleString()}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">Card Transactions</p>
                </div>
                <div className="p-4 bg-muted/50 rounded-lg text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <Banknote className="h-4 w-4 text-muted-foreground" />
                    <span className="text-2xl font-bold">
                      {preview.fullAnalysisStats?.cashTransactions?.toLocaleString() || cashTransactions.length.toLocaleString()}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">Cash/Other</p>
                </div>
              </>
            )}
          </div>
          
          {sourceType === "fuel" && preview.fullAnalysisStats && (
            <div className="p-4 bg-muted/30 rounded-lg" data-testid="card-row-breakdown">
              <p className="text-sm font-medium mb-2">Row breakdown:</p>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li className="flex justify-between">
                  <span>Total rows in file</span>
                  <span className="font-mono">{preview.fullAnalysisStats.totalRows.toLocaleString()}</span>
                </li>
                <li className="flex justify-between font-medium">
                  <span>→ Valid transactions</span>
                  <span className="font-mono">{preview.fullAnalysisStats.validTransactions.toLocaleString()}</span>
                </li>
                {preview.fullAnalysisStats.cardTransactions > 0 && (
                  <li className="flex justify-between text-primary pl-4">
                    <span>• Card payments (will be matched)</span>
                    <span className="font-mono">{preview.fullAnalysisStats.cardTransactions.toLocaleString()}</span>
                  </li>
                )}
                {preview.fullAnalysisStats.cashTransactions > 0 && (
                  <li className="flex justify-between pl-4">
                    <span>• Cash payments (not matched)</span>
                    <span className="font-mono">{preview.fullAnalysisStats.cashTransactions.toLocaleString()}</span>
                  </li>
                )}
                {preview.fullAnalysisStats.unknownPaymentType > 0 && (
                  <li className="flex justify-between text-amber-600 pl-4">
                    <span>• Unknown payment type</span>
                    <span className="font-mono">{preview.fullAnalysisStats.unknownPaymentType.toLocaleString()}</span>
                  </li>
                )}
                
                {/* Skipped rows breakdown */}
                {(preview.fullAnalysisStats.skippedRows.headerRows > 0 ||
                  preview.fullAnalysisStats.skippedRows.emptyDate > 0 ||
                  preview.fullAnalysisStats.skippedRows.zeroOrInvalidAmount > 0 ||
                  preview.fullAnalysisStats.skippedRows.pageBreaks > 0 ||
                  preview.fullAnalysisStats.skippedRows.other > 0) && (
                  <>
                    <li className="flex justify-between text-muted-foreground/70 pt-2 border-t mt-2">
                      <span>→ Skipped rows</span>
                      <span className="font-mono">
                        {(preview.fullAnalysisStats.skippedRows.headerRows +
                          preview.fullAnalysisStats.skippedRows.emptyDate +
                          preview.fullAnalysisStats.skippedRows.zeroOrInvalidAmount +
                          preview.fullAnalysisStats.skippedRows.pageBreaks +
                          preview.fullAnalysisStats.skippedRows.other).toLocaleString()}
                      </span>
                    </li>
                    {preview.fullAnalysisStats.skippedRows.headerRows > 0 && (
                      <li className="flex justify-between text-muted-foreground/60 pl-4">
                        <span>• Repeated header rows</span>
                        <span className="font-mono">{preview.fullAnalysisStats.skippedRows.headerRows.toLocaleString()}</span>
                      </li>
                    )}
                    {preview.fullAnalysisStats.skippedRows.emptyDate > 0 && (
                      <li className="flex justify-between text-muted-foreground/60 pl-4">
                        <span>• Missing date</span>
                        <span className="font-mono">{preview.fullAnalysisStats.skippedRows.emptyDate.toLocaleString()}</span>
                      </li>
                    )}
                    {preview.fullAnalysisStats.skippedRows.zeroOrInvalidAmount > 0 && (
                      <li className="flex justify-between text-muted-foreground/60 pl-4">
                        <span>• Zero or invalid amount</span>
                        <span className="font-mono">{preview.fullAnalysisStats.skippedRows.zeroOrInvalidAmount.toLocaleString()}</span>
                      </li>
                    )}
                    {preview.fullAnalysisStats.skippedRows.pageBreaks > 0 && (
                      <li className="flex justify-between text-muted-foreground/60 pl-4">
                        <span>• Page breaks / formatting</span>
                        <span className="font-mono">{preview.fullAnalysisStats.skippedRows.pageBreaks.toLocaleString()}</span>
                      </li>
                    )}
                    {preview.fullAnalysisStats.skippedRows.other > 0 && (
                      <li className="flex justify-between text-muted-foreground/60 pl-4">
                        <span>• Other</span>
                        <span className="font-mono">{preview.fullAnalysisStats.skippedRows.other.toLocaleString()}</span>
                      </li>
                    )}
                  </>
                )}
              </ul>
            </div>
          )}
          
          {sourceType === "fuel" && cardTransactions.length > 0 && (
            <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
              <p className="text-sm">
                <strong className="text-primary">{cardTransactions.length.toLocaleString()}</strong> card transactions 
                ({formatCurrency(cardAmount)}) will be matched against your bank records.
              </p>
            </div>
          )}
          
          {sourceType === "fuel" && cardTransactions.length === 0 && (
            <div className="p-4 bg-destructive/10 border border-destructive/30 rounded-lg" data-testid="alert-zero-transactions">
              <div className="flex items-start gap-3">
                <XCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-destructive">No card transactions found</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    We couldn't find any card transactions in your fuel data. Bank transactions need card sales to match against.
                  </p>
                  <p className="text-sm text-muted-foreground mt-2">
                    <strong>What to check:</strong> Make sure you've mapped the Payment Type column correctly, 
                    or check if your data contains card transactions.
                  </p>
                </div>
              </div>
            </div>
          )}
          
          {sourceType === "fuel" && cardTransactions.length > 0 && preview.totalRows > 100 && cardTransactions.length < preview.totalRows * 0.01 && (
            <div className="p-4 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg" data-testid="alert-low-transactions">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-amber-700 dark:text-amber-400">Low transaction count</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Only <strong>{cardTransactions.length.toLocaleString()}</strong> card transactions from <strong>{preview.totalRows.toLocaleString()}</strong> rows 
                    ({((cardTransactions.length / preview.totalRows) * 100).toFixed(1)}%). Does this seem right?
                  </p>
                  <p className="text-sm text-muted-foreground mt-2">
                    If not, go back and check your column mappings, especially the Payment Type field.
                  </p>
                </div>
              </div>
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
          disabled={processFileMutation.isPending || (sourceType === "fuel" && cardTransactions.length === 0)}
          data-testid="button-confirm-import"
        >
          {processFileMutation.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Check className="h-4 w-4 mr-2" />
          )}
          {sourceType === "fuel" && cardTransactions.length === 0 
            ? "Cannot Continue - No Card Transactions" 
            : "Confirm & Continue"}
        </Button>
      </div>
    </div>
  );
}
