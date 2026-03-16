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

/** Canvas color for each step — exported so ReconciliationFlow can set the wrapper bg */
export const STEP_CANVAS_COLORS: Record<ReconciliationStep, string> = {
  fuel: "#6B2D6B",       // Plum
  bank: "#1B7A6E",       // Deep Teal
  configure: "#E8601C",  // Burnt Orange
  results: "#F5C400",    // Sunshine — earned
};

/** Steps 1-3 are dark canvases (white text). Step 4 is light (dark text). */
function isDarkCanvas(step: ReconciliationStep): boolean {
  return step !== "results";
}

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
  const dark = isDarkCanvas(currentStep);

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

  // Connector line color depends on step states and canvas
  function connectorColor(leftIndex: number): string {
    const leftCompleted = completedSteps.includes(STEPS[leftIndex].id);
    const rightCompleted = completedSteps.includes(STEPS[leftIndex + 1].id);
    const rightIsCurrent = STEPS[leftIndex + 1].id === currentStep;

    if (!dark) {
      // Sunshine canvas — all connectors use dark tones
      return "bg-[#1A1200]/20";
    }
    if (leftCompleted && rightCompleted) return "bg-white/[0.35]";
    if (leftCompleted && rightIsCurrent) return "bg-white/[0.35]";
    if (rightIsCurrent || leftCompleted) return "bg-white/[0.2]";
    return "bg-white/[0.12]";
  }

  return (
    <nav
      aria-label="Reconciliation progress"
      className={cn("w-full h-[76px] flex items-center px-5", className)}
    >
      <ol className="flex items-center w-full" role="list">
        {STEPS.map((step, index) => {
          const isCompleted = completedSteps.includes(step.id);
          const isCurrent = step.id === currentStep;
          const isUpcoming = !isCompleted && !isCurrent;
          const isEligible = stepEligibility ? stepEligibility[step.id] : (isCompleted || index <= currentIndex);
          const isClickable = onStepClick && isEligible;

          const statusLabel = isCompleted
            ? "completed"
            : isCurrent
              ? "current"
              : isEligible
                ? "available"
                : "locked";

          // Tile background
          let tileBg: string;
          if (isCurrent) {
            tileBg = "bg-white/[0.92]";
          } else if (isCompleted) {
            tileBg = dark ? "bg-white/[0.15]" : "bg-white/[0.4]";
          } else {
            tileBg = dark ? "bg-white/[0.08]" : "bg-white/[0.4]";
          }

          // Text colors
          const numColor = isCurrent
            ? "text-[#1A1200]/50"
            : isCompleted
              ? (dark ? "text-white/[0.6]" : "text-[#1A1200]/[0.45]")
              : (dark ? "text-white/[0.4]" : "text-[#1A1200]/[0.45]");

          const nameColor = isCurrent
            ? "text-[#1A1200]"
            : isCompleted
              ? (dark ? "text-white/[0.82]" : "text-[#1A1200]/[0.65]")
              : (dark ? "text-white/[0.55]" : "text-[#1A1200]/[0.65]");

          const subtitleColor = "text-[#1A1200]/[0.55]";

          // Indicator (dot or checkmark) color
          const indicatorColor = isCurrent
            ? "text-[#1A1200]"
            : isCompleted
              ? (dark ? "text-white/[0.82]" : "text-[#1A1200]/[0.65]")
              : (dark ? "text-white/[0.6]" : "text-[#1A1200]/[0.55]");

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
                  "rounded-[10px] py-2 px-3.5 transition-colors group outline-none flex items-center gap-2.5",
                  "focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-1",
                  tileBg,
                  isClickable && "cursor-pointer",
                  !isClickable && "cursor-default"
                )}
                data-testid={`step-${step.id}`}
              >
                {/* Indicator: dot or checkmark */}
                <div className="flex-shrink-0">
                  {isCompleted ? (
                    <Check className={cn("h-3 w-3 stroke-[2.5]", indicatorColor)} />
                  ) : (
                    <div
                      className={cn(
                        "rounded-full",
                        isCurrent ? "w-[5px] h-[5px] bg-[#1A1200]" : "w-[5px] h-[5px]",
                        !isCurrent && (dark ? "bg-white/[0.6]" : "bg-[#1A1200]/[0.55]")
                      )}
                    />
                  )}
                </div>

                {/* Text content */}
                <div className="text-left min-w-0">
                  <p className={cn("font-sans font-normal leading-none", numColor)} style={{ fontSize: "9px" }}>
                    {String(index + 1).padStart(2, "0")}
                  </p>
                  <p className={cn("font-heading font-semibold leading-tight mt-0.5 truncate", nameColor)} style={{ fontSize: "12px" }}>
                    <span className="hidden sm:inline">{step.label}</span>
                    <span className="sm:hidden">{step.shortLabel}</span>
                  </p>
                  {isCurrent && (
                    <p className={cn("font-sans font-light leading-tight mt-0.5 hidden sm:block", subtitleColor)} style={{ fontSize: "10px" }}>
                      {step.description}
                    </p>
                  )}
                </div>
              </button>

              {/* Connector line */}
              {index < STEPS.length - 1 && (
                <div className="flex-1 mx-1.5 sm:mx-2.5" aria-hidden="true">
                  <div className={cn("h-px transition-colors", connectorColor(index))} />
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
