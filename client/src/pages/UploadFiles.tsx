import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight } from "lucide-react";
import FileUploadZone from "@/components/FileUploadZone";
import { Link } from "wouter";

export default function UploadFiles() {
  const [, setLocation] = useLocation();
  const [uploadedFiles, setUploadedFiles] = useState({
    fuel: false,
    bank1: false,
    bank2: false,
  });

  const handleFilesSelected = (source: 'fuel' | 'bank1' | 'bank2') => (files: File[]) => {
    console.log(`${source} files selected:`, files);
    setUploadedFiles(prev => ({ ...prev, [source]: files.length > 0 }));
  };

  const canContinue = uploadedFiles.fuel && (uploadedFiles.bank1 || uploadedFiles.bank2);

  const handleContinue = () => {
    console.log('Proceeding to column mapping');
    setLocation("/mapping");
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center gap-4">
            <Link href="/create">
              <Button variant="ghost" size="icon" data-testid="button-back">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div className="flex-1">
              <h1 className="text-2xl font-semibold">Upload Transaction Files</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Upload files from your fuel management system and bank accounts
              </p>
            </div>
            <Button 
              onClick={handleContinue}
              disabled={!canContinue}
              data-testid="button-continue"
            >
              Continue to Mapping
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        <div className="space-y-6">
          <FileUploadZone
            label="Upload Fuel Management Transactions"
            onFilesSelected={handleFilesSelected('fuel')}
          />

          <FileUploadZone
            label="Upload Bank Account 1 Transactions"
            onFilesSelected={handleFilesSelected('bank1')}
          />

          <FileUploadZone
            label="Upload Bank Account 2 Transactions (Optional)"
            onFilesSelected={handleFilesSelected('bank2')}
          />
        </div>
      </main>
    </div>
  );
}
