export type FuelLike = {
  transactionDate: string;
  transactionTime: string | null;
  cardNumber: string | null;
  attendant: string | null;
  cashier: string | null;
};

export type BankLike = {
  id: string;
  amount: string;
  sourceType: string | null;
  sourceName: string | null;
  transactionDate: string;
  transactionTime: string | null;
  cardNumber: string | null;
  description: string | null;
  matchStatus: string;
};

export type DeclineAnalysisTransaction = {
  id: string;
  date: string;
  time: string;
  amount: number;
  bank: string;
  cardNumber: string;
  description: string;
  type: string;
  note: string;
  recoveredAmount: number;
  isRecovered: boolean;
  resubmittedTxId: string | null;
  attendant: string | null;
  cashier: string | null;
};

export type DeclineAnalysisSuspicious = {
  pattern: string;
  severity: "high" | "medium" | "low";
  detail: string;
  cardNumber: string;
  amount: number;
  shortfall: number;
  attendant: string | null;
};

export type DeclineAnalysisResult = {
  summary: {
    totalDeclined: number;
    resubmittedCount: number;
    unrecoveredCount: number;
    netUnrecoveredAmount: number;
    totalDeclinedAmount: number;
  };
  transactions: DeclineAnalysisTransaction[];
  suspicious: DeclineAnalysisSuspicious[];
};

export function findNearestFuelForDecline<T extends FuelLike>(
  tx: { cardNumber: string | null; transactionDate: string; transactionTime: string | null },
  fuelTxns: readonly T[],
): T | null {
  if (!tx.transactionTime) return null;
  const toMin = (t: string) => parseInt(t.split(":")[0]) * 60 + parseInt(t.split(":")[1] || "0");
  const txMin = toMin(tx.transactionTime);
  const sameDate = fuelTxns.filter((f) => f.transactionDate === tx.transactionDate && f.transactionTime);

  if (tx.cardNumber) {
    const cardMatches = sameDate.filter((f) => f.cardNumber === tx.cardNumber);
    if (cardMatches.length > 0) {
      const before = cardMatches.filter((f) => toMin(f.transactionTime!) <= txMin);
      if (before.length > 0) {
        return before.reduce((b, f) => toMin(f.transactionTime!) > toMin(b.transactionTime!) ? f : b);
      }
      return cardMatches.reduce((b, f) =>
        (toMin(f.transactionTime!) - txMin) < (toMin(b.transactionTime!) - txMin) ? f : b
      );
    }
  }

  let nearest: T | null = null;
  let nearestDiff = Infinity;
  for (const f of sameDate) {
    const diff = Math.abs(toMin(f.transactionTime!) - txMin);
    if (diff < nearestDiff && diff <= 30) {
      nearestDiff = diff;
      nearest = f;
    }
  }
  return nearest;
}

export function computeDeclineAnalysis<
  B extends BankLike,
  F extends FuelLike & { amount: string; isCardTransaction: string | null }
