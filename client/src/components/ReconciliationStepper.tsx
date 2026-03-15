import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type ReconciliationStep = "fuel" | "bank" | "configure" | "results";

interface StepConfig {
  id: ReconciliationStep;
  label: string;
  shortLabel: string;
  description: string;
}

const STEPS: StepConfig[] = [
  {
    id: "fuel",
    label: "Upload Fuel Data",
    shortLabel: "Fuel",
    description: "Your source of truth",
  },
  {
    id: "bank",
    label: "Upload Bank Data",
    shortLabel: "Bank",
    description: "Transactions to verify",
  },
  {
    id: "configure",
    label: "Configure Matching",
    shortLabel: "Match",
    description: "Set matching rules",
  },
  {
    id: "results",
    label: "Results",
    shortLabel: "Results",
    description: "Review matches",
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
                    "relative flex items-center justify-center w-6 h-6 rounded-full transition-all",
                    "group-focus-visible:ring-2 group-focus-visible:ring-[#1A1200] group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-[#F5C400]",
                    isCompleted && "bg-[#1A1200] text-white",
                    isCurrent && !isCompleted && "bg-[#1A1200]/15 text-[#1A1200]",
                    !isCurrent && !isCompleted && "bg-[#1A1200]/10 text-[#1A1200]/50"
                  )}
                >
                  {isCompleted ? (
                    <Check className="h-3.5 w-3.5 stroke-[3]" />
                  ) : (
                    <span className="text-xs font-semibold">{index + 1}</span>
                  )}
                </div>
                <div className="text-center">
                  <p
                    className={cn(
                      "text-xs sm:text-sm font-heading font-medium transition-colors leading-tight",
                      isCurrent && "text-[#1A1200] font-semibold",
                      isCompleted && "text-[#1A1200]",
                      !isCurrent && !isCompleted && "text-[#1A1200]/60"
                    )}
                  >
                    <span className="hidden sm:inline">{step.label}</span>
                    <span className="sm:hidden">{step.shortLabel}</span>
                  </p>
                  <p
                    className={cn(
                      "text-xs hidden sm:block",
                      isCurrent ? "text-[#1A1200]/70" : "text-[#1A1200]/40"
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
                        ? "bg-[#1A1200]"
                        : "bg-[#1A1200]/20"
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
