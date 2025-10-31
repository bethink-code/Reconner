import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight } from "lucide-react";
import ColumnMappingTable from "@/components/ColumnMappingTable";
import { Link } from "wouter";

export default function ColumnMapping() {
  const [, setLocation] = useLocation();
  const [confirmedMappings, setConfirmedMappings] = useState({
    fuel: false,
    bank1: false,
  });

  // todo: remove mock functionality
  const fuelColumns = [
    {
      detectedColumn: "Transaction Date",
      mappedTo: "date",
      sampleData: ["2024-01-15", "2024-01-16", "2024-01-17"],
    },
    {
      detectedColumn: "Total Amount",
      mappedTo: "amount",
      sampleData: ["1250.50", "890.00", "2100.75"],
    },
    {
      detectedColumn: "Ref#",
      mappedTo: "reference",
      sampleData: ["REF001", "REF002", "REF003"],
    },
    {
      detectedColumn: "Description",
      mappedTo: "description",
      sampleData: ["Fuel delivery", "Payment", "Supply"],
    },
  ];

  const bank1Columns = [
    {
      detectedColumn: "Date",
      mappedTo: "date",
      sampleData: ["01/15/2024", "01/16/2024", "01/17/2024"],
    },
    {
      detectedColumn: "Amount",
      mappedTo: "amount",
      sampleData: ["$1,250.50", "$890.00", "$2,100.75"],
    },
    {
      detectedColumn: "Reference Number",
      mappedTo: "reference",
      sampleData: ["BANK-REF-001", "BANK-REF-002", "BANK-REF-003"],
    },
    {
      detectedColumn: "Memo",
      mappedTo: "",
      sampleData: ["Payment received", "Transfer", "Deposit"],
    },
  ];

  const handleMappingConfirm = (source: 'fuel' | 'bank1') => () => {
    console.log(`${source} mapping confirmed`);
    setConfirmedMappings(prev => ({ ...prev, [source]: true }));
  };

  const canContinue = confirmedMappings.fuel && confirmedMappings.bank1;

  const handleContinue = () => {
    console.log('Proceeding to reconciliation');
    setLocation("/reconcile");
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center gap-4">
            <Link href="/upload">
              <Button variant="ghost" size="icon" data-testid="button-back">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div className="flex-1">
              <h1 className="text-2xl font-semibold">Map Data Columns</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Confirm field mappings for uploaded files
              </p>
            </div>
            <Button 
              onClick={handleContinue}
              disabled={!canContinue}
              data-testid="button-start-reconciliation"
            >
              Start Reconciliation
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        <div className="space-y-6">
          <ColumnMappingTable
            source="Fuel Management System"
            columns={fuelColumns}
            onMappingConfirm={handleMappingConfirm('fuel')}
          />

          <ColumnMappingTable
            source="Bank Account 1"
            columns={bank1Columns}
            onMappingConfirm={handleMappingConfirm('bank1')}
          />
        </div>
      </main>
    </div>
  );
}
