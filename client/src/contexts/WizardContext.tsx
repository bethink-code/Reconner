import { createContext, useContext, useReducer, useCallback, type ReactNode } from "react";
import type { UploadedFile } from "@shared/schema";
import type { DataQualityReport } from "@/components/DataQualityWarnings";

export type SubStep = "upload" | "quality" | "mapping" | "preview" | "complete";

export type StepType = "fuel" | "bank";

export interface FileStep {
  id: string;
  type: StepType;
  sourceType: string;
  sourceName: string;
  file: UploadedFile | null;
  qualityReport: DataQualityReport | null;
  columnMapping: Record<string, string> | null;
  currentSubStep: SubStep;
  isComplete: boolean;
  bankPreset?: string;
}

export interface WizardState {
  periodId: string;
  currentStepIndex: number;
  steps: FileStep[];
  isAddingBank: boolean;
}

type WizardAction =
  | { type: "INIT"; payload: { periodId: string; existingFiles: UploadedFile[] } }
  | { type: "SET_STEP"; payload: number }
  | { type: "SET_SUBSTEP"; payload: { stepIndex: number; subStep: SubStep } }
  | { type: "UPDATE_FILE"; payload: { stepIndex: number; file: UploadedFile; qualityReport: DataQualityReport | null } }
  | { type: "UPDATE_MAPPING"; payload: { stepIndex: number; mapping: Record<string, string> } }
  | { type: "UPDATE_BANK_PRESET"; payload: { stepIndex: number; preset: string } }
  | { type: "MARK_FILE_PROCESSED"; payload: { stepIndex: number; transactionsCreated: number } }
  | { type: "COMPLETE_STEP"; payload: number }
  | { type: "ADD_BANK_STEP"; payload?: { sourceName?: string } }
  | { type: "REMOVE_BANK_STEP"; payload: number }
  | { type: "SET_ADDING_BANK"; payload: boolean }
  | { type: "GO_BACK" }
  | { type: "GO_FORWARD" };

function createInitialStep(type: StepType, sourceType: string, sourceName: string, file?: UploadedFile): FileStep {
  const hasFile = !!file;
  const hasMapping = file?.columnMapping && Object.keys(file.columnMapping as object).length > 0;
  const isProcessed = file?.status === 'processed';
  
  let currentSubStep: SubStep = "upload";
  if (hasFile && isProcessed) {
    currentSubStep = "complete";
  } else if (hasFile && hasMapping) {
    currentSubStep = "preview";
  } else if (hasFile && !hasMapping) {
    currentSubStep = "quality";
  }
  
  return {
    id: `${type}-${sourceType}-${Date.now()}`,
    type,
    sourceType,
    sourceName,
    file: file || null,
    qualityReport: file?.qualityReport as DataQualityReport | null,
    columnMapping: file?.columnMapping as Record<string, string> | null,
    currentSubStep,
    isComplete: hasFile && isProcessed,
    bankPreset: undefined,
  };
}

