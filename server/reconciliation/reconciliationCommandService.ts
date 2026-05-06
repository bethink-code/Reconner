import type {
  Match,
  Transaction,
  TransactionResolution,
  UploadedFile,
} from "../../shared/schema";

export type ReconciliationActor = {
  id: string | null;
  name: string | null;
  email: string | null;
};

type ResolutionType = TransactionResolution["resolutionType"];

export type ManualMatchInput = {
  periodId: string;
  bankTransactionId: string;
  fuelTransactionId: string;
};

export type ReviewLinkInput = ManualMatchInput & {
  reviewTransactionId: string;
  actor: ReconciliationActor;
  notes?: string | null;
};

export type ResolutionInput = {
  periodId: string;
  transactionId: string;
  resolutionType: ResolutionType;
  reason?: string | null;
  notes?: string | null;
  linkedTransactionId?: string | null;
  assignee?: string | null;
  actor: ReconciliationActor;
};

export type BulkResolutionInput = {
  periodId: string;
  transactionIds: string[];
  resolutionType: ResolutionType;
  reason?: string | null;
  notes?: string | null;
  linkedTransactionId?: string | null;
  assignee?: string | null;
  actor: ReconciliationActor;
};

type ManualMatchResolution = {
  transactionId: string;
  linkedTransactionId: string;
  reason: string | null;
  notes: string | null;
  actor: ReconciliationActor;
};

export interface ReconciliationCommandRepository {
  getFile(id: string): Promise<UploadedFile | undefined>;
  getMatch(id: string): Promise<Match | undefined>;
  getTransaction(id: string): Promise<Transaction | undefined>;
  getTransactionsByFile(fileId: string): Promise<Transaction[]>;
  getTransactionsByIds(ids: string[]): Promise<Transaction[]>;
  getTransactionsByMatchId(matchId: string): Promise<Transaction[]>;
  getResolutionsByPeriod(periodId: string): Promise<TransactionResolution[]>;
  getResolutionsByTransaction(transactionId: string): Promise<TransactionResolution[]>;
  createManualMatch(
    input: ManualMatchInput & { resolution?: ManualMatchResolution | null },
  ): Promise<Match>;
  createResolution(input: ResolutionInput): Promise<TransactionResolution>;
  createBulkResolutions(input: BulkResolutionInput): Promise<number>;
  clearStandaloneResolutions(transactionIds: string[]): Promise<number>;
  deleteTransactionsByFile(fileId: string): Promise<void>;
  deleteFile(fileId: string): Promise<void>;
  unlinkMatchBundle(matchId: string, transactionIds: string[]): Promise<void>;
}

export class ReconciliationCommandError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ReconciliationCommandError";
    this.status = status;
    this.code = code;
  }
}

function uniqueIds(ids: string[]) {
  return [...new Set(ids)];
}

function isBankTransaction(transaction: Transaction) {
  return !!transaction.sourceType?.startsWith("bank");
}

function isFuelTransaction(transaction: Transaction) {
  return transaction.sourceType === "fuel";
}

function assertPeriodTransaction(
  transaction: Transaction | undefined,
  periodId: string,
  label: string,
): Transaction {
  if (!transaction) {
    throw new ReconciliationCommandError(404, "transaction_not_found", `${label} transaction was not found`);
  }

  if (transaction.periodId !== periodId) {
    throw new ReconciliationCommandError(400, "transaction_period_mismatch", `${label} transaction is not in this reconciliation period`);
  }

  return transaction;
}

export class ReconciliationCommandService {
  private readonly repository: ReconciliationCommandRepository;

  constructor(repository: ReconciliationCommandRepository) {
    this.repository = repository;
  }

  async createManualMatch(input: ManualMatchInput) {
    const [bankTransaction, fuelTransaction] = await this.loadManualMatchTransactions(input);

    if (bankTransaction.matchId || bankTransaction.matchStatus === "matched") {
      throw new ReconciliationCommandError(409, "bank_already_matched", "The selected bank transaction is already matched");
    }

    if (fuelTransaction.matchId || fuelTransaction.matchStatus === "matched") {
      throw new ReconciliationCommandError(409, "fuel_already_matched", "The selected fuel transaction is already matched");
    }

    return this.repository.createManualMatch(input);
  }

