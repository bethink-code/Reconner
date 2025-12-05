import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, FileText } from "lucide-react";
import { DataQualityWarnings, type DataQualityReport } from "@/components/DataQualityWarnings";
import type { UploadedFile } from "@shared/schema";

interface QualityCheckPanelProps {
  file: UploadedFile;
  qualityReport: DataQualityReport;
  onContinue: () => void;
  onBack: () => void;
}

export function QualityCheckPanel({
  file,
  qualityReport,
  onContinue,
  onBack,
}: QualityCheckPanelProps) {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Card data-testid="card-quality-check">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Checking Your File
          </CardTitle>
          <CardDescription>
            {file.fileName}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataQualityWarnings
            report={qualityReport}
            fileName={file.fileName}
            onContinue={onContinue}
          />
        </CardContent>
      </Card>
      
      <div className="flex justify-start">
        <Button variant="outline" onClick={onBack} data-testid="button-back-quality">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Choose Different File
        </Button>
      </div>
    </div>
  );
}
