import test from "node:test";
import assert from "node:assert/strict";

import {
  ReconciliationCommandError,
  ReconciliationCommandService,
  type ReconciliationCommandRepository,
} from "../../server/reconciliation/reconciliationCommandService.ts";
import type {
  Match,
  Transaction,
  TransactionResolution,
  UploadedFile,
} from "../../shared/schema";

function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: overrides.id ?? "transaction-1",
    fileId: overrides.fileId ?? "file-1",
    periodId: overrides.periodId ?? "period-1",
    sourceType: overrides.sourceType ?? "fuel",
    sourceName: overrides.sourceName ?? null,
    rawData: overrides.rawData ?? {},
    transactionDate: overrides.transactionDate ?? "2026-04-26",
    transactionTime: overrides.transactionTime ?? "10:00:00",
    amount: overrides.amount ?? "100.00",
    description: overrides.description ?? null,
    referenceNumber: overrides.referenceNumber ?? null,
    cardNumber: overrides.cardNumber ?? null,
    paymentType: overrides.paymentType ?? null,
    isCardTransaction: overrides.isCardTransaction ?? "yes",
    attendant: overrides.attendant ?? null,
    cashier: overrides.cashier ?? null,
    pump: overrides.pump ?? null,
    matchStatus: overrides.matchStatus ?? "unmatched",
    matchId: overrides.matchId ?? null,
    createdAt: overrides.createdAt ?? new Date("2026-05-06T10:00:00.000Z"),
  };
}

function makeMatch(overrides: Partial<Match> = {}): Match {
  return {
    id: overrides.id ?? "match-1",
    periodId: overrides.periodId ?? "period-1",
    fuelTransactionId: overrides.fuelTransactionId ?? "fuel-1",
    bankTransactionId: overrides.bankTransactionId ?? "bank-1",
    matchType: overrides.matchType ?? "user_confirmed",
    matchConfidence: overrides.matchConfidence ?? "100",
    createdAt: overrides.createdAt ?? new Date("2026-05-06T10:00:00.000Z"),
  };
}

function makeResolution(
  overrides: Partial<TransactionResolution> = {},
): TransactionResolution {
  return {
    id: overrides.id ?? "resolution-1",
    transactionId: overrides.transactionId ?? "transaction-1",
    periodId: overrides.periodId ?? "period-1",
    resolutionType: overrides.resolutionType ?? "reviewed",
    reason: overrides.reason ?? null,
    notes: overrides.notes ?? null,
    userId: overrides.userId ?? null,
    userName: overrides.userName ?? null,
    userEmail: overrides.userEmail ?? null,
    linkedTransactionId: overrides.linkedTransactionId ?? null,
    assignee: overrides.assignee ?? null,
    createdAt: overrides.createdAt ?? new Date("2026-05-06T10:00:00.000Z"),
  };
}

function makeRepository(overrides: Partial<ReconciliationCommandRepository> = {}) {
  const calls = {
    createManualMatch: [] as Parameters<ReconciliationCommandRepository["createManualMatch"]>[],
    createResolution: [] as Parameters<ReconciliationCommandRepository["createResolution"]>[],
    createBulkResolutions: [] as Parameters<ReconciliationCommandRepository["createBulkResolutions"]>[],
    clearStandaloneResolutions: [] as Parameters<ReconciliationCommandRepository["clearStandaloneResolutions"]>[],
    deleteTransactionsByFile: [] as Parameters<ReconciliationCommandRepository["deleteTransactionsByFile"]>[],
    deleteFile: [] as Parameters<ReconciliationCommandRepository["deleteFile"]>[],
    unlinkMatchBundle: [] as Parameters<ReconciliationCommandRepository["unlinkMatchBundle"]>[],
  };

  const repository: ReconciliationCommandRepository = {
    getFile: async () => undefined,
    getMatch: async () => undefined,
    getTransaction: async () => undefined,
    getTransactionsByFile: async () => [],
    getTransactionsByIds: async () => [],
    getTransactionsByMatchId: async () => [],
    getResolutionsByPeriod: async () => [],
    getResolutionsByTransaction: async () => [],
    createManualMatch: async (...args) => {
      calls.createManualMatch.push(args);
      return makeMatch();
    },
    createResolution: async (...args) => {
      calls.createResolution.push(args);
      return makeResolution();
    },
    createBulkResolutions: async (...args) => {
      calls.createBulkResolutions.push(args);
      return args[0].transactionIds.length;
    },
    clearStandaloneResolutions: async (...args) => {
      calls.clearStandaloneResolutions.push(args);
      return args[0].length;
    },
    deleteTransactionsByFile: async (...args) => {
      calls.deleteTransactionsByFile.push(args);
    },
    deleteFile: async (...args) => {
      calls.deleteFile.push(args);
    },
    unlinkMatchBundle: async (...args) => {
      calls.unlinkMatchBundle.push(args);
    },
    ...overrides,
  };

  return { repository, calls };
}

