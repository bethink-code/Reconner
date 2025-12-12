import { 
  type User, 
  type UpsertUser,
  type ReconciliationPeriod,
  type InsertReconciliationPeriod,
  type UploadedFile,
  type InsertUploadedFile,
  type Transaction,
  type InsertTransaction,
  type Match,
  type InsertMatch,
  type MatchingRules,
  type InsertMatchingRules,
  type MatchingRulesConfig,
  type TransactionResolution,
  type InsertTransactionResolution,
  users,
  reconciliationPeriods,
  uploadedFiles,
  transactions,
  matches,
  matchingRules,
  transactionResolutions
} from "@shared/schema";
import { db } from "./db";
import { pool } from "./db";
import { eq, and, or, desc, sql, inArray } from "drizzle-orm";

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
  unmatchableBankTransactions: number;
  unmatchableBankAmount: number;
  resolvedBankTransactions: number;
  resolvedBankAmount: number;
  fuelDateRange?: { min: string; max: string };
  bankDateRange?: { min: string; max: string };
}

export interface VerificationSummary {
  overview: {
    fuelSystem: {
      totalSales: number;
      cardSales: number;
      cardTransactions: number;
      cashSales: number;
      cashTransactions: number;
    };
    bankStatements: {
      totalAmount: number;
      totalTransactions: number;
      sources: { name: string; amount: number; transactions: number }[];
      dateRange: { earliest: string | null; latest: string | null; days: number };
    };
  };
  verificationStatus: {
    verified: { transactions: number; amount: number; percentage: number };
    pendingVerification: { transactions: number; amount: number; reason: string };
    unverified: { transactions: number; amount: number; percentage: number };
    cashSales: { transactions: number; amount: number; reason: string };
  };
  coverageAnalysis: {
    volumeCoverage: number;
    dateRangeCoverage: number;
    fuelDateRange: { earliest: string | null; latest: string | null; days: number };
    bankDateRange: { earliest: string | null; latest: string | null; days: number };
    missingDays: number;
    dailyAverages: { fuel: number; bank: number };
    volumeGap: number;
  };
  discrepancyReport: {
    verifiedSales: number;
    bankDeposits: number;
    difference: number;
    bankHasMore: boolean;
    pendingVerification: { amount: number; transactions: number; percentageOfCardSales: number };
    unmatchedIssues: { count: number; amount: number };
  };
  matchingResults: {
    performanceRating: number;
    performanceLabel: string;
    bankTransactions: { matched: number; unmatched: number; matchRate: number };
    matchQuality: {
      highConfidence: number;
      mediumConfidence: number;
    };
    invoiceGrouping: {
      multiLineInvoices: number;
      totalItemsGrouped: number;
    };
    matchesByDateOffset: {
      sameDay: number;
      oneDay: number;
      twoDays: number;
      threePlusDays: number;
    };
  };
  recommendedActions: {
    critical: { action: string; description: string; details: string[] }[];
    important: { action: string; description: string; details: string[] }[];
    optional: { action: string; description: string; details: string[] }[];
  };
}

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  getAllUsers(): Promise<User[]>;
  setUserAdmin(id: string, isAdmin: boolean): Promise<User | undefined>;
  
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
  deleteMatchesByFile(fileId: string): Promise<void>;
  
  getPeriodSummary(periodId: string): Promise<PeriodSummary>;
  getVerificationSummary(periodId: string): Promise<VerificationSummary>;
  
  getMatchingRules(periodId: string): Promise<MatchingRulesConfig>;
  saveMatchingRules(periodId: string, rules: MatchingRulesConfig): Promise<MatchingRules>;
  
  // Resolution methods
  getResolutionsByPeriod(periodId: string): Promise<TransactionResolution[]>;
  getResolutionsByTransaction(transactionId: string): Promise<TransactionResolution[]>;
  createResolution(resolution: InsertTransactionResolution): Promise<TransactionResolution>;
  getResolvedTransactionIds(periodId: string): Promise<string[]>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users).orderBy(desc(users.createdAt));
  }

  async setUserAdmin(id: string, isAdmin: boolean): Promise<User | undefined> {
    const [updated] = await db.update(users)
      .set({ isAdmin, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return updated || undefined;
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

  async getTransactionsByPeriodPaginated(
    periodId: string,
    options: {
      limit: number;
      offset: number;
      sourceType?: string;
      matchStatus?: string;
      isCardTransaction?: string;
    }
  ): Promise<{ transactions: Transaction[]; total: number }> {
    const { limit, offset, sourceType, matchStatus, isCardTransaction } = options;
    
    // Build conditions array - always starts with periodId
    const conditions: any[] = [eq(transactions.periodId, periodId)];
    
    if (sourceType) {
      if (sourceType === 'bank') {
        // Match any bank source (bank, bank2, bank_account, etc.)
        conditions.push(sql`${transactions.sourceType} LIKE 'bank%'`);
      } else {
        conditions.push(eq(transactions.sourceType, sourceType));
      }
    }
    
    if (matchStatus) {
      conditions.push(eq(transactions.matchStatus, matchStatus));
    }
    
    if (isCardTransaction) {
      conditions.push(eq(transactions.isCardTransaction, isCardTransaction));
    }
    
    // Build the where clause - use and() only if multiple conditions
    const whereClause = conditions.length === 1 
      ? conditions[0] 
      : and(...conditions);
    
    // Get paginated transactions
    const result = await db.select().from(transactions)
      .where(whereClause)
      .orderBy(desc(transactions.transactionDate))
      .limit(limit)
      .offset(offset);
    
    // Get total count with same conditions
    const [countResult] = await db.select({ count: sql<number>`count(*)::int` })
      .from(transactions)
      .where(whereClause);
    
    return {
      transactions: result,
      total: countResult?.count || 0
    };
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

  async deleteMatchesByFile(fileId: string): Promise<void> {
    // Get all transaction IDs for this file
    const fileTransactions = await db.select({ id: transactions.id })
      .from(transactions)
      .where(eq(transactions.fileId, fileId));
    
    if (fileTransactions.length === 0) return;
    
    const transactionIds = fileTransactions.map(t => t.id);
    
    // Delete matches that reference any of these transactions
    // (either as fuel or bank transaction)
    await db.delete(matches).where(
      or(
        inArray(matches.fuelTransactionId, transactionIds),
        inArray(matches.bankTransactionId, transactionIds)
      )
    );
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
          
          COUNT(CASE WHEN source_type LIKE 'bank%' AND (match_status = 'unmatched' OR match_status IS NULL) AND amount::numeric > 0 THEN 1 END) as unmatched_bank_transactions,
          COALESCE(SUM(CASE WHEN source_type LIKE 'bank%' AND (match_status = 'unmatched' OR match_status IS NULL) AND amount::numeric > 0 THEN amount::numeric ELSE 0 END), 0) as unmatched_bank_amount,
          COUNT(CASE WHEN source_type LIKE 'bank%' AND match_status = 'unmatchable' THEN 1 END) as unmatchable_bank_transactions,
          COALESCE(SUM(CASE WHEN source_type LIKE 'bank%' AND match_status = 'unmatchable' THEN amount::numeric ELSE 0 END), 0) as unmatchable_bank_amount,
          COUNT(CASE WHEN source_type LIKE 'bank%' AND match_status = 'resolved' THEN 1 END) as resolved_bank_transactions,
          COALESCE(SUM(CASE WHEN source_type LIKE 'bank%' AND match_status = 'resolved' THEN amount::numeric ELSE 0 END), 0) as resolved_bank_amount,
          
          COUNT(CASE WHEN source_type = 'fuel' AND is_card_transaction = 'yes' AND match_status != 'matched' AND amount::numeric > 0 THEN 1 END) as unmatched_card_transactions,
          COALESCE(SUM(CASE WHEN source_type = 'fuel' AND is_card_transaction = 'yes' AND match_status != 'matched' AND amount::numeric > 0 THEN amount::numeric ELSE 0 END), 0) as unmatched_card_amount,
          
          MIN(CASE WHEN source_type = 'fuel' THEN transaction_date END) as fuel_date_min,
          MAX(CASE WHEN source_type = 'fuel' THEN transaction_date END) as fuel_date_max,
          MIN(CASE WHEN source_type LIKE 'bank%' THEN transaction_date END) as bank_date_min,
          MAX(CASE WHEN source_type LIKE 'bank%' THEN transaction_date END) as bank_date_max
          
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
      unmatchableBankTransactions: parseInt(row.unmatchable_bank_transactions || '0'),
      unmatchableBankAmount: parseFloat(row.unmatchable_bank_amount || '0'),
      resolvedBankTransactions: parseInt(row.resolved_bank_transactions || '0'),
      resolvedBankAmount: parseFloat(row.resolved_bank_amount || '0'),
      fuelDateRange: row.fuel_date_min && row.fuel_date_max ? {
        min: row.fuel_date_min,
        max: row.fuel_date_max,
      } : undefined,
      bankDateRange: row.bank_date_min && row.bank_date_max ? {
        min: row.bank_date_min,
        max: row.bank_date_max,
      } : undefined,
    };
  }

  async getVerificationSummary(periodId: string): Promise<VerificationSummary> {
    // Get comprehensive verification-based metrics
    const result = await pool.query(`
      WITH fuel_stats AS (
        SELECT 
          COUNT(*) as total_fuel,
          COALESCE(SUM(amount::numeric), 0) as total_fuel_amount,
          COUNT(CASE WHEN is_card_transaction = 'yes' THEN 1 END) as card_transactions,
          COALESCE(SUM(CASE WHEN is_card_transaction = 'yes' THEN amount::numeric ELSE 0 END), 0) as card_amount,
          COUNT(CASE WHEN is_card_transaction = 'no' THEN 1 END) as cash_transactions,
          COALESCE(SUM(CASE WHEN is_card_transaction = 'no' THEN amount::numeric ELSE 0 END), 0) as cash_amount,
          MIN(transaction_date) as fuel_earliest,
          MAX(transaction_date) as fuel_latest
        FROM transactions
        WHERE period_id = $1 AND source_type = 'fuel'
      ),
      bank_stats AS (
        SELECT 
          COUNT(*) as total_bank,
          COALESCE(SUM(amount::numeric), 0) as total_bank_amount,
          COUNT(CASE WHEN match_status = 'matched' THEN 1 END) as matched_bank,
          COALESCE(SUM(CASE WHEN match_status = 'matched' THEN amount::numeric ELSE 0 END), 0) as matched_bank_amount,
          MIN(transaction_date) as bank_earliest,
          MAX(transaction_date) as bank_latest
        FROM transactions
        WHERE period_id = $1 AND source_type LIKE 'bank%'
      ),
      bank_sources AS (
        SELECT 
          source_name,
          COUNT(*) as tx_count,
          COALESCE(SUM(amount::numeric), 0) as source_amount
        FROM transactions
        WHERE period_id = $1 AND source_type LIKE 'bank%'
        GROUP BY source_name
      ),
      card_matched AS (
        SELECT 
          COUNT(DISTINCT t.id) as matched_card_transactions,
          COALESCE(SUM(t.amount::numeric), 0) as matched_card_amount
        FROM transactions t
        WHERE t.period_id = $1 
          AND t.source_type = 'fuel' 
          AND t.is_card_transaction = 'yes'
          AND t.match_status = 'matched'
      ),
      unmatched_card AS (
        SELECT 
          COUNT(*) as unmatched_count,
          COALESCE(SUM(amount::numeric), 0) as unmatched_amount
        FROM transactions
        WHERE period_id = $1 
          AND source_type = 'fuel' 
          AND is_card_transaction = 'yes'
          AND match_status != 'matched'
          AND amount::numeric > 0
      ),
      match_quality AS (
        SELECT 
          COUNT(CASE WHEN match_confidence >= 85 THEN 1 END) as high_confidence,
          COUNT(CASE WHEN match_confidence >= 70 AND match_confidence < 85 THEN 1 END) as medium_confidence,
          COUNT(*) as total_matches
        FROM matches
        WHERE period_id = $1
      ),
      match_date_offsets AS (
        SELECT 
          COUNT(CASE WHEN ABS(
            TO_DATE(t_bank.transaction_date, 'YYYY-MM-DD') - 
            TO_DATE(t_fuel.transaction_date, 'YYYY-MM-DD')
          ) = 0 THEN 1 END) as same_day,
          COUNT(CASE WHEN ABS(
            TO_DATE(t_bank.transaction_date, 'YYYY-MM-DD') - 
            TO_DATE(t_fuel.transaction_date, 'YYYY-MM-DD')
          ) = 1 THEN 1 END) as one_day,
          COUNT(CASE WHEN ABS(
            TO_DATE(t_bank.transaction_date, 'YYYY-MM-DD') - 
            TO_DATE(t_fuel.transaction_date, 'YYYY-MM-DD')
          ) = 2 THEN 1 END) as two_days,
          COUNT(CASE WHEN ABS(
            TO_DATE(t_bank.transaction_date, 'YYYY-MM-DD') - 
            TO_DATE(t_fuel.transaction_date, 'YYYY-MM-DD')
          ) >= 3 THEN 1 END) as three_plus_days
        FROM matches m
        JOIN transactions t_fuel ON m.fuel_transaction_id = t_fuel.id
        JOIN transactions t_bank ON m.bank_transaction_id = t_bank.id
        WHERE m.period_id = $1
      ),
      invoice_groups AS (
        SELECT 
          COUNT(DISTINCT invoice_number) as grouped_invoices,
          COUNT(*) as total_grouped_items
        FROM (
          SELECT reference_number as invoice_number, COUNT(*) as item_count
          FROM transactions
          WHERE period_id = $1 
            AND source_type = 'fuel' 
            AND reference_number IS NOT NULL 
            AND reference_number != ''
          GROUP BY reference_number
          HAVING COUNT(*) > 1
        ) grouped
      )
      SELECT 
        fs.*,
        bs.*,
        cm.matched_card_transactions,
        cm.matched_card_amount,
        uc.unmatched_count as unmatched_card_count,
        uc.unmatched_amount as unmatched_card_amount,
        mq.high_confidence,
        mq.medium_confidence,
        mq.total_matches,
        md.same_day,
        md.one_day,
        md.two_days,
        md.three_plus_days,
        COALESCE(ig.grouped_invoices, 0) as grouped_invoices,
        COALESCE(ig.total_grouped_items, 0) as total_grouped_items
      FROM fuel_stats fs
      CROSS JOIN bank_stats bs
      CROSS JOIN card_matched cm
      CROSS JOIN unmatched_card uc
      CROSS JOIN match_quality mq
      CROSS JOIN match_date_offsets md
      CROSS JOIN invoice_groups ig
    `, [periodId]);

    // Get bank sources breakdown
    const sourcesResult = await pool.query(`
      SELECT 
        source_name,
        COUNT(*) as tx_count,
        COALESCE(SUM(amount::numeric), 0) as source_amount
      FROM transactions
      WHERE period_id = $1 AND source_type LIKE 'bank%'
      GROUP BY source_name
    `, [periodId]);

    const row = result.rows[0] || {};
    const bankSources = sourcesResult.rows.map(s => ({
      name: s.source_name || 'Unknown Bank',
      amount: parseFloat(s.source_amount || '0'),
      transactions: parseInt(s.tx_count || '0')
    }));

    // Parse values
    const totalFuelAmount = parseFloat(row.total_fuel_amount || '0');
    const cardAmount = parseFloat(row.card_amount || '0');
    const cashAmount = parseFloat(row.cash_amount || '0');
    const cardTransactions = parseInt(row.card_transactions || '0');
    const cashTransactions = parseInt(row.cash_transactions || '0');
    
    const totalBankAmount = parseFloat(row.total_bank_amount || '0');
    const totalBankTransactions = parseInt(row.total_bank || '0');
    const matchedBankTransactions = parseInt(row.matched_bank || '0');
    const matchedBankAmount = parseFloat(row.matched_bank_amount || '0');
    
    const matchedCardTransactions = parseInt(row.matched_card_transactions || '0');
    const matchedCardAmount = parseFloat(row.matched_card_amount || '0');
    const unmatchedCardCount = parseInt(row.unmatched_card_count || '0');
    const unmatchedCardAmount = parseFloat(row.unmatched_card_amount || '0');
    
    // Date calculations
    const fuelEarliest = row.fuel_earliest;
    const fuelLatest = row.fuel_latest;
    const bankEarliest = row.bank_earliest;
    const bankLatest = row.bank_latest;
    
    const calculateDays = (earliest: string | null, latest: string | null): number => {
      if (!earliest || !latest) return 0;
      const start = new Date(earliest);
      const end = new Date(latest);
      return Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    };
    
    const fuelDays = calculateDays(fuelEarliest, fuelLatest);
    const bankDays = calculateDays(bankEarliest, bankLatest);
    
    // Coverage metrics - round to 1 decimal to avoid floating point display issues
    const volumeCoverage = cardAmount > 0 ? Math.round((totalBankAmount / cardAmount) * 1000) / 10 : 0;
    const dateRangeCoverage = fuelDays > 0 ? Math.round((bankDays / fuelDays) * 1000) / 10 : 0;
    const missingDays = Math.max(0, fuelDays - bankDays);
    
    // Daily averages
    const fuelDailyAvg = fuelDays > 0 ? cardTransactions / fuelDays : 0;
    const bankDailyAvg = bankDays > 0 ? totalBankTransactions / bankDays : 0;
    const volumeGap = bankDailyAvg > 0 ? fuelDailyAvg / bankDailyAvg : 0;
    
    // Match rate calculation - KEY INSIGHT: calculate based on what CAN be verified
    // Round to 1 decimal to avoid floating point display issues
    const bankMatchRate = totalBankTransactions > 0 
      ? Math.round((matchedBankTransactions / totalBankTransactions) * 1000) / 10
      : 0;
    
    // Performance rating (1-5 stars)
    let performanceRating = 1;
    let performanceLabel = 'Poor';
    if (bankMatchRate >= 90) { performanceRating = 5; performanceLabel = 'Excellent'; }
    else if (bankMatchRate >= 80) { performanceRating = 5; performanceLabel = 'Excellent'; }
    else if (bankMatchRate >= 70) { performanceRating = 4; performanceLabel = 'Very Good'; }
    else if (bankMatchRate >= 60) { performanceRating = 3; performanceLabel = 'Good'; }
    else if (bankMatchRate >= 40) { performanceRating = 2; performanceLabel = 'Needs Improvement'; }
    
    // Pending verification = card transactions without corresponding bank data
    const pendingVerificationAmount = cardAmount - matchedCardAmount - unmatchedCardAmount;
    const pendingVerificationTransactions = cardTransactions - matchedCardTransactions - unmatchedCardCount;
    
    // Unverified = card transactions that have bank data available but didn't match
    // Round to 1 decimal to avoid floating point display issues
    const unverifiedPercentage = totalBankTransactions > 0 
      ? Math.round(((totalBankTransactions - matchedBankTransactions) / totalBankTransactions) * 1000) / 10
      : 0;

    // Build recommended actions
    const criticalActions: { action: string; description: string; details: string[] }[] = [];
    const importantActions: { action: string; description: string; details: string[] }[] = [];
    const optionalActions: { action: string; description: string; details: string[] }[] = [];

    // Critical: Missing bank data
    if (volumeCoverage < 50) {
      criticalActions.push({
        action: 'upload_bank_statements',
        description: 'Upload Missing Bank Statements',
        details: [
          `You're missing ${(100 - volumeCoverage).toFixed(0)}% of bank transaction data`,
          'Check for additional merchant accounts',
          'Verify all bank accounts uploaded',
          missingDays > 0 ? `Get statements for ${missingDays} missing days` : ''
        ].filter(d => d)
      });
    }

    // Important: Unmatched transactions
    const unmatchedBankCount = totalBankTransactions - matchedBankTransactions;
    if (unmatchedBankCount > 0) {
      importantActions.push({
        action: 'review_unmatched',
        description: `Review ${unmatchedBankCount} Unmatched Transactions`,
        details: [
          `R${(totalBankAmount - matchedBankAmount).toFixed(2)} in transactions that didn't match`,
          'Check for voided sales',
          'Verify refunds processed',
          'Look for amount discrepancies'
        ]
      });
    }

    // Optional: Adjust rules (only if match rate is below expectations)
    if (bankMatchRate >= 70) {
      optionalActions.push({
        action: 'adjust_rules',
        description: 'Adjust Matching Rules',
        details: [
          `Current performance: ${bankMatchRate.toFixed(1)}% (${performanceLabel.toLowerCase()})`,
          'Only adjust if match rate drops after adding complete bank data'
        ]
      });
    } else if (bankMatchRate > 0) {
      importantActions.push({
        action: 'adjust_rules',
        description: 'Consider Adjusting Matching Rules',
        details: [
          `Current match rate: ${bankMatchRate.toFixed(1)}%`,
          'Try widening date window or amount tolerance',
          'Enable invoice grouping if not already on'
        ]
      });
    }

    return {
      overview: {
        fuelSystem: {
          totalSales: totalFuelAmount,
          cardSales: cardAmount,
          cardTransactions,
          cashSales: cashAmount,
          cashTransactions
        },
        bankStatements: {
          totalAmount: totalBankAmount,
          totalTransactions: totalBankTransactions,
          sources: bankSources,
          dateRange: { earliest: bankEarliest, latest: bankLatest, days: bankDays }
        }
      },
      verificationStatus: {
        verified: { 
          transactions: matchedBankTransactions, 
          amount: matchedBankAmount, 
          percentage: bankMatchRate 
        },
        pendingVerification: { 
          transactions: Math.max(0, pendingVerificationTransactions), 
          amount: Math.max(0, pendingVerificationAmount), 
          reason: 'No bank data available for these card transactions' 
        },
        unverified: { 
          transactions: unmatchedBankCount, 
          amount: totalBankAmount - matchedBankAmount, 
          percentage: unverifiedPercentage 
        },
        cashSales: { 
          transactions: cashTransactions, 
          amount: cashAmount, 
          reason: "Bank statements don't show cash deposits by transaction" 
        }
      },
      coverageAnalysis: {
        volumeCoverage,
        dateRangeCoverage,
        fuelDateRange: { earliest: fuelEarliest, latest: fuelLatest, days: fuelDays },
        bankDateRange: { earliest: bankEarliest, latest: bankLatest, days: bankDays },
        missingDays,
        dailyAverages: { fuel: fuelDailyAvg, bank: bankDailyAvg },
        volumeGap
      },
      discrepancyReport: {
        verifiedSales: matchedCardAmount,
        bankDeposits: totalBankAmount,
        difference: Math.abs(matchedCardAmount - totalBankAmount),
        bankHasMore: totalBankAmount > matchedCardAmount,
        pendingVerification: { 
          amount: Math.max(0, pendingVerificationAmount), 
          transactions: Math.max(0, pendingVerificationTransactions),
          percentageOfCardSales: cardAmount > 0 ? Math.round((Math.max(0, pendingVerificationAmount) / cardAmount) * 1000) / 10 : 0
        },
        unmatchedIssues: { count: unmatchedBankCount, amount: totalBankAmount - matchedBankAmount }
      },
      matchingResults: {
        performanceRating,
        performanceLabel,
        bankTransactions: { 
          matched: matchedBankTransactions, 
          unmatched: unmatchedBankCount, 
          matchRate: bankMatchRate 
        },
        matchQuality: {
          highConfidence: parseInt(row.high_confidence || '0'),
          mediumConfidence: parseInt(row.medium_confidence || '0')
        },
        invoiceGrouping: {
          multiLineInvoices: parseInt(row.grouped_invoices || '0'),
          totalItemsGrouped: parseInt(row.total_grouped_items || '0')
        },
        matchesByDateOffset: {
          sameDay: parseInt(row.same_day || '0'),
          oneDay: parseInt(row.one_day || '0'),
          twoDays: parseInt(row.two_days || '0'),
          threePlusDays: parseInt(row.three_plus_days || '0')
        }
      },
      recommendedActions: {
        critical: criticalActions,
        important: importantActions,
        optional: optionalActions
      }
    };
  }

  async getMatchingRules(periodId: string): Promise<MatchingRulesConfig> {
    const [rules] = await db.select().from(matchingRules).where(eq(matchingRules.periodId, periodId));
    
    if (!rules) {
      // Return default (moderate) rules
      // Tolerance set to R1.00 to handle fuel price variations and rounding
      // Minimum confidence lowered to 60 to allow time-outside-window matches
      return {
        amountTolerance: 1.00,
        dateWindowDays: 3,
        timeWindowMinutes: 60,
        groupByInvoice: true,
        requireCardMatch: false,
        minimumConfidence: 60,
        autoMatchThreshold: 85
      };
    }
    
    return {
      amountTolerance: parseFloat(rules.amountTolerance),
      dateWindowDays: rules.dateWindowDays,
      timeWindowMinutes: rules.timeWindowMinutes,
      groupByInvoice: rules.groupByInvoice,
      requireCardMatch: rules.requireCardMatch,
      minimumConfidence: rules.minimumConfidence,
      autoMatchThreshold: rules.autoMatchThreshold
    };
  }

  async saveMatchingRules(periodId: string, rules: MatchingRulesConfig): Promise<MatchingRules> {
    // Check if rules already exist for this period
    const [existing] = await db.select().from(matchingRules).where(eq(matchingRules.periodId, periodId));
    
    const rulesData = {
      periodId,
      amountTolerance: String(rules.amountTolerance),
      dateWindowDays: rules.dateWindowDays,
      timeWindowMinutes: rules.timeWindowMinutes,
      groupByInvoice: rules.groupByInvoice,
      requireCardMatch: rules.requireCardMatch,
      minimumConfidence: rules.minimumConfidence,
      autoMatchThreshold: rules.autoMatchThreshold,
    };
    
    if (existing) {
      // Update existing rules - exclude periodId to avoid unique constraint issues
      const [updated] = await db.update(matchingRules)
        .set({ 
          amountTolerance: rulesData.amountTolerance,
          dateWindowDays: rulesData.dateWindowDays,
          timeWindowMinutes: rulesData.timeWindowMinutes,
          groupByInvoice: rulesData.groupByInvoice,
          requireCardMatch: rulesData.requireCardMatch,
          minimumConfidence: rulesData.minimumConfidence,
          autoMatchThreshold: rulesData.autoMatchThreshold,
          updatedAt: new Date() 
        })
        .where(eq(matchingRules.periodId, periodId))
        .returning();
      return updated;
    } else {
      // Create new rules
      const [created] = await db.insert(matchingRules).values(rulesData).returning();
      return created;
    }
  }

  // Resolution methods
  async getResolutionsByPeriod(periodId: string): Promise<TransactionResolution[]> {
    return await db.select()
      .from(transactionResolutions)
      .where(eq(transactionResolutions.periodId, periodId))
      .orderBy(desc(transactionResolutions.createdAt));
  }

  async getResolutionsByTransaction(transactionId: string): Promise<TransactionResolution[]> {
    return await db.select()
      .from(transactionResolutions)
      .where(eq(transactionResolutions.transactionId, transactionId))
      .orderBy(desc(transactionResolutions.createdAt));
  }

  async createResolution(resolution: InsertTransactionResolution): Promise<TransactionResolution> {
    const [created] = await db.insert(transactionResolutions).values(resolution).returning();
    return created;
  }

  async getResolvedTransactionIds(periodId: string): Promise<string[]> {
    const resolutions = await db.select({ transactionId: transactionResolutions.transactionId })
      .from(transactionResolutions)
      .where(eq(transactionResolutions.periodId, periodId));
    return resolutions.map(r => r.transactionId);
  }
}

export const storage = new DatabaseStorage();
