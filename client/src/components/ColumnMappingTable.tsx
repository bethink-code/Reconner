import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { CheckCircle2, AlertCircle } from "lucide-react";

interface ColumnMapping {
  detectedColumn: string;
  mappedTo: string;
  sampleData: string[];
}

interface ColumnMappingTableProps {
  source: string;
  columns: ColumnMapping[];
  onMappingConfirm?: (mappings: ColumnMapping[]) => void;
}

export default function ColumnMappingTable({ source, columns: initialColumns, onMappingConfirm }: ColumnMappingTableProps) {
  const [columns, setColumns] = useState(initialColumns);

  const handleMappingChange = (index: number, value: string) => {
    const updated = [...columns];
    updated[index].mappedTo = value;
    setColumns(updated);
  };

  const allMapped = columns.every((col) => col.mappedTo !== "");
  const requiredFields = ["date", "amount", "reference"];
  const mappedFields = columns.map((col) => col.mappedTo).filter((m) => m !== "ignore");
  const hasAllRequired = requiredFields.every((field) => mappedFields.includes(field));

  return (
    <Card data-testid={`card-mapping-${source}`}>
      <CardHeader>
        <CardTitle className="text-lg">Column Mapping - {source}</CardTitle>
        <p className="text-sm text-muted-foreground">
          Map detected columns to required fields
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4 pb-2 border-b text-sm font-semibold">
            <div>Detected Column</div>
            <div>Map To</div>
            <div>Sample Data</div>
          </div>

          {columns.map((col, index) => (
            <div key={index} className="grid grid-cols-3 gap-4 items-start" data-testid={`row-mapping-${index}`}>
              <div className="text-sm font-medium pt-2">{col.detectedColumn}</div>
              <Select value={col.mappedTo} onValueChange={(value) => handleMappingChange(index, value)}>
                <SelectTrigger data-testid={`select-mapping-${index}`}>
                  <SelectValue placeholder="Select field" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="date">Date</SelectItem>
                  <SelectItem value="amount">Amount</SelectItem>
                  <SelectItem value="reference">Reference</SelectItem>
                  <SelectItem value="description">Description</SelectItem>
                  <SelectItem value="cardNumber">Card Number</SelectItem>
                  <SelectItem value="paymentType">Payment Type</SelectItem>
                  <SelectItem value="attendant">Attendant</SelectItem>
                  <SelectItem value="pump">Pump</SelectItem>
                  <SelectItem value="ignore">Ignore</SelectItem>
                </SelectContent>
              </Select>
              <div className="text-sm text-muted-foreground font-mono">
                {col.sampleData.slice(0, 2).join(", ")}...
              </div>
            </div>
          ))}

          <div className="pt-4 border-t flex items-center justify-between">
            <div className="flex items-center gap-2">
              {hasAllRequired ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-chart-2" />
                  <span className="text-sm text-chart-2">All required fields mapped</span>
                </>
              ) : (
                <>
                  <AlertCircle className="h-4 w-4 text-chart-4" />
                  <span className="text-sm text-muted-foreground">
                    Required: Date, Amount, Reference
                  </span>
                </>
              )}
            </div>
            <Button
              disabled={!hasAllRequired}
              onClick={() => {
                onMappingConfirm?.(columns);
              }}
              data-testid="button-confirm-mapping"
            >
              Confirm Mapping
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
