import type { MatchingStage } from "../../shared/matchingStages";

export interface FuelInvoice<TItem> {
  invoiceNumber: string;
  items: TItem[];
  totalAmount: number;
  firstDate: string;
  firstTime: string | null;
  cardNumber: string | null;
}

export interface MatchingRulesLike {
  amountTolerance: number;
  dateWindowDays: number;
  timeWindowMinutes: number;
  requireCardMatch: boolean;
  minimumConfidence: number;
  autoMatchThreshold?: number;
}

export interface BestInvoiceMatch<TItem> {
  invoice: FuelInvoice<TItem>;
  confidence: number;
  timeDiff: number;
  dateDiff: number;
  amountDiff: number;
  reasons: string[];
}

export interface StageMatch<TBank, TFuel> {
  stage: MatchingStage;
  bankTransaction: TBank;
  bestMatch: BestInvoiceMatch<TFuel>;
}

type BoundaryPosition = "start" | "end" | "both" | "none";

type FuelTxnLike = {
  id: string;
  amount: string;
  transactionDate: string;
  transactionTime: string | null;
  cardNumber: string | null;
  referenceNumber: string | null;
  matchStatus: string;
};

type BankTxnLike = {
  amount: string;
  transactionDate: string;
  transactionTime: string | null;
  cardNumber: string | null;
};

export function groupFuelByInvoice<T extends FuelTxnLike>(
  fuelTransactions: T[],
  groupByInvoice: boolean,
): FuelInvoice<T>[] {
  if (!groupByInvoice) {
    return fuelTransactions.map((tx) => ({
      invoiceNumber: tx.id,
      items: [tx],
      totalAmount: parseFloat(tx.amount),
      firstDate: tx.transactionDate,
      firstTime: tx.transactionTime,
      cardNumber: tx.cardNumber,
    }));
  }

  const invoices: Record<string, FuelInvoice<T>> = {};

  for (const tx of fuelTransactions) {
    const invoiceNum = tx.referenceNumber || tx.id;

    if (!invoices[invoiceNum]) {
      invoices[invoiceNum] = {
        invoiceNumber: invoiceNum,
        items: [],
        totalAmount: 0,
        firstDate: tx.transactionDate,
        firstTime: tx.transactionTime,
        cardNumber: tx.cardNumber,
      };
    }

    invoices[invoiceNum].items.push(tx);
    invoices[invoiceNum].totalAmount += parseFloat(tx.amount);
  }

  return Object.values(invoices);
}

export function parseTimeToMinutes(timeStr: string): number | null {
  if (!timeStr) return null;
  const match = timeStr.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return null;
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  return hours * 60 + minutes;
}

export function parseDateToDays(dateStr: string): number | null {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return null;
  return Math.floor(date.getTime() / (1000 * 60 * 60 * 24));
}

export function scoreBankToInvoices<TBank extends BankTxnLike, TFuel extends FuelTxnLike>(
  bankTx: TBank,
  candidateInvoices: FuelInvoice<TFuel>[],
  usedInvoices: Set<string>,
  rules: MatchingRulesLike,
): BestInvoiceMatch<TFuel> | null {
  return scoreBankToInvoicesForStage(bankTx, candidateInvoices, usedInvoices, {
    id: "single_pass",
    name: "Single Pass",
    description: "Legacy single-pass scoring",
    order: 1,
    maxAmountDiff: rules.amountTolerance,
    minDateDiffDays: 0,
    maxDateDiffDays: rules.dateWindowDays,
    maxTimeDiffMinutes: rules.timeWindowMinutes,
    requireExactAmount: false,
    requireCardMatch: rules.requireCardMatch,
    minimumConfidence: rules.minimumConfidence,
    autoConfirmConfidence: rules.autoMatchThreshold ?? rules.minimumConfidence,
    boundaryMode: "none",
  });
}

