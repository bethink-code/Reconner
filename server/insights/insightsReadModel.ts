import type { PeriodInsightsReadModel } from "../../shared/periodInsights.ts";
import type { AttendantSummaryRow, PeriodSummary } from "../storage";
import type { DeclineAnalysisResult } from "./declineInsights.ts";
import { buildAttendantsReport } from "./attendantsReport.ts";
import { buildDeclinedTransactionsReport } from "./declinedTransactionsReport.ts";
import { buildReconciliationOverviewReport } from "./reconciliationOverviewReport.ts";
import { buildReprintScamReadModel, type ReprintScamFuelLike } from "./reprintScamReport.ts";
import {
  buildCashGapReadModel,
  type CashGapPeriodBounds,
  type CashGapSpentLike,
  type CashGapSaleLike,
} from "./cashGapReport.ts";

export interface CashGapInputsForReport {
  salesTransactions: CashGapSaleLike[];
  received: number | null;
  spent: CashGapSpentLike[];
  /** Period dates — cash sales outside these never count (period is boss). */
  bounds: CashGapPeriodBounds;
}

export function buildInsightsReadModel(
  summary: PeriodSummary,
  attendantSummary: AttendantSummaryRow[],
  declineResult: DeclineAnalysisResult,
  fuelTransactions: ReprintScamFuelLike[],
  cashGapInputs: CashGapInputsForReport,
): PeriodInsightsReadModel {
  return {
    detail: buildReconciliationOverviewReport(summary),
    attendants: buildAttendantsReport({
      attendants: attendantSummary,
      declineTransactions: declineResult.transactions,
      unmatchedBankCount: summary.unmatchedBankTransactions,
      unmatchedBankAmount: summary.unmatchedBankAmount,
    }),
    declines: buildDeclinedTransactionsReport(declineResult),
    reprints: buildReprintScamReadModel(fuelTransactions),
    cashGap: buildCashGapReadModel(
      cashGapInputs.salesTransactions,
      cashGapInputs.received,
      cashGapInputs.spent,
      cashGapInputs.bounds,
    ),
  };
}
