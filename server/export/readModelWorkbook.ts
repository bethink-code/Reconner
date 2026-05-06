import { deriveSummaryStats } from "../../shared/reconciliationDerivedStats.ts";
import type { PeriodInsightsReadModel } from "../../shared/periodInsights.ts";
import type { ResultsDashboardReadModel } from "../../shared/reconciliationDashboard.ts";
import type { ReviewQueueReadModel } from "../../shared/reconciliationReview.ts";
import type { MatchingRulesConfig, ReconciliationPeriod } from "../../shared/schema";

type WorksheetRow = Record<string, string | number | undefined>;

function fmt(value: number) {
  return parseFloat(value.toFixed(2));
}

function fmtPeriodDate(value: string) {
  return new Date(value).toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function buildReconciliationSummaryRows(params: {
  period: ReconciliationPeriod;
  matchingRules: MatchingRulesConfig | null;
  dashboard: ResultsDashboardReadModel;
  review: ReviewQueueReadModel;
}): WorksheetRow[] {
  const { period, matchingRules, dashboard, review } = params;
  const summary = dashboard.summary;
  const stats = deriveSummaryStats(summary);
  const bankBreakdown = summary.perBankBreakdown || [];
  const matchedBankCount = summary.matchedPairs;
  const cardMatchRateLabel = summary.cardFuelTransactions > 0
    ? `${stats.cardMatchPct}% (${stats.matchedCardCount}/${summary.cardFuelTransactions})`
    : "-";
  const bankMatchRatePct = stats.matchableBankTotal > 0
    ? Math.round((matchedBankCount / stats.matchableBankTotal) * 100)
    : 0;
  const bankMatchRateLabel = stats.matchableBankTotal > 0
    ? `${bankMatchRatePct}% (${matchedBankCount}/${stats.matchableBankTotal})`
    : "-";
  const periodDates = period.startDate === period.endDate
    ? fmtPeriodDate(period.startDate)
    : `${fmtPeriodDate(period.startDate)} - ${fmtPeriodDate(period.endDate)}`;

  const rows: WorksheetRow[] = [
    { Metric: "Period", Count: "", Amount: period.name },
    { Metric: "Period dates", Count: "", Amount: periodDates },
    { Metric: "" },
    { Metric: "FUEL TRANSACTIONS", Count: "Count", Amount: "Amount" },
    { Metric: "  Card", Count: summary.cardFuelTransactions, Amount: fmt(summary.cardFuelAmount) },
  ];

  if (summary.debtorFuelTransactions > 0) {
    rows.push({
      Metric: "  Debtor / Account",
      Count: summary.debtorFuelTransactions,
      Amount: fmt(summary.debtorFuelAmount),
    });
  }

  rows.push(
    { Metric: "  Cash", Count: summary.cashFuelTransactions, Amount: fmt(summary.cashFuelAmount) },
    { Metric: "  Total", Count: summary.fuelTransactions, Amount: fmt(summary.totalFuelAmount) },
    { Metric: "" },
    { Metric: "BANK TRANSACTIONS" },
    { Metric: "  Total bank transactions", Count: summary.bankTransactions },
    { Metric: "  Matchable bank transactions", Count: stats.matchableBankTotal },
    {
      Metric: "  Outside date range",
      Count: stats.unmatchableBank,
      Amount: stats.outsideRangeAmt > 0 ? fmt(stats.outsideRangeAmt) : undefined,
    },
    {
      Metric: "  Excluded (reversed/declined/cancelled)",
      Count: summary.excludedBankTransactions || 0,
      Amount: (summary.excludedBankAmount || 0) > 0 ? fmt(summary.excludedBankAmount || 0) : undefined,
    },
  );

  if (bankBreakdown.length > 0) {
    rows.push({ Metric: "" });
    const header: WorksheetRow = { Metric: "" };
    for (const bank of bankBreakdown) {
      header[bank.bankName] = bank.bankName;
    }
    header.Total = "Total";
    rows.push(header);

    for (const rowLabel of [
      {
        metric: "Number of Declined transactions",
        getCount: (bank: (typeof bankBreakdown)[number]) => bank.declinedCount,
      },
      {
        metric: "Total amount for Declined transactions",
        getCount: (bank: (typeof bankBreakdown)[number]) => bank.declinedAmount,
      },
      {
        metric: "Number of Cancelled transactions",
        getCount: (bank: (typeof bankBreakdown)[number]) => bank.cancelledCount,
      },
      {
        metric: "Total amount for Cancelled transactions",
        getCount: (bank: (typeof bankBreakdown)[number]) => bank.cancelledAmount,
      },
      {
        metric: "Number of Approved transactions",
        getCount: (bank: (typeof bankBreakdown)[number]) => bank.approvedCount,
      },
      {
        metric: "Total amount for Approved transactions",
        getCount: (bank: (typeof bankBreakdown)[number]) => bank.approvedAmount,
      },
    ]) {
      const section: WorksheetRow = { Metric: rowLabel.metric };
      let total = 0;
      for (const bank of bankBreakdown) {
        const value = rowLabel.getCount(bank);
        section[bank.bankName] = value || "-";
        total += value;
      }
      section.Total = total || "-";
      rows.push(section);
    }
  }

  rows.push(
    { Metric: "" },
    { Metric: "FUEL CARD SALES MATCHING" },
    { Metric: "  Fuel card sales match rate", Count: cardMatchRateLabel },
    { Metric: "  Matched fuel card sales transactions", Count: stats.matchedCardCount },
    { Metric: "  Unmatched fuel card sales transactions", Count: stats.unmatchedFuelCount },
    { Metric: "" },
    { Metric: "BANK PAYMENT MATCHING" },
    { Metric: "  Bank payment match rate", Count: bankMatchRateLabel },
    { Metric: "  Matched bank transactions", Count: matchedBankCount },
    { Metric: "  Unmatched bank transactions", Count: summary.unmatchedBankTransactions },
  );

  if (matchingRules) {
    rows.push(
      { Metric: "" },
      { Metric: "MATCHING RULES" },
      { Metric: "  Amount tolerance", Count: `+/-R ${Number(matchingRules.amountTolerance).toFixed(2)}` },
      { Metric: "  Date window", Count: `${matchingRules.dateWindowDays} day${matchingRules.dateWindowDays !== 1 ? "s" : ""}` },
      { Metric: "  Time window", Count: `${matchingRules.timeWindowMinutes} min` },
      { Metric: "  Operational close window", Count: `${matchingRules.attendantSubmissionDelayMinutes} min` },
      { Metric: "  Minimum confidence", Count: `${matchingRules.minimumConfidence}%` },
      { Metric: "  Auto-match threshold", Count: `${matchingRules.autoMatchThreshold}%` },
      { Metric: "  Invoice grouping", Count: matchingRules.groupByInvoice ? "On" : "Off" },
      { Metric: "  Card required", Count: matchingRules.requireCardMatch ? "Yes" : "No" },
    );
  }

  rows.push(
    { Metric: "" },
    { Metric: "REVIEW PROGRESS" },
    { Metric: "  Matched with reason", Count: dashboard.counts.linked },
    { Metric: "  Flagged to investigate", Count: dashboard.counts.flagged },
    { Metric: "  Dismissed", Count: dashboard.counts.dismissed },
    { Metric: "  Total review actions", Count: dashboard.counts.linked + dashboard.counts.flagged + dashboard.counts.dismissed },
    { Metric: "  Unmatched bank still to review", Count: review.sides.bank.summary.unresolvedCount },
    { Metric: "  Unmatched fuel card sales still to review", Count: review.sides.fuel.summary.unresolvedCount },
  );

  rows.push(
    { Metric: "" },
    { Metric: "FUEL CARD SALES RECONCILIATION", Count: "", Amount: "Amount" },
    { Metric: "  Bank approved amount", Amount: fmt(stats.bankApprovedAmount) },
    { Metric: "  Fuel card sales amount", Amount: fmt(stats.cardOnlyAmount) },
    { Metric: "  Surplus / shortfall", Amount: fmt(stats.fileSurplus) },
    { Metric: "" },
    { Metric: "SURPLUS / SHORTFALL ANALYSIS" },
    { Metric: "" },
    { Metric: "  Matched amount variance:" },
    { Metric: "    Matched fuel amount (both sides in period)", Amount: fmt(stats.matchedFuelInPeriod) },
    { Metric: "    Matched bank amount", Amount: fmt(summary.matchedBankAmount) },
    { Metric: "    Variance", Amount: fmt(stats.matchedVariance) },
    { Metric: "" },
    { Metric: "  Fuel matched to bank outside period", Amount: stats.lagFuelAmount > 0 ? fmt(stats.lagFuelAmount) : "-" },
    { Metric: "" },
    {
      Metric: "  Fuel card sales with no bank match, within bank coverage",
      Amount: stats.unmatchedFuelCoveredAmount > 0 ? fmt(stats.unmatchedFuelCoveredAmount) : "-",
    },
    { Metric: "" },
    {
      Metric: "  Fuel card sales with no bank match, outside bank coverage",
      Amount: stats.unmatchedFuelUncoveredAmount > 0 ? fmt(stats.unmatchedFuelUncoveredAmount) : "-",
    },
    summary.tenantBankCoverage
      ? { Metric: `    Bank coverage: ${summary.tenantBankCoverage.min} to ${summary.tenantBankCoverage.max}` }
      : { Metric: "    No bank data uploaded for this property" },
    { Metric: "" },
    { Metric: "  Bank with no fuel match", Amount: stats.unmatchedBankAmt > 0 ? fmt(stats.unmatchedBankAmt) : "-" },
    { Metric: "" },
    {
      Metric: "  Bank matched to fuel outside period (lag-explained)",
      Amount: stats.lagExplainedBankAmount > 0 ? fmt(stats.lagExplainedBankAmount) : "-",
    },
    { Metric: "" },
    {
      Metric: "  Total surplus / shortfall",
      Amount: fmt(
        stats.matchedVariance -
          stats.lagFuelAmount -
          stats.unmatchedFuelCoveredAmount -
          stats.unmatchedFuelUncoveredAmount +
          stats.unmatchedBankAmt +
          stats.lagExplainedBankAmount,
      ),
    },
    { Metric: "" },
    { Metric: "  Excluded bank amount", Amount: fmt(summary.excludedBankAmount || 0) },
  );

  return rows;
}

export function buildAttendantSummaryRows(
  attendants: PeriodInsightsReadModel["attendants"],
): WorksheetRow[] {
  if (attendants.state === "no_fuel_data") {
    return [{ Metric: "No fuel transaction data found" }];
  }

  if (attendants.state === "no_attendant_data") {
    return [
      { Metric: "No attendant data available for this period." },
      { Metric: "Map the attendant column when uploading fuel data to see this report." },
    ];
  }

  const summary = attendants.summary;
  if (!summary) {
    return [];
  }

  const rows: WorksheetRow[] = [
    { Metric: "ATTENDANT ACCOUNTABILITY", Count: "", Amount: "" },
    { Metric: "  Fuel card sales", Count: summary.fuelCardSalesCount, Amount: fmt(summary.fuelCardSalesAmount) },
    {
      Metric: "  less Matched fuel card sales",
      Count: summary.matchedFuelCardSalesCount,
      Amount: fmt(summary.matchedFuelCardSalesAmount),
    },
    {
      Metric: "  Unmatched fuel card sales",
      Count: summary.unmatchedFuelCardSalesCount,
      Amount: fmt(summary.unmatchedFuelCardSalesAmount),
    },
    {
      Metric: `    (across ${summary.unmatchedAttendantCount} attendant${summary.unmatchedAttendantCount !== 1 ? "s" : ""})`,
    },
    { Metric: "  plus Pump calibration error", Count: "", Amount: fmt(summary.pumpCalibrationError) },
    { Metric: "  Total shortfall allocated to attendants", Count: "", Amount: fmt(summary.totalShortfall) },
    {},
    { Metric: "VERIFIED FUEL CARD SALES BY ATTENDANT" },
    {},
  ];

  for (const attendant of attendants.verified) {
    rows.push({
      Metric: `${attendant.attendant} (${attendant.verifiedSaleCount} verified sale${attendant.verifiedSaleCount !== 1 ? "s" : ""})`,
    });
    rows.push({
      Metric: "  Total card sales",
      Count: attendant.totalCardSalesCount,
      Amount: fmt(attendant.totalCardSalesAmount),
    });
    rows.push({
      Metric: "  Matched card sales",
      Count: attendant.matchedCardSalesCount,
      Amount: fmt(attendant.matchedCardSalesAmount),
    });
    rows.push({
      Metric: "  Matched bank amount",
      Count: attendant.matchedCardSalesCount,
      Amount: fmt(attendant.matchedBankAmount),
    });

    if (attendant.banks.length >= 2) {
      for (const bank of attendant.banks) {
        rows.push({
          Metric: `    ${bank.bankName}`,
          Count: bank.count,
          Amount: fmt(bank.amount),
        });
      }
    }

    if (attendant.debtorCount > 0) {
      rows.push({
        Metric: "  Debtor / Account",
        Count: attendant.debtorCount,
        Amount: fmt(attendant.debtorAmount),
      });
    }

    if (attendant.declines) {
      rows.push({
        Metric: "  Declined transactions",
        Count: attendant.declines.totalCount,
        Amount: fmt(attendant.declines.totalAmount),
      });
      if (attendant.declines.recoveredCount > 0) {
        rows.push({
          Metric: "    Recovered",
          Count: attendant.declines.recoveredCount,
          Amount: fmt(attendant.declines.totalAmount - attendant.declines.unrecoveredAmount),
        });
      }
      if (attendant.declines.unrecoveredCount > 0) {
        rows.push({
          Metric: "    Unrecovered",
          Count: attendant.declines.unrecoveredCount,
          Amount: fmt(attendant.declines.unrecoveredAmount),
        });
      }
    }

    if (
      attendant.unmatchedCardSalesCount > 0 ||
      Math.abs(attendant.pumpCalibrationError) >= 0.01
    ) {
      if (attendant.unmatchedCardSalesCount > 0) {
        rows.push({
          Metric: "  Unmatched card sales",
          Count: attendant.unmatchedCardSalesCount,
          Amount: fmt(attendant.unmatchedCardSalesAmount),
        });
      }
      if (Math.abs(attendant.pumpCalibrationError) >= 0.01) {
        rows.push({
          Metric: "  Pump calibration error",
          Count: "",
          Amount: fmt(attendant.pumpCalibrationError),
        });
      }
      rows.push({
        Metric: "  Attendant shortfall",
        Count: "",
        Amount: fmt(attendant.attendantShortfall),
      });
    }

    rows.push({});
  }

  rows.push({
    Metric: "Total",
    Count: summary.matchedFuelCardSalesCount,
    Amount: fmt(summary.matchedBankAmount),
  });

  if (attendants.unmatchedOnly.length > 0) {
    rows.push({});
    rows.push({ Metric: "NO VERIFIED FUEL CARD SALES" });
    for (const attendant of attendants.unmatchedOnly) {
      rows.push({
        Metric: `  ${attendant.attendant}`,
        Count: attendant.unmatchedCardSalesCount,
        Amount: fmt(attendant.unmatchedCardSalesAmount),
      });
    }
  }

  if (attendants.unmatchedBank.count > 0) {
    rows.push({});
    rows.push({
      Metric: "UNMATCHED BANK TRANSACTIONS",
      Count: attendants.unmatchedBank.count,
      Amount: fmt(attendants.unmatchedBank.amount),
    });
    rows.push({ Metric: "  These could not be attributed to any attendant - see Unmatched bank sheet" });
  }

  return rows;
}

export function buildDeclinedRows(
  declines: PeriodInsightsReadModel["declines"],
): WorksheetRow[] {
  if (!declines.hasDeclined) {
    return [{ Metric: "No declined or cancelled transactions in this period." }];
  }

  const rows: WorksheetRow[] = [
    { Metric: "DECLINE SUMMARY", Count: "", Amount: "" },
    {
      Metric: "  Total declined / cancelled",
      Count: declines.summary.totalDeclined,
      Amount: fmt(declines.summary.totalDeclinedAmount),
    },
  ];

  for (const bank of declines.banks) {
    rows.push({
      Metric: `    ${bank.bankName}`,
      Count: bank.count,
      Amount: fmt(bank.amount),
    });
  }

  rows.push(
    {
      Metric: "  Resubmitted successfully",
      Count: declines.summary.resubmittedCount,
      Amount: fmt(declines.summary.resubmittedAmount),
    },
    {
      Metric: "  Net unrecovered",
      Count: declines.summary.unrecoveredCount,
      Amount: fmt(declines.summary.netUnrecoveredAmount),
    },
    {},
    { Metric: "TRANSACTION DETAIL BY CARD" },
    {},
  );

  for (const group of declines.groups) {
    const headerParts = [
      `Card ${group.cardLabel}`,
      `${group.bankName} | ${group.transactionCount} transaction${group.transactionCount !== 1 ? "s" : ""}`,
      group.attendant ? `Attendant: ${group.attendant}` : null,
      group.statusLabel,
      ...group.badges.map((badge) => badge.label),
    ].filter(Boolean);
    rows.push({ Metric: headerParts.join(" | ") });

    for (const item of group.items) {
      rows.push({
        Metric: `  ${item.type} at ${item.time}`,
        Count: "",
        Amount: fmt(item.amount),
        Type: item.type,
      });
      if (item.outcomeLabel) {
        rows.push({
          Metric: `    ${item.outcomeLabel}`,
          Count: "",
          Amount: item.outcomeType === "shortfall"
            ? fmt(item.shortfall)
            : item.recoveredAmount > 0
              ? fmt(item.recoveredAmount)
              : "",
          Type: item.outcomeType === "shortfall"
            ? "Shortfall"
            : item.recoveredAmount > 0
              ? "Recovered"
              : "",
        });
      }
    }

    rows.push({});
  }

  return rows;
}