  async createReviewLink(input: ReviewLinkInput) {
    const [bankTransaction, fuelTransaction] = await this.loadManualMatchTransactions(input);
    const reviewTransactionId = input.reviewTransactionId;

    if (reviewTransactionId !== bankTransaction.id && reviewTransactionId !== fuelTransaction.id) {
      throw new ReconciliationCommandError(400, "invalid_review_transaction", "The review transaction must be one of the linked transactions");
    }

    if (bankTransaction.matchId || bankTransaction.matchStatus === "matched") {
      throw new ReconciliationCommandError(409, "bank_already_matched", "The selected bank transaction is already matched");
    }

    if (fuelTransaction.matchId || fuelTransaction.matchStatus === "matched") {
      throw new ReconciliationCommandError(409, "fuel_already_matched", "The selected fuel transaction is already matched");
    }

    return this.repository.createManualMatch({
      periodId: input.periodId,
      bankTransactionId: bankTransaction.id,
      fuelTransactionId: fuelTransaction.id,
      resolution: {
        transactionId: reviewTransactionId,
        linkedTransactionId: reviewTransactionId === bankTransaction.id ? fuelTransaction.id : bankTransaction.id,
        reason: "manual_match",
        notes: input.notes ?? "Linked via review",
        actor: input.actor,
      },
    });
  }

  async createResolution(input: ResolutionInput) {
    const transaction = assertPeriodTransaction(
      await this.repository.getTransaction(input.transactionId),
      input.periodId,
      "Selected",
    );

    if (input.resolutionType === "linked") {
      throw new ReconciliationCommandError(400, "linked_resolution_requires_match", "Use the review link command to create a linked match");
    }

    if (input.linkedTransactionId) {
      assertPeriodTransaction(
        await this.repository.getTransaction(input.linkedTransactionId),
        input.periodId,
        "Linked",
      );
    }

    return this.repository.createResolution({
      ...input,
      transactionId: transaction.id,
      reason: input.reason ?? null,
      notes: input.notes ?? null,
      linkedTransactionId: input.linkedTransactionId ?? null,
      assignee: input.assignee ?? null,
    });
  }

  async createBulkResolutions(input: BulkResolutionInput) {
    if (input.transactionIds.length === 0) {
      throw new ReconciliationCommandError(400, "missing_transactions", "At least one transaction is required");
    }

    if (input.resolutionType === "linked") {
      throw new ReconciliationCommandError(400, "linked_resolution_requires_match", "Linked resolutions must be created through a match command");
    }

    const requestedIds = uniqueIds(input.transactionIds);
    const transactions = await this.repository.getTransactionsByIds(requestedIds);
    const transactionsById = new Map(transactions.map((transaction) => [transaction.id, transaction]));

    for (const transactionId of requestedIds) {
      assertPeriodTransaction(transactionsById.get(transactionId), input.periodId, "Selected");
    }

    return this.repository.createBulkResolutions({
      ...input,
      transactionIds: requestedIds,
      reason: input.reason ?? null,
      notes: input.notes ?? null,
      linkedTransactionId: input.linkedTransactionId ?? null,
      assignee: input.assignee ?? null,
    });
  }

  async removeResolution(periodId: string, transactionId: string) {
    const transaction = assertPeriodTransaction(
      await this.repository.getTransaction(transactionId),
      periodId,
      "Selected",
    );
    const resolutions = await this.repository.getResolutionsByTransaction(transaction.id);

    if (resolutions.length === 0) {
      throw new ReconciliationCommandError(404, "resolution_not_found", "No resolution was found for this transaction");
    }

    const hasLinkedResolution = resolutions.some((resolution) => resolution.resolutionType === "linked");
    if (hasLinkedResolution && transaction.matchId) {
      const bundleTransactions = await this.repository.getTransactionsByMatchId(transaction.matchId);
      const transactionIds = uniqueIds(
        bundleTransactions.length > 0
          ? bundleTransactions.map((item) => item.id)
          : [transaction.id],
      );

      await this.repository.unlinkMatchBundle(transaction.matchId, transactionIds);
      return { count: resolutions.length, mode: "unlinked_match" as const };
    }

    const count = await this.repository.clearStandaloneResolutions([transaction.id]);
    return { count, mode: "removed_resolution" as const };
  }

  async deleteMatch(periodId: string, matchId: string) {
    const match = await this.repository.getMatch(matchId);
    if (!match) {
      throw new ReconciliationCommandError(404, "match_not_found", "Match not found");
    }

    if (match.periodId !== periodId) {
      throw new ReconciliationCommandError(400, "match_period_mismatch", "This match does not belong to the selected reconciliation period");
    }

    const bundleTransactions = await this.repository.getTransactionsByMatchId(match.id);
    const transactionIds = uniqueIds(
      bundleTransactions.length > 0
        ? bundleTransactions.map((transaction) => transaction.id)
        : [match.bankTransactionId, match.fuelTransactionId],
    );

    await this.repository.unlinkMatchBundle(match.id, transactionIds);
  }

