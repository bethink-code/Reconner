export interface InsightsBankBreakdown {
  bankName: string;
  approvedCount: number;
  approvedAmount: number;
  declinedCount: number;
  declinedAmount: number;
  cancelledCount: number;
  cancelledAmount: number;
  totalCount: number;
  totalAmount: number;
}

export interface InsightsDetailReadModel {
  fuelSales: {
    card: { count: number; amount: number };
    debtor: { count: number; amount: number };
    cash: { count: number; amount: number };
    total: { count: number; amount: number };
  };
  bankTransactions: {
    totalCount: number;
    matchableCount: number;
    outsideDateRange: { count: number; amount: number };
    excluded: { count: number; amount: number };
    byBank: InsightsBankBreakdown[];
    totals: {
      approvedCount: number;
      approvedAmount: number;
      declinedCount: number;
      declinedAmount: number;
      cancelledCount: number;
      cancelledAmount: number;
      totalCount: number;
      totalAmount: number;
    };
  };
  matching: {
    cardMatchPct: number;
    matchedCardCount: number;
    unmatchedCardCount: number;
  };
  reconciliation: {
    bankApprovedAmount: number;
    fuelCardSalesAmount: number;
    fileSurplus: number;
  };
  surplusAnalysis: {
    matchedFuelInPeriod: number;
    matchedBankAmount: number;
    matchedVariance: number;
    lagFuelAmount: number;
    unmatchedFuelCoveredAmount: number;
    unmatchedFuelUncoveredAmount: number;
    unmatchedBankAmount: number;
    lagExplainedBankAmount: number;
    excludedBankAmount: number;
    totalSurplusShortfall: number;
    tenantBankCoverage?: { min: string; max: string };
  };
}

export interface InsightsAttendantBankBreakdown {
  bankName: string;
  count: number;
  amount: number;
}

export interface InsightsAttendantDeclineSummary {
  totalCount: number;
  totalAmount: number;
  recoveredCount: number;
  unrecoveredCount: number;
  unrecoveredAmount: number;
}

export interface InsightsAttendantRow {
  attendant: string;
  verifiedSaleCount: number;
  totalCardSalesCount: number;
  totalCardSalesAmount: number;
  matchedCardSalesCount: number;
  matchedCardSalesAmount: number;
  matchedBankAmount: number;
  banks: InsightsAttendantBankBreakdown[];
  debtorCount: number;
  debtorAmount: number;
  declines: InsightsAttendantDeclineSummary | null;
  unmatchedCardSalesCount: number;
  unmatchedCardSalesAmount: number;
  pumpCalibrationError: number;
  attendantShortfall: number;
}

export interface InsightsUnmatchedOnlyAttendantRow {
  attendant: string;
  unmatchedCardSalesCount: number;
  unmatchedCardSalesAmount: number;
}

export interface InsightsAttendantsReadModel {
  state: "ready" | "no_fuel_data" | "no_attendant_data";
  summary: {
    fuelCardSalesCount: number;
    fuelCardSalesAmount: number;
    matchedFuelCardSalesCount: number;
    matchedFuelCardSalesAmount: number;
    matchedBankAmount: number;
    unmatchedFuelCardSalesCount: number;
    unmatchedFuelCardSalesAmount: number;
    unmatchedAttendantCount: number;
    pumpCalibrationError: number;
    totalShortfall: number;
    hasAnyDeclines: boolean;
  } | null;
  verified: InsightsAttendantRow[];
  unmatchedOnly: InsightsUnmatchedOnlyAttendantRow[];
  unmatchedBank: {
    count: number;
    amount: number;
  };
}

export interface InsightsDeclineSummary {
  totalDeclined: number;
  totalDeclinedAmount: number;
  resubmittedCount: number;
  resubmittedAmount: number;
  unrecoveredCount: number;
  netUnrecoveredAmount: number;
}

export interface InsightsDeclineBankSummary {
  bankName: string;
  count: number;
  amount: number;
}

export interface InsightsDeclineBadge {
  label: string;
  severity: "high" | "medium" | "low";
}

export interface InsightsDeclineItem {
  id: string;
  time: string;
  type: string;
  amount: number;
  note: string;
  outcomeLabel: string | null;
  recoveredAmount: number;
  shortfall: number;
  isRecovered: boolean;
  outcomeType: "recovered" | "shortfall" | "none";
}

export interface InsightsDeclineCardGroup {
  cardLabel: string;
  bankName: string;
  transactionCount: number;
  attendant: string | null;
  statusLabel: "Recovered" | "Unrecovered";
  badges: InsightsDeclineBadge[];
  items: InsightsDeclineItem[];
}

export interface InsightsDeclinesReadModel {
  hasDeclined: boolean;
  summary: InsightsDeclineSummary;
  banks: InsightsDeclineBankSummary[];
  groups: InsightsDeclineCardGroup[];
}

export interface PeriodInsightsReadModel {
  detail: InsightsDetailReadModel;
  attendants: InsightsAttendantsReadModel;
  declines: InsightsDeclinesReadModel;
}
