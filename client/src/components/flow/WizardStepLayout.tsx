import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { LucideIcon } from "lucide-react";

interface WizardStepLayoutProps {
  icon: LucideIcon;
  title: string;
  description: string;
  statusSection?: React.ReactNode;
  actionsSection: React.ReactNode;
  navigationSection?: React.ReactNode;
}

export function WizardStepLayout({
  icon: Icon,
  title,
  description,
  statusSection,
  actionsSection,
  navigationSection,
}: WizardStepLayoutProps) {
  return (
    <Card className="max-w-2xl mx-auto" data-testid="wizard-step-card">
      <CardHeader className="text-center pb-4">
        <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
          <Icon className="h-6 w-6 text-primary" />
        </div>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {statusSection && (
          <>
            <div className="space-y-3" data-testid="status-section">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Status
              </h3>
              {statusSection}
            </div>
            <Separator />
          </>
        )}
        
        <div className="space-y-4" data-testid="actions-section">
          {actionsSection}
        </div>
        
        {navigationSection && (
          <>
            <Separator />
            <div className="flex justify-between gap-3" data-testid="navigation-section">
              {navigationSection}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