function makeFile(overrides: Partial<UploadedFile> = {}): UploadedFile {
  return {
    id: overrides.id ?? "file-1",
    periodId: overrides.periodId ?? "period-1",
    fileName: overrides.fileName ?? "bank.csv",
    fileType: overrides.fileType ?? "csv",
    sourceType: overrides.sourceType ?? "bank",
    sourceName: overrides.sourceName ?? "FNB",
    fileUrl: overrides.fileUrl ?? "objects/file-1",
    fileData: overrides.fileData ?? null,
    fileSize: overrides.fileSize ?? 100,
    rowCount: overrides.rowCount ?? 10,
    columnMapping: overrides.columnMapping ?? null,
    qualityReport: overrides.qualityReport ?? null,
    uploadedAt: overrides.uploadedAt ?? new Date("2026-05-06T10:00:00.000Z"),
    status: overrides.status ?? "processed",
    contentHash: overrides.contentHash ?? null,
    bankName: overrides.bankName ?? null,
  };
}

test("createReviewLink validates the pair and creates one linked match bundle", async () => {
  const bankTransaction = makeTransaction({
    id: "bank-1",
    sourceType: "bank-fnb",
    isCardTransaction: null,
  });
  const fuelTransaction = makeTransaction({
    id: "fuel-1",
    sourceType: "fuel",
  });
  const { repository, calls } = makeRepository({
    getTransactionsByIds: async () => [bankTransaction, fuelTransaction],
  });
  const service = new ReconciliationCommandService(repository);

  const match = await service.createReviewLink({
    periodId: "period-1",
    bankTransactionId: bankTransaction.id,
    fuelTransactionId: fuelTransaction.id,
    reviewTransactionId: fuelTransaction.id,
    notes: null,
    actor: {
      id: "user-1",
      name: "Ada Admin",
      email: "ada@example.com",
    },
  });

  assert.equal(match.id, "match-1");
  assert.equal(calls.createManualMatch.length, 1);
  assert.deepEqual(calls.createManualMatch[0][0], {
    periodId: "period-1",
    bankTransactionId: "bank-1",
    fuelTransactionId: "fuel-1",
    resolution: {
      transactionId: "fuel-1",
      linkedTransactionId: "bank-1",
      reason: "manual_match",
      notes: "Linked via review",
      actor: {
        id: "user-1",
        name: "Ada Admin",
        email: "ada@example.com",
      },
    },
  });
});

test("createManualMatch rejects invalid bank-side transactions", async () => {
  const invalidBank = makeTransaction({
    id: "not-bank",
    sourceType: "fuel",
  });
  const fuelTransaction = makeTransaction({
    id: "fuel-1",
    sourceType: "fuel",
  });
  const { repository } = makeRepository({
    getTransactionsByIds: async () => [invalidBank, fuelTransaction],
  });
  const service = new ReconciliationCommandService(repository);

  await assert.rejects(
    () => service.createManualMatch({
      periodId: "period-1",
      bankTransactionId: invalidBank.id,
      fuelTransactionId: fuelTransaction.id,
    }),
    (error: unknown) => {
      assert.ok(error instanceof ReconciliationCommandError);
      assert.equal(error.code, "invalid_bank_transaction");
      return true;
    },
  );
});

test("createResolution blocks linked-only resolutions from the generic command", async () => {
  const transaction = makeTransaction({ id: "fuel-1" });
  const { repository, calls } = makeRepository({
    getTransaction: async () => transaction,
  });
  const service = new ReconciliationCommandService(repository);

  await assert.rejects(
    () => service.createResolution({
      periodId: "period-1",
      transactionId: transaction.id,
      resolutionType: "linked",
      reason: null,
      notes: null,
      actor: { id: null, name: null, email: null },
    }),
    (error: unknown) => {
      assert.ok(error instanceof ReconciliationCommandError);
      assert.equal(error.code, "linked_resolution_requires_match");
      return true;
    },
  );

  assert.equal(calls.createResolution.length, 0);
});

test("removeResolution unlinks the whole match bundle for linked review matches", async () => {
  const reviewFuel = makeTransaction({
    id: "fuel-1",
    matchId: "match-1",
    matchStatus: "matched",
  });
  const bankTransaction = makeTransaction({
    id: "bank-1",
    sourceType: "bank-fnb",
    isCardTransaction: null,
    matchId: "match-1",
    matchStatus: "matched",
  });
  const extraFuel = makeTransaction({
    id: "fuel-2",
    matchId: "match-1",
    matchStatus: "matched",
  });
  const { repository, calls } = makeRepository({
    getTransaction: async () => reviewFuel,
    getResolutionsByTransaction: async () => [
      makeResolution({
        transactionId: reviewFuel.id,
        resolutionType: "linked",
      }),
    ],
    getTransactionsByMatchId: async () => [reviewFuel, bankTransaction, extraFuel],
  });
  const service = new ReconciliationCommandService(repository);

  const result = await service.removeResolution("period-1", reviewFuel.id);

  assert.equal(result.mode, "unlinked_match");
  assert.deepEqual(calls.unlinkMatchBundle[0], [
    "match-1",
    ["fuel-1", "bank-1", "fuel-2"],
  ]);
  assert.equal(calls.clearStandaloneResolutions.length, 0);
});

