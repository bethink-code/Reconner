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
    <div className="max-w-2xl mx-auto bg-section rounded-2xl p-8" data-testid="wizard-step-card">
      {/* Header */}
      <div className="text-center pb-6">
        <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-card flex items-center justify-center">
          <Icon className="h-6 w-6 text-primary" />
        </div>
        <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
        <p className="text-sm text-muted-foreground mt-1">{description}</p>
      </div>

      {/* Content */}
      <div className="space-y-6">
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
      </div>
    </div>
  );
}