  async clearPeriodResolutions(periodId: string) {
    const resolutions = await this.repository.getResolutionsByPeriod(periodId);
    if (resolutions.length === 0) return 0;

    const resolutionIds = uniqueIds(resolutions.map((resolution) => resolution.transactionId));
    const transactions = await this.repository.getTransactionsByIds(resolutionIds);
    const transactionsById = new Map(transactions.map((transaction) => [transaction.id, transaction]));
    const linkedMatchIds = new Set<string>();
    const linkedFallbackTransactions = new Map<string, string>();
    const standaloneIds: string[] = [];

    for (const resolution of resolutions) {
      const transaction = assertPeriodTransaction(
        transactionsById.get(resolution.transactionId),
        periodId,
        "Resolved",
      );

      if (resolution.resolutionType === "linked" && transaction.matchId) {
        linkedMatchIds.add(transaction.matchId);
        if (!linkedFallbackTransactions.has(transaction.matchId)) {
          linkedFallbackTransactions.set(transaction.matchId, transaction.id);
        }
      } else if (resolution.resolutionType !== "linked") {
        standaloneIds.push(transaction.id);
      }
    }

    for (const matchId of linkedMatchIds) {
      const bundleTransactions = await this.repository.getTransactionsByMatchId(matchId);
      const transactionIds = uniqueIds(
        bundleTransactions.length > 0
          ? bundleTransactions.map((transaction) => transaction.id)
          : [linkedFallbackTransactions.get(matchId) || ""].filter(Boolean),
      );

      if (transactionIds.length > 0) {
        await this.repository.unlinkMatchBundle(matchId, transactionIds);
      }
    }

    const remainingStandaloneIds = uniqueIds(
      standaloneIds.filter((transactionId) => {
        const transaction = transactionsById.get(transactionId);
        return !transaction?.matchId || !linkedMatchIds.has(transaction.matchId);
      }),
    );

    if (remainingStandaloneIds.length > 0) {
      await this.repository.clearStandaloneResolutions(remainingStandaloneIds);
    }

    return resolutions.length;
  }

  async clearFileTransactions(periodId: string, fileId: string) {
    const file = await this.repository.getFile(fileId);
    if (!file) {
      throw new ReconciliationCommandError(404, "file_not_found", "File not found");
    }

    if (file.periodId !== periodId) {
      throw new ReconciliationCommandError(400, "file_period_mismatch", "This file does not belong to the selected reconciliation period");
    }

    const transactions = await this.repository.getTransactionsByFile(fileId);
    const linkedMatchIds = new Set<string>();
    const linkedFallbackTransactions = new Map<string, string>();
    const standaloneResolutionIds = new Set<string>();

    for (const transaction of transactions) {
      assertPeriodTransaction(transaction, periodId, "File");

      if (transaction.matchId) {
        linkedMatchIds.add(transaction.matchId);
        if (!linkedFallbackTransactions.has(transaction.matchId)) {
          linkedFallbackTransactions.set(transaction.matchId, transaction.id);
        }
      } else {
        const resolutions = await this.repository.getResolutionsByTransaction(transaction.id);
        if (resolutions.length > 0) {
          standaloneResolutionIds.add(transaction.id);
        }
      }
    }

    for (const matchId of linkedMatchIds) {
      const bundleTransactions = await this.repository.getTransactionsByMatchId(matchId);
      const transactionIds = uniqueIds(
        bundleTransactions.length > 0
          ? bundleTransactions.map((transaction) => transaction.id)
          : [linkedFallbackTransactions.get(matchId) || ""].filter(Boolean),
      );

      if (transactionIds.length > 0) {
        await this.repository.unlinkMatchBundle(matchId, transactionIds);
      }
    }

    if (standaloneResolutionIds.size > 0) {
      await this.repository.clearStandaloneResolutions([...standaloneResolutionIds]);
    }

    await this.repository.deleteTransactionsByFile(fileId);
    return {
      file,
      deletedTransactionCount: transactions.length,
    };
  }

  async deleteFileAndState(periodId: string, fileId: string) {
    const result = await this.clearFileTransactions(periodId, fileId);
    await this.repository.deleteFile(fileId);
    return result;
  }

  private async loadManualMatchTransactions(input: ManualMatchInput) {
    const transactions = await this.repository.getTransactionsByIds(
      uniqueIds([input.bankTransactionId, input.fuelTransactionId]),
    );
    const transactionsById = new Map(transactions.map((transaction) => [transaction.id, transaction]));

    const bankTransaction = assertPeriodTransaction(
      transactionsById.get(input.bankTransactionId),
      input.periodId,
      "Selected bank",
    );
    const fuelTransaction = assertPeriodTransaction(
      transactionsById.get(input.fuelTransactionId),
      input.periodId,
      "Selected fuel",
    );

    if (!isBankTransaction(bankTransaction)) {
      throw new ReconciliationCommandError(400, "invalid_bank_transaction", "The selected bank transaction is not a bank transaction");
    }

    if (!isFuelTransaction(fuelTransaction)) {
      throw new ReconciliationCommandError(400, "invalid_fuel_transaction", "The selected fuel transaction is not a fuel transaction");
    }

    return [bankTransaction, fuelTransaction] as const;
  }
}