function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case "INIT": {
      const { periodId, existingFiles } = action.payload;
      
      const fuelFile = existingFiles.find(f => f.sourceType === "fuel");
      const bankFiles = existingFiles.filter(f => f.sourceType?.startsWith("bank"));
      
      const steps: FileStep[] = [
        createInitialStep("fuel", "fuel", "Fuel Management System", fuelFile),
      ];
      
      if (bankFiles.length > 0) {
        bankFiles.forEach((bankFile, idx) => {
          steps.push(createInitialStep(
            "bank",
            bankFile.sourceType || `bank${idx + 1}`,
            bankFile.sourceName || `Bank Account ${idx + 1}`,
            bankFile
          ));
        });
      } else {
        steps.push(createInitialStep("bank", "bank1", "Bank Account 1"));
      }
      
      const firstIncompleteIndex = steps.findIndex(s => !s.isComplete);
      
      return {
        periodId,
        currentStepIndex: firstIncompleteIndex >= 0 ? firstIncompleteIndex : 0,
        steps,
        isAddingBank: false,
      };
    }
    
    case "SET_STEP": {
      return { ...state, currentStepIndex: action.payload };
    }
    
    case "SET_SUBSTEP": {
      const { stepIndex, subStep } = action.payload;
      return {
        ...state,
        steps: state.steps.map((step, idx) =>
          idx === stepIndex ? { ...step, currentSubStep: subStep } : step
        ),
      };
    }
    
    case "UPDATE_FILE": {
      const { stepIndex, file, qualityReport } = action.payload;
      return {
        ...state,
        steps: state.steps.map((step, idx) =>
          idx === stepIndex
            ? {
                ...step,
                file,
                qualityReport,
                currentSubStep: qualityReport?.hasIssues ? "quality" : "mapping",
              }
            : step
        ),
      };
    }
    
    case "UPDATE_MAPPING": {
      const { stepIndex, mapping } = action.payload;
      return {
        ...state,
        steps: state.steps.map((step, idx) =>
          idx === stepIndex
            ? { ...step, columnMapping: mapping, currentSubStep: "preview" }
            : step
        ),
      };
    }
    
    case "UPDATE_BANK_PRESET": {
      const { stepIndex, preset } = action.payload;
      return {
        ...state,
        steps: state.steps.map((step, idx) =>
          idx === stepIndex ? { ...step, bankPreset: preset } : step
        ),
      };
    }
    
    case "MARK_FILE_PROCESSED": {
      const { stepIndex, transactionsCreated } = action.payload;
      return {
        ...state,
        steps: state.steps.map((step, idx) =>
          idx === stepIndex && step.file
            ? {
                ...step,
                file: { ...step.file, status: 'processed', rowCount: transactionsCreated },
              }
            : step
        ),
      };
    }
    
    case "COMPLETE_STEP": {
      const stepIndex = action.payload;
      const newSteps = state.steps.map((step, idx) =>
        idx === stepIndex ? { ...step, isComplete: true, currentSubStep: "complete" as SubStep } : step
      );
      
      const nextIncompleteIndex = newSteps.findIndex((s, idx) => idx > stepIndex && !s.isComplete);
      const nextIndex = nextIncompleteIndex >= 0 ? nextIncompleteIndex : stepIndex + 1;
      
      return {
        ...state,
        steps: newSteps,
        currentStepIndex: Math.min(nextIndex, newSteps.length - 1),
        isAddingBank: nextIndex >= newSteps.length,
      };
    }
    
    case "ADD_BANK_STEP": {
      const bankCount = state.steps.filter(s => s.type === "bank").length;
      const newBankStep = createInitialStep(
        "bank",
        `bank${bankCount + 1}`,
        action.payload?.sourceName || `Bank Account ${bankCount + 1}`
      );
      
      return {
        ...state,
        steps: [...state.steps, newBankStep],
        currentStepIndex: state.steps.length,
        isAddingBank: false,
      };
    }
    
    case "REMOVE_BANK_STEP": {
      const newSteps = state.steps.filter((_, idx) => idx !== action.payload);
      return {
        ...state,
        steps: newSteps,
        currentStepIndex: Math.min(state.currentStepIndex, newSteps.length - 1),
      };
    }
    
    case "SET_ADDING_BANK": {
      return { ...state, isAddingBank: action.payload };
    }
    
    case "GO_BACK": {
      const currentStep = state.steps[state.currentStepIndex];
      const subStepOrder: SubStep[] = ["upload", "quality", "mapping", "preview", "complete"];
      const currentSubIndex = subStepOrder.indexOf(currentStep.currentSubStep);
      
      if (currentSubIndex > 0) {
        return {
          ...state,
          steps: state.steps.map((step, idx) =>
            idx === state.currentStepIndex
              ? { ...step, currentSubStep: subStepOrder[currentSubIndex - 1] }
              : step
          ),
        };
      }
      
      if (state.currentStepIndex > 0) {
        return { ...state, currentStepIndex: state.currentStepIndex - 1 };
      }
      
      return state;
    }
    
    case "GO_FORWARD": {
      const currentStep = state.steps[state.currentStepIndex];
      const subStepOrder: SubStep[] = ["upload", "quality", "mapping", "preview", "complete"];
      const currentSubIndex = subStepOrder.indexOf(currentStep.currentSubStep);
      
      if (currentSubIndex < subStepOrder.length - 1) {
        return {
          ...state,
          steps: state.steps.map((step, idx) =>
            idx === state.currentStepIndex
              ? { ...step, currentSubStep: subStepOrder[currentSubIndex + 1] }
              : step
          ),
        };
      }
      
      if (state.currentStepIndex < state.steps.length - 1) {
        return { ...state, currentStepIndex: state.currentStepIndex + 1 };
      }
      
      return { ...state, isAddingBank: true };
    }
    
    default:
      return state;
  }
}

