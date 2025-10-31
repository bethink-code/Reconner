import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import StatusBadge from "./StatusBadge";
import { ChevronDown, ChevronUp } from "lucide-react";

interface Transaction {
  id: string;
  date: string;
  amount: number;
  reference: string;
  description?: string;
  source: string;
  matchStatus?: "matched" | "unmatched" | "partial";
  confidence?: number;
}

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

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
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
                  {transactions.some(t => t.matchStatus) && (
                    <th className="text-left p-3 text-sm font-semibold">Status</th>
                  )}
                  <th className="w-12 p-3"></th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((transaction) => (
                  <>
                    <tr 
                      key={transaction.id} 
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
                      <td className="p-3 text-sm">{transaction.date}</td>
                      <td className="p-3 text-sm font-mono">{transaction.reference}</td>
                      <td className="p-3 text-sm text-muted-foreground truncate max-w-xs">
                        {transaction.description || '-'}
                      </td>
                      <td className="p-3 text-sm font-mono text-right">
                        {formatCurrency(transaction.amount)}
                      </td>
                      <td className="p-3 text-sm">{transaction.source}</td>
                      {transactions.some(t => t.matchStatus) && (
                        <td className="p-3">
                          {transaction.matchStatus && (
                            <StatusBadge status={transaction.matchStatus} />
                          )}
                        </td>
                      )}
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
                        <td colSpan={showSelection ? 8 : 7} className="p-4">
                          <div className="space-y-2 text-sm">
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <span className="font-medium">Transaction ID:</span>{" "}
                                <span className="font-mono">{transaction.id}</span>
                              </div>
                              <div>
                                <span className="font-medium">Full Description:</span>{" "}
                                {transaction.description || 'N/A'}
                              </div>
                            </div>
                            {transaction.confidence !== undefined && (
                              <div>
                                <span className="font-medium">Match Confidence:</span>{" "}
                                {transaction.confidence}%
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