test("createBulkResolutions validates that every transaction belongs to the period", async () => {
  const inPeriod = makeTransaction({ id: "fuel-1", periodId: "period-1" });
  const wrongPeriod = makeTransaction({ id: "fuel-2", periodId: "period-2" });
  const { repository, calls } = makeRepository({
    getTransactionsByIds: async () => [inPeriod, wrongPeriod],
  });
  const service = new ReconciliationCommandService(repository);

  await assert.rejects(
    () => service.createBulkResolutions({
      periodId: "period-1",
      transactionIds: [inPeriod.id, wrongPeriod.id],
      resolutionType: "flagged",
      reason: null,
      notes: null,
      actor: { id: null, name: null, email: null },
    }),
    (error: unknown) => {
      assert.ok(error instanceof ReconciliationCommandError);
      assert.equal(error.code, "transaction_period_mismatch");
      return true;
    },
  );

  assert.equal(calls.createBulkResolutions.length, 0);
});

test("clearPeriodResolutions unlinks linked bundles and clears standalone review state", async () => {
  const linkedFuel = makeTransaction({
    id: "fuel-1",
    matchId: "match-1",
    matchStatus: "matched",
  });
  const standaloneFuel = makeTransaction({
    id: "fuel-2",
    matchId: null,
    matchStatus: "resolved",
  });
  const bundleBank = makeTransaction({
    id: "bank-1",
    sourceType: "bank-fnb",
    isCardTransaction: null,
    matchId: "match-1",
    matchStatus: "matched",
  });
  const { repository, calls } = makeRepository({
    getResolutionsByPeriod: async () => [
      makeResolution({ transactionId: linkedFuel.id, resolutionType: "linked" }),
      makeResolution({ transactionId: standaloneFuel.id, resolutionType: "flagged" }),
    ],
    getTransactionsByIds: async () => [linkedFuel, standaloneFuel],
    getTransactionsByMatchId: async () => [linkedFuel, bundleBank],
  });
  const service = new ReconciliationCommandService(repository);

  const count = await service.clearPeriodResolutions("period-1");

  assert.equal(count, 2);
  assert.deepEqual(calls.unlinkMatchBundle[0], ["match-1", ["fuel-1", "bank-1"]]);
  assert.deepEqual(calls.clearStandaloneResolutions[0], [["fuel-2"]]);
});

test("clearFileTransactions unlinks impacted bundles, clears standalone resolutions, and deletes file transactions", async () => {
  const file = makeFile({ id: "file-1", periodId: "period-1" });
  const matchedFuel = makeTransaction({
    id: "fuel-1",
    fileId: file.id,
    matchId: "match-1",
    matchStatus: "matched",
  });
  const resolvedFuel = makeTransaction({
    id: "fuel-2",
    fileId: file.id,
    matchStatus: "resolved",
  });
  const counterpartBank = makeTransaction({
    id: "bank-1",
    sourceType: "bank-fnb",
    isCardTransaction: null,
    matchId: "match-1",
    matchStatus: "matched",
  });
  const { repository, calls } = makeRepository({
    getFile: async () => file,
    getTransactionsByFile: async () => [matchedFuel, resolvedFuel],
    getTransactionsByMatchId: async () => [matchedFuel, counterpartBank],
    getResolutionsByTransaction: async (transactionId) =>
      transactionId === resolvedFuel.id
        ? [makeResolution({ transactionId, resolutionType: "flagged" })]
        : [],
  });
  const service = new ReconciliationCommandService(repository);

  const result = await service.clearFileTransactions("period-1", file.id);

  assert.equal(result.deletedTransactionCount, 2);
  assert.equal(result.file.id, file.id);
  assert.deepEqual(calls.unlinkMatchBundle[0], ["match-1", ["fuel-1", "bank-1"]]);
  assert.deepEqual(calls.clearStandaloneResolutions[0], [["fuel-2"]]);
  assert.deepEqual(calls.deleteTransactionsByFile[0], [file.id]);
});

test("deleteFileAndState removes the file record after reconciliation-safe cleanup", async () => {
  const file = makeFile({ id: "file-9", periodId: "period-1" });
  const { repository, calls } = makeRepository({
    getFile: async () => file,
    getTransactionsByFile: async () => [],
  });
  const service = new ReconciliationCommandService(repository);

  await service.deleteFileAndState("period-1", file.id);

  assert.deepEqual(calls.deleteTransactionsByFile[0], [file.id]);
  assert.deepEqual(calls.deleteFile[0], [file.id]);
});