>(
  bankTxns: readonly B[],
  fuelTxns: readonly F[],
): DeclineAnalysisResult {
  const excluded = bankTxns.filter((t) => t.matchStatus === "excluded");
  const approved = bankTxns.filter((t) => t.matchStatus !== "excluded" && t.matchStatus !== "unmatchable");

  const claimedApprovals = new Set<string>();

  const analysed: DeclineAnalysisTransaction[] = excluded.map((tx) => {
    const desc = (tx.description || "").toLowerCase();
    const type = desc.includes("declined") ? "Declined"
      : desc.includes("cancel") || desc.includes("revers") ? "Cancelled / Reversed"
      : "Excluded";
    const cleanDesc = tx.description?.replace(/\s*\[Excluded:.*?\]/g, "").trim() || "";
    const amt = parseFloat(tx.amount);
    const card = tx.cardNumber || "";
    const date = tx.transactionDate;

    const nearestFuel = findNearestFuelForDecline(tx, fuelTxns);

    return {
      id: tx.id,
      date,
      time: tx.transactionTime || "",
      amount: amt,
      bank: tx.sourceName || tx.sourceType || "Bank",
      cardNumber: card,
      description: cleanDesc,
      type,
      note: "",
      recoveredAmount: 0,
      isRecovered: false,
      resubmittedTxId: null,
      attendant: nearestFuel?.attendant || null,
      cashier: nearestFuel?.cashier || null,
    };
  });

  const toMinutes = (t: string) => {
    const parts = t.split(":");
    return parseInt(parts[0]) * 60 + parseInt(parts[1] || "0");
  };

  for (const appr of approved) {
    if (!appr.cardNumber || claimedApprovals.has(appr.id)) continue;
    const apprTime = appr.transactionTime ? toMinutes(appr.transactionTime) : null;
    const candidates = analysed.filter((d) =>
      !d.isRecovered && d.cardNumber === appr.cardNumber && d.date === appr.transactionDate
    );
    if (candidates.length === 0) continue;

    let best: typeof candidates[0] | null = null;
    let bestDiff = Infinity;
    for (const c of candidates) {
      if (apprTime !== null && c.time) {
        const cTime = toMinutes(c.time);
        if (cTime <= apprTime) {
          const diff = apprTime - cTime;
          if (diff < bestDiff) {
            bestDiff = diff;
            best = c;
          }
        }
      }
    }

    if (!best) {
      for (const c of candidates) {
        if (apprTime !== null && c.time) {
          const diff = Math.abs(toMinutes(c.time) - apprTime);
          if (diff < bestDiff) {
            bestDiff = diff;
            best = c;
          }
        }
      }
    }

    if (best) {
      const apprAmt = parseFloat(appr.amount);
      const shortfall = best.amount - apprAmt;
      if (shortfall > 0.5) {
        best.note = `partial resubmission at ${appr.transactionTime || "unknown"} — shortfall ${shortfall.toFixed(2)}`;
        best.recoveredAmount = apprAmt;
        best.isRecovered = false;
      } else {
        best.note = `resubmitted at ${appr.transactionTime || "unknown"}`;
        best.recoveredAmount = apprAmt;
        best.isRecovered = true;
      }
      best.resubmittedTxId = appr.id;
      claimedApprovals.add(appr.id);
    }
  }

  const suspicious: DeclineAnalysisSuspicious[] = [];
  const findAttendant = (d: { date: string; time: string; cardNumber: string }) => {
    const fuel = findNearestFuelForDecline(
      { cardNumber: d.cardNumber, transactionDate: d.date, transactionTime: d.time || null },
      fuelTxns,
    );
    return fuel?.attendant || null;
  };

  const declinesByCard = new Map<string, typeof analysed>();
  for (const d of analysed) {
    if (!d.cardNumber) continue;
    if (!declinesByCard.has(d.cardNumber)) declinesByCard.set(d.cardNumber, []);
    declinesByCard.get(d.cardNumber)!.push(d);
  }

  for (const [card, declines] of Array.from(declinesByCard.entries())) {
    if (declines.length >= 3) {
      const att = findAttendant(declines[0]);
      suspicious.push({
        pattern: "Repeated decline attempts",
        severity: "high",
        detail: `Card ${card} was declined ${declines.length} times on ${declines[0].date}`,
        cardNumber: card,
        amount: declines.reduce((s, d) => s + d.amount, 0),
        shortfall: 0,
        attendant: att,
      });
    }

    for (const d of declines) {
      if (d.isRecovered) continue;
      const laterApproved = approved.find((a) =>
        a.cardNumber === card && a.transactionDate === d.date
        && parseFloat(a.amount) < d.amount
        && a.transactionTime && d.time && a.transactionTime > d.time
      );
      if (laterApproved) {
        const shortfall = d.amount - parseFloat(laterApproved.amount);
        const att = findAttendant(d);
        suspicious.push({
          pattern: "Declined then lower amount approved",
          severity: "high",
          detail: `Card ${card}: declined R${d.amount.toFixed(2)}, then approved R${parseFloat(laterApproved.amount).toFixed(2)} (shortfall R${shortfall.toFixed(2)})`,
          cardNumber: card,
          amount: d.amount,
          shortfall,
          attendant: att,
        });
      }
    }
  }

  for (const d of analysed) {
    if (d.isRecovered || !d.time) continue;
    const dMinutes = parseInt(d.time.split(":")[0]) * 60 + parseInt(d.time.split(":")[1] || "0");
    const cashNearby = fuelTxns.filter((f) => {
      if (f.isCardTransaction !== "no" || f.transactionDate !== d.date || !f.transactionTime) return false;
      const fMinutes = parseInt(f.transactionTime.split(":")[0]) * 60 + parseInt(f.transactionTime.split(":")[1] || "0");
      return fMinutes > dMinutes && (fMinutes - dMinutes) <= 5;
    });
    for (const cash of cashNearby) {
      const cashAmt = parseFloat(cash.amount);
      if (cashAmt > 0 && cashAmt >= d.amount * 0.5 && cashAmt < d.amount) {
        suspicious.push({
          pattern: "Declined then cash payment",
          severity: "medium",
          detail: `Card ${d.cardNumber} declined R${d.amount.toFixed(2)} at ${d.time}, cash R${cashAmt.toFixed(2)} at ${cash.transactionTime} by ${cash.attendant || "Unknown"} (shortfall R${(d.amount - cashAmt).toFixed(2)})`,
          cardNumber: d.cardNumber,
          amount: d.amount,
          shortfall: d.amount - cashAmt,
          attendant: cash.attendant || null,
        });
      }
    }
  }

  const lateNight = analysed.filter((d) => {
    if (!d.time) return false;
    const hour = parseInt(d.time.split(":")[0]);
    return hour >= 22 || hour < 5;
  });
  if (lateNight.length > 0) {
    suspicious.push({
      pattern: "Late-night declines",
      severity: "low",
      detail: `${lateNight.length} decline${lateNight.length !== 1 ? "s" : ""} between 22:00-05:00`,
      cardNumber: "",
      amount: lateNight.reduce((s, d) => s + d.amount, 0),
      shortfall: 0,
      attendant: null,
    });
  }

  const totalDeclined = analysed.length;
  const resubmittedCount = analysed.filter((d) => d.isRecovered).length;
  const unrecovered = analysed.filter((d) => !d.isRecovered);
  const netUnrecoveredAmount = unrecovered.reduce((s, d) => s + d.amount, 0);

  const sortedSuspicious = suspicious.sort((a, b) => {
    const sev = { high: 0, medium: 1, low: 2 };
    return sev[a.severity] - sev[b.severity];
  });

  return {
    summary: {
      totalDeclined,
      resubmittedCount,
      unrecoveredCount: unrecovered.length,
      netUnrecoveredAmount,
      totalDeclinedAmount: analysed.reduce((s, d) => s + d.amount, 0),
    },
    transactions: analysed,
    suspicious: sortedSuspicious,
  };
}