interface WizardContextValue {
  state: WizardState;
  currentStep: FileStep | null;
  totalSteps: number;
  bankStepsCount: number;
  allStepsComplete: boolean;
  hasAtLeastOneBank: boolean;
  init: (periodId: string, existingFiles: UploadedFile[]) => void;
  setStep: (index: number) => void;
  setSubStep: (stepIndex: number, subStep: SubStep) => void;
  updateFile: (stepIndex: number, file: UploadedFile, qualityReport: DataQualityReport | null) => void;
  updateMapping: (stepIndex: number, mapping: Record<string, string>) => void;
  updateBankPreset: (stepIndex: number, preset: string) => void;
  markFileProcessed: (stepIndex: number, transactionsCreated: number) => void;
  completeStep: (stepIndex: number) => void;
  addBankStep: (sourceName?: string) => void;
  removeBankStep: (stepIndex: number) => void;
  setAddingBank: (adding: boolean) => void;
  goBack: () => void;
  goForward: () => void;
}

const WizardContext = createContext<WizardContextValue | null>(null);

const initialState: WizardState = {
  periodId: "",
  currentStepIndex: 0,
  steps: [],
  isAddingBank: false,
};

export function WizardProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(wizardReducer, initialState);
  
  const init = useCallback((periodId: string, existingFiles: UploadedFile[]) => {
    dispatch({ type: "INIT", payload: { periodId, existingFiles } });
  }, []);
  
  const setStep = useCallback((index: number) => {
    dispatch({ type: "SET_STEP", payload: index });
  }, []);
  
  const setSubStep = useCallback((stepIndex: number, subStep: SubStep) => {
    dispatch({ type: "SET_SUBSTEP", payload: { stepIndex, subStep } });
  }, []);
  
  const updateFile = useCallback((stepIndex: number, file: UploadedFile, qualityReport: DataQualityReport | null) => {
    dispatch({ type: "UPDATE_FILE", payload: { stepIndex, file, qualityReport } });
  }, []);
  
  const updateMapping = useCallback((stepIndex: number, mapping: Record<string, string>) => {
    dispatch({ type: "UPDATE_MAPPING", payload: { stepIndex, mapping } });
  }, []);
  
  const updateBankPreset = useCallback((stepIndex: number, preset: string) => {
    dispatch({ type: "UPDATE_BANK_PRESET", payload: { stepIndex, preset } });
  }, []);
  
  const markFileProcessed = useCallback((stepIndex: number, transactionsCreated: number) => {
    dispatch({ type: "MARK_FILE_PROCESSED", payload: { stepIndex, transactionsCreated } });
  }, []);
  
  const completeStep = useCallback((stepIndex: number) => {
    dispatch({ type: "COMPLETE_STEP", payload: stepIndex });
  }, []);
  
  const addBankStep = useCallback((sourceName?: string) => {
    dispatch({ type: "ADD_BANK_STEP", payload: sourceName ? { sourceName } : undefined });
  }, []);
  
  const removeBankStep = useCallback((stepIndex: number) => {
    dispatch({ type: "REMOVE_BANK_STEP", payload: stepIndex });
  }, []);
  
  const setAddingBank = useCallback((adding: boolean) => {
    dispatch({ type: "SET_ADDING_BANK", payload: adding });
  }, []);
  
  const goBack = useCallback(() => {
    dispatch({ type: "GO_BACK" });
  }, []);
  
  const goForward = useCallback(() => {
    dispatch({ type: "GO_FORWARD" });
  }, []);
  
  const currentStep = state.steps[state.currentStepIndex] || null;
  const totalSteps = state.steps.length;
  const bankStepsCount = state.steps.filter(s => s.type === "bank").length;
  const allStepsComplete = state.steps.every(s => s.isComplete);
  const hasAtLeastOneBank = state.steps.some(s => s.type === "bank" && s.isComplete);
  
  const value: WizardContextValue = {
    state,
    currentStep,
    totalSteps,
    bankStepsCount,
    allStepsComplete,
    hasAtLeastOneBank,
    init,
    setStep,
    setSubStep,
    updateFile,
    updateMapping,
    updateBankPreset,
    markFileProcessed,
    completeStep,
    addBankStep,
    removeBankStep,
    setAddingBank,
    goBack,
    goForward,
  };
  
  return (
    <WizardContext.Provider value={value}>
      {children}
    </WizardContext.Provider>
  );
}

export function useWizard() {
  const context = useContext(WizardContext);
  if (!context) {
    throw new Error("useWizard must be used within a WizardProvider");
  }
  return context;
}
