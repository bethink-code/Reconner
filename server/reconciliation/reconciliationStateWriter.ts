import { eq, inArray } from "drizzle-orm";
import { db } from "../db";
import {
  matches,
  uploadedFiles,
  transactionResolutions,
  transactions,
  type Match,
  type Transaction,
  type TransactionResolution,
  type UploadedFile,
} from "../../shared/schema";
import type {
  BulkResolutionInput,
  ManualMatchInput,
  ReconciliationCommandRepository,
  ResolutionInput,
} from "./reconciliationCommandService.ts";

type MatchResolution = NonNullable<
  Parameters<ReconciliationCommandRepository["createManualMatch"]>[0]["resolution"]
>;

export class DatabaseReconciliationStateWriter implements ReconciliationCommandRepository {
  async getFile(id: string): Promise<UploadedFile | undefined> {
    const [file] = await db.select().from(uploadedFiles).where(eq(uploadedFiles.id, id));
    return file || undefined;
  }

  async getMatch(id: string): Promise<Match | undefined> {
    const [match] = await db.select().from(matches).where(eq(matches.id, id));
    return match || undefined;
  }

  async getTransaction(id: string): Promise<Transaction | undefined> {
    const [transaction] = await db.select().from(transactions).where(eq(transactions.id, id));
    return transaction || undefined;
  }

  async getTransactionsByIds(ids: string[]): Promise<Transaction[]> {
    if (ids.length === 0) return [];
    return db.select().from(transactions).where(inArray(transactions.id, ids));
  }

  async getTransactionsByFile(fileId: string): Promise<Transaction[]> {
    return db.select().from(transactions).where(eq(transactions.fileId, fileId));
  }

  async getTransactionsByMatchId(matchId: string): Promise<Transaction[]> {
    return db.select().from(transactions).where(eq(transactions.matchId, matchId));
  }

  async getResolutionsByPeriod(periodId: string): Promise<TransactionResolution[]> {
    return db.select().from(transactionResolutions).where(eq(transactionResolutions.periodId, periodId));
  }

  async getResolutionsByTransaction(transactionId: string): Promise<TransactionResolution[]> {
    return db.select().from(transactionResolutions).where(eq(transactionResolutions.transactionId, transactionId));
  }

  async createManualMatch(
    input: ManualMatchInput & { resolution?: MatchResolution | null },
  ): Promise<Match> {
    return db.transaction(async (tx) => {
      await tx.delete(transactionResolutions)
        .where(inArray(transactionResolutions.transactionId, [input.bankTransactionId, input.fuelTransactionId]));

      const [createdMatch] = await tx.insert(matches).values({
        periodId: input.periodId,
        bankTransactionId: input.bankTransactionId,
        fuelTransactionId: input.fuelTransactionId,
        matchType: "user_confirmed",
        matchConfidence: "100",
      }).returning();

      await tx.update(transactions)
        .set({ matchStatus: "matched", matchId: createdMatch.id })
        .where(inArray(transactions.id, [input.bankTransactionId, input.fuelTransactionId]));

      if (input.resolution) {
        await tx.insert(transactionResolutions).values({
          transactionId: input.resolution.transactionId,
          periodId: input.periodId,
          resolutionType: "linked",
          reason: input.resolution.reason,
          notes: input.resolution.notes,
          userId: input.resolution.actor.id,
          userName: input.resolution.actor.name,
          userEmail: input.resolution.actor.email,
          linkedTransactionId: input.resolution.linkedTransactionId,
          assignee: null,
        });
      }

      return createdMatch;
    });
  }

  async createResolution(input: ResolutionInput): Promise<TransactionResolution> {
    return db.transaction(async (tx) => {
      await tx.delete(transactionResolutions)
        .where(eq(transactionResolutions.transactionId, input.transactionId));

      const [resolution] = await tx.insert(transactionResolutions).values({
        transactionId: input.transactionId,
        periodId: input.periodId,
        resolutionType: input.resolutionType,
        reason: input.reason ?? null,
        notes: input.notes ?? null,
        userId: input.actor.id,
        userName: input.actor.name,
        userEmail: input.actor.email,
        linkedTransactionId: input.linkedTransactionId ?? null,
        assignee: input.assignee ?? null,
      }).returning();

      await tx.update(transactions)
        .set({ matchStatus: "resolved" })
        .where(eq(transactions.id, input.transactionId));

      return resolution;
    });
  }

  async createBulkResolutions(input: BulkResolutionInput): Promise<number> {
    if (input.transactionIds.length === 0) return 0;

    return db.transaction(async (tx) => {
      await tx.delete(transactionResolutions)
        .where(inArray(transactionResolutions.transactionId, input.transactionIds));

      const inserted = await tx.insert(transactionResolutions).values(
        input.transactionIds.map((transactionId) => ({
          transactionId,
          periodId: input.periodId,
          resolutionType: input.resolutionType,
          reason: input.reason ?? null,
          notes: input.notes ?? null,
          userId: input.actor.id,
          userName: input.actor.name,
          userEmail: input.actor.email,
          linkedTransactionId: input.linkedTransactionId ?? null,
          assignee: input.assignee ?? null,
        })),
      ).returning({ id: transactionResolutions.id });

      await tx.update(transactions)
        .set({ matchStatus: "resolved" })
        .where(inArray(transactions.id, input.transactionIds));

      return inserted.length;
    });
  }

  async clearStandaloneResolutions(transactionIds: string[]): Promise<number> {
    if (transactionIds.length === 0) return 0;

    return db.transaction(async (tx) => {
      await tx.update(transactions)
        .set({ matchStatus: "unmatched", matchId: null })
        .where(inArray(transactions.id, transactionIds));

      const result = await tx.delete(transactionResolutions)
        .where(inArray(transactionResolutions.transactionId, transactionIds));

      return result.rowCount ?? 0;
    });
  }

  async deleteTransactionsByFile(fileId: string): Promise<void> {
    await db.delete(transactions).where(eq(transactions.fileId, fileId));
  }

  async deleteFile(fileId: string): Promise<void> {
    await db.delete(uploadedFiles).where(eq(uploadedFiles.id, fileId));
  }

  async unlinkMatchBundle(matchId: string, transactionIds: string[]): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.update(transactions)
        .set({ matchStatus: "unmatched", matchId: null })
        .where(inArray(transactions.id, transactionIds));

      await tx.delete(transactionResolutions)
        .where(inArray(transactionResolutions.transactionId, transactionIds));

      await tx.delete(matches).where(eq(matches.id, matchId));
    });
  }
}

export const reconciliationStateWriter = new DatabaseReconciliationStateWriter();