export function scoreBankToInvoicesForStage<TBank extends BankTxnLike, TFuel extends FuelTxnLike>(
  bankTx: TBank,
  candidateInvoices: FuelInvoice<TFuel>[],
  usedInvoices: Set<string>,
  stage: MatchingStage,
  getBoundaryPosition?: (invoice: FuelInvoice<TFuel>) => BoundaryPosition,
): BestInvoiceMatch<TFuel> | null {
  let bestMatch: BestInvoiceMatch<TFuel> | null = null;
  const seen = new Set<string>();

  for (const invoice of candidateInvoices) {
    if (seen.has(invoice.invoiceNumber)) continue;
    seen.add(invoice.invoiceNumber);
    if (usedInvoices.has(invoice.invoiceNumber)) continue;
    if (invoice.items.some((item) => item.matchStatus === "matched")) continue;

    const reasons: string[] = [`stage:${stage.id}`];

    const bankAmount = parseFloat(bankTx.amount);
    const amountDiff = Math.abs(bankAmount - invoice.totalAmount);
    if (amountDiff > stage.maxAmountDiff) continue;
    if (stage.requireExactAmount && amountDiff > 0.01) continue;

    const fuelDate = parseDateToDays(invoice.firstDate || "");
    const bankDate = parseDateToDays(bankTx.transactionDate || "");
    if (fuelDate === null || bankDate === null) continue;
    const dateDiff = bankDate - fuelDate;
    if (dateDiff < stage.minDateDiffDays || dateDiff > stage.maxDateDiffDays) continue;

    const boundaryPosition = getBoundaryPosition ? getBoundaryPosition(invoice) : "none";
    if (stage.boundaryMode === "boundary") {
      const allowsPreviousDay = boundaryPosition === "start" || boundaryPosition === "both";
      const allowsNextDay = boundaryPosition === "end" || boundaryPosition === "both";
      const isDirectionalBoundary =
        (dateDiff === -1 && allowsPreviousDay) ||
        (dateDiff === 1 && allowsNextDay);
      if (!isDirectionalBoundary) continue;
      reasons.push(dateDiff === -1 ? "boundary-previous-day" : "boundary-next-day");
    }

    const fuelTime = parseTimeToMinutes(invoice.firstTime || "");
    const bankTime = parseTimeToMinutes(bankTx.transactionTime || "");

    let confidence = 70;
    if (dateDiff === 0) confidence = 85;
    else if (Math.abs(dateDiff) === 1) confidence = 75;
    else if (Math.abs(dateDiff) === 2) confidence = 68;
    else confidence = 65;

    let timeDiff = 0;
    if (dateDiff === 0 && fuelTime !== null && bankTime !== null) {
      timeDiff = Math.abs(bankTime - fuelTime);
      if (stage.maxTimeDiffMinutes !== null && timeDiff > stage.maxTimeDiffMinutes) continue;
      if (timeDiff <= 5) confidence = 100;
      else if (timeDiff <= 15) confidence = 95;
      else if (timeDiff <= 30) confidence = 85;
      else confidence = 75;
    }

    if (amountDiff > 0) {
      const divisor = stage.maxAmountDiff <= 0 ? 0.01 : stage.maxAmountDiff;
      confidence -= Math.min(5, (amountDiff / divisor) * 5);
    }

    let cardMatch: "yes" | "no" | "unknown" = "unknown";
    if (stage.requireCardMatch) {
      if (!bankTx.cardNumber || !invoice.cardNumber) continue;
      if (bankTx.cardNumber !== invoice.cardNumber) continue;
      cardMatch = "yes";
      confidence += 25;
      reasons.push("card-match-required");
    } else if (bankTx.cardNumber && invoice.cardNumber) {
      if (bankTx.cardNumber === invoice.cardNumber) {
        cardMatch = "yes";
        confidence += 25;
        reasons.push("card-match-strong");
      } else {
        cardMatch = "no";
        confidence -= 30;
        reasons.push("card-differ");
      }
    }

    confidence = Math.min(100, Math.max(0, confidence));
    if (confidence < stage.minimumConfidence) continue;

    const absDiff = Math.abs(dateDiff);
    const cardMatchScore = cardMatch === "yes" ? 2 : cardMatch === "unknown" ? 1 : 0;
    const bestCardScore = bestMatch
      ? (bestMatch.reasons.some((r) => r.startsWith("card-match")) ? 2
        : bestMatch.reasons.some((r) => r === "card-differ") ? 0 : 1)
      : -1;

    if (!bestMatch ||
        confidence > bestMatch.confidence ||
        (confidence === bestMatch.confidence && cardMatchScore > bestCardScore) ||
        (confidence === bestMatch.confidence && cardMatchScore === bestCardScore && absDiff < bestMatch.dateDiff) ||
        (confidence === bestMatch.confidence && cardMatchScore === bestCardScore && absDiff === bestMatch.dateDiff && timeDiff < bestMatch.timeDiff)) {
      bestMatch = { invoice, confidence, timeDiff, dateDiff: absDiff, amountDiff, reasons };
    }
  }

  return bestMatch;
}

export function runSequentialMatchingStages<TBank extends BankTxnLike & { id: string }, TFuel extends FuelTxnLike>(
  bankTransactions: TBank[],
  fuelInvoices: FuelInvoice<TFuel>[],
  stages: MatchingStage[],
): StageMatch<TBank, TFuel>[] {
  const remainingBanks = [...bankTransactions];
  const usedInvoices = new Set<string>();
  const stageMatches: StageMatch<TBank, TFuel>[] = [];
  const boundaryPositions = deriveBoundaryPositions(fuelInvoices);

  for (const stage of stages) {
    const stillRemaining: TBank[] = [];

    for (const bankTx of remainingBanks) {
      const bestMatch = scoreBankToInvoicesForStage(
        bankTx,
        fuelInvoices,
        usedInvoices,
        stage,
        (invoice) => boundaryPositions.get(invoice.invoiceNumber) || "none",
      );
      if (!bestMatch) {
        stillRemaining.push(bankTx);
        continue;
      }

      usedInvoices.add(bestMatch.invoice.invoiceNumber);
      stageMatches.push({
        stage,
        bankTransaction: bankTx,
        bestMatch,
      });
    }

    remainingBanks.length = 0;
    remainingBanks.push(...stillRemaining);
  }

  return stageMatches;
}

function deriveBoundaryPositions<TFuel>(fuelInvoices: FuelInvoice<TFuel>[]): Map<string, BoundaryPosition> {
  const grouped = new Map<string, FuelInvoice<TFuel>[]>();

  for (const invoice of fuelInvoices) {
    const key = invoice.firstDate || "";
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(invoice);
  }

  const positions = new Map<string, BoundaryPosition>();

  for (const invoices of grouped.values()) {
    const sorted = [...invoices].sort((a, b) => {
      const timeA = parseTimeToMinutes(a.firstTime || "") ?? Number.MAX_SAFE_INTEGER;
      const timeB = parseTimeToMinutes(b.firstTime || "") ?? Number.MAX_SAFE_INTEGER;
      if (timeA !== timeB) return timeA - timeB;
      return a.invoiceNumber.localeCompare(b.invoiceNumber);
    });

    if (sorted.length === 0) continue;

    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    positions.set(first.invoiceNumber, first.invoiceNumber === last.invoiceNumber ? "both" : "start");
    positions.set(last.invoiceNumber, first.invoiceNumber === last.invoiceNumber ? "both" : "end");
  }

  return positions;
}
