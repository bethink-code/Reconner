import { 
  type User, 
  type InsertUser,
  type ReconciliationPeriod,
  type InsertReconciliationPeriod,
  type UploadedFile,
  type InsertUploadedFile,
  type Transaction,
  type InsertTransaction,
  type Match,
  type InsertMatch,
  users,
  reconciliationPeriods,
  uploadedFiles,
  transactions,
  matches
} from "@shared/schema";
import { db } from "./db";
import { pool } from "./db";
import { eq, and, or, desc } from "drizzle-orm";

export interface PeriodSummary {
  totalTransactions: number;
  fuelTransactions: number;
  bankTransactions: number;
  matchedTransactions: number;
  matchedPairs: number;
  unmatchedTransactions: number;
  matchRate: number;
  totalFuelAmount: number;
  totalBankAmount: number;
  discrepancy: number;
  cardFuelTransactions: number;
  cashFuelTransactions: number;
  unknownFuelTransactions: number;
  cardFuelAmount: number;
  cashFuelAmount: number;
  unknownFuelAmount: number;
  bankMatchRate: number;
  cardMatchRate: number;
  matchesSameDay: number;
  matches1Day: number;
  matches2Day: number;
  matches3Day: number;
  unmatchedBankTransactions: number;
  unmatchedBankAmount: number;
  unmatchedCardTransactions: number;
  unmatchedCardAmount: number;
}

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  getPeriods(): Promise<ReconciliationPeriod[]>;
  getPeriod(id: string): Promise<ReconciliationPeriod | undefined>;
  createPeriod(period: InsertReconciliationPeriod): Promise<ReconciliationPeriod>;
  updatePeriod(id: string, data: Partial<InsertReconciliationPeriod>): Promise<ReconciliationPeriod | undefined>;
  deletePeriod(id: string): Promise<void>;
  
  getFilesByPeriod(periodId: string): Promise<UploadedFile[]>;
  getFile(id: string): Promise<UploadedFile | undefined>;
  createFile(file: InsertUploadedFile): Promise<UploadedFile>;
  updateFile(id: string, data: Partial<InsertUploadedFile>): Promise<UploadedFile | undefined>;
  deleteFile(id: string): Promise<void>;
  
  getTransactionsByPeriod(periodId: string): Promise<Transaction[]>;
  getTransactionsByFile(fileId: string): Promise<Transaction[]>;
  getTransaction(id: string): Promise<Transaction | undefined>;
  createTransaction(transaction: InsertTransaction): Promise<Transaction>;
  createTransactions(transactions: InsertTransaction[]): Promise<Transaction[]>;
  updateTransaction(id: string, data: Partial<InsertTransaction>): Promise<Transaction | undefined>;
  deleteTransactionsByFile(fileId: string): Promise<void>;
  
  getMatchesByPeriod(periodId: string): Promise<Match[]>;
  getMatch(id: string): Promise<Match | undefined>;
  createMatch(match: InsertMatch): Promise<Match>;
  deleteMatch(id: string): Promise<void>;
  
  getPeriodSummary(periodId: string): Promise<PeriodSummary>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async getPeriods(): Promise<ReconciliationPeriod[]> {
    return await db.select().from(reconciliationPeriods).orderBy(desc(reconciliationPeriods.createdAt));
  }

  async getPeriod(id: string): Promise<ReconciliationPeriod | undefined> {
    const [period] = await db.select().from(reconciliationPeriods).where(eq(reconciliationPeriods.id, id));
    return period || undefined;
  }

  async createPeriod(period: InsertReconciliationPeriod): Promise<ReconciliationPeriod> {
    const [newPeriod] = await db.insert(reconciliationPeriods).values(period).returning();
    return newPeriod;
  }

  async updatePeriod(id: string, data: Partial<InsertReconciliationPeriod>): Promise<ReconciliationPeriod | undefined> {
    const [updated] = await db.update(reconciliationPeriods)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(reconciliationPeriods.id, id))
      .returning();
    return updated || undefined;
  }

  async deletePeriod(id: string): Promise<void> {
    await db.delete(reconciliationPeriods).where(eq(reconciliationPeriods.id, id));
  }

  async getFilesByPeriod(periodId: string): Promise<UploadedFile[]> {
    return await db.select().from(uploadedFiles)
      .where(eq(uploadedFiles.periodId, periodId))
      .orderBy(desc(uploadedFiles.uploadedAt));
  }

  async getFile(id: string): Promise<UploadedFile | undefined> {
    const [file] = await db.select().from(uploadedFiles).where(eq(uploadedFiles.id, id));
    return file || undefined;
  }

  async createFile(file: InsertUploadedFile): Promise<UploadedFile> {
    const [newFile] = await db.insert(uploadedFiles).values(file).returning();
    return newFile;
  }

  async updateFile(id: string, data: Partial<InsertUploadedFile>): Promise<UploadedFile | undefined> {
    const [updated] = await db.update(uploadedFiles)
      .set(data)
      .where(eq(uploadedFiles.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteFile(id: string): Promise<void> {
    await db.delete(uploadedFiles).where(eq(uploadedFiles.id, id));
  }

  async getTransactionsByPeriod(periodId: string): Promise<Transaction[]> {
    return await db.select().from(transactions)
      .where(eq(transactions.periodId, periodId))
      .orderBy(desc(transactions.transactionDate));
  }

  async getTransactionsByFile(fileId: string): Promise<Transaction[]> {
    return await db.select().from(transactions)
      .where(eq(transactions.fileId, fileId))
      .orderBy(desc(transactions.transactionDate));
  }

  async getTransaction(id: string): Promise<Transaction | undefined> {
    const [transaction] = await db.select().from(transactions).where(eq(transactions.id, id));
    return transaction || undefined;
  }

  async createTransaction(transaction: InsertTransaction): Promise<Transaction> {
    const [newTransaction] = await db.insert(transactions).values(transaction).returning();
    return newTransaction;
  }

  async createTransactions(transactionList: InsertTransaction[]): Promise<Transaction[]> {
    if (transactionList.length === 0) return [];
    
    // Batch inserts to avoid "Maximum call stack size exceeded" error
    // when inserting many transactions at once
    const BATCH_SIZE = 100;
    const results: Transaction[] = [];
    
    for (let i = 0; i < transactionList.length; i += BATCH_SIZE) {
      const batch = transactionList.slice(i, i + BATCH_SIZE);
      const inserted = await db.insert(transactions).values(batch).returning();
      results.push(...inserted);
    }
    
    return results;
  }

  async updateTransaction(id: string, data: Partial<InsertTransaction>): Promise<Transaction | undefined> {
    const [updated] = await db.update(transactions)
      .set(data)
      .where(eq(transactions.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteTransactionsByFile(fileId: string): Promise<void> {
    await db.delete(transactions).where(eq(transactions.fileId, fileId));
  }

  async getMatchesByPeriod(periodId: string): Promise<Match[]> {
    return await db.select().from(matches)
      .where(eq(matches.periodId, periodId))
      .orderBy(desc(matches.createdAt));
  }

  async getMatch(id: string): Promise<Match | undefined> {
    const [match] = await db.select().from(matches).where(eq(matches.id, id));
    return match || undefined;
  }

  async createMatch(match: InsertMatch): Promise<Match> {
    const [newMatch] = await db.insert(matches).values(match).returning();
    return newMatch;
  }

  async deleteMatch(id: string): Promise<void> {
    await db.delete(matches).where(eq(matches.id, id));
  }

  async getPeriodSummary(periodId: string): Promise<PeriodSummary> {
    const result = await pool.query(`
      WITH tx_stats AS (
        SELECT 
          COUNT(*) as total_transactions,
          COUNT(CASE WHEN source_type = 'fuel' THEN 1 END) as fuel_transactions,
          COUNT(CASE WHEN source_type LIKE 'bank%' THEN 1 END) as bank_transactions,
          COUNT(CASE WHEN match_status = 'matched' THEN 1 END) as matched_transactions,
          
          COALESCE(SUM(CASE WHEN source_type = 'fuel' THEN amount::numeric ELSE 0 END), 0) as total_fuel_amount,
          COALESCE(SUM(CASE WHEN source_type LIKE 'bank%' THEN amount::numeric ELSE 0 END), 0) as total_bank_amount,
          
          COUNT(CASE WHEN source_type = 'fuel' AND is_card_transaction = 'yes' THEN 1 END) as card_fuel_transactions,
          COUNT(CASE WHEN source_type = 'fuel' AND is_card_transaction = 'no' THEN 1 END) as cash_fuel_transactions,
          COUNT(CASE WHEN source_type = 'fuel' AND is_card_transaction = 'unknown' THEN 1 END) as unknown_fuel_transactions,
          
          COALESCE(SUM(CASE WHEN source_type = 'fuel' AND is_card_transaction = 'yes' THEN amount::numeric ELSE 0 END), 0) as card_fuel_amount,
          COALESCE(SUM(CASE WHEN source_type = 'fuel' AND is_card_transaction = 'no' THEN amount::numeric ELSE 0 END), 0) as cash_fuel_amount,
          COALESCE(SUM(CASE WHEN source_type = 'fuel' AND is_card_transaction = 'unknown' THEN amount::numeric ELSE 0 END), 0) as unknown_fuel_amount,
          
          COUNT(CASE WHEN source_type LIKE 'bank%' AND match_status = 'matched' THEN 1 END) as matched_bank_transactions,
          COUNT(CASE WHEN source_type = 'fuel' AND is_card_transaction = 'yes' AND match_status = 'matched' THEN 1 END) as matched_card_fuel,
          
          COUNT(CASE WHEN source_type LIKE 'bank%' AND match_status != 'matched' AND amount::numeric > 0 THEN 1 END) as unmatched_bank_transactions,
          COALESCE(SUM(CASE WHEN source_type LIKE 'bank%' AND match_status != 'matched' AND amount::numeric > 0 THEN amount::numeric ELSE 0 END), 0) as unmatched_bank_amount,
          
          COUNT(CASE WHEN source_type = 'fuel' AND is_card_transaction = 'yes' AND match_status != 'matched' AND amount::numeric > 0 THEN 1 END) as unmatched_card_transactions,
          COALESCE(SUM(CASE WHEN source_type = 'fuel' AND is_card_transaction = 'yes' AND match_status != 'matched' AND amount::numeric > 0 THEN amount::numeric ELSE 0 END), 0) as unmatched_card_amount
          
        FROM transactions
        WHERE period_id = $1
      ),
      match_stats AS (
        SELECT 
          COUNT(*) as matched_pairs,
          COUNT(CASE WHEN ABS(
            TO_DATE(t_bank.transaction_date, 'YYYY-MM-DD') - 
            TO_DATE(t_fuel.transaction_date, 'YYYY-MM-DD')
          ) = 0 THEN 1 END) as matches_same_day,
          COUNT(CASE WHEN ABS(
            TO_DATE(t_bank.transaction_date, 'YYYY-MM-DD') - 
            TO_DATE(t_fuel.transaction_date, 'YYYY-MM-DD')
          ) = 1 THEN 1 END) as matches_1_day,
          COUNT(CASE WHEN ABS(
            TO_DATE(t_bank.transaction_date, 'YYYY-MM-DD') - 
            TO_DATE(t_fuel.transaction_date, 'YYYY-MM-DD')
          ) = 2 THEN 1 END) as matches_2_day,
          COUNT(CASE WHEN ABS(
            TO_DATE(t_bank.transaction_date, 'YYYY-MM-DD') - 
            TO_DATE(t_fuel.transaction_date, 'YYYY-MM-DD')
          ) >= 3 THEN 1 END) as matches_3_day
        FROM matches m
        JOIN transactions t_fuel ON m.fuel_transaction_id = t_fuel.id
        JOIN transactions t_bank ON m.bank_transaction_id = t_bank.id
        WHERE m.period_id = $1
      )
      SELECT 
        tx.*,
        COALESCE(ms.matched_pairs, 0) as matched_pairs,
        COALESCE(ms.matches_same_day, 0) as matches_same_day,
        COALESCE(ms.matches_1_day, 0) as matches_1_day,
        COALESCE(ms.matches_2_day, 0) as matches_2_day,
        COALESCE(ms.matches_3_day, 0) as matches_3_day
      FROM tx_stats tx
      CROSS JOIN match_stats ms
    `, [periodId]);

    const row = result.rows[0] || {};
    
    const totalTransactions = parseInt(row.total_transactions || '0');
    const fuelTransactions = parseInt(row.fuel_transactions || '0');
    const bankTransactions = parseInt(row.bank_transactions || '0');
    const matchedTransactions = parseInt(row.matched_transactions || '0');
    const cardFuelTransactions = parseInt(row.card_fuel_transactions || '0');
    const matchedBankTransactions = parseInt(row.matched_bank_transactions || '0');
    const matchedCardFuel = parseInt(row.matched_card_fuel || '0');
    
    const bankMatchRate = bankTransactions > 0 
      ? (matchedBankTransactions / bankTransactions) * 100 
      : 0;
    
    const cardMatchRate = cardFuelTransactions > 0 
      ? (matchedCardFuel / cardFuelTransactions) * 100 
      : 0;
    
    const cardFuelAmount = parseFloat(row.card_fuel_amount || '0');
    const totalBankAmount = parseFloat(row.total_bank_amount || '0');

    return {
      totalTransactions,
      fuelTransactions,
      bankTransactions,
      matchedTransactions,
      matchedPairs: parseInt(row.matched_pairs || '0'),
      unmatchedTransactions: totalTransactions - matchedTransactions,
      matchRate: totalTransactions > 0 
        ? (matchedTransactions / totalTransactions) * 100 
        : 0,
      totalFuelAmount: parseFloat(row.total_fuel_amount || '0'),
      totalBankAmount,
      discrepancy: Math.abs(cardFuelAmount - totalBankAmount),
      cardFuelTransactions,
      cashFuelTransactions: parseInt(row.cash_fuel_transactions || '0'),
      unknownFuelTransactions: parseInt(row.unknown_fuel_transactions || '0'),
      cardFuelAmount,
      cashFuelAmount: parseFloat(row.cash_fuel_amount || '0'),
      unknownFuelAmount: parseFloat(row.unknown_fuel_amount || '0'),
      bankMatchRate,
      cardMatchRate,
      matchesSameDay: parseInt(row.matches_same_day || '0'),
      matches1Day: parseInt(row.matches_1_day || '0'),
      matches2Day: parseInt(row.matches_2_day || '0'),
      matches3Day: parseInt(row.matches_3_day || '0'),
      unmatchedBankTransactions: parseInt(row.unmatched_bank_transactions || '0'),
      unmatchedBankAmount: parseFloat(row.unmatched_bank_amount || '0'),
      unmatchedCardTransactions: parseInt(row.unmatched_card_transactions || '0'),
      unmatchedCardAmount: parseFloat(row.unmatched_card_amount || '0'),
    };
  }
}

export const storage = new DatabaseStorage();
