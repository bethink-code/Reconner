import { Check, Fuel, Building2, Settings, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";

export type ReconciliationStep = "fuel" | "bank" | "configure" | "results";

interface StepConfig {
  id: ReconciliationStep;
  label: string;
  shortLabel: string;
  description: string;
  icon: React.ElementType;
}

const STEPS: StepConfig[] = [
  {
    id: "fuel",
    label: "Upload Fuel Data",
    shortLabel: "Fuel",
    description: "Your source of truth",
    icon: Fuel,
  },
  {
    id: "bank",
    label: "Upload Bank Data",
    shortLabel: "Bank",
    description: "Transactions to verify",
    icon: Building2,
  },
  {
    id: "configure",
    label: "Configure Matching",
    shortLabel: "Match",
    description: "Set matching rules",
    icon: Settings,
  },
  {
    id: "results",
    label: "Results",
    shortLabel: "Results",
    description: "Review matches",
    icon: BarChart3,
  },
];

export type StepEligibility = Record<ReconciliationStep, boolean>;

interface ReconciliationStepperProps {
  currentStep: ReconciliationStep;
  completedSteps: ReconciliationStep[];
  stepEligibility?: StepEligibility;
  onStepClick?: (step: ReconciliationStep) => void;
  className?: string;
}

export function ReconciliationStepper({
  currentStep,
  completedSteps,
  stepEligibility,
  onStepClick,
  className,
}: ReconciliationStepperProps) {
  const currentIndex = STEPS.findIndex((s) => s.id === currentStep);

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    let targetIndex = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      targetIndex = Math.min(index + 1, STEPS.length - 1);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      targetIndex = Math.max(index - 1, 0);
    } else if (e.key === "Home") {
      e.preventDefault();
      targetIndex = 0;
    } else if (e.key === "End") {
      e.preventDefault();
      targetIndex = STEPS.length - 1;
    }

    if (targetIndex >= 0) {
      const buttons = document.querySelectorAll<HTMLButtonElement>('[data-stepper-button]');
      buttons[targetIndex]?.focus();
    }
  };

  return (
    <nav
      aria-label="Reconciliation progress"
      className={cn("w-full", className)}
    >
      <ol className="flex items-center justify-between" role="list">
        {STEPS.map((step, index) => {
          const isCompleted = completedSteps.includes(step.id);
          const isCurrent = step.id === currentStep;
          const isEligible = stepEligibility ? stepEligibility[step.id] : (isCompleted || index <= currentIndex);
          const isClickable = onStepClick && isEligible;
          const Icon = step.icon;

          const statusLabel = isCompleted
            ? "completed"
            : isCurrent
              ? "current"
              : isEligible
                ? "available"
                : "locked";

          return (
            <li key={step.id} className="flex items-center flex-1 last:flex-initial">
              <button
                type="button"
                onClick={() => isClickable && onStepClick?.(step.id)}
                onKeyDown={(e) => handleKeyDown(e, index)}
                disabled={!isClickable}
                aria-label={`Step ${index + 1} of ${STEPS.length}: ${step.label} — ${statusLabel}`}
                aria-current={isCurrent ? "step" : undefined}
                data-stepper-button
                tabIndex={isCurrent ? 0 : -1}
                className={cn(
                  "flex flex-col items-center gap-1.5 transition-colors group outline-none",
                  isClickable && "cursor-pointer",
                  !isClickable && "cursor-default"
                )}
                data-testid={`step-${step.id}`}
              >
                <div
                  className={cn(
                    "relative flex items-center justify-center w-10 h-10 rounded-full border-2 transition-all",
                    "group-focus-visible:ring-2 group-focus-visible:ring-primary group-focus-visible:ring-offset-2",
                    isCompleted && "bg-primary border-primary text-primary-foreground",
                    isCurrent && !isCompleted && "border-primary bg-primary/10 text-primary",
                    !isCurrent && !isCompleted && "border-muted-foreground/30 text-muted-foreground/50"
                  )}
                >
                  {isCompleted ? (
                    <Check className="h-5 w-5" />
                  ) : (
                    <Icon className="h-5 w-5" />
                  )}
                </div>
                <div className="text-center">
                  <p
                    className={cn(
                      "text-xs sm:text-sm font-medium transition-colors leading-tight",
                      isCurrent && "text-primary",
                      isCompleted && "text-foreground",
                      !isCurrent && !isCompleted && "text-muted-foreground"
                    )}
                  >
                    <span className="hidden sm:inline">{step.label}</span>
                    <span className="sm:hidden">{step.shortLabel}</span>
                  </p>
                  <p
                    className={cn(
                      "text-xs hidden sm:block",
                      isCurrent ? "text-muted-foreground" : "text-muted-foreground/60"
                    )}
                  >
                    {step.description}
                  </p>
                </div>
              </button>

              {index < STEPS.length - 1 && (
                <div className="flex-1 mx-2 sm:mx-4" aria-hidden="true">
                  <div
                    className={cn(
                      "h-0.5 transition-colors",
                      index < currentIndex || completedSteps.includes(STEPS[index + 1].id)
                        ? "bg-primary"
                        : "bg-muted-foreground/20"
                    )}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function getStepIndex(step: ReconciliationStep): number {
  return STEPS.findIndex((s) => s.id === step);
}

export function getStepById(id: ReconciliationStep): StepConfig | undefined {
  return STEPS.find((s) => s.id === id);
}

export { STEPS };
