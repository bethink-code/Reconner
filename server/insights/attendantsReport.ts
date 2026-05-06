import type {
  InsightsAttendantDeclineSummary,
  InsightsAttendantRow,
  InsightsAttendantsReadModel,
} from "../../shared/periodInsights.ts";
import type { AttendantSummaryRow } from "../storage";
import type { DeclineAnalysisTransaction } from "./declineInsights.ts";

type DeclineByAttendant = Map<string, InsightsAttendantDeclineSummary>;

function buildAttendantDeclineMap(
  declineTransactions: DeclineAnalysisTransaction[],
): DeclineByAttendant {
  const declines = new Map<string, InsightsAttendantDeclineSummary>();

  for (const transaction of declineTransactions) {
    const attendant = transaction.attendant?.trim() || "Unknown";
    const current = declines.get(attendant) || {
      totalCount: 0,
      totalAmount: 0,
      recoveredCount: 0,
      unrecoveredCount: 0,
      unrecoveredAmount: 0,
    };

    current.totalCount += 1;
    current.totalAmount += transaction.amount;
    if (transaction.isRecovered) {
      current.recoveredCount += 1;
    } else {
      current.unrecoveredCount += 1;
      current.unrecoveredAmount += transaction.amount - (transaction.recoveredAmount || 0);
    }

    declines.set(attendant, current);
  }

  return declines;
}

export function buildAttendantsReport(params: {
  attendants: AttendantSummaryRow[];
  declineTransactions: DeclineAnalysisTransaction[];
  unmatchedBankCount: number;
  unmatchedBankAmount: number;
}): InsightsAttendantsReadModel {
  const { attendants, declineTransactions, unmatchedBankCount, unmatchedBankAmount } = params;

  if (attendants.length === 0) {
    return {
      state: "no_fuel_data",
      summary: null,
      verified: [],
      unmatchedOnly: [],
      unmatchedBank: {
        count: unmatchedBankCount,
        amount: unmatchedBankAmount,
      },
    };
  }

  const allUnknown =
    attendants.length === 1 &&
    attendants.every((attendant) => attendant.attendant === "Unknown");

  if (allUnknown) {
    return {
      state: "no_attendant_data",
      summary: null,
      verified: [],
      unmatchedOnly: [],
      unmatchedBank: {
        count: unmatchedBankCount,
        amount: unmatchedBankAmount,
      },
    };
  }

  const declineByAttendant = buildAttendantDeclineMap(declineTransactions);
  const verified = attendants
    .filter((attendant) => attendant.matchedCount > 0)
    .sort((left, right) => right.matchedBankAmount - left.matchedBankAmount)
    .map((attendant): InsightsAttendantRow => {
      const declineSummary = declineByAttendant.get(attendant.attendant) || (
        attendant.declinedCount > 0
          ? {
              totalCount: attendant.declinedCount,
              totalAmount: attendant.declinedAmount,
              recoveredCount: 0,
              unrecoveredCount: attendant.declinedCount,
              unrecoveredAmount: attendant.declinedAmount,
            }
          : null
      );
      const totalCardSalesCount = attendant.matchedCount + attendant.unmatchedCount;
      const totalCardSalesAmount = attendant.matchedAmount + attendant.unmatchedAmount;
      const calibrationError = attendant.matchedAmount - attendant.matchedBankAmount;
      const attendantShortfall = attendant.unmatchedAmount + calibrationError;

      return {
        attendant: attendant.attendant,
        verifiedSaleCount: attendant.matchedCount,
        totalCardSalesCount,
        totalCardSalesAmount,
        matchedCardSalesCount: attendant.matchedCount,
        matchedCardSalesAmount: attendant.matchedAmount,
        matchedBankAmount: attendant.matchedBankAmount,
        banks: attendant.banks,
        debtorCount: attendant.debtorCount,
        debtorAmount: attendant.debtorAmount,
        declines: declineSummary,
        unmatchedCardSalesCount: attendant.unmatchedCount,
        unmatchedCardSalesAmount: attendant.unmatchedAmount,
        pumpCalibrationError: calibrationError,
        attendantShortfall,
      };
    });

  const unmatchedOnly = attendants
    .filter((attendant) => attendant.matchedCount === 0 && attendant.unmatchedCount > 0)
    .map((attendant) => ({
      attendant: attendant.attendant,
      unmatchedCardSalesCount: attendant.unmatchedCount,
      unmatchedCardSalesAmount: attendant.unmatchedAmount,
    }));

  const matchedFuelCardSalesCount = verified.reduce(
    (sum, attendant) => sum + attendant.matchedCardSalesCount,
    0,
  );
  const matchedFuelCardSalesAmount = verified.reduce(
    (sum, attendant) => sum + attendant.matchedCardSalesAmount,
    0,
  );
  const matchedBankAmount = verified.reduce(
    (sum, attendant) => sum + attendant.matchedBankAmount,
    0,
  );
  const unmatchedFuelCardSalesCount = attendants.reduce(
    (sum, attendant) => sum + attendant.unmatchedCount,
    0,
  );
  const unmatchedFuelCardSalesAmount = attendants.reduce(
    (sum, attendant) => sum + attendant.unmatchedAmount,
    0,
  );
  const fuelCardSalesCount = matchedFuelCardSalesCount + unmatchedFuelCardSalesCount;
  const fuelCardSalesAmount = matchedFuelCardSalesAmount + unmatchedFuelCardSalesAmount;
  const pumpCalibrationError = matchedFuelCardSalesAmount - matchedBankAmount;
  const unmatchedAttendantCount = attendants.filter(
    (attendant) => attendant.unmatchedCount > 0,
  ).length;

  return {
    state: "ready",
    summary: {
      fuelCardSalesCount,
      fuelCardSalesAmount,
      matchedFuelCardSalesCount,
      matchedFuelCardSalesAmount,
      matchedBankAmount,
      unmatchedFuelCardSalesCount,
      unmatchedFuelCardSalesAmount,
      unmatchedAttendantCount,
      pumpCalibrationError,
      totalShortfall: unmatchedFuelCardSalesAmount + pumpCalibrationError,
      hasAnyDeclines: declineTransactions.length > 0,
    },
    verified,
    unmatchedOnly,
    unmatchedBank: {
      count: unmatchedBankCount,
      amount: unmatchedBankAmount,
    },
  };
}
