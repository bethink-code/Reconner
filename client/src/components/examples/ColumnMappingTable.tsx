import ColumnMappingTable from '../ColumnMappingTable';

export default function ColumnMappingTableExample() {
  const mockColumns = [
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
      detectedColumn: "Notes",
      mappedTo: "",
      sampleData: ["Fuel delivery", "Payment received", "Adjustment"],
    },
  ];

  return (
    <div className="max-w-4xl">
      <ColumnMappingTable
        source="Fuel Management System"
        columns={mockColumns}
        onMappingConfirm={(mappings) => console.log('Mappings confirmed:', mappings)}
      />
    </div>
  );
}
