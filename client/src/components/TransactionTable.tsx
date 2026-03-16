import { useState, Fragment } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import StatusBadge from "./StatusBadge";
import { ChevronDown, ChevronUp, CreditCard, Banknote } from "lucide-react";
import type { Transaction } from "@shared/schema";

interface TransactionTableProps {
  title: string;
  transactions: Transaction[];
  showSelection?: boolean;
  onTransactionSelect?: (transaction: Transaction) => void;
}

export default function TransactionTable({ 
  title, 
  transactions, 
  showSelection = false,
  onTransactionSelect 
}: TransactionTableProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggleSelection = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const formatCurrency = (amount: string | number) => {
    const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    return "R " + (isNaN(numAmount) ? 0 : numAmount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const getPaymentTypeIcon = (paymentType: string | null, isCard: string | null) => {
    if (isCard === 'yes' || paymentType?.toLowerCase().includes('card')) {
      return <CreditCard className="h-3 w-3 text-chart-4" />;
    } else if (isCard === 'no' || paymentType?.toLowerCase().includes('cash')) {
      return <Banknote className="h-3 w-3 text-chart-5" />;
    }
    return null;
  };

  return (
    <Card data-testid={`card-${title.toLowerCase().replace(/\s/g, '-')}`}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{title}</CardTitle>
          <span className="text-sm text-muted-foreground">
            {transactions.length} transaction{transactions.length !== 1 ? 's' : ''}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/50">
                <tr className="border-b">
                  {showSelection && <th className="w-12 p-3"></th>}
                  <th className="text-left p-3 text-sm font-semibold">Date</th>
                  <th className="text-left p-3 text-sm font-semibold">Reference</th>
                  <th className="text-left p-3 text-sm font-semibold">Description</th>
                  <th className="text-right p-3 text-sm font-semibold">Amount</th>
                  <th className="text-left p-3 text-sm font-semibold">Source</th>
                  <th className="text-left p-3 text-sm font-semibold">Type</th>
                  <th className="text-left p-3 text-sm font-semibold">Status</th>
                  <th className="w-12 p-3"></th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((transaction) => (
                  <Fragment key={transaction.id}>
                    <tr 
                      className="border-b hover-elevate cursor-pointer"
                      onClick={() => onTransactionSelect?.(transaction)}
                      data-testid={`row-transaction-${transaction.id}`}
                    >
                      {showSelection && (
                        <td className="p-3">
                          <Checkbox
                            checked={selectedIds.has(transaction.id)}
                            onCheckedChange={() => toggleSelection(transaction.id)}
                            onClick={(e) => e.stopPropagation()}
                            data-testid={`checkbox-${transaction.id}`}
                          />
                        </td>
                      )}
                      <td className="p-3 text-sm">{transaction.transactionDate}</td>
                      <td className="p-3 text-sm font-mono">{transaction.referenceNumber || '-'}</td>
                      <td className="p-3 text-sm text-muted-foreground truncate max-w-xs">
                        {transaction.description || '-'}
                      </td>
                      <td className="p-3 text-sm font-mono text-right">
                        {formatCurrency(transaction.amount)}
                      </td>
                      <td className="p-3 text-sm">
                        <Badge variant="outline" className="text-xs">
                          {transaction.sourceName || (transaction.sourceType === 'fuel' ? 'Fuel System' : 'Bank')}
                        </Badge>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-1">
                          {getPaymentTypeIcon(transaction.paymentType, transaction.isCardTransaction)}
                          <span className="text-xs text-muted-foreground">
                            {transaction.paymentType || (transaction.isCardTransaction === 'yes' ? 'Card' : transaction.isCardTransaction === 'no' ? 'Cash' : '-')}
                          </span>
                        </div>
                      </td>
                      <td className="p-3">
                        <StatusBadge status={transaction.matchStatus as "matched" | "unmatched" | "partial"} />
                      </td>
                      <td className="p-3">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleExpand(transaction.id);
                          }}
                          data-testid={`button-expand-${transaction.id}`}
                        >
                          {expandedId === transaction.id ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </Button>
                      </td>
                    </tr>
                    {expandedId === transaction.id && (
                      <tr className="bg-muted/30">
                        <td colSpan={showSelection ? 10 : 9} className="p-4">
                          <div className="space-y-2 text-sm">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                              <div>
                                <span className="font-medium">Transaction ID:</span>{" "}
                                <span className="font-mono text-xs">{transaction.id}</span>
                              </div>
                              <div>
                                <span className="font-medium">Source Type:</span>{" "}
                                {transaction.sourceType === 'fuel' ? 'Fuel System' : 'Bank Account'}
                              </div>
                              <div>
                                <span className="font-medium">Payment Type:</span>{" "}
                                {transaction.paymentType || 'N/A'}
                              </div>
                              <div>
                                <span className="font-medium">Card Transaction:</span>{" "}
                                {transaction.isCardTransaction === 'yes' ? 'Yes' : transaction.isCardTransaction === 'no' ? 'No' : 'Unknown'}
                              </div>
                            </div>
                            <div>
                              <span className="font-medium">Full Description:</span>{" "}
                              {transaction.description || 'N/A'}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
