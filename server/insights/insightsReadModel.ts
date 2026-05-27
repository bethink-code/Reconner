import type { PeriodInsightsReadModel } from "../../shared/periodInsights.ts";
import type { AttendantSummaryRow, PeriodSummary } from "../storage";
import type { DeclineAnalysisResult } from "./declineInsights.ts";
import { buildAttendantsReport } from "./attendantsReport.ts";
import { buildDeclinedTransactionsReport } from "./declinedTransactionsReport.ts";
import { buildReconciliationOverviewReport } from "./reconciliationOverviewReport.ts";
import { buildReprintScamReadModel, type ReprintScamFuelLike } from "./reprintScamReport.ts";

export function buildInsightsReadModel(
  summary: PeriodSummary,
  attendantSummary: AttendantSummaryRow[],
  declineResult: DeclineAnalysisResult,
  fuelTransactions: ReprintScamFuelLike[],
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
  };
}
