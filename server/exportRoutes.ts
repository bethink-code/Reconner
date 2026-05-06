import type { Express } from "express";
import { isAuthenticated } from "./auth";
import { audit } from "./auditLog";
import {
  buildAttendantSummaryRows,
  buildDeclinedRows,
  buildReconciliationSummaryRows,
} from "./export/readModelWorkbook.ts";
import {
  computeDeclineAnalysis as computeDeclineAnalysisFromInsights,
  findNearestFuelForDecline as findNearestFuelForDeclineFromInsights,
} from "./insights/declineInsights";
import { buildInsightsReadModel } from "./insights/insightsReadModel.ts";
import { buildResultsDashboardReadModel } from "./reconciliation/dashboardReadModel.ts";
import { buildReviewQueueReadModel } from "./reconciliation/reviewQueueReadModel.ts";
import { assertPeriodOwner } from "./routeAccess";
import { storage } from "./storage";

function matchTypeLabel(matchType: string) {
  if (matchType === "auto_exact" || matchType === "auto_exact_review") {
    return "Lekana (Exact)";
  }
  if (
    matchType === "auto_rules" ||
    matchType === "auto_rules_review" ||
    matchType === "auto" ||
    matchType === "auto_review"
  ) {
    return "Lekana (Rules)";
  }
  if (matchType === "user_confirmed" || matchType === "manual") {
    return "User (Confirmed)";
  }
  if (matchType === "linked") {
    return "User (With reason)";
  }
  return matchType || "Lekana (Rules)";
}

