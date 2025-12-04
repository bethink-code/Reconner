import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, ArrowRight } from "lucide-react";
import { useWizard } from "@/contexts/WizardContext";
import type { UploadedFile } from "@shared/schema";

interface CompletionPanelProps {
  title: string;
  file: UploadedFile;
  nextStepLabel: string;
}

export function CompletionPanel({ title, file, nextStepLabel }: CompletionPanelProps) {
  const { goForward, state, currentStep } = useWizard();
  
  const isLastStep = state.currentStepIndex === state.steps.length - 1;
  
  return (
    <Card className="max-w-2xl mx-auto" data-testid="card-completion">
      <CardContent className="pt-8 pb-8 text-center">
        <div className="h-16 w-16 rounded-full bg-green-100 dark:bg-green-900/50 flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
        </div>
        
        <h2 className="text-xl font-semibold mb-2">{title}</h2>
        
        <div className="space-y-1 text-muted-foreground mb-6">
          <p>{file.rowCount?.toLocaleString()} transactions ready for reconciliation</p>
        </div>
        
        <p className="text-sm text-muted-foreground mb-6">
          {nextStepLabel}
        </p>
        
        <Button onClick={goForward} data-testid="button-continue-next">
          Continue
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </CardContent>
    </Card>
  );
}