export function registerExportRoutes(app: Express) {
  app.get("/api/periods/:periodId/export", isAuthenticated, async (req: any, res) => {
    try {
      const period = await assertPeriodOwner(req.params.periodId, req, res);
      if (!period) return;

      const [
        allTransactions,
        matchesData,
        resolutions,
        attendantSummary,
        matchingRulesData,
        periodSummary,
      ] = await Promise.all([
        storage.getTransactionsByPeriod(req.params.periodId),
        storage.getMatchesByPeriod(req.params.periodId),
        storage.getResolutionsByPeriod(req.params.periodId),
        storage.getAttendantSummary(req.params.periodId),
        storage.getMatchingRules(req.params.periodId),
        storage.getPeriodSummary(req.params.periodId),
      ]);

      const transactions = allTransactions.filter(
        (transaction) =>
          transaction.transactionDate &&
          transaction.transactionDate >= period.startDate &&
          transaction.transactionDate <= period.endDate,
      );

      const matchMap = new Map<string, typeof matchesData[0]>();
      for (const match of matchesData) {
        matchMap.set(match.bankTransactionId, match);
        matchMap.set(match.fuelTransactionId, match);
      }

      const resolutionMap = new Map(
        resolutions.map((resolution) => [resolution.transactionId, resolution]),
      );
      const txMap = new Map(transactions.map((transaction) => [transaction.id, transaction]));

      const fuelByMatchId = new Map<string, typeof transactions>();
      for (const transaction of transactions) {
        if (transaction.matchId && transaction.sourceType === "fuel") {
          if (!fuelByMatchId.has(transaction.matchId)) {
            fuelByMatchId.set(transaction.matchId, []);
          }
          fuelByMatchId.get(transaction.matchId)!.push(transaction);
        }
      }

      const bankTxns = transactions.filter((transaction) =>
        transaction.sourceType?.startsWith("bank"),
      );
      const fuelTxns = transactions.filter((transaction) => transaction.sourceType === "fuel");
      const allBankTransactions = allTransactions.filter((transaction) =>
        transaction.sourceType?.startsWith("bank"),
      );
      const allFuelTransactions = allTransactions.filter(
        (transaction) => transaction.sourceType === "fuel",
      );
      const matchedBank = bankTxns.filter((transaction) => transaction.matchStatus === "matched");
      const unmatchedBank = bankTxns.filter(
        (transaction) =>
          transaction.matchStatus === "unmatched" && parseFloat(transaction.amount) > 0,
      );
      const outsideRange = bankTxns.filter(
        (transaction) => transaction.matchStatus === "unmatchable",
      );

      const dashboardModel = buildResultsDashboardReadModel(periodSummary, resolutions);
      const reviewModel = buildReviewQueueReadModel(
        period,
        allTransactions,
        resolutions,
        matchingRulesData,
      );
      const declineResult = computeDeclineAnalysisFromInsights(
        allBankTransactions,
        allFuelTransactions,
      );
      const insightsModel = buildInsightsReadModel(
        periodSummary,
        attendantSummary,
        declineResult,
      );

      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();

      const fmt = (value: number) => parseFloat(value.toFixed(2));
      const sumAmount = (rows: typeof transactions) =>
        rows.reduce((sum, row) => sum + parseFloat(row.amount), 0);

      const summaryRows = buildReconciliationSummaryRows({
        period,
        matchingRules: matchingRulesData,
        dashboard: dashboardModel,
        review: reviewModel,
      });
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), "Summary");

      const matchedRows = matchesData.map((match) => {
        const bank = txMap.get(match.bankTransactionId);
        const fuel = txMap.get(match.fuelTransactionId);
        const allFuelItems = fuelByMatchId.get(match.id) || [];
        const bankAmount = bank ? parseFloat(bank.amount) : 0;
        const fuelAmount = allFuelItems.length > 0
          ? allFuelItems.reduce((sum, fuelItem) => sum + parseFloat(fuelItem.amount), 0)
          : fuel
            ? parseFloat(fuel.amount)
            : 0;

        return {
          Date: bank?.transactionDate || fuel?.transactionDate || "",
          "Bank Time": bank?.transactionTime || "",
          "Fuel Time": fuel?.transactionTime || "",
          "Bank Amount": bankAmount,
          "Fuel Amount": fuelAmount,
          "Fuel Items": allFuelItems.length > 1 ? allFuelItems.length : 1,
          Difference: Math.round((bankAmount - fuelAmount) * 100) / 100,
          "Bank Source": bank?.sourceName || "",
          "Bank Description": bank?.description || "",
          "Fuel Description":
            allFuelItems.length > 1
              ? allFuelItems
                  .map(
                    (fuelItem) =>
                      `${fuelItem.description || ""} (${parseFloat(fuelItem.amount).toFixed(2)})`,
                  )
                  .join("; ")
              : fuel?.description || "",
          "Card Number": bank?.cardNumber || "",
          "Payment Type": fuel?.paymentType || "",
          Attendant: fuel?.attendant || "",
          Cashier: fuel?.cashier || "",
          Pump: fuel?.pump || "",
          Confidence: match.matchConfidence ? `${match.matchConfidence}%` : "",
          "Match Type": matchTypeLabel(match.matchType),
        };
      });
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(matchedRows), "Matched");

      const unmatchedRows = unmatchedBank.map((transaction) => {
        const resolution = resolutionMap.get(transaction.id);
        const fuel = findNearestFuelForDeclineFromInsights(transaction, fuelTxns);
        return {
          Date: transaction.transactionDate,
          Time: transaction.transactionTime || "",
          Amount: parseFloat(transaction.amount),
          Bank: transaction.sourceName || transaction.sourceType,
          "Card Number": transaction.cardNumber || "",
          Description: transaction.description || "",
          Attendant: fuel?.attendant || "",
          Cashier: fuel?.cashier || "",
          Resolution: resolution ? resolution.resolutionType : "unresolved",
          Reason: resolution?.reason || "",
          Notes: resolution?.notes || "",
        };
      });
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(unmatchedRows), "Unmatched bank");

      if (outsideRange.length > 0) {
        const outsideRows = outsideRange.map((transaction) => ({
          Date: transaction.transactionDate,
          Time: transaction.transactionTime || "",
          Amount: parseFloat(transaction.amount),
          Bank: transaction.sourceName || transaction.sourceType,
          "Card Number": transaction.cardNumber || "",
          Description: transaction.description || "",
        }));
        XLSX.utils.book_append_sheet(
          wb,
          XLSX.utils.json_to_sheet(outsideRows),
          "Outside date range",
        );
      }

      const fuelRows = fuelTxns.map((transaction) => {
        const match = matchMap.get(transaction.id);
        const bankTransaction = match ? txMap.get(match.bankTransactionId) : null;
        return {
          Date: transaction.transactionDate,
          Time: transaction.transactionTime || "",
          Amount: parseFloat(transaction.amount),
          "Payment Type": transaction.paymentType || "",
          "Card Number": transaction.cardNumber || "",
          Attendant: transaction.attendant || "",
          Cashier: transaction.cashier || "",
          Pump: transaction.pump || "",
          Description: transaction.description || "",
          Matched: match ? "Yes" : "No",
          "Bank Match Amount": bankTransaction ? parseFloat(bankTransaction.amount) : "",
          "Bank Source": bankTransaction?.sourceName || "",
        };
      });
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(fuelRows), "Fuel Transactions");

      const unmatchedFuel = fuelTxns.filter(
        (transaction) =>
          transaction.isCardTransaction === "yes" && transaction.matchStatus !== "matched",
      );
      if (unmatchedFuel.length > 0) {
        const unmatchedFuelRows: Record<string, any>[] = unmatchedFuel.map((transaction) => {
          const resolution = resolutionMap.get(transaction.id);
          return {
            Date: transaction.transactionDate,
            Time: transaction.transactionTime || "",
            Amount: parseFloat(transaction.amount),
            "Payment Type": transaction.paymentType || "",
            "Card Number": transaction.cardNumber || "",
            Reference: transaction.referenceNumber || "",
            Attendant: transaction.attendant || "",
            Cashier: transaction.cashier || "",
            Pump: transaction.pump || "",
            Description: transaction.description || "",
            Resolution: resolution ? resolution.resolutionType : "unresolved",
            Reason: resolution?.reason || "",
            Notes: resolution?.notes || "",
          };
        });

        const attendantTotals = new Map<string, { count: number; amount: number }>();
        for (const transaction of unmatchedFuel) {
          const name = transaction.attendant || "Unknown";
          const existing = attendantTotals.get(name) || { count: 0, amount: 0 };
          existing.count += 1;
          existing.amount += parseFloat(transaction.amount);
          attendantTotals.set(name, existing);
        }

        unmatchedFuelRows.push({});
        unmatchedFuelRows.push({ Attendant: "BY ATTENDANT" });
        for (const [name, stats] of Array.from(attendantTotals.entries()).sort((a, b) =>
          a[0].localeCompare(b[0]),
        )) {
          unmatchedFuelRows.push({ Attendant: `  ${name}`, Amount: fmt(stats.amount) });
        }
        unmatchedFuelRows.push({
          Attendant: "Total unmatched fuel card sales",
          Amount: fmt(sumAmount(unmatchedFuel)),
        });

        XLSX.utils.book_append_sheet(
          wb,
          XLSX.utils.json_to_sheet(unmatchedFuelRows),
          "Unmatched fuel",
        );
      }

      if (insightsModel.declines.hasDeclined) {
        const declinedRows = buildDeclinedRows(insightsModel.declines);
        XLSX.utils.book_append_sheet(
          wb,
          XLSX.utils.json_to_sheet(declinedRows),
          "Declined card transactions",
        );
      }

      const attendantRows = buildAttendantSummaryRows(insightsModel.attendants);
      if (attendantRows.length > 0) {
        XLSX.utils.book_append_sheet(
          wb,
          XLSX.utils.json_to_sheet(attendantRows),
          "Attendant Summary",
        );
      }

      const allRows = transactions.map((transaction) => ({
        Date: transaction.transactionDate,
        Time: transaction.transactionTime || "",
        Source: transaction.sourceType,
        "Source Name": transaction.sourceName || "",
        Amount: parseFloat(transaction.amount),
        "Card Number": transaction.cardNumber || "",
        "Payment Type": transaction.paymentType || "",
        Reference: transaction.referenceNumber || "",
        Description: transaction.description || "",
        Attendant: transaction.attendant || "",
        Pump: transaction.pump || "",
        Status: transaction.matchStatus,
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(allRows), "All Transactions");

      const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

      audit(req, {
        action: "data.export",
        resourceType: "period",
        resourceId: req.params.periodId,
        detail: `Full reconciliation export: ${period.name}`,
      });

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="Reconciliation_${period.name.replace(/\s+/g, "_")}.xlsx"`,
      );
      res.send(buffer);
    } catch (error) {
      console.error("Error exporting reconciliation:", error);
      res.status(500).json({ error: "Failed to export reconciliation" });
    }
  });

  app.get("/api/periods/:periodId/export-flagged", isAuthenticated, async (req: any, res) => {
    try {
      const period = await assertPeriodOwner(req.params.periodId, req, res);
      if (!period) return;

      const resolutions = await storage.getResolutionsByPeriod(req.params.periodId);
      const flaggedResolutions = resolutions.filter(
        (resolution) => resolution.resolutionType === "flagged",
      );
      if (flaggedResolutions.length === 0) {
        return res.status(404).json({ error: "No flagged transactions found" });
      }

      const transactions = await storage.getTransactionsByPeriod(req.params.periodId);
      const transactionMap = new Map(
        transactions.map((transaction) => [transaction.id, transaction]),
      );

      const flaggedData = flaggedResolutions.map((resolution) => {
        const transaction = transactionMap.get(resolution.transactionId);
        return {
          "Bank Transaction Date": transaction?.transactionDate || "",
          "Bank Amount": transaction ? parseFloat(transaction.amount) : 0,
          "Bank Reference": transaction?.referenceNumber || "",
          Description: transaction?.description || "",
          "Flagged By": resolution.userName || resolution.userEmail || "Unknown",
          "Flagged Date": resolution.createdAt
            ? new Date(resolution.createdAt).toLocaleDateString("en-ZA")
            : "",
          Notes: resolution.notes || "",
        };
      });

      const XLSX = await import("xlsx");
      const ws = XLSX.utils.json_to_sheet(flaggedData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Flagged Transactions");

      const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

      audit(req, {
        action: "data.export_flagged",
        resourceType: "period",
        resourceId: req.params.periodId,
        detail: `${flaggedResolutions.length} flagged transactions`,
      });

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="Flagged_Transactions_${period.name.replace(/\s+/g, "_")}.xlsx"`,
      );
      res.send(buffer);
    } catch (error) {
      console.error("Error exporting flagged transactions:", error);
      res.status(500).json({ error: "Failed to export flagged transactions" });
    }
  });
}
