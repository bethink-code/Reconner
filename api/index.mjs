var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// server/api.ts
import "dotenv/config";
import express from "express";

// server/routes.ts
import { createServer } from "http";
import { createHash } from "crypto";
import multer from "multer";

// shared/schema.ts
var schema_exports = {};
__export(schema_exports, {
  RESOLUTION_REASONS: () => RESOLUTION_REASONS,
  insertMatchSchema: () => insertMatchSchema,
  insertMatchingRulesSchema: () => insertMatchingRulesSchema,
  insertReconciliationPeriodSchema: () => insertReconciliationPeriodSchema,
  insertTransactionResolutionSchema: () => insertTransactionResolutionSchema,
  insertTransactionSchema: () => insertTransactionSchema,
  insertUploadedFileSchema: () => insertUploadedFileSchema,
  matches: () => matches,
  matchingRules: () => matchingRules,
  matchingRulesConfigSchema: () => matchingRulesConfigSchema,
  reconciliationPeriods: () => reconciliationPeriods,
  sessions: () => sessions,
  transactionResolutions: () => transactionResolutions,
  transactions: () => transactions,
  uploadedFiles: () => uploadedFiles,
  users: () => users
});
import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, decimal, jsonb, integer, boolean, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
var sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull()
  },
  (table) => [index("IDX_session_expire").on(table.expire)]
);
var users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  isAdmin: boolean("is_admin").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
var reconciliationPeriods = pgTable("reconciliation_periods", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  status: text("status").notNull().default("in_progress"),
  userId: varchar("user_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
var insertReconciliationPeriodSchema = createInsertSchema(reconciliationPeriods).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
var uploadedFiles = pgTable("uploaded_files", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  periodId: varchar("period_id").notNull().references(() => reconciliationPeriods.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  fileType: text("file_type").notNull(),
  sourceType: text("source_type").notNull(),
  sourceName: text("source_name").notNull(),
  fileUrl: text("file_url").notNull(),
  fileSize: integer("file_size").notNull(),
  rowCount: integer("row_count").default(0),
  columnMapping: jsonb("column_mapping"),
  qualityReport: jsonb("quality_report"),
  contentHash: text("content_hash"),
  bankName: text("bank_name"),
  // For bank files: FNB, ABSA, Standard Bank, Nedbank, Other
  uploadedAt: timestamp("uploaded_at").defaultNow(),
  status: text("status").notNull().default("uploaded")
}, (table) => [
  index("IDX_uploaded_files_period_id").on(table.periodId)
]);
var insertUploadedFileSchema = createInsertSchema(uploadedFiles).omit({
  id: true,
  uploadedAt: true
});
var transactions = pgTable("transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fileId: varchar("file_id").notNull().references(() => uploadedFiles.id, { onDelete: "cascade" }),
  periodId: varchar("period_id").notNull().references(() => reconciliationPeriods.id, { onDelete: "cascade" }),
  sourceType: text("source_type").notNull(),
  sourceName: text("source_name"),
  // Name of the source (e.g., "FNB Merchant", "Fuel Master")
  rawData: jsonb("raw_data").notNull(),
  transactionDate: text("transaction_date").notNull(),
  transactionTime: text("transaction_time"),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  description: text("description"),
  referenceNumber: text("reference_number"),
  cardNumber: text("card_number"),
  // Masked card number like ****1234 for matching
  paymentType: text("payment_type"),
  // 'card', 'cash', 'credit_card', etc.
  isCardTransaction: text("is_card_transaction").default("unknown"),
  // 'yes', 'no', 'unknown' - for filtering reconciliation
  attendant: text("attendant"),
  // Pump attendant name
  cashier: text("cashier"),
  // Cashier name (may differ from attendant)
  pump: text("pump"),
  // Pump number
  matchStatus: text("match_status").notNull().default("unmatched"),
  matchId: varchar("match_id"),
  createdAt: timestamp("created_at").defaultNow()
}, (table) => [
  index("IDX_transactions_period_id").on(table.periodId),
  index("IDX_transactions_file_id").on(table.fileId),
  index("IDX_transactions_match_status").on(table.matchStatus)
]);
var insertTransactionSchema = createInsertSchema(transactions).omit({
  id: true,
  createdAt: true
});
var matches = pgTable("matches", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  periodId: varchar("period_id").notNull().references(() => reconciliationPeriods.id, { onDelete: "cascade" }),
  fuelTransactionId: varchar("fuel_transaction_id").notNull().references(() => transactions.id, { onDelete: "cascade" }),
  bankTransactionId: varchar("bank_transaction_id").notNull().references(() => transactions.id, { onDelete: "cascade" }),
  matchType: text("match_type").notNull(),
  matchConfidence: decimal("match_confidence", { precision: 5, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow()
}, (table) => [
  index("IDX_matches_period_id").on(table.periodId)
]);
var insertMatchSchema = createInsertSchema(matches).omit({
  id: true,
  createdAt: true
});
var matchingRules = pgTable("matching_rules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  periodId: varchar("period_id").notNull().references(() => reconciliationPeriods.id, { onDelete: "cascade" }).unique(),
  // Amount tolerance in Rand — tight for overfill/underfill only. Tips should be flagged.
  amountTolerance: decimal("amount_tolerance", { precision: 10, scale: 2 }).notNull().default("2.00"),
  // Date window in days (0-7)
  dateWindowDays: integer("date_window_days").notNull().default(3),
  // Time window in minutes (15-180)
  timeWindowMinutes: integer("time_window_minutes").notNull().default(60),
  // Grouping options
  groupByInvoice: boolean("group_by_invoice").notNull().default(true),
  // Matching requirements
  requireCardMatch: boolean("require_card_match").notNull().default(false),
  // Confidence thresholds (0-100)
  minimumConfidence: integer("minimum_confidence").notNull().default(70),
  autoMatchThreshold: integer("auto_match_threshold").notNull().default(85),
  // Metadata
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
var insertMatchingRulesSchema = createInsertSchema(matchingRules).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
var matchingRulesConfigSchema = z.object({
  amountTolerance: z.number().min(0).max(50),
  dateWindowDays: z.number().int().min(0).max(7),
  timeWindowMinutes: z.number().int().min(15).max(1440),
  groupByInvoice: z.boolean(),
  requireCardMatch: z.boolean(),
  minimumConfidence: z.number().int().min(0).max(100),
  autoMatchThreshold: z.number().int().min(0).max(100)
});
var transactionResolutions = pgTable("transaction_resolutions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  transactionId: varchar("transaction_id").notNull().references(() => transactions.id, { onDelete: "cascade" }),
  periodId: varchar("period_id").notNull().references(() => reconciliationPeriods.id, { onDelete: "cascade" }),
  // Resolution type: 'linked', 'reviewed', 'flagged', 'written_off', 'dismissed'
  resolutionType: text("resolution_type").notNull(),
  // Reason for reviewed resolutions
  reason: text("reason"),
  // Additional notes
  notes: text("notes"),
  // Who performed the action
  userId: varchar("user_id").references(() => users.id),
  userName: text("user_name"),
  userEmail: text("user_email"),
  // For linked resolutions, the fuel transaction ID
  linkedTransactionId: varchar("linked_transaction_id").references(() => transactions.id, { onDelete: "set null" }),
  // For flagged resolutions, the assignee
  assignee: text("assignee"),
  // Timestamp
  createdAt: timestamp("created_at").defaultNow()
}, (table) => [
  index("IDX_transaction_resolutions_transaction_id").on(table.transactionId),
  index("IDX_transaction_resolutions_period_id").on(table.periodId)
]);
var insertTransactionResolutionSchema = createInsertSchema(transactionResolutions).omit({
  id: true,
  createdAt: true
});
var RESOLUTION_REASONS = [
  { value: "timing_difference", label: "Timing difference (posted next day)" },
  { value: "cash_as_card", label: "Cash recorded as card (or vice versa)" },
  { value: "test_transaction", label: "Test/pre-auth transaction" },
  { value: "different_merchant", label: "Different merchant account" },
  { value: "refund_reversal", label: "Refund/reversal" },
  { value: "bank_fee", label: "Bank fee/charge" },
  { value: "other", label: "Other" }
];

// server/db.ts
import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
neonConfig.webSocketConstructor = ws;
if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?"
  );
}
var pool = new Pool({ connectionString: process.env.DATABASE_URL });
var db = drizzle({ client: pool, schema: schema_exports });

// server/storage.ts
import { eq, and, or, desc, sql as sql2, inArray } from "drizzle-orm";
var DatabaseStorage = class {
  async getUser(id) {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || void 0;
  }
  async upsertUser(userData) {
    const existingByEmail = userData.email ? await db.select().from(users).where(eq(users.email, userData.email)) : [];
    if (existingByEmail.length > 0) {
      const [updated] = await db.update(users).set({
        ...userData,
        updatedAt: /* @__PURE__ */ new Date()
      }).where(eq(users.email, userData.email)).returning();
      return updated;
    }
    const [user] = await db.insert(users).values(userData).onConflictDoUpdate({
      target: users.id,
      set: {
        ...userData,
        updatedAt: /* @__PURE__ */ new Date()
      }
    }).returning();
    return user;
  }
  async getAllUsers() {
    return await db.select().from(users).orderBy(desc(users.createdAt));
  }
  async setUserAdmin(id, isAdmin) {
    const [updated] = await db.update(users).set({ isAdmin, updatedAt: /* @__PURE__ */ new Date() }).where(eq(users.id, id)).returning();
    return updated || void 0;
  }
  async getPeriods(userId) {
    if (userId) {
      return await db.select().from(reconciliationPeriods).where(eq(reconciliationPeriods.userId, userId)).orderBy(desc(reconciliationPeriods.createdAt));
    }
    return await db.select().from(reconciliationPeriods).orderBy(desc(reconciliationPeriods.createdAt));
  }
  async getPeriod(id) {
    const [period] = await db.select().from(reconciliationPeriods).where(eq(reconciliationPeriods.id, id));
    return period || void 0;
  }
  async createPeriod(period) {
    const [newPeriod] = await db.insert(reconciliationPeriods).values(period).returning();
    return newPeriod;
  }
  async updatePeriod(id, data) {
    const [updated] = await db.update(reconciliationPeriods).set({ ...data, updatedAt: /* @__PURE__ */ new Date() }).where(eq(reconciliationPeriods.id, id)).returning();
    return updated || void 0;
  }
  async deletePeriod(id) {
    await db.delete(reconciliationPeriods).where(eq(reconciliationPeriods.id, id));
  }
  async getFilesByPeriod(periodId) {
    return await db.select().from(uploadedFiles).where(eq(uploadedFiles.periodId, periodId)).orderBy(desc(uploadedFiles.uploadedAt));
  }
  async getFile(id) {
    const [file] = await db.select().from(uploadedFiles).where(eq(uploadedFiles.id, id));
    return file || void 0;
  }
  async createFile(file) {
    const [newFile] = await db.insert(uploadedFiles).values(file).returning();
    return newFile;
  }
  async updateFile(id, data) {
    const [updated] = await db.update(uploadedFiles).set(data).where(eq(uploadedFiles.id, id)).returning();
    return updated || void 0;
  }
  async deleteFile(id) {
    await db.delete(uploadedFiles).where(eq(uploadedFiles.id, id));
  }
  async getTransactionsByPeriod(periodId) {
    return await db.select().from(transactions).where(eq(transactions.periodId, periodId)).orderBy(desc(transactions.transactionDate));
  }
  async getTransactionsByPeriodPaginated(periodId, options) {
    const { limit, offset, sourceType, matchStatus, isCardTransaction } = options;
    const conditions = [eq(transactions.periodId, periodId)];
    if (sourceType) {
      if (sourceType === "bank") {
        conditions.push(sql2`${transactions.sourceType} LIKE 'bank%'`);
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
    const whereClause = conditions.length === 1 ? conditions[0] : and(...conditions);
    const result = await db.select().from(transactions).where(whereClause).orderBy(desc(transactions.transactionDate)).limit(limit).offset(offset);
    const [countResult] = await db.select({ count: sql2`count(*)::int` }).from(transactions).where(whereClause);
    return {
      transactions: result,
      total: countResult?.count || 0
    };
  }
  async getTransactionsByFile(fileId) {
    return await db.select().from(transactions).where(eq(transactions.fileId, fileId)).orderBy(desc(transactions.transactionDate));
  }
  async getTransaction(id) {
    const [transaction] = await db.select().from(transactions).where(eq(transactions.id, id));
    return transaction || void 0;
  }
  async createTransaction(transaction) {
    const [newTransaction] = await db.insert(transactions).values(transaction).returning();
    return newTransaction;
  }
  async createTransactions(transactionList) {
    if (transactionList.length === 0) return { count: 0 };
    const BATCH_SIZE = 500;
    let count = 0;
    for (let i = 0; i < transactionList.length; i += BATCH_SIZE) {
      const batch = transactionList.slice(i, i + BATCH_SIZE);
      await db.insert(transactions).values(batch);
      count += batch.length;
    }
    return { count };
  }
  async updateTransaction(id, data) {
    const [updated] = await db.update(transactions).set(data).where(eq(transactions.id, id)).returning();
    return updated || void 0;
  }
  async deleteTransactionsByFile(fileId) {
    await db.delete(transactions).where(eq(transactions.fileId, fileId));
  }
  async getMatchesByPeriod(periodId) {
    return await db.select().from(matches).where(eq(matches.periodId, periodId)).orderBy(desc(matches.createdAt));
  }
  async getMatch(id) {
    const [match] = await db.select().from(matches).where(eq(matches.id, id));
    return match || void 0;
  }
  async createMatch(match) {
    const [newMatch] = await db.insert(matches).values(match).returning();
    return newMatch;
  }
  async createMatchesBatch(matchData) {
    if (matchData.length === 0) return [];
    const BATCH_SIZE = 100;
    const results = [];
    for (let i = 0; i < matchData.length; i += BATCH_SIZE) {
      const batch = matchData.slice(i, i + BATCH_SIZE);
      const inserted = await db.insert(matches).values(batch).returning();
      results.push(...inserted);
    }
    return results;
  }
  async updateTransactionsBatch(updates) {
    if (updates.length === 0) return;
    const BATCH_SIZE = 100;
    for (let i = 0; i < updates.length; i += BATCH_SIZE) {
      const batch = updates.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(
        ({ id, data }) => db.update(transactions).set(data).where(eq(transactions.id, id))
      ));
    }
  }
  async deleteMatch(id) {
    await db.delete(matches).where(eq(matches.id, id));
  }
  async deleteMatchesByFile(fileId) {
    const fileTransactions = await db.select({ id: transactions.id }).from(transactions).where(eq(transactions.fileId, fileId));
    if (fileTransactions.length === 0) return;
    const transactionIds = fileTransactions.map((t) => t.id);
    await db.delete(matches).where(
      or(
        inArray(matches.fuelTransactionId, transactionIds),
        inArray(matches.bankTransactionId, transactionIds)
      )
    );
  }
  async resetMatchesByPeriod(periodId) {
    await db.delete(matches).where(eq(matches.periodId, periodId));
    await db.update(transactions).set({ matchStatus: "unmatched", matchId: null }).where(and(
      eq(transactions.periodId, periodId),
      sql2`match_status != 'excluded'`
    ));
  }
  async getPeriodSummary(periodId) {
    const result = await pool.query(`
      WITH bank_coverage AS (
        SELECT
          MIN(transaction_date) AS min_date,
          MAX(transaction_date) AS max_date
        FROM transactions
        WHERE period_id = $1
          AND source_type LIKE 'bank%'
          AND match_status NOT IN ('unmatchable', 'excluded')
      ),
      tx_stats AS (
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

          COUNT(CASE WHEN source_type = 'fuel' AND is_card_transaction = 'yes' AND (
            LOWER(payment_type) LIKE '%debtor%' OR LOWER(payment_type) LIKE '%account%' OR LOWER(payment_type) LIKE '%fleet%'
          ) THEN 1 END) as debtor_fuel_transactions,
          COALESCE(SUM(CASE WHEN source_type = 'fuel' AND is_card_transaction = 'yes' AND (
            LOWER(payment_type) LIKE '%debtor%' OR LOWER(payment_type) LIKE '%account%' OR LOWER(payment_type) LIKE '%fleet%'
          ) THEN amount::numeric ELSE 0 END), 0) as debtor_fuel_amount,

          COUNT(CASE WHEN source_type LIKE 'bank%' AND match_status = 'matched' THEN 1 END) as matched_bank_transactions,
          COALESCE(SUM(CASE WHEN source_type LIKE 'bank%' AND match_status = 'matched' THEN amount::numeric ELSE 0 END), 0) as matched_bank_amount,
          COUNT(CASE WHEN source_type = 'fuel' AND is_card_transaction = 'yes' AND match_status = 'matched' THEN 1 END) as matched_card_fuel,
          
          COUNT(CASE WHEN source_type LIKE 'bank%' AND (match_status = 'unmatched' OR match_status IS NULL) AND amount::numeric > 0 THEN 1 END) as unmatched_bank_transactions,
          COALESCE(SUM(CASE WHEN source_type LIKE 'bank%' AND (match_status = 'unmatched' OR match_status IS NULL) AND amount::numeric > 0 THEN amount::numeric ELSE 0 END), 0) as unmatched_bank_amount,
          COUNT(CASE WHEN source_type LIKE 'bank%' AND match_status = 'unmatchable' THEN 1 END) as unmatchable_bank_transactions,
          COALESCE(SUM(CASE WHEN source_type LIKE 'bank%' AND match_status = 'unmatchable' THEN amount::numeric ELSE 0 END), 0) as unmatchable_bank_amount,
          COUNT(CASE WHEN source_type LIKE 'bank%' AND match_status = 'excluded' THEN 1 END) as excluded_bank_transactions,
          COALESCE(SUM(CASE WHEN source_type LIKE 'bank%' AND match_status = 'excluded' THEN amount::numeric ELSE 0 END), 0) as excluded_bank_amount,
          COUNT(CASE WHEN source_type LIKE 'bank%' AND match_status = 'resolved' THEN 1 END) as resolved_bank_transactions,
          COALESCE(SUM(CASE WHEN source_type LIKE 'bank%' AND match_status = 'resolved' THEN amount::numeric ELSE 0 END), 0) as resolved_bank_amount,
          
          COUNT(CASE WHEN source_type = 'fuel' AND is_card_transaction = 'yes' AND match_status != 'matched' AND amount::numeric > 0 THEN 1 END) as unmatched_card_transactions,
          COALESCE(SUM(CASE WHEN source_type = 'fuel' AND is_card_transaction = 'yes' AND match_status != 'matched' AND amount::numeric > 0 THEN amount::numeric ELSE 0 END), 0) as unmatched_card_amount,

          -- Fuel card transactions scoped to bank coverage dates
          COUNT(CASE WHEN source_type = 'fuel' AND is_card_transaction = 'yes'
                     AND transaction_date >= bc.min_date AND transaction_date <= bc.max_date THEN 1 END) as scoped_card_count,
          COALESCE(SUM(CASE WHEN source_type = 'fuel' AND is_card_transaction = 'yes'
                     AND transaction_date >= bc.min_date AND transaction_date <= bc.max_date THEN amount::numeric ELSE 0 END), 0) as scoped_card_amount,
          COUNT(CASE WHEN source_type = 'fuel' AND is_card_transaction = 'yes' AND match_status = 'matched'
                     AND transaction_date >= bc.min_date AND transaction_date <= bc.max_date THEN 1 END) as scoped_matched_count,
          COALESCE(SUM(CASE WHEN source_type = 'fuel' AND is_card_transaction = 'yes' AND match_status = 'matched'
                     AND transaction_date >= bc.min_date AND transaction_date <= bc.max_date THEN amount::numeric ELSE 0 END), 0) as scoped_matched_amount,
          COUNT(CASE WHEN source_type = 'fuel' AND is_card_transaction = 'yes' AND match_status != 'matched'
                     AND transaction_date >= bc.min_date AND transaction_date <= bc.max_date THEN 1 END) as scoped_unmatched_count,
          COALESCE(SUM(CASE WHEN source_type = 'fuel' AND is_card_transaction = 'yes' AND match_status != 'matched'
                     AND transaction_date >= bc.min_date AND transaction_date <= bc.max_date THEN amount::numeric ELSE 0 END), 0) as scoped_unmatched_amount,

          bc.min_date as bank_coverage_min,
          bc.max_date as bank_coverage_max,

          MIN(CASE WHEN source_type = 'fuel' THEN transaction_date END) as fuel_date_min,
          MAX(CASE WHEN source_type = 'fuel' THEN transaction_date END) as fuel_date_max,
          MIN(CASE WHEN source_type LIKE 'bank%' THEN transaction_date END) as bank_date_min,
          MAX(CASE WHEN source_type LIKE 'bank%' THEN transaction_date END) as bank_date_max

        FROM transactions
        CROSS JOIN bank_coverage bc
        WHERE period_id = $1
        GROUP BY bc.min_date, bc.max_date
      ),
      match_stats AS (
        SELECT
          COUNT(*) as matched_pairs,
          COALESCE(SUM(t_fuel.amount::numeric), 0) as matched_fuel_amount,
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
        COALESCE(ms.matched_fuel_amount, 0) as matched_fuel_amount,
        COALESCE(ms.matches_same_day, 0) as matches_same_day,
        COALESCE(ms.matches_1_day, 0) as matches_1_day,
        COALESCE(ms.matches_2_day, 0) as matches_2_day,
        COALESCE(ms.matches_3_day, 0) as matches_3_day
      FROM tx_stats tx
      CROSS JOIN match_stats ms
    `, [periodId]);
    const row = result.rows[0] || {};
    const totalTransactions = parseInt(row.total_transactions || "0");
    const fuelTransactions = parseInt(row.fuel_transactions || "0");
    const bankTransactions = parseInt(row.bank_transactions || "0");
    const matchedTransactions = parseInt(row.matched_transactions || "0");
    const cardFuelTransactions = parseInt(row.card_fuel_transactions || "0");
    const matchedBankTransactions = parseInt(row.matched_bank_transactions || "0");
    const matchedCardFuel = parseInt(row.matched_card_fuel || "0");
    const unmatchableBankTx = parseInt(row.unmatchable_bank_transactions || "0");
    const excludedBankTx = parseInt(row.excluded_bank_transactions || "0");
    const matchableBankTx = bankTransactions - unmatchableBankTx - excludedBankTx;
    const bankMatchRate = matchableBankTx > 0 ? matchedBankTransactions / matchableBankTx * 100 : 0;
    const cardMatchRate = cardFuelTransactions > 0 ? matchedCardFuel / cardFuelTransactions * 100 : 0;
    const cardFuelAmount = parseFloat(row.card_fuel_amount || "0");
    const totalBankAmount = parseFloat(row.total_bank_amount || "0");
    return {
      totalTransactions,
      fuelTransactions,
      bankTransactions,
      matchedTransactions,
      matchedPairs: parseInt(row.matched_pairs || "0"),
      unmatchedTransactions: totalTransactions - matchedTransactions,
      matchRate: totalTransactions > 0 ? matchedTransactions / totalTransactions * 100 : 0,
      totalFuelAmount: parseFloat(row.total_fuel_amount || "0"),
      totalBankAmount,
      discrepancy: Math.abs(cardFuelAmount - totalBankAmount),
      cardFuelTransactions,
      cashFuelTransactions: parseInt(row.cash_fuel_transactions || "0"),
      unknownFuelTransactions: parseInt(row.unknown_fuel_transactions || "0"),
      cardFuelAmount,
      cashFuelAmount: parseFloat(row.cash_fuel_amount || "0"),
      unknownFuelAmount: parseFloat(row.unknown_fuel_amount || "0"),
      bankMatchRate,
      cardMatchRate,
      matchesSameDay: parseInt(row.matches_same_day || "0"),
      matches1Day: parseInt(row.matches_1_day || "0"),
      matches2Day: parseInt(row.matches_2_day || "0"),
      matches3Day: parseInt(row.matches_3_day || "0"),
      unmatchedBankTransactions: parseInt(row.unmatched_bank_transactions || "0"),
      unmatchedBankAmount: parseFloat(row.unmatched_bank_amount || "0"),
      unmatchedCardTransactions: parseInt(row.unmatched_card_transactions || "0"),
      unmatchedCardAmount: parseFloat(row.unmatched_card_amount || "0"),
      unmatchableBankTransactions: parseInt(row.unmatchable_bank_transactions || "0"),
      unmatchableBankAmount: parseFloat(row.unmatchable_bank_amount || "0"),
      excludedBankTransactions: parseInt(row.excluded_bank_transactions || "0"),
      excludedBankAmount: parseFloat(row.excluded_bank_amount || "0"),
      resolvedBankTransactions: parseInt(row.resolved_bank_transactions || "0"),
      resolvedBankAmount: parseFloat(row.resolved_bank_amount || "0"),
      matchedBankAmount: parseFloat(row.matched_bank_amount || "0"),
      matchedFuelAmount: parseFloat(row.matched_fuel_amount || "0"),
      debtorFuelTransactions: parseInt(row.debtor_fuel_transactions || "0"),
      debtorFuelAmount: parseFloat(row.debtor_fuel_amount || "0"),
      scopedCardCount: parseInt(row.scoped_card_count || "0"),
      scopedCardAmount: parseFloat(row.scoped_card_amount || "0"),
      scopedMatchedCount: parseInt(row.scoped_matched_count || "0"),
      scopedMatchedAmount: parseFloat(row.scoped_matched_amount || "0"),
      scopedUnmatchedCount: parseInt(row.scoped_unmatched_count || "0"),
      scopedUnmatchedAmount: parseFloat(row.scoped_unmatched_amount || "0"),
      fuelDateRange: row.fuel_date_min && row.fuel_date_max ? {
        min: row.fuel_date_min,
        max: row.fuel_date_max
      } : void 0,
      bankDateRange: row.bank_date_min && row.bank_date_max ? {
        min: row.bank_date_min,
        max: row.bank_date_max
      } : void 0,
      bankCoverageRange: row.bank_coverage_min && row.bank_coverage_max ? {
        min: row.bank_coverage_min,
        max: row.bank_coverage_max
      } : void 0,
      bankAccountRanges: await this.getBankAccountCoverageRanges(periodId),
      perBankBreakdown: await this.getPerBankBreakdown(periodId)
    };
  }
  async getPerBankBreakdown(periodId) {
    const result = await pool.query(`
      SELECT
        COALESCE(f.bank_name, t.source_name, 'Bank') as bank_name,
        COUNT(CASE WHEN t.match_status != 'excluded' THEN 1 END) as approved_count,
        COALESCE(SUM(CASE WHEN t.match_status != 'excluded' THEN t.amount::numeric ELSE 0 END), 0) as approved_amount,
        COUNT(CASE WHEN t.match_status = 'excluded' AND LOWER(t.description) LIKE '%declined%' THEN 1 END) as declined_count,
        COALESCE(SUM(CASE WHEN t.match_status = 'excluded' AND LOWER(t.description) LIKE '%declined%' THEN t.amount::numeric ELSE 0 END), 0) as declined_amount,
        COUNT(CASE WHEN t.match_status = 'excluded' AND (LOWER(t.description) LIKE '%cancel%' OR LOWER(t.description) LIKE '%revers%') THEN 1 END) as cancelled_count,
        COALESCE(SUM(CASE WHEN t.match_status = 'excluded' AND (LOWER(t.description) LIKE '%cancel%' OR LOWER(t.description) LIKE '%revers%') THEN t.amount::numeric ELSE 0 END), 0) as cancelled_amount,
        COUNT(*) as total_count,
        COALESCE(SUM(t.amount::numeric), 0) as total_amount
      FROM transactions t
      LEFT JOIN uploaded_files f ON t.file_id = f.id
      WHERE t.period_id = $1 AND t.source_type LIKE 'bank%'
      GROUP BY COALESCE(f.bank_name, t.source_name, 'Bank')
      ORDER BY COALESCE(f.bank_name, t.source_name, 'Bank')
    `, [periodId]);
    return result.rows.map((row) => ({
      bankName: row.bank_name,
      approvedCount: parseInt(row.approved_count || "0"),
      approvedAmount: parseFloat(row.approved_amount || "0"),
      declinedCount: parseInt(row.declined_count || "0"),
      declinedAmount: parseFloat(row.declined_amount || "0"),
      cancelledCount: parseInt(row.cancelled_count || "0"),
      cancelledAmount: parseFloat(row.cancelled_amount || "0"),
      totalCount: parseInt(row.total_count || "0"),
      totalAmount: parseFloat(row.total_amount || "0")
    }));
  }
  async getAttendantSummary(periodId) {
    const result = await pool.query(`
      WITH bank_coverage AS (
        SELECT
          MIN(transaction_date) AS min_date,
          MAX(transaction_date) AS max_date
        FROM transactions
        WHERE period_id = $1
          AND source_type LIKE 'bank%'
          AND match_status NOT IN ('unmatchable', 'excluded')
      )
      SELECT
        COALESCE(NULLIF(TRIM(t.attendant), ''), 'Unknown') AS attendant,
        COUNT(CASE WHEN t.is_card_transaction = 'yes' AND t.match_status = 'matched'
                    AND t.transaction_date >= bc.min_date
                    AND t.transaction_date <= bc.max_date THEN 1 END)::int AS matched_count,
        COALESCE(SUM(CASE WHEN t.is_card_transaction = 'yes' AND t.match_status = 'matched'
                    AND t.transaction_date >= bc.min_date
                    AND t.transaction_date <= bc.max_date THEN t.amount::numeric ELSE 0 END), 0) AS matched_amount,
        COUNT(CASE WHEN t.is_card_transaction = 'yes' AND t.match_status != 'matched'
                    AND t.transaction_date >= bc.min_date
                    AND t.transaction_date <= bc.max_date THEN 1 END)::int AS unmatched_count,
        COALESCE(SUM(CASE WHEN t.is_card_transaction = 'yes' AND t.match_status != 'matched'
                    AND t.transaction_date >= bc.min_date
                    AND t.transaction_date <= bc.max_date THEN t.amount::numeric ELSE 0 END), 0) AS unmatched_amount,
        COUNT(*)::int AS total_count,
        COALESCE(SUM(t.amount::numeric), 0) AS total_amount
      FROM transactions t
      CROSS JOIN bank_coverage bc
      WHERE t.period_id = $1 AND t.source_type = 'fuel'
      GROUP BY COALESCE(NULLIF(TRIM(t.attendant), ''), 'Unknown')
      ORDER BY matched_count DESC, attendant ASC
    `, [periodId]);
    const bankBreakdown = await pool.query(`
      SELECT
        COALESCE(NULLIF(TRIM(t_fuel.attendant), ''), 'Unknown') AS attendant,
        COALESCE(f.bank_name, t_bank.source_name, 'Bank') AS bank_name,
        COUNT(*)::int AS count,
        COALESCE(SUM(t_bank.amount::numeric), 0) AS amount
      FROM matches m
      JOIN transactions t_fuel ON m.fuel_transaction_id = t_fuel.id
      JOIN transactions t_bank ON m.bank_transaction_id = t_bank.id
      LEFT JOIN uploaded_files f ON t_bank.file_id = f.id
      WHERE m.period_id = $1
      GROUP BY COALESCE(NULLIF(TRIM(t_fuel.attendant), ''), 'Unknown'),
               COALESCE(f.bank_name, t_bank.source_name, 'Bank')
      ORDER BY count DESC
    `, [periodId]);
    const banksByAttendant = {};
    for (const row of bankBreakdown.rows) {
      const att = row.attendant;
      if (!banksByAttendant[att]) banksByAttendant[att] = [];
      banksByAttendant[att].push({
        bankName: row.bank_name,
        count: parseInt(row.count || "0"),
        amount: parseFloat(row.amount || "0")
      });
    }
    return result.rows.map((row) => {
      const matchedCount = parseInt(row.matched_count || "0");
      const banks = banksByAttendant[row.attendant] || [];
      const matchedBankAmount = banks.reduce((sum, b) => sum + b.amount, 0);
      return {
        attendant: row.attendant,
        matchedCount,
        matchedAmount: parseFloat(row.matched_amount || "0"),
        matchedBankAmount,
        unmatchedCount: parseInt(row.unmatched_count || "0"),
        unmatchedAmount: parseFloat(row.unmatched_amount || "0"),
        banks,
        totalCount: parseInt(row.total_count || "0"),
        totalAmount: parseFloat(row.total_amount || "0")
      };
    });
  }
  async getBankAccountCoverageRanges(periodId) {
    const result = await pool.query(`
      SELECT
        t.file_id,
        COALESCE(f.bank_name, t.source_name, 'Bank Account') as bank_name,
        COALESCE(t.source_name, 'Bank Account') as source_name,
        MIN(t.transaction_date) as min_date,
        MAX(t.transaction_date) as max_date,
        COUNT(*) as tx_count,
        COUNT(*) FILTER (WHERE t.match_status NOT IN ('unmatchable', 'excluded')) as in_range_count
      FROM transactions t
      LEFT JOIN uploaded_files f ON t.file_id = f.id
      WHERE t.period_id = $1 AND t.source_type LIKE 'bank%'
      GROUP BY t.file_id, f.bank_name, t.source_name
      ORDER BY MIN(t.transaction_date)
    `, [periodId]);
    return result.rows.map((row) => ({
      fileId: row.file_id,
      sourceName: row.source_name || "Bank Account",
      bankName: row.bank_name,
      min: row.min_date,
      max: row.max_date,
      txCount: parseInt(row.tx_count || "0"),
      inRangeCount: parseInt(row.in_range_count || "0")
    }));
  }
  async getVerificationSummary(periodId) {
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
          COUNT(CASE WHEN match_status = 'unmatched' THEN 1 END) as unmatched_bank,
          COALESCE(SUM(CASE WHEN match_status = 'unmatched' THEN amount::numeric ELSE 0 END), 0) as unmatched_bank_amount,
          COUNT(CASE WHEN match_status = 'excluded' THEN 1 END) as excluded_bank,
          COALESCE(SUM(CASE WHEN match_status = 'excluded' THEN amount::numeric ELSE 0 END), 0) as excluded_bank_amount,
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
    const bankSources = sourcesResult.rows.map((s) => ({
      name: s.source_name || "Unknown Bank",
      amount: parseFloat(s.source_amount || "0"),
      transactions: parseInt(s.tx_count || "0")
    }));
    const totalFuelAmount = parseFloat(row.total_fuel_amount || "0");
    const cardAmount = parseFloat(row.card_amount || "0");
    const cashAmount = parseFloat(row.cash_amount || "0");
    const cardTransactions = parseInt(row.card_transactions || "0");
    const cashTransactions = parseInt(row.cash_transactions || "0");
    const totalBankAmount = parseFloat(row.total_bank_amount || "0");
    const totalBankTransactions = parseInt(row.total_bank || "0");
    const matchedBankTransactions = parseInt(row.matched_bank || "0");
    const matchedBankAmount = parseFloat(row.matched_bank_amount || "0");
    const unmatchedBankOnly = parseInt(row.unmatched_bank || "0");
    const unmatchedBankOnlyAmount = parseFloat(row.unmatched_bank_amount || "0");
    const excludedBankTransactions = parseInt(row.excluded_bank || "0");
    const excludedBankAmount = parseFloat(row.excluded_bank_amount || "0");
    const matchedCardTransactions = parseInt(row.matched_card_transactions || "0");
    const matchedCardAmount = parseFloat(row.matched_card_amount || "0");
    const unmatchedCardCount = parseInt(row.unmatched_card_count || "0");
    const unmatchedCardAmount = parseFloat(row.unmatched_card_amount || "0");
    const fuelEarliest = row.fuel_earliest;
    const fuelLatest = row.fuel_latest;
    const bankEarliest = row.bank_earliest;
    const bankLatest = row.bank_latest;
    const calculateDays = (earliest, latest) => {
      if (!earliest || !latest) return 0;
      const start = new Date(earliest);
      const end = new Date(latest);
      return Math.ceil((end.getTime() - start.getTime()) / (1e3 * 60 * 60 * 24)) + 1;
    };
    const fuelDays = calculateDays(fuelEarliest, fuelLatest);
    const bankDays = calculateDays(bankEarliest, bankLatest);
    const volumeCoverage = cardAmount > 0 ? Math.round(totalBankAmount / cardAmount * 1e3) / 10 : 0;
    const dateRangeCoverage = fuelDays > 0 ? Math.round(bankDays / fuelDays * 1e3) / 10 : 0;
    const missingDays = Math.max(0, fuelDays - bankDays);
    const fuelDailyAvg = fuelDays > 0 ? cardTransactions / fuelDays : 0;
    const bankDailyAvg = bankDays > 0 ? totalBankTransactions / bankDays : 0;
    const volumeGap = bankDailyAvg > 0 ? fuelDailyAvg / bankDailyAvg : 0;
    const bankMatchRate = totalBankTransactions > 0 ? Math.round(matchedBankTransactions / totalBankTransactions * 1e3) / 10 : 0;
    let performanceRating = 1;
    let performanceLabel = "Poor";
    if (bankMatchRate >= 90) {
      performanceRating = 5;
      performanceLabel = "Excellent";
    } else if (bankMatchRate >= 80) {
      performanceRating = 5;
      performanceLabel = "Excellent";
    } else if (bankMatchRate >= 70) {
      performanceRating = 4;
      performanceLabel = "Very Good";
    } else if (bankMatchRate >= 60) {
      performanceRating = 3;
      performanceLabel = "Good";
    } else if (bankMatchRate >= 40) {
      performanceRating = 2;
      performanceLabel = "Needs Improvement";
    }
    const pendingVerificationAmount = cardAmount - matchedCardAmount - unmatchedCardAmount;
    const pendingVerificationTransactions = cardTransactions - matchedCardTransactions - unmatchedCardCount;
    const unverifiedPercentage = totalBankTransactions > 0 ? Math.round((totalBankTransactions - matchedBankTransactions) / totalBankTransactions * 1e3) / 10 : 0;
    const criticalActions = [];
    const importantActions = [];
    const optionalActions = [];
    if (volumeCoverage < 50) {
      criticalActions.push({
        action: "upload_bank_statements",
        description: "Upload Missing Bank Statements",
        details: [
          `You're missing ${(100 - volumeCoverage).toFixed(0)}% of bank transaction data`,
          "Check for additional merchant accounts",
          "Verify all bank accounts uploaded",
          missingDays > 0 ? `Get statements for ${missingDays} missing days` : ""
        ].filter((d) => d)
      });
    }
    const unmatchedBankCount = totalBankTransactions - matchedBankTransactions;
    if (unmatchedBankCount > 0) {
      importantActions.push({
        action: "review_unmatched",
        description: `Review ${unmatchedBankCount} Unmatched Transactions`,
        details: [
          `R${(totalBankAmount - matchedBankAmount).toFixed(2)} in transactions that didn't match`,
          "Check for voided sales",
          "Verify refunds processed",
          "Look for amount discrepancies"
        ]
      });
    }
    if (bankMatchRate >= 70) {
      optionalActions.push({
        action: "adjust_rules",
        description: "Adjust Matching Rules",
        details: [
          `Current performance: ${bankMatchRate.toFixed(1)}% (${performanceLabel.toLowerCase()})`,
          "Only adjust if match rate drops after adding complete bank data"
        ]
      });
    } else if (bankMatchRate > 0) {
      importantActions.push({
        action: "adjust_rules",
        description: "Consider Adjusting Matching Rules",
        details: [
          `Current match rate: ${bankMatchRate.toFixed(1)}%`,
          "Try widening date window or amount tolerance",
          "Enable invoice grouping if not already on"
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
          reason: "No bank data available for these card transactions"
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
          percentageOfCardSales: cardAmount > 0 ? Math.round(Math.max(0, pendingVerificationAmount) / cardAmount * 1e3) / 10 : 0
        },
        unmatchedIssues: { count: unmatchedBankOnly, amount: unmatchedBankOnlyAmount },
        excludedTransactions: { count: excludedBankTransactions, amount: excludedBankAmount }
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
          highConfidence: parseInt(row.high_confidence || "0"),
          mediumConfidence: parseInt(row.medium_confidence || "0")
        },
        invoiceGrouping: {
          multiLineInvoices: parseInt(row.grouped_invoices || "0"),
          totalItemsGrouped: parseInt(row.total_grouped_items || "0")
        },
        matchesByDateOffset: {
          sameDay: parseInt(row.same_day || "0"),
          oneDay: parseInt(row.one_day || "0"),
          twoDays: parseInt(row.two_days || "0"),
          threePlusDays: parseInt(row.three_plus_days || "0")
        }
      },
      recommendedActions: {
        critical: criticalActions,
        important: importantActions,
        optional: optionalActions
      }
    };
  }
  async getMatchingRules(periodId) {
    const [rules] = await db.select().from(matchingRules).where(eq(matchingRules.periodId, periodId));
    if (!rules) {
      return {
        amountTolerance: 2,
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
  async saveMatchingRules(periodId, rules) {
    const [existing] = await db.select().from(matchingRules).where(eq(matchingRules.periodId, periodId));
    const rulesData = {
      periodId,
      amountTolerance: String(rules.amountTolerance),
      dateWindowDays: rules.dateWindowDays,
      timeWindowMinutes: rules.timeWindowMinutes,
      groupByInvoice: rules.groupByInvoice,
      requireCardMatch: rules.requireCardMatch,
      minimumConfidence: rules.minimumConfidence,
      autoMatchThreshold: rules.autoMatchThreshold
    };
    if (existing) {
      const [updated] = await db.update(matchingRules).set({
        amountTolerance: rulesData.amountTolerance,
        dateWindowDays: rulesData.dateWindowDays,
        timeWindowMinutes: rulesData.timeWindowMinutes,
        groupByInvoice: rulesData.groupByInvoice,
        requireCardMatch: rulesData.requireCardMatch,
        minimumConfidence: rulesData.minimumConfidence,
        autoMatchThreshold: rulesData.autoMatchThreshold,
        updatedAt: /* @__PURE__ */ new Date()
      }).where(eq(matchingRules.periodId, periodId)).returning();
      return updated;
    } else {
      const [created] = await db.insert(matchingRules).values(rulesData).returning();
      return created;
    }
  }
  // Resolution methods
  async getResolutionsByPeriod(periodId) {
    return await db.select().from(transactionResolutions).where(eq(transactionResolutions.periodId, periodId)).orderBy(desc(transactionResolutions.createdAt));
  }
  async clearResolutionsByPeriod(periodId) {
    const resolutions = await this.getResolutionsByPeriod(periodId);
    const resolvedTxIds = resolutions.filter((r) => r.resolutionType !== "linked").map((r) => r.transactionId);
    if (resolvedTxIds.length > 0) {
      await db.update(transactions).set({ matchStatus: "unmatched" }).where(and(
        eq(transactions.periodId, periodId),
        inArray(transactions.id, resolvedTxIds)
      ));
    }
    const result = await db.delete(transactionResolutions).where(eq(transactionResolutions.periodId, periodId));
    return result.rowCount ?? 0;
  }
  async getResolutionsByTransaction(transactionId) {
    return await db.select().from(transactionResolutions).where(eq(transactionResolutions.transactionId, transactionId)).orderBy(desc(transactionResolutions.createdAt));
  }
  async createResolution(resolution) {
    const [created] = await db.insert(transactionResolutions).values(resolution).returning();
    return created;
  }
  async getResolvedTransactionIds(periodId) {
    const resolutions = await db.select({ transactionId: transactionResolutions.transactionId }).from(transactionResolutions).where(eq(transactionResolutions.periodId, periodId));
    return resolutions.map((r) => r.transactionId);
  }
};
var storage = new DatabaseStorage();

// server/fileParser.ts
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { PDFExtract } from "pdf.js-extract";
var SOURCE_PRESETS = [
  {
    name: "FNB Merchant",
    description: "FNB Bank merchant transaction export",
    category: "bank",
    detectPattern: (headers) => {
      const normalized = headers.map((h) => h.toLowerCase().trim());
      return normalized.includes("transaction date") && normalized.includes("terminal id") && normalized.includes("pan");
    },
    mappings: {
      "Transaction date": "date",
      "Transaction Date": "date",
      "Amount": "amount",
      "Terminal ID": "reference",
      "Transaction type": "description",
      "Transaction Type": "description",
      "PAN": "cardNumber",
      "Source": "ignore"
    },
    columnLabels: {
      "Transaction date": 'Date & Time (e.g., "28 Feb 23:38:59")',
      "Transaction Date": 'Date & Time (e.g., "28 Feb 23:38:59")',
      "Amount": "Transaction Amount (R currency)",
      "Terminal ID": "Terminal Reference ID",
      "Transaction type": "Transaction Type (Purchase, etc.)",
      "Transaction Type": "Transaction Type (Purchase, etc.)",
      "PAN": "Card Number (masked)",
      "Source": "Source System"
    }
  },
  {
    name: "ABSA Merchant",
    description: "ABSA Bank merchant portal export",
    category: "bank",
    detectPattern: (headers) => {
      const normalized = headers.map((h) => h.toLowerCase().trim());
      const hasAmount = normalized.some((h) => h.includes("transaction amount") || h === "amount");
      const hasReference = normalized.some((h) => h.includes("short reference") || h === "uti short reference");
      const hasMerchant = normalized.some((h) => h.includes("merchant"));
      return hasAmount && hasReference && hasMerchant;
    },
    mappings: {
      "Date": "date",
      "Time": "time",
      "Transaction Amount": "amount",
      "Amount": "amount",
      "Short Reference": "reference",
      "UTI Short Reference": "reference",
      "Merchant Name": "description",
      "MerchantName": "description",
      "Receipt No": "ignore",
      "Terminal ID": "ignore",
      "Card Number": "cardNumber",
      "PAN": "cardNumber",
      "Card Type": "ignore",
      "Payment Method": "paymentType",
      "Invoice No": "ignore",
      "MID": "ignore",
      "Batch": "ignore",
      "RRN": "ignore",
      "Invoice No": "ignore",
      "Sequence No": "ignore",
      "STAN": "ignore"
    },
    columnLabels: {
      "Date": "Transaction Date (YYYY/MM/DD)",
      "Time": "Transaction Time",
      "Transaction Amount": "Amount (R currency format)",
      "Amount": "Amount (R currency format)",
      "Short Reference": "Short Reference Code",
      "UTI Short Reference": "Short Reference Code",
      "Merchant Name": "Merchant/Store Name",
      "MerchantName": "Merchant/Store Name",
      "Receipt No": "Receipt Number",
      "Terminal ID": "Terminal ID",
      "Card Number": "Masked Card Number",
      "PAN": "Masked Card Number",
      "Card Type": "Card Type (Visa, MC)",
      "Payment Method": "Payment Method"
    }
  },
  {
    name: "Fuel Master",
    description: "Fuel Master shift/sales export",
    category: "fuel",
    detectPattern: (headers) => {
      const normalized = headers.map((h) => h.toLowerCase().trim());
      const hasCrypticColumns = headers.some((h) => /^_\d+$/.test(h.trim()));
      const hasInvoice = normalized.includes("invoice");
      const hasShift = normalized.includes("shift");
      return hasCrypticColumns && hasInvoice || hasShift && hasInvoice;
    },
    mappings: {
      "_1": "date",
      // Date/Time combined
      "_2": "ignore",
      // Shift identifier
      "_3": "description",
      // Fuel type (DSL50, ULP95)
      "_4": "ignore",
      // Unit price
      "_5": "amount",
      // Total amount
      "Invoice": "reference",
      "Description": "ignore",
      // Actually contains quantity, not description
      "Shift": "paymentType",
      // Contains "Card" or other payment type
      "Card Number": "cardNumber",
      "Card No": "cardNumber",
      "CardNo": "cardNumber"
    },
    columnLabels: {
      "_1": "Date & Time (combined)",
      "_2": "Shift Number",
      "_3": "Fuel Type (DSL50, ULP95)",
      "_4": "Unit Price per Liter",
      "_5": "Total Amount",
      "Invoice": "Invoice Number",
      "Description": "Quantity (liters)",
      "Shift": "Payment Type (Card/Cash)",
      "Card Number": "Masked Card Number",
      "Card No": "Masked Card Number",
      "CardNo": "Masked Card Number"
    }
  },
  {
    name: "Standard Bank Digital",
    description: "Standard Bank / TotalEnergies merchant export",
    category: "bank",
    detectPattern: (headers) => {
      const normalized = headers.map((h) => h.toLowerCase().trim().replace(/\s+/g, " "));
      return normalized.includes("transaction amount") && normalized.includes("transaction date") && normalized.includes("batch id") && normalized.includes("card number");
    },
    mappings: {
      "Transaction  Date": "date",
      "Transaction  Time": "time",
      "Transaction  Amount": "amount",
      "Reference  Number": "reference",
      "Transaction  Type": "description",
      "Card  Number": "cardNumber",
      // Ignore the rest
      "Batch  ID": "ignore",
      "Card  Type": "ignore",
      "Merchant  Number": "ignore",
      "Reject  Code": "ignore",
      "Settlement  Date": "ignore",
      "Terminal  ID": "ignore",
      "Authorisation  Code": "ignore",
      "Batch  Sequence  Number": "ignore",
      "Cashback  Amount": "ignore",
      "Cashier  Number": "ignore",
      "GUID": "ignore",
      "Interchange  Rate": "ignore",
      "Item  Rate": "ignore",
      "Origin  ID": "ignore",
      "POS Entry  Mode": "ignore",
      "Record  Type": "ignore",
      "RRN": "ignore",
      "STAN": "ignore"
    },
    columnLabels: {
      "Transaction  Date": "Transaction Date (DD/MM/YYYY)",
      "Transaction  Time": "Transaction Time",
      "Transaction  Amount": "Transaction Amount",
      "Reference  Number": "Reference Number",
      "Transaction  Type": "Transaction Type",
      "Card  Number": "Card Number (masked)"
    }
  },
  {
    name: "Sale Master",
    description: "Sale Master fuel POS export (semicolon-delimited)",
    category: "fuel",
    detectPattern: (headers) => {
      const normalized = headers.map((h) => h.toLowerCase().trim());
      return normalized.includes("transdatetime") && normalized.includes("saletotal") && normalized.includes("invoicenumber");
    },
    mappings: {
      "transdatetime": "date",
      "TransTime": "time",
      "SaleTotal": "amount",
      "InvoiceNumber": "reference",
      "Description": "description",
      "PayType": "paymentType",
      "accnum": "cardNumber",
      // Ignore the rest
      "AutoInPumpDisplayNumber": "ignore",
      "branch": "ignore",
      "TransDate": "ignore",
      "unitname": "ignore",
      "shiftnumber": "ignore",
      "pump": "pump",
      "hose": "ignore",
      "PluCode": "ignore",
      "allgroups": "ignore",
      "subgroups": "ignore",
      "AttendantKey": "ignore",
      // internal key, not useful
      "AttendantMiniPOSKey": "ignore",
      "Attendant": "attendant",
      "Cashier": "cashier",
      "UnitCost": "ignore",
      "CostPrice": "ignore",
      "UnitVAT": "ignore",
      "UnitTotalCurr": "ignore",
      "VAT": "ignore",
      "TotalCurr": "ignore",
      "Selling": "ignore",
      "Quantity": "ignore",
      "WANPLU": "ignore",
      "MiniPOSCode": "ignore",
      "MiniPOSLineItemNumber": "ignore",
      "FuelSale": "ignore",
      "SaleType": "ignore",
      "Standalone": "ignore",
      "Debtor": "ignore",
      "accname": "ignore",
      "RegNum": "ignore",
      "OdoMeter": "ignore",
      "OrderNum": "ignore",
      "paytypedescription": "ignore",
      "AccountCode": "ignore",
      "MemoNumber": "ignore",
      "ManagerApproval": "ignore",
      "Updated": "ignore",
      "ExternalAccount": "ignore",
      "UniqueID": "ignore",
      "DriverName": "ignore",
      "PostCount": "ignore",
      "DayEndshiftnumber": "ignore",
      "RequestNum": "ignore",
      "FleetNum": "ignore",
      "vatnumber": "ignore",
      "TotaliserLiter": "ignore",
      "PreAuthNumber": "ignore",
      "salelineuniqueid": "ignore",
      "fuelsalekey": "ignore"
    },
    columnLabels: {
      "transdatetime": "Transaction Date & Time",
      "TransTime": "Transaction Time",
      "SaleTotal": "Sale Total Amount",
      "InvoiceNumber": "Invoice Number",
      "Description": "Product Description (fuel type)",
      "PayType": "Payment Type (Card/Cash)",
      "accnum": "Account/Card Number"
    }
  }
];
var DataNormalizer = class {
  // Format Excel serial date/time for display in preview
  // Converts "45901.63006944444" to "2025-09-01 15:07:18"
  static formatExcelSerialForDisplay(value) {
    if (value === null || value === void 0 || value === "") return "";
    const trimmed = String(value).trim();
    const serial = parseFloat(trimmed);
    if (!isNaN(serial) && serial > 4e4 && serial < 6e4) {
      const excelEpoch = new Date(1899, 11, 30);
      const wholeDays = Math.floor(serial);
      const date = new Date(excelEpoch.getTime() + wholeDays * 86400 * 1e3);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      const fractionalDay = serial - wholeDays;
      if (fractionalDay > 0) {
        const totalSeconds = Math.round(fractionalDay * 86400);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor(totalSeconds % 3600 / 60);
        const seconds = totalSeconds % 60;
        return `${year}-${month}-${day} ${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
      }
      return `${year}-${month}-${day}`;
    }
    return trimmed;
  }
  // Normalize preview rows: convert Excel serial dates to readable format
  static normalizePreviewRows(rows) {
    return rows.map((row) => {
      const normalizedRow = {};
      for (const [key, value] of Object.entries(row)) {
        normalizedRow[key] = this.formatExcelSerialForDisplay(value);
      }
      return normalizedRow;
    });
  }
  // Normalize ABSA amount: "R 1,337.20" → 1337.20
  static normalizeABSAAmount(value) {
    if (!value) return "0";
    let cleaned = String(value).trim();
    cleaned = cleaned.replace(/^R\s*/i, "");
    cleaned = cleaned.replace(/,/g, "");
    const isNegative = cleaned.startsWith("(") && cleaned.endsWith(")") || cleaned.startsWith("-") || cleaned.toLowerCase().includes("cr");
    cleaned = cleaned.replace(/[^0-9.]/g, "");
    return isNegative ? `-${cleaned}` : cleaned;
  }
  // Normalize FNB amount: "R100,00" → "100.00" (comma is decimal separator in SA format)
  static normalizeFNBAmount(value) {
    if (!value) return "0";
    let cleaned = String(value).trim();
    cleaned = cleaned.replace(/^R\s*/i, "");
    const isNegative = cleaned.startsWith("-") || cleaned.startsWith("(") && cleaned.endsWith(")");
    cleaned = cleaned.replace(/[()]/g, "");
    cleaned = cleaned.replace(/\s/g, "");
    if (/,\d{1,2}$/.test(cleaned) && !cleaned.includes(".")) {
      cleaned = cleaned.replace(",", ".");
    }
    cleaned = cleaned.replace(/[^0-9.]/g, "");
    if (!cleaned) return "0";
    return isNegative ? `-${cleaned}` : cleaned;
  }
  // Normalize FNB date: "27 Nov" → "2025-11-27" (uses provided year)
  static normalizeFNBDate(value, year = String((/* @__PURE__ */ new Date()).getFullYear())) {
    if (!value) return "";
    const trimmed = String(value).trim();
    const match = trimmed.match(/^(\d{1,2})\s+([A-Za-z]{3})/);
    if (match) {
      const day = match[1].padStart(2, "0");
      const monthStr = match[2];
      const months = {
        "jan": "01",
        "feb": "02",
        "mar": "03",
        "apr": "04",
        "may": "05",
        "jun": "06",
        "jul": "07",
        "aug": "08",
        "sep": "09",
        "oct": "10",
        "nov": "11",
        "dec": "12"
      };
      const month = months[monthStr.toLowerCase()];
      if (month) {
        return `${year}-${month}-${day}`;
      }
    }
    return trimmed;
  }
  // Normalize ABSA date: "2025/11/27" → "2025-11-27"
  static normalizeABSADate(value) {
    if (!value) return "";
    return String(value).trim().replace(/\//g, "-");
  }
  // Normalize Fuel Master datetime: extract date portion from datetime
  static normalizeFuelMasterDate(value) {
    if (!value) return "";
    const trimmed = String(value).trim();
    const dateMatch = trimmed.match(/^(\d{4}[-/]\d{2}[-/]\d{2})/);
    if (dateMatch) {
      return dateMatch[1].replace(/\//g, "-");
    }
    const serial = parseFloat(trimmed);
    if (!isNaN(serial) && serial > 4e4 && serial < 6e4) {
      const excelEpoch = new Date(1899, 11, 30);
      const wholeDays = Math.floor(serial);
      const date = new Date(excelEpoch.getTime() + wholeDays * 86400 * 1e3);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    }
    return trimmed;
  }
  // Extract time from Fuel Master datetime (Excel serial or HH:MM:SS format)
  static normalizeFuelMasterTime(value) {
    if (!value) return "";
    const trimmed = String(value).trim();
    const timeMatch = trimmed.match(/(\d{2}:\d{2}(:\d{2})?)/);
    if (timeMatch) {
      return timeMatch[1];
    }
    const serial = parseFloat(trimmed);
    if (!isNaN(serial) && serial > 4e4 && serial < 6e4) {
      const fractionalDay = serial - Math.floor(serial);
      const totalSeconds = Math.round(fractionalDay * 86400);
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor(totalSeconds % 3600 / 60);
      const seconds = totalSeconds % 60;
      return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    }
    return "";
  }
  // General amount normalization
  static normalizeAmount(value, sourceType, presetName) {
    if (!value) return "0";
    if (presetName === "FNB Merchant" || String(value).match(/^R\s*[\d\s]*,\d{2}$/) && !String(value).includes(".")) {
      return this.normalizeFNBAmount(value);
    }
    if (sourceType && sourceType.startsWith("bank") && String(value).includes("R")) {
      return this.normalizeABSAAmount(value);
    }
    let rawAmount = String(value).trim();
    const isNegative = rawAmount.startsWith("(") && rawAmount.endsWith(")") || rawAmount.startsWith("-") || rawAmount.endsWith("-") || rawAmount.toLowerCase().includes("cr");
    rawAmount = rawAmount.replace(/[R$€£,\s]/g, "");
    rawAmount = rawAmount.replace(/[^0-9.-]/g, "");
    if (!rawAmount || rawAmount === "-") return "0";
    return isNegative && !rawAmount.startsWith("-") ? `-${rawAmount}` : rawAmount;
  }
  // Check if a payment type processes through the card terminal (appears on bank statements)
  // Card, Debit, Credit, Visa, Mastercard = obvious card payments
  // Debtor/Account/Fleet = account sales that also process through the terminal
  static isCardPayment(value) {
    if (!value) return false;
    const lower = String(value).toLowerCase().trim();
    return lower === "card" || lower.includes("credit") || lower.includes("debit") || lower.includes("visa") || lower.includes("mastercard") || lower.includes("card") || lower.includes("debtor") || lower.includes("account") || lower.includes("fleet");
  }
  // Check if payment type is strictly cash (not processed through terminal)
  static isCashPayment(value) {
    if (!value) return false;
    const lower = String(value).toLowerCase().trim();
    return lower === "cash";
  }
  // Normalize card number to last 4 digits format for matching
  // Input can be: "****1234", "1234", "5412751234561234", "xxxx-xxxx-xxxx-1234"
  // Output: "1234" (last 4 digits only for comparison)
  static normalizeCardNumber(value) {
    if (!value) return "";
    const cleaned = String(value).trim();
    const digits = cleaned.replace(/\D/g, "");
    if (digits.length >= 4) {
      return digits.slice(-4);
    }
    if (digits.length > 0) {
      return digits;
    }
    return "";
  }
};
function findColumnValue(rawRow, candidates) {
  for (const col of candidates) {
    if (rawRow[col] != null && String(rawRow[col]).trim()) {
      return String(rawRow[col]).toLowerCase().trim();
    }
  }
  const lowerCandidates = candidates.map((c) => c.toLowerCase());
  for (const [key, value] of Object.entries(rawRow)) {
    if (lowerCandidates.includes(key.toLowerCase().trim()) && value != null && String(value).trim()) {
      return String(value).toLowerCase().trim();
    }
  }
  return "";
}
function findColumnRawValue(rawRow, candidates) {
  for (const col of candidates) {
    if (rawRow[col] != null && String(rawRow[col]).trim()) {
      return String(rawRow[col]).trim();
    }
  }
  const lowerCandidates = candidates.map((c) => c.toLowerCase());
  for (const [key, value] of Object.entries(rawRow)) {
    if (lowerCandidates.includes(key.toLowerCase().trim()) && value != null && String(value).trim()) {
      return String(value).trim();
    }
  }
  return "";
}
function detectBankTransactionStatus(rawRow, presetName) {
  const statusVal = findColumnValue(rawRow, [
    "Status",
    "Transaction Status",
    "Trans Status",
    "Result",
    "Response"
  ]);
  const txTypeVal = findColumnValue(rawRow, [
    "Transaction type",
    "Transaction Type",
    "Trans Type",
    "Type",
    "Transaction  Type"
    // Standard Bank double-space variant
  ]);
  if (presetName === "FNB Merchant") {
    if (statusVal === "approved") return "approved";
    if (statusVal === "declined") return "declined";
    if (statusVal === "reversed") return "reversed";
    if (txTypeVal.includes("revers") || txTypeVal.includes("refund")) return "reversed";
    const source = findColumnValue(rawRow, ["Source"]);
    if (source.includes("revers") || source.includes("refund")) return "reversed";
    const rawAmount = String(rawRow["Amount"] || "").toLowerCase();
    if (rawAmount.includes("clined") || rawAmount.includes("decline")) return "declined";
    if (rawAmount.includes("versed") || rawAmount.includes("reversal") || rawAmount.includes("reverse")) return "reversed";
    if (rawAmount.includes("cancel")) return "cancelled";
    if (rawAmount.includes("proved") || rawAmount.includes("approv")) return "approved";
    return "unknown";
  }
  if (presetName === "ABSA Merchant") {
    if (statusVal === "success") return "approved";
    if (statusVal === "declined") return "declined";
    if (statusVal === "cancelled" || statusVal === "canceled") return "cancelled";
    const msgType = findColumnRawValue(rawRow, ["Message Type", "MessageType", "Msg Type"]);
    if (msgType === "0420") return "reversed";
    if (txTypeVal.includes("revers") || txTypeVal.includes("refund")) return "reversed";
    return "unknown";
  }
  if (presetName === "Standard Bank Digital") {
    const rejectCode = findColumnRawValue(rawRow, ["Reject  Code", "Reject Code", "RejectCode"]);
    if (rejectCode && rejectCode !== "0" && rejectCode !== "00") return "declined";
    if (txTypeVal.includes("revers") || txTypeVal.includes("refund")) return "reversed";
    return "approved";
  }
  if (statusVal) {
    if (statusVal === "approved" || statusVal === "success") return "approved";
    if (statusVal === "declined" || statusVal === "rejected") return "declined";
    if (statusVal === "reversed" || statusVal.includes("reversal")) return "reversed";
    if (statusVal === "cancelled" || statusVal === "canceled") return "cancelled";
  }
  if (txTypeVal) {
    if (txTypeVal.includes("revers") || txTypeVal.includes("refund")) return "reversed";
  }
  const allValues = Object.values(rawRow).map((v) => String(v || "").toLowerCase());
  for (const val of allValues) {
    if (val === "reversed" || val.includes("reversal")) return "reversed";
    if (val === "declined" || val === "rejected") return "declined";
    if (val === "cancelled" || val === "canceled") return "cancelled";
  }
  return "unknown";
}
function detectAndExcludeReversals(transactions2, presetName) {
  const stats = {
    declined: 0,
    reversed: 0,
    cancelled: 0,
    pairedApprovals: 0,
    totalExcluded: 0
  };
  const statuses = transactions2.map(
    (tx) => detectBankTransactionStatus(tx.rawData || {}, presetName)
  );
  for (let i = 0; i < transactions2.length; i++) {
    const status = statuses[i];
    if (status === "declined") {
      transactions2[i].matchStatus = "excluded";
      transactions2[i].description = (transactions2[i].description || "") + " [Excluded: Declined]";
      stats.declined++;
      stats.totalExcluded++;
    } else if (status === "cancelled") {
      transactions2[i].matchStatus = "excluded";
      transactions2[i].description = (transactions2[i].description || "") + " [Excluded: Cancelled]";
      stats.cancelled++;
      stats.totalExcluded++;
    }
  }
  const approvedByKey = /* @__PURE__ */ new Map();
  for (let i = 0; i < transactions2.length; i++) {
    if (statuses[i] !== "approved" && statuses[i] !== "unknown") continue;
    if (transactions2[i].matchStatus === "excluded") continue;
    const amount = Math.abs(parseFloat(transactions2[i].amount || "0")).toFixed(2);
    const card = (transactions2[i].cardNumber || "").trim();
    const date = (transactions2[i].transactionDate || "").substring(0, 10);
    const key = `${date}_${amount}_${card}`;
    if (!approvedByKey.has(key)) approvedByKey.set(key, []);
    approvedByKey.get(key).push(i);
  }
  const consumedApprovals = /* @__PURE__ */ new Set();
  for (let i = 0; i < transactions2.length; i++) {
    if (statuses[i] !== "reversed") continue;
    const tx = transactions2[i];
    const amount = Math.abs(parseFloat(tx.amount || "0")).toFixed(2);
    const card = (tx.cardNumber || "").trim();
    const date = (tx.transactionDate || "").substring(0, 10);
    const key = `${date}_${amount}_${card}`;
    tx.matchStatus = "excluded";
    tx.description = (tx.description || "") + " [Excluded: Reversed]";
    stats.reversed++;
    stats.totalExcluded++;
    const candidates = approvedByKey.get(key) || [];
    const keyNoCard = `${date}_${amount}_`;
    const candidatesNoCard = card ? [] : approvedByKey.get(keyNoCard) || [];
    const allCandidates = [...candidates, ...candidatesNoCard];
    for (const idx of allCandidates) {
      if (consumedApprovals.has(idx)) continue;
      consumedApprovals.add(idx);
      transactions2[idx].matchStatus = "excluded";
      transactions2[idx].description = (transactions2[idx].description || "") + " [Excluded: Paired with reversal]";
      stats.pairedApprovals++;
      stats.totalExcluded++;
      break;
    }
  }
  const remainingByKey = /* @__PURE__ */ new Map();
  for (let i = 0; i < transactions2.length; i++) {
    if (transactions2[i].matchStatus === "excluded") continue;
    const rawAmount = parseFloat(transactions2[i].amount || "0");
    if (rawAmount >= 0) {
      const absAmount = rawAmount.toFixed(2);
      const card = (transactions2[i].cardNumber || "").trim();
      const date = (transactions2[i].transactionDate || "").substring(0, 10);
      const key = `${date}_${absAmount}_${card}`;
      if (!remainingByKey.has(key)) remainingByKey.set(key, []);
      remainingByKey.get(key).push(i);
    }
  }
  const consumedPositives = /* @__PURE__ */ new Set();
  for (let i = 0; i < transactions2.length; i++) {
    if (transactions2[i].matchStatus === "excluded") continue;
    const rawAmount = parseFloat(transactions2[i].amount || "0");
    if (rawAmount >= 0) continue;
    const absAmount = Math.abs(rawAmount).toFixed(2);
    const card = (transactions2[i].cardNumber || "").trim();
    const date = (transactions2[i].transactionDate || "").substring(0, 10);
    const key = `${date}_${absAmount}_${card}`;
    transactions2[i].matchStatus = "excluded";
    transactions2[i].description = (transactions2[i].description || "") + " [Excluded: Negative amount reversal]";
    stats.reversed++;
    stats.totalExcluded++;
    const positives = remainingByKey.get(key) || [];
    for (const idx of positives) {
      if (consumedPositives.has(idx) || transactions2[idx].matchStatus === "excluded") continue;
      consumedPositives.add(idx);
      transactions2[idx].matchStatus = "excluded";
      transactions2[idx].description = (transactions2[idx].description || "") + " [Excluded: Paired with negative reversal]";
      stats.pairedApprovals++;
      stats.totalExcluded++;
      break;
    }
  }
  return stats;
}
var FileParser = class {
  parseCSV(buffer) {
    const text2 = buffer.toString("utf-8");
    const firstLine = text2.split("\n")[0] || "";
    const tabCount = (firstLine.match(/\t/g) || []).length;
    const semicolonCount = (firstLine.match(/;/g) || []).length;
    const commaCount = (firstLine.match(/,/g) || []).length;
    let delimiter = tabCount > semicolonCount && tabCount > commaCount ? "	" : semicolonCount > commaCount ? ";" : ",";
    let result = Papa.parse(text2, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
      delimiter
    });
    let headers = result.meta.fields || [];
    if (headers.length <= 1 && delimiter !== "	") {
      const tabResult = Papa.parse(text2, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: false,
        delimiter: "	"
      });
      const tabHeaders = tabResult.meta.fields || [];
      if (tabHeaders.length > 1) {
        result = tabResult;
        headers = tabHeaders;
        delimiter = "	";
      }
    }
    if (headers.length <= 1) {
      console.log(`[PARSER] Only ${headers.length} column(s) detected with delimiter "${delimiter}", trying fixed-width parser`);
      const parsed = this.parseFixedWidth(text2);
      if (parsed && parsed.headers.length > 1) {
        console.log(`[PARSER] Fixed-width parser found ${parsed.headers.length} columns: ${parsed.headers.join(", ")}`);
        return parsed;
      }
      console.log(`[PARSER] Fixed-width parser also failed`);
    }
    const criticalErrors = result.errors.filter(
      (e) => e.type !== "FieldMismatch"
    );
    if (criticalErrors.length > 0) {
      throw new Error(`CSV parsing error: ${criticalErrors[0].message}`);
    }
    headers = result.meta.fields || [];
    const rows = result.data;
    return {
      headers,
      rows,
      rowCount: rows.length
    };
  }
  // Parse fixed-width or space-delimited text files (e.g., FNB .txt exports)
  // Uses known header patterns to identify column boundaries
  parseFixedWidth(text2) {
    const lines = text2.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) return null;
    const headerLine = lines[0];
    console.log(`[PARSER] Fixed-width: header line = "${headerLine.substring(0, 120)}..."`);
    let headerParts = headerLine.split(/\s{2,}/).map((h) => h.trim()).filter(Boolean);
    let columnStarts = [];
    if (headerParts.length >= 2) {
      let searchFrom = 0;
      for (const part of headerParts) {
        const idx = headerLine.indexOf(part, searchFrom);
        columnStarts.push(idx);
        searchFrom = idx + part.length;
      }
    }
    if (headerParts.length < 2) {
      const knownHeaders = [
        "Transaction date",
        "Transaction Date",
        "Transaction time",
        "Transaction Time",
        "Transaction type",
        "Transaction Type",
        "Transaction amount",
        "Transaction Amount",
        "Terminal ID",
        "Card Number",
        "Card number",
        "Reference Number",
        "Reference number",
        "PAN",
        "Source",
        "Amount",
        "Date",
        "Time",
        "Description",
        "Type"
      ];
      const found = [];
      const headerLower = headerLine;
      for (const kh of knownHeaders) {
        let searchPos = 0;
        while (true) {
          const idx = headerLower.indexOf(kh, searchPos);
          if (idx === -1) break;
          const alreadyMatched = found.some(
            (f) => idx >= f.start && idx < f.start + f.name.length
          );
          if (!alreadyMatched) {
            found.push({ name: kh, start: idx });
          }
          searchPos = idx + 1;
        }
      }
      if (found.length < 2) return null;
      found.sort((a, b) => a.start - b.start);
      headerParts = found.map((f) => f.name);
      columnStarts = found.map((f) => f.start);
      console.log(`[PARSER] Fixed-width: matched ${found.length} known headers: ${headerParts.join(", ")}`);
    }
    if (headerParts.length < 2 || columnStarts.length < 2) return null;
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;
      const row = {};
      for (let c = 0; c < headerParts.length; c++) {
        const start = columnStarts[c];
        const end = c < headerParts.length - 1 ? columnStarts[c + 1] : line.length;
        row[headerParts[c]] = line.substring(start, end).trim();
      }
      rows.push(row);
    }
    return {
      headers: headerParts,
      rows,
      rowCount: rows.length
    };
  }
  parseExcel(buffer) {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      throw new Error("Excel file has no sheets");
    }
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      defval: ""
    });
    if (data.length === 0) {
      throw new Error("Excel file is empty");
    }
    let headers = data[0].map((h) => String(h).trim());
    if (headers.length === 1 && headers[0].includes(";")) {
      headers = headers[0].split(";").map((h) => h.trim());
      const rows2 = data.slice(1).map((row) => {
        const cellValue = String(row[0] || "");
        const values = cellValue.split(";");
        const obj = {};
        headers.forEach((header, index2) => {
          obj[header] = values[index2] !== void 0 ? values[index2].trim() : "";
        });
        return obj;
      });
      return { headers, rows: rows2, rowCount: rows2.length };
    }
    const rows = data.slice(1).map((row) => {
      const obj = {};
      headers.forEach((header, index2) => {
        obj[header] = row[index2] !== void 0 ? String(row[index2]).trim() : "";
      });
      return obj;
    });
    return {
      headers,
      rows,
      rowCount: rows.length
    };
  }
  async parsePDF(buffer) {
    const pdfExtract = new PDFExtract();
    const data = await pdfExtract.extractBuffer(buffer, {});
    if (!data.pages || data.pages.length === 0) {
      throw new Error("PDF file is empty or unreadable");
    }
    const allTextItems = [];
    for (const page of data.pages) {
      if (page.content) {
        for (const item of page.content) {
          if (item.str && item.str.trim()) {
            allTextItems.push({
              text: item.str.trim(),
              x: item.x,
              y: item.y,
              width: item.width
            });
          }
        }
      }
    }
    if (allTextItems.length === 0) {
      throw new Error("No text found in PDF");
    }
    const rowsByY = /* @__PURE__ */ new Map();
    const yTolerance = 3;
    for (const item of allTextItems) {
      let foundRow = false;
      const entries = Array.from(rowsByY.entries());
      for (const [existingY, items] of entries) {
        if (Math.abs(existingY - item.y) < yTolerance) {
          items.push({ text: item.text, x: item.x, width: item.width });
          foundRow = true;
          break;
        }
      }
      if (!foundRow) {
        rowsByY.set(item.y, [{ text: item.text, x: item.x, width: item.width }]);
      }
    }
    const sortedRowsWithCoords = Array.from(rowsByY.entries()).sort((a, b) => a[0] - b[0]).map(([_, items]) => items.sort((a, b) => a.x - b.x));
    if (sortedRowsWithCoords.length < 1) {
      throw new Error("No data rows detected in PDF");
    }
    const allXPositions = /* @__PURE__ */ new Set();
    for (const row of sortedRowsWithCoords.slice(0, Math.min(10, sortedRowsWithCoords.length))) {
      for (const item of row) {
        allXPositions.add(Math.round(item.x));
      }
    }
    const sortedXPositions = Array.from(allXPositions).sort((a, b) => a - b);
    const columnXRanges = [];
    let currentGroup = [];
    const xGapThreshold = 15;
    for (let i = 0; i < sortedXPositions.length; i++) {
      if (currentGroup.length === 0) {
        currentGroup.push(sortedXPositions[i]);
      } else {
        const lastX = currentGroup[currentGroup.length - 1];
        if (sortedXPositions[i] - lastX <= xGapThreshold) {
          currentGroup.push(sortedXPositions[i]);
        } else {
          columnXRanges.push({
            min: Math.min(...currentGroup),
            max: Math.max(...currentGroup),
            index: columnXRanges.length
          });
          currentGroup = [sortedXPositions[i]];
        }
      }
    }
    if (currentGroup.length > 0) {
      columnXRanges.push({
        min: Math.min(...currentGroup),
        max: Math.max(...currentGroup),
        index: columnXRanges.length
      });
    }
    function getColumnIndex(x) {
      for (const range of columnXRanges) {
        if (x >= range.min - 5 && x <= range.max + 5) {
          return range.index;
        }
      }
      for (let i = 0; i < columnXRanges.length - 1; i++) {
        if (x > columnXRanges[i].max && x < columnXRanges[i + 1].min) {
          const distToLeft = x - columnXRanges[i].max;
          const distToRight = columnXRanges[i + 1].min - x;
          return distToLeft < distToRight ? i : i + 1;
        }
      }
      return columnXRanges.length - 1;
    }
    const numColumns = columnXRanges.length;
    const structuredRows = [];
    for (const rowItems of sortedRowsWithCoords) {
      const row = new Array(numColumns).fill("");
      for (const item of rowItems) {
        const colIndex = getColumnIndex(Math.round(item.x));
        if (row[colIndex]) {
          row[colIndex] += " " + item.text;
        } else {
          row[colIndex] = item.text;
        }
      }
      structuredRows.push(row);
    }
    if (structuredRows.length === 0) {
      throw new Error("No table structure detected in PDF");
    }
    const headers = structuredRows[0].map((h, i) => h || `Column ${i + 1}`);
    const dataRows = structuredRows.slice(1);
    const rows = dataRows.map((row) => {
      const obj = {};
      headers.forEach((header, index2) => {
        obj[header] = (row[index2] || "").trim();
      });
      return obj;
    });
    return {
      headers,
      rows,
      rowCount: rows.length
    };
  }
  async parse(buffer, fileType) {
    if (fileType === "csv" || fileType === "text/csv") {
      return this.parseCSV(buffer);
    } else if (fileType === "xlsx" || fileType === "xls" || fileType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" || fileType === "application/vnd.ms-excel") {
      return this.parseExcel(buffer);
    } else if (fileType === "pdf" || fileType === "application/pdf") {
      return await this.parsePDF(buffer);
    } else {
      throw new Error(`Unsupported file type: ${fileType}`);
    }
  }
  // Detect which source preset matches the headers
  detectSourcePreset(headers) {
    for (const preset of SOURCE_PRESETS) {
      if (preset.detectPattern(headers)) {
        return preset;
      }
    }
    return null;
  }
  autoDetectColumns(headers) {
    const mappings = [];
    const usedFields = /* @__PURE__ */ new Set();
    const detectedPreset = this.detectSourcePreset(headers);
    if (detectedPreset) {
      for (const header of headers) {
        const presetMapping = detectedPreset.mappings[header];
        if (presetMapping && presetMapping !== "ignore") {
          if (usedFields.has(presetMapping)) {
            mappings.push({
              detectedColumn: header,
              suggestedMapping: "ignore",
              confidence: 0
            });
          } else {
            usedFields.add(presetMapping);
            mappings.push({
              detectedColumn: header,
              suggestedMapping: presetMapping,
              confidence: 1
            });
          }
        } else if (presetMapping === "ignore") {
          mappings.push({
            detectedColumn: header,
            suggestedMapping: "ignore",
            confidence: 1
          });
        } else {
          const detected = this.detectColumnGeneric(header);
          if (detected.suggestedMapping !== "ignore" && usedFields.has(detected.suggestedMapping)) {
            mappings.push({
              detectedColumn: header,
              suggestedMapping: "ignore",
              confidence: 0
            });
          } else {
            if (detected.suggestedMapping !== "ignore") {
              usedFields.add(detected.suggestedMapping);
            }
            mappings.push(detected);
          }
        }
      }
      return mappings;
    }
    for (const header of headers) {
      const detected = this.detectColumnGeneric(header);
      if (detected.suggestedMapping !== "ignore" && usedFields.has(detected.suggestedMapping)) {
        mappings.push({
          detectedColumn: header,
          suggestedMapping: "ignore",
          confidence: 0
        });
      } else {
        if (detected.suggestedMapping !== "ignore") {
          usedFields.add(detected.suggestedMapping);
        }
        mappings.push(detected);
      }
    }
    return mappings;
  }
  // Generic column detection based on column name patterns
  detectColumnGeneric(header) {
    const normalized = header.toLowerCase().trim().replace(/\s+/g, " ");
    let suggestedMapping = "ignore";
    let confidence = 0;
    if (normalized.includes("date") || normalized.includes("transaction date") || normalized.includes("posted") || normalized === "dt" || normalized === "_1") {
      suggestedMapping = "date";
      confidence = normalized === "date" || normalized === "transaction date" ? 1 : 0.8;
    } else if (normalized === "time" || normalized.includes("time") && !normalized.includes("date")) {
      suggestedMapping = "time";
      confidence = normalized === "time" ? 1 : 0.7;
    } else if (
      // Only map specific amount columns - not all columns containing "amount"
      normalized === "amount" || normalized === "transaction amount" || normalized === "gross amount" || normalized === "original amount" || normalized === "amt" || normalized === "_5"
    ) {
      suggestedMapping = "amount";
      confidence = normalized === "amount" || normalized === "transaction amount" ? 1 : 0.9;
    } else if (normalized.includes("reference") || normalized.includes("ref") || normalized.includes("transaction id") || normalized === "invoice" || normalized.includes("short reference") || normalized.includes("terminal id") || normalized.includes("receipt")) {
      suggestedMapping = "reference";
      confidence = normalized === "reference" || normalized === "invoice" ? 1 : 0.7;
    } else if (
      // Card number detection - check BEFORE description to avoid conflicts
      normalized === "pan" || normalized.includes("pan") || normalized === "card number" || normalized === "card no" || normalized === "cardno" || normalized.includes("card num") || normalized.includes("card #") || normalized.includes("masked") || normalized.includes("card pan") || normalized === "payment identifier" || normalized.includes("payment id")
    ) {
      suggestedMapping = "cardNumber";
      confidence = normalized === "pan" || normalized === "card number" || normalized === "payment identifier" ? 1 : 0.9;
    } else if (normalized.includes("description") || normalized.includes("desc") || normalized.includes("memo") || normalized.includes("details") || normalized.includes("merchant") || normalized.includes("vendor") || normalized === "_3") {
      suggestedMapping = "description";
      confidence = normalized === "description" ? 1 : 0.8;
    } else if (normalized === "shift" || normalized.includes("payment method") || normalized.includes("payment type") || normalized.includes("card type") || normalized.includes("transaction type")) {
      suggestedMapping = "paymentType";
      confidence = 0.9;
    }
    return {
      detectedColumn: header,
      suggestedMapping,
      confidence
    };
  }
  // Get human-readable label for a column based on detected preset
  getColumnLabel(header, headers) {
    const preset = this.detectSourcePreset(headers);
    if (preset && preset.columnLabels[header]) {
      return preset.columnLabels[header];
    }
    return header;
  }
  extractTransactionData(row, columnMapping, headers, sourceType) {
    let transactionDate = "";
    let transactionTime = "";
    let amount = "";
    let referenceNumber = "";
    let description = "";
    let cardNumber = "";
    let paymentType = "";
    let isCardTransaction = "unknown";
    let attendant = "";
    let cashier = "";
    let pump = "";
    const preset = this.detectSourcePreset(headers);
    const processedFields = /* @__PURE__ */ new Set();
    for (const [column, mapping] of Object.entries(columnMapping)) {
      if (mapping === "ignore") continue;
      if (processedFields.has(mapping)) {
        continue;
      }
      const value = row[column] || "";
      switch (mapping) {
        case "date":
          const rawDate = String(value).trim();
          if (!rawDate) break;
          if (preset?.name === "FNB Merchant") {
            const normalizedDate = DataNormalizer.normalizeFNBDate(rawDate);
            if (normalizedDate) {
              transactionDate = normalizedDate;
              processedFields.add("date");
            }
            if (!transactionTime) {
              const timeMatch = rawDate.match(/(\d{1,2}:\d{2}(:\d{2})?)/);
              if (timeMatch) {
                transactionTime = timeMatch[1];
              }
            }
          } else if (preset?.name === "ABSA Merchant") {
            const normalizedDate = DataNormalizer.normalizeABSADate(rawDate);
            if (normalizedDate) {
              transactionDate = normalizedDate;
              processedFields.add("date");
            }
          } else if (preset?.name === "Standard Bank Digital") {
            const parts = rawDate.split("/");
            if (parts.length === 3) {
              transactionDate = `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
              processedFields.add("date");
            } else {
              transactionDate = rawDate;
              processedFields.add("date");
            }
          } else if (preset?.name === "Sale Master") {
            const spaceIdx = rawDate.indexOf(" ");
            if (spaceIdx > 0) {
              transactionDate = rawDate.substring(0, spaceIdx);
              processedFields.add("date");
              if (!transactionTime) {
                transactionTime = rawDate.substring(spaceIdx + 1).trim();
              }
            } else {
              transactionDate = rawDate;
              processedFields.add("date");
            }
          } else if (preset?.name === "Fuel Master") {
            const normalizedDate = DataNormalizer.normalizeFuelMasterDate(rawDate);
            if (normalizedDate) {
              transactionDate = normalizedDate;
              processedFields.add("date");
            }
            if (!transactionTime) {
              transactionTime = DataNormalizer.normalizeFuelMasterTime(rawDate);
            }
          } else {
            const serial = parseFloat(rawDate);
            if (!isNaN(serial) && serial > 4e4 && serial < 6e4) {
              const normalizedDate = DataNormalizer.normalizeFuelMasterDate(rawDate);
              if (normalizedDate) {
                transactionDate = normalizedDate;
                processedFields.add("date");
              }
              if (!transactionTime) {
                transactionTime = DataNormalizer.normalizeFuelMasterTime(rawDate);
              }
            } else if (rawDate) {
              transactionDate = rawDate;
              processedFields.add("date");
            }
          }
          break;
        case "time":
          const timeVal = String(value).trim();
          if (timeVal) {
            transactionTime = timeVal;
            processedFields.add("time");
          }
          break;
        case "amount":
          const amtVal = DataNormalizer.normalizeAmount(String(value), sourceType, preset?.name);
          if (amtVal) {
            amount = amtVal;
            processedFields.add("amount");
          }
          break;
        case "reference":
          const refVal = String(value).trim();
          if (refVal) {
            referenceNumber = refVal;
            processedFields.add("reference");
          }
          break;
        case "description":
          const descVal = String(value).trim();
          if (descVal) {
            description = descVal;
            processedFields.add("description");
          }
          break;
        case "cardNumber":
          const cardVal = DataNormalizer.normalizeCardNumber(String(value));
          if (cardVal) {
            cardNumber = cardVal;
            processedFields.add("cardNumber");
          }
          break;
        case "paymentType":
          const ptVal = String(value).trim();
          if (ptVal) {
            paymentType = ptVal;
            processedFields.add("paymentType");
            if (DataNormalizer.isCardPayment(paymentType)) {
              isCardTransaction = "yes";
            } else {
              isCardTransaction = "no";
            }
          }
          break;
        case "attendant":
          const attVal = String(value).trim();
          if (attVal) {
            attendant = attVal;
            processedFields.add("attendant");
          }
          break;
        case "cashier":
          const cashVal = String(value).trim();
          if (cashVal) {
            cashier = cashVal;
            processedFields.add("cashier");
          }
          break;
        case "pump":
          const pumpVal = String(value).trim();
          if (pumpVal) {
            pump = pumpVal;
            processedFields.add("pump");
          }
          break;
      }
    }
    if (sourceType && sourceType.startsWith("bank")) {
      isCardTransaction = "yes";
    }
    return {
      transactionDate,
      transactionTime,
      amount,
      referenceNumber,
      description,
      cardNumber,
      paymentType,
      isCardTransaction,
      attendant,
      cashier,
      pump
    };
  }
  /**
   * Validates if a transaction row is valid or should be skipped.
   * Returns { valid: true } or { valid: false, reason: string }
   */
  isValidTransactionRow(extracted, rawRow, columnMapping) {
    const dateColumns = Object.entries(columnMapping).filter(([_, mapping]) => mapping === "date").map(([col, _]) => col);
    for (const col of dateColumns) {
      const rawValue = String(rawRow[col] || "").trim();
      if (rawValue.toLowerCase() === col.toLowerCase()) {
        return { valid: false, reason: "header_row" };
      }
      if (["date", "date / time", "date/time", "transaction date", "trans date"].includes(rawValue.toLowerCase())) {
        return { valid: false, reason: "header_row" };
      }
    }
    if (!extracted.transactionDate || extracted.transactionDate.trim() === "") {
      return { valid: false, reason: "empty_date" };
    }
    const amountNum = parseFloat(extracted.amount);
    if (isNaN(amountNum) || amountNum === 0) {
      return { valid: false, reason: "zero_or_invalid_amount" };
    }
    for (const value of Object.values(rawRow)) {
      const strValue = String(value || "").trim();
      if (/^Page\s+\d+/i.test(strValue)) {
        return { valid: false, reason: "page_break" };
      }
    }
    const headerPatterns = ["qty", "cost", "shift", "total", "account", "invoice", "description", "amount"];
    const keyValues = [extracted.description, extracted.referenceNumber].filter((v) => v);
    const allLookLikeHeaders = keyValues.length > 0 && keyValues.every(
      (v) => headerPatterns.includes(v.toLowerCase())
    );
    if (allLookLikeHeaders && keyValues.length >= 2) {
      return { valid: false, reason: "header_row" };
    }
    return { valid: true };
  }
};
var fileParser = new FileParser();

// server/dataQualityValidator.ts
var DataQualityValidator = class {
  datePatterns = [
    /^\d{4}[-/]\d{2}[-/]\d{2}$/,
    /^\d{2}[-/]\d{2}[-/]\d{4}$/,
    /^\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i,
    /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}/i,
    /^\d{5,}(\.\d+)?$/
    // Excel serial date
  ];
  timePatterns = [
    /^\d{2}:\d{2}(:\d{2})?$/,
    /^\d{1,2}:\d{2}\s*(AM|PM)?$/i
  ];
  amountPatterns = [
    /^-?R?\s*[\d,]+\.?\d*$/,
    /^-?\$?\s*[\d,]+\.?\d*$/,
    /^\([\d,]+\.?\d*\)$/,
    // Negative in parentheses
    /^-?[\d,]+\.?\d*\s*(CR|DR)?$/i
  ];
  cardNumberPatterns = [
    /^\*{4}\d{4}$/,
    /^x{4}[-\s]?x{4}[-\s]?x{4}[-\s]?\d{4}$/i,
    /^\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}$/,
    /^\d{16}$/,
    /^\d{4}$/
  ];
  headerLikePatterns = [
    /^(date|time|amount|description|reference|invoice|shift|card|pan|terminal|transaction|type|receipt|total|quantity|price|unit|fuel|diesel|petrol|payment)$/i
  ];
  pageBreakPatterns = [
    /^page\s*\d+/i,
    /^\d+\s*of\s*\d+/i,
    /^generated|^printed|^report/i,
    /^-{3,}$/,
    /^={3,}$/,
    /^total[:\s]/i,
    /^subtotal/i,
    /^grand total/i
  ];
  /**
   * Validate parsed file data and generate quality report
   */
  validate(parsedData, sourceType, sourceName) {
    const issues = [];
    const rowsToRemove = [];
    const columnAnalysis = this.analyzeColumns(parsedData);
    const detectedPreset = this.detectPreset(parsedData.headers);
    const shiftResult = this.detectColumnShift(parsedData, columnAnalysis, detectedPreset);
    if (shiftResult.detected) {
      issues.push({
        type: "COLUMN_SHIFT",
        severity: "CRITICAL",
        message: `Data appears to be shifted from expected columns. ${shiftResult.description}`,
        details: shiftResult.details,
        suggestedFix: "Use the suggested column mapping to correct the data alignment."
      });
    }
    const repeatedHeaders = this.detectRepeatedHeaders(parsedData);
    if (repeatedHeaders.rows.length > 0) {
      rowsToRemove.push(...repeatedHeaders.rows);
      issues.push({
        type: "REPEATED_HEADERS",
        severity: "WARNING",
        message: `Found ${repeatedHeaders.rows.length} rows that appear to be repeated header rows`,
        details: { rows: repeatedHeaders.rows, samples: repeatedHeaders.samples },
        affectedRows: repeatedHeaders.rows,
        suggestedFix: "These rows will be excluded from processing."
      });
    }
    const pageBreaks = this.detectPageBreakRows(parsedData);
    if (pageBreaks.rows.length > 0) {
      rowsToRemove.push(...pageBreaks.rows);
      issues.push({
        type: "PAGE_BREAK_ROWS",
        severity: "WARNING",
        message: `Found ${pageBreaks.rows.length} rows that appear to be page breaks or report metadata`,
        details: { rows: pageBreaks.rows, samples: pageBreaks.samples },
        affectedRows: pageBreaks.rows,
        suggestedFix: "These rows will be excluded from processing."
      });
    }
    const emptyColumns = this.detectEmptyColumns(columnAnalysis);
    if (emptyColumns.length > 0) {
      issues.push({
        type: "EMPTY_COLUMN",
        severity: "INFO",
        message: `Found ${emptyColumns.length} empty or mostly empty columns`,
        details: { columns: emptyColumns },
        suggestedFix: "These columns can be ignored during mapping."
      });
    }
    const typeMismatches = this.detectTypeMismatches(parsedData, columnAnalysis, detectedPreset);
    for (const mismatch of typeMismatches) {
      issues.push({
        type: "DATA_TYPE_MISMATCH",
        severity: "WARNING",
        message: mismatch.message,
        details: mismatch.details,
        affectedRows: mismatch.affectedRows,
        suggestedFix: mismatch.suggestedFix
      });
    }
    const missingData = this.detectMissingRequiredData(parsedData, columnAnalysis, sourceType, detectedPreset);
    if (missingData.issues.length > 0) {
      issues.push(...missingData.issues);
    }
    const suggestedMapping = this.generateSuggestedMapping(parsedData, columnAnalysis, detectedPreset);
    const uniqueRowsToRemove = Array.from(new Set(rowsToRemove)).sort((a, b) => a - b);
    const problematicRows = uniqueRowsToRemove.length;
    const cleanRows = parsedData.rowCount - problematicRows;
    return {
      hasIssues: issues.length > 0,
      hasCriticalIssues: issues.some((i) => i.severity === "CRITICAL"),
      totalRows: parsedData.rowCount,
      cleanRows,
      problematicRows,
      issues,
      columnAnalysis,
      suggestedColumnMapping: suggestedMapping,
      rowsToRemove: uniqueRowsToRemove,
      columnShiftDetected: shiftResult.detected,
      shiftDetails: shiftResult.detected ? {
        expectedColumn: shiftResult.details.problems?.[0] ?? "",
        actualDataType: shiftResult.details.mappingIssues ? JSON.stringify(Object.keys(shiftResult.details.mappingIssues)) : "",
        examples: shiftResult.details.problems?.slice(0, 3) ?? []
      } : void 0,
      detectedPreset: detectedPreset?.name
    };
  }
  /**
   * Analyze each column to infer data types and patterns
   */
  analyzeColumns(parsedData) {
    const analysis = [];
    for (let i = 0; i < parsedData.headers.length; i++) {
      const header = parsedData.headers[i];
      const values = parsedData.rows.map((row) => String(row[header] ?? "").trim());
      const nonEmptyValues = values.filter((v) => v !== "");
      const uniqueValues = new Set(nonEmptyValues);
      const sampleValues = nonEmptyValues.slice(0, 5);
      let dateCount = 0;
      let timeCount = 0;
      let amountCount = 0;
      let cardCount = 0;
      let headerLikeCount = 0;
      let pageLikeCount = 0;
      for (const value of nonEmptyValues) {
        if (this.matchesPatterns(value, this.datePatterns)) dateCount++;
        if (this.matchesPatterns(value, this.timePatterns)) timeCount++;
        if (this.matchesPatterns(value, this.amountPatterns)) amountCount++;
        if (this.matchesPatterns(value, this.cardNumberPatterns)) cardCount++;
        if (this.matchesPatterns(value, this.headerLikePatterns)) headerLikeCount++;
        if (this.matchesPatterns(value, this.pageBreakPatterns)) pageLikeCount++;
      }
      const total = nonEmptyValues.length || 1;
      let inferredType = "text";
      if (total === 0) {
        inferredType = "empty";
      } else if (dateCount / total > 0.7) {
        if (nonEmptyValues.some((v) => v.includes(":") || parseFloat(v) > 4e4 && v.includes("."))) {
          inferredType = "datetime";
        } else {
          inferredType = "date";
        }
      } else if (timeCount / total > 0.7) {
        inferredType = "time";
      } else if (amountCount / total > 0.7) {
        inferredType = "amount";
      } else if (cardCount / total > 0.5) {
        inferredType = "cardNumber";
      } else if (amountCount / total > 0.3 && dateCount / total > 0.3) {
        inferredType = "mixed";
      }
      analysis.push({
        columnName: header,
        columnIndex: i,
        inferredType,
        nullCount: values.filter((v) => v === "").length,
        nonNullCount: nonEmptyValues.length,
        uniqueValues: uniqueValues.size,
        sampleValues,
        headerLikeValues: headerLikeCount,
        pageLikeValues: pageLikeCount,
        hasDatePattern: dateCount > 0,
        hasAmountPattern: amountCount > 0,
        hasCardPattern: cardCount > 0
      });
    }
    return analysis;
  }
  /**
   * Detect if column data is shifted from expected positions
   */
  detectColumnShift(parsedData, columnAnalysis, preset) {
    const result = { detected: false, description: "", details: {} };
    if (!preset) return result;
    const problems = [];
    const mappingIssues = {};
    for (const [columnName, expectedType] of Object.entries(preset.mappings)) {
      if (expectedType === "ignore") continue;
      const colAnalysis = columnAnalysis.find((c) => c.columnName === columnName);
      if (!colAnalysis) continue;
      const isMatch = this.typeMatchesExpected(colAnalysis.inferredType, expectedType);
      if (!isMatch && colAnalysis.nonNullCount > 0) {
        problems.push(`Column "${columnName}" expected to contain ${expectedType} but contains ${colAnalysis.inferredType}`);
        mappingIssues[columnName] = {
          expected: expectedType,
          actual: colAnalysis.inferredType,
          examples: colAnalysis.sampleValues
        };
      }
    }
    if (problems.length >= 2) {
      result.detected = true;
      result.description = `Multiple columns have unexpected data types: ${problems.slice(0, 3).join("; ")}`;
      result.details = {
        problems,
        mappingIssues,
        presetName: preset.name
      };
    }
    return result;
  }
  /**
   * Detect rows that look like repeated headers
   */
  detectRepeatedHeaders(parsedData) {
    const headerSet = new Set(parsedData.headers.map((h) => h.toLowerCase().trim()));
    const repeatedRows = [];
    const samples = [];
    parsedData.rows.forEach((row, index2) => {
      const values = Object.values(row).map((v) => String(v ?? "").toLowerCase().trim());
      const matchCount = values.filter((v) => headerSet.has(v)).length;
      if (matchCount >= Math.min(3, parsedData.headers.length / 2)) {
        repeatedRows.push(index2);
        if (samples.length < 3) samples.push(row);
      }
    });
    return { rows: repeatedRows, samples };
  }
  /**
   * Detect page break, total, and other junk rows
   */
  detectPageBreakRows(parsedData) {
    const pageBreakRows = [];
    const samples = [];
    parsedData.rows.forEach((row, index2) => {
      const values = Object.values(row).map((v) => String(v ?? "").trim()).filter((v) => v);
      const isPageBreak = values.some((v) => this.matchesPatterns(v, this.pageBreakPatterns));
      const isMostlyEmpty = values.length < 2 && parsedData.headers.length > 3;
      const isTotalRow = values.some((v) => /^(sub)?total\s*:?$/i.test(v));
      if (isPageBreak || isMostlyEmpty || isTotalRow) {
        pageBreakRows.push(index2);
        if (samples.length < 3) samples.push(row);
      }
    });
    return { rows: pageBreakRows, samples };
  }
  /**
   * Detect columns that are empty or mostly empty
   */
  detectEmptyColumns(columnAnalysis) {
    return columnAnalysis.filter((col) => col.inferredType === "empty" || col.nullCount / (col.nullCount + col.nonNullCount) > 0.9).map((col) => col.columnName);
  }
  /**
   * Detect type mismatches in data
   */
  detectTypeMismatches(parsedData, columnAnalysis, preset) {
    const mismatches = [];
    const amountColumns = columnAnalysis.filter(
      (c) => c.inferredType === "amount" || c.columnName.toLowerCase().includes("amount") || preset?.mappings[c.columnName] === "amount"
    );
    for (const col of amountColumns) {
      const badRows = [];
      parsedData.rows.forEach((row, index2) => {
        const value = String(row[col.columnName] ?? "").trim();
        if (value && !this.matchesPatterns(value, this.amountPatterns) && !/^[\d.-]+$/.test(value.replace(/[R$,\s]/g, ""))) {
          badRows.push(index2);
        }
      });
      if (badRows.length > 0 && badRows.length < parsedData.rowCount * 0.3) {
        mismatches.push({
          message: `Column "${col.columnName}" contains ${badRows.length} non-numeric values`,
          details: {
            column: col.columnName,
            badRowCount: badRows.length,
            sampleBadValues: badRows.slice(0, 3).map((i) => parsedData.rows[i][col.columnName])
          },
          affectedRows: badRows.slice(0, 10),
          suggestedFix: "Review these rows for data entry errors or adjust column mapping."
        });
      }
    }
    return mismatches;
  }
  /**
   * Detect missing required data
   */
  detectMissingRequiredData(parsedData, columnAnalysis, sourceType, detectedPreset) {
    const issues = [];
    const hasDateColumn = columnAnalysis.some(
      (c) => c.inferredType === "date" || c.inferredType === "datetime"
    );
    if (!hasDateColumn && !detectedPreset) {
      issues.push({
        type: "MISSING_REQUIRED_DATA",
        severity: "CRITICAL",
        message: "No date column detected in the file",
        details: {
          requiredField: "date",
          hint: "Check if dates are formatted unusually or in a merged column"
        },
        suggestedFix: "Manually map the correct column to the date field."
      });
    }
    const hasAmountColumn = columnAnalysis.some((c) => c.inferredType === "amount");
    if (!hasAmountColumn && !detectedPreset) {
      issues.push({
        type: "MISSING_REQUIRED_DATA",
        severity: "CRITICAL",
        message: "No amount column detected in the file",
        details: {
          requiredField: "amount",
          hint: "Check if amounts include currency symbols or unusual formatting"
        },
        suggestedFix: "Manually map the correct column to the amount field."
      });
    }
    return { issues };
  }
  /**
   * Generate suggested column mapping based on analysis
   */
  generateSuggestedMapping(parsedData, columnAnalysis, preset) {
    const mapping = {};
    if (preset) {
      for (const [columnName, fieldType] of Object.entries(preset.mappings)) {
        if (fieldType !== "ignore" && parsedData.headers.includes(columnName)) {
          mapping[fieldType] = columnName;
        }
      }
    }
    const fieldPriority = [
      { field: "date", types: ["date", "datetime"] },
      { field: "time", types: ["time"] },
      { field: "amount", types: ["amount"] },
      { field: "cardNumber", types: ["cardNumber"] }
    ];
    for (const { field, types } of fieldPriority) {
      if (!mapping[field]) {
        const candidate = columnAnalysis.find(
          (c) => types.includes(c.inferredType) && !Object.values(mapping).includes(c.columnName)
        );
        if (candidate) {
          mapping[field] = candidate.columnName;
        }
      }
    }
    if (!mapping["reference"]) {
      const refColumn = columnAnalysis.find(
        (c) => /invoice|ref|reference|receipt/i.test(c.columnName) && !Object.values(mapping).includes(c.columnName)
      );
      if (refColumn) {
        mapping["reference"] = refColumn.columnName;
      }
    }
    if (!mapping["description"]) {
      const descColumn = columnAnalysis.find(
        (c) => /desc|description|detail|narrative/i.test(c.columnName) && c.inferredType === "text" && !Object.values(mapping).includes(c.columnName)
      );
      if (descColumn) {
        mapping["description"] = descColumn.columnName;
      }
    }
    return mapping;
  }
  /**
   * Detect which preset matches the file headers
   */
  detectPreset(headers) {
    for (const preset of SOURCE_PRESETS) {
      if (preset.detectPattern(headers)) {
        return preset;
      }
    }
    return null;
  }
  /**
   * Check if inferred type matches expected type
   */
  typeMatchesExpected(inferred, expected) {
    if (expected === "ignore") return true;
    const typeMap = {
      date: ["date", "datetime"],
      time: ["time", "datetime"],
      amount: ["amount", "number"],
      reference: ["text", "number"],
      description: ["text"],
      cardNumber: ["cardNumber", "text"],
      paymentType: ["text"]
    };
    return typeMap[expected]?.includes(inferred) ?? false;
  }
  /**
   * Check if value matches any of the patterns
   */
  matchesPatterns(value, patterns) {
    return patterns.some((pattern) => pattern.test(value));
  }
};
var dataQualityValidator = new DataQualityValidator();

// server/objectStorage.ts
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
var ObjectNotFoundError = class _ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, _ObjectNotFoundError.prototype);
  }
};
var ObjectStorageService = class {
  localStorageDir;
  constructor() {
    const defaultDir = process.env.NODE_ENV === "production" ? "/tmp/uploads" : path.join(process.cwd(), "uploads");
    this.localStorageDir = process.env.PRIVATE_OBJECT_DIR || defaultDir;
  }
  ensureDir(dir) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
  safePath(objectPath) {
    const resolved = path.resolve(this.localStorageDir, objectPath);
    if (!resolved.startsWith(path.resolve(this.localStorageDir))) {
      throw new Error("Invalid file path");
    }
    return resolved;
  }
  async uploadFile(buffer, fileName, contentType) {
    const fileId = randomUUID();
    const uploadDir = path.join(this.localStorageDir, fileId);
    this.ensureDir(uploadDir);
    const filePath = this.safePath(`${fileId}/${fileName}`);
    fs.writeFileSync(filePath, buffer);
    fs.writeFileSync(filePath + ".meta", JSON.stringify({ contentType }));
    return `${fileId}/${fileName}`;
  }
  async downloadFile(objectPath, res) {
    try {
      const filePath = this.safePath(objectPath);
      if (!fs.existsSync(filePath)) {
        throw new ObjectNotFoundError();
      }
      let contentType = "application/octet-stream";
      const metaPath = filePath + ".meta";
      if (fs.existsSync(metaPath)) {
        const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
        contentType = meta.contentType || contentType;
      }
      const stat = fs.statSync(filePath);
      res.set({
        "Content-Type": contentType,
        "Content-Length": stat.size.toString(),
        "Cache-Control": "private, max-age=3600"
      });
      const stream = fs.createReadStream(filePath);
      stream.on("error", (err) => {
        console.error("Stream error:", err);
        if (!res.headersSent) {
          res.status(500).json({ error: "Error streaming file" });
        }
      });
      stream.pipe(res);
    } catch (error) {
      console.error("Error downloading file:", error);
      if (!res.headersSent) {
        if (error instanceof ObjectNotFoundError) {
          res.status(404).json({ error: "File not found" });
        } else {
          res.status(500).json({ error: "Error downloading file" });
        }
      }
    }
  }
  async getFile(objectPath) {
    const filePath = this.safePath(objectPath);
    if (!fs.existsSync(filePath)) {
      throw new ObjectNotFoundError();
    }
    return {
      download: async () => [fs.readFileSync(filePath)]
    };
  }
  async deleteFile(objectPath) {
    try {
      const filePath = this.safePath(objectPath);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        const metaPath = filePath + ".meta";
        if (fs.existsSync(metaPath)) fs.unlinkSync(metaPath);
      }
    } catch (error) {
    }
  }
};
var objectStorageService = new ObjectStorageService();

// server/auth.ts
import * as client from "openid-client";
import { Strategy } from "openid-client/passport";
import passport from "passport";
import session from "express-session";
import memoize from "memoizee";
import connectPg from "connect-pg-simple";
var getOidcConfig = memoize(
  async () => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new Error(
        "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set"
      );
    }
    const config = await client.discovery(
      new URL("https://accounts.google.com"),
      clientId,
      clientSecret
    );
    return config;
  },
  { maxAge: 3600 * 1e3 }
);
function getSessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SESSION_SECRET environment variable is required in production");
    }
    return "dev-only-insecure-secret";
  }
  return secret;
}
function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1e3;
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: true,
    ttl: sessionTtl,
    tableName: "sessions"
  });
  return session({
    secret: getSessionSecret(),
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: sessionTtl
    }
  });
}
function updateUserSession(user, tokens) {
  user.claims = tokens.claims();
  user.access_token = tokens.access_token;
  user.refresh_token = tokens.refresh_token;
  user.expires_at = user.claims?.exp;
}
async function upsertUser(claims) {
  await storage.upsertUser({
    id: claims["sub"],
    email: claims["email"],
    firstName: claims["given_name"],
    lastName: claims["family_name"],
    profileImageUrl: claims["picture"]
  });
}
async function setupAuth(app2) {
  app2.set("trust proxy", 1);
  app2.use(getSession());
  app2.use(passport.initialize());
  app2.use(passport.session());
  passport.serializeUser((user, cb) => cb(null, user));
  passport.deserializeUser((user, cb) => cb(null, user));
  let strategyReady = false;
  async function ensureStrategy() {
    if (strategyReady) return;
    const config = await getOidcConfig();
    const callbackUrl = process.env.AUTH_CALLBACK_URL || "http://localhost:5000/api/callback";
    const verify = async (tokens, verified) => {
      const user = {};
      updateUserSession(user, tokens);
      await upsertUser(tokens.claims());
      verified(null, user);
    };
    const strategy = new Strategy(
      {
        name: "google",
        config,
        scope: "openid email profile",
        callbackURL: callbackUrl
      },
      verify
    );
    passport.use(strategy);
    strategyReady = true;
  }
  app2.get("/api/login", async (req, res, next) => {
    try {
      await ensureStrategy();
      passport.authenticate("google", {
        prompt: "select_account"
      })(req, res, next);
    } catch (err) {
      console.error("Login init error:", err);
      res.status(500).json({ error: "Authentication service unavailable, please retry" });
    }
  });
  app2.get("/api/callback", async (req, res, next) => {
    try {
      await ensureStrategy();
      passport.authenticate("google", {
        successReturnToOrRedirect: "/",
        failureRedirect: "/api/login"
      })(req, res, next);
    } catch (err) {
      console.error("Callback init error:", err);
      res.redirect("/api/login");
    }
  });
  app2.get("/api/logout", (req, res) => {
    req.logout(() => {
      res.redirect("/");
    });
  });
}
var isAuthenticated = async (req, res, next) => {
  const user = req.user;
  if (!req.isAuthenticated() || !user.expires_at) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  const now = Math.floor(Date.now() / 1e3);
  if (now <= user.expires_at) {
    return next();
  }
  const refreshToken = user.refresh_token;
  if (!refreshToken) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  try {
    const config = await getOidcConfig();
    const tokenResponse = await client.refreshTokenGrant(config, refreshToken);
    updateUserSession(user, tokenResponse);
    return next();
  } catch (error) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
};

// server/routes.ts
import { z as z2 } from "zod";
function computeContentHash(buffer) {
  return createHash("sha256").update(buffer).digest("hex").slice(0, 16);
}
var upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024
  }
});
var columnMappingSchema = z2.record(z2.enum(["date", "amount", "reference", "description", "time", "paymentType", "cardNumber", "attendant", "cashier", "pump", "ignore"]));
async function registerRoutes(app2) {
  await setupAuth(app2);
  app2.get("/api/auth/user", isAuthenticated, async (req, res) => {
    try {
      if (!req.user?.claims?.sub) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });
  const isAdmin = async (req, res, next) => {
    try {
      if (!req.user?.claims?.sub) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const user = await storage.getUser(req.user.claims.sub);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }
      next();
    } catch (error) {
      console.error("Admin check error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  };
  app2.get("/api/admin/users", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const users2 = await storage.getAllUsers();
      res.json(users2);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });
  app2.patch("/api/admin/users/:id/admin", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { isAdmin: makeAdmin } = req.body;
      if (typeof makeAdmin !== "boolean") {
        return res.status(400).json({ message: "isAdmin must be a boolean" });
      }
      if (req.params.id === req.user.claims.sub && !makeAdmin) {
        return res.status(400).json({ message: "Cannot remove your own admin status" });
      }
      const updated = await storage.setUserAdmin(req.params.id, makeAdmin);
      if (!updated) {
        return res.status(404).json({ message: "User not found" });
      }
      res.json(updated);
    } catch (error) {
      console.error("Error updating user admin status:", error);
      res.status(500).json({ message: "Failed to update user" });
    }
  });
  app2.get("/api/periods", isAuthenticated, async (req, res) => {
    try {
      const rawSub = req.user?.claims?.sub;
      const userId = rawSub != null ? String(rawSub) : void 0;
      const periods = await storage.getPeriods(userId);
      res.json(periods);
    } catch (error) {
      console.error("Error fetching periods:", error);
      res.status(500).json({ error: "Failed to fetch periods" });
    }
  });
  app2.get("/api/periods/:id", isAuthenticated, async (req, res) => {
    try {
      const period = await storage.getPeriod(req.params.id);
      if (!period) {
        return res.status(404).json({ error: "Period not found" });
      }
      const userId = req.user?.claims?.sub;
      if (period.userId && period.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }
      res.json(period);
    } catch (error) {
      console.error("Error fetching period:", error);
      res.status(500).json({ error: "Failed to fetch period" });
    }
  });
  app2.post("/api/periods", isAuthenticated, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const validated = insertReconciliationPeriodSchema.parse(req.body);
      const period = await storage.createPeriod({ ...validated, userId });
      res.json(period);
    } catch (error) {
      console.error("Error creating period:", error);
      res.status(400).json({ error: "Invalid period data" });
    }
  });
  app2.patch("/api/periods/:id", isAuthenticated, async (req, res) => {
    try {
      const partialSchema = insertReconciliationPeriodSchema.partial();
      const validated = partialSchema.parse(req.body);
      const updated = await storage.updatePeriod(req.params.id, validated);
      if (!updated) {
        return res.status(404).json({ error: "Period not found" });
      }
      res.json(updated);
    } catch (error) {
      console.error("Error updating period:", error);
      res.status(400).json({ error: "Invalid period data" });
    }
  });
  app2.delete("/api/periods/:id", isAuthenticated, async (req, res) => {
    try {
      await storage.deletePeriod(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting period:", error);
      res.status(500).json({ error: "Failed to delete period" });
    }
  });
  app2.get("/api/periods/:periodId/files", isAuthenticated, async (req, res) => {
    try {
      const files = await storage.getFilesByPeriod(req.params.periodId);
      res.json(files);
    } catch (error) {
      console.error("Error fetching files:", error);
      res.status(500).json({ error: "Failed to fetch files" });
    }
  });
  app2.post("/api/periods/:periodId/files/upload", isAuthenticated, upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file provided" });
      }
      const { sourceType, sourceName, bankName } = req.body;
      if (!sourceType || !sourceName) {
        return res.status(400).json({ error: "sourceType and sourceName are required" });
      }
      const contentHash = computeContentHash(req.file.buffer);
      const existingFiles = await storage.getFilesByPeriod(req.params.periodId);
      const existingFile = existingFiles.find(
        (f) => f.sourceType === sourceType && f.sourceName === sourceName
      );
      if (existingFile && existingFile.contentHash === contentHash) {
        console.log(`Same file re-uploaded, re-parsing for mappings: ${existingFile.fileName}`);
        const isCSVReupload = req.file.mimetype.includes("csv") || req.file.mimetype === "text/csv" || req.file.mimetype === "text/plain" || req.file.originalname.toLowerCase().endsWith(".csv") || req.file.originalname.toLowerCase().endsWith(".txt");
        const fileType2 = isCSVReupload ? "csv" : "excel";
        const reuploadParsed = await fileParser.parse(req.file.buffer, fileType2);
        const reuploadMappingsArray = fileParser.autoDetectColumns(reuploadParsed.headers);
        const reuploadDetectedPreset = fileParser.detectSourcePreset(reuploadParsed.headers);
        const reuploadMappings = {};
        if (reuploadDetectedPreset) {
          for (const header of reuploadParsed.headers) {
            reuploadMappings[header] = reuploadDetectedPreset.mappings[header] || "ignore";
          }
        } else {
          for (const mapping of reuploadMappingsArray) {
            reuploadMappings[mapping.detectedColumn] = mapping.mappedTo || "ignore";
          }
          for (const header of reuploadParsed.headers) {
            if (!reuploadMappings[header]) {
              reuploadMappings[header] = "ignore";
            }
          }
        }
        return res.json({
          file: existingFile,
          parsed: {
            headers: reuploadParsed.headers,
            rows: [],
            rowCount: existingFile.rowCount || reuploadParsed.rowCount
          },
          suggestedMappings: reuploadMappings,
          qualityReport: existingFile.qualityReport || { hasIssues: false, totalRows: reuploadParsed.rowCount, cleanRows: reuploadParsed.rowCount, issues: [] },
          isReupload: true,
          message: "Same file detected, using existing data"
        });
      }
      const fileToReplace = existingFile ? {
        id: existingFile.id,
        fileName: existingFile.fileName,
        fileUrl: existingFile.fileUrl
      } : null;
      if (fileToReplace) {
        console.log(`Will replace existing file after successful upload: ${fileToReplace.fileName} (${fileToReplace.id})`);
      }
      const isCSV = req.file.mimetype.includes("csv") || req.file.mimetype === "text/csv" || req.file.mimetype === "text/plain" || req.file.originalname.endsWith(".csv") || req.file.originalname.endsWith(".txt");
      const isExcel = req.file.mimetype.includes("spreadsheet") || req.file.mimetype.includes("excel") || req.file.originalname.endsWith(".xlsx") || req.file.originalname.endsWith(".xls");
      const isPDF = req.file.mimetype === "application/pdf" || req.file.originalname.endsWith(".pdf");
      if (!isCSV && !isExcel && !isPDF) {
        return res.status(400).json({
          error: "Invalid file format. Please upload CSV, TXT, Excel, or PDF files only."
        });
      }
      const fileType = isCSV ? "csv" : isExcel ? "xlsx" : "pdf";
      const parsed = await fileParser.parse(req.file.buffer, fileType);
      const columnMappings = fileParser.autoDetectColumns(parsed.headers);
      const detectedPreset = fileParser.detectSourcePreset(parsed.headers);
      const normalizeSourceType = (st) => st.replace(/\d+$/, "");
      if (detectedPreset && detectedPreset.category !== normalizeSourceType(sourceType)) {
        const detectedCategory = detectedPreset.category;
        const expectedCategory = normalizeSourceType(sourceType);
        console.warn(`Source type mismatch: expected ${expectedCategory}, detected ${detectedCategory} (${detectedPreset.name})`);
        return res.status(400).json({
          error: `This looks like a ${detectedCategory === "bank" ? "bank statement" : "fuel system export"}, but you're uploading it as ${expectedCategory === "bank" ? "bank data" : "fuel data"}. Please check you're on the right step.`,
          detectedType: detectedCategory,
          expectedType: expectedCategory,
          detectedPreset: detectedPreset.name
        });
      }
      const suggestedMappingsObject = {};
      for (const mapping of columnMappings) {
        suggestedMappingsObject[mapping.detectedColumn] = mapping.suggestedMapping;
      }
      const rawQualityReport = dataQualityValidator.validate(
        parsed,
        sourceType,
        sourceName
      );
      const normalizeIssueType = (type) => {
        const normalized = type.toLowerCase();
        if (normalized.includes("column_shift")) return "column_shift";
        if (normalized.includes("page_break")) return "page_break";
        if (normalized.includes("repeated_header")) return "repeated_header";
        if (normalized.includes("empty_column")) return "empty_column";
        if (normalized.includes("type_mismatch") || normalized.includes("data_type_mismatch")) return "type_mismatch";
        if (normalized.includes("missing_required")) return "missing_data";
        if (normalized.includes("inconsistent")) return "inconsistent_data";
        return normalized;
      };
      const qualityReport = {
        hasIssues: rawQualityReport.hasIssues,
        hasCriticalIssues: rawQualityReport.hasCriticalIssues,
        overallScore: 100 - rawQualityReport.problematicRows / rawQualityReport.totalRows * 100,
        totalRows: rawQualityReport.totalRows,
        cleanRows: rawQualityReport.cleanRows,
        problematicRows: rawQualityReport.problematicRows,
        issues: rawQualityReport.issues.map((issue) => ({
          type: normalizeIssueType(issue.type),
          severity: issue.severity.toLowerCase(),
          message: issue.message,
          details: issue.details,
          affectedColumns: issue.details?.columns,
          rowNumbers: issue.affectedRows,
          suggestedFix: issue.suggestedFix
        })),
        columnAnalysis: rawQualityReport.columnAnalysis.map((col) => ({
          columnName: col.columnName,
          columnIndex: col.columnIndex,
          inferredType: col.inferredType,
          nullCount: col.nullCount,
          nonNullCount: col.nonNullCount,
          uniqueValues: col.uniqueValues,
          sampleValues: col.sampleValues,
          expectedType: col.inferredType,
          actualType: col.inferredType,
          nullPercentage: col.nullCount / (col.nullCount + col.nonNullCount) * 100,
          consistencyScore: 100 - (col.headerLikeValues + col.pageLikeValues) / (col.nonNullCount || 1) * 100
        })),
        suggestedMapping: rawQualityReport.suggestedColumnMapping,
        suggestedColumnMapping: rawQualityReport.suggestedColumnMapping,
        // Keep legacy field too
        rowsToRemove: rawQualityReport.rowsToRemove,
        columnShiftDetected: rawQualityReport.columnShiftDetected,
        shiftDetails: rawQualityReport.shiftDetails,
        detectedPreset: rawQualityReport.detectedPreset
      };
      const fileUrl = await objectStorageService.uploadFile(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype
      );
      const uploadedFile = await storage.createFile({
        periodId: req.params.periodId,
        fileName: req.file.originalname,
        fileType,
        sourceType,
        sourceName,
        fileUrl,
        fileSize: req.file.size,
        rowCount: parsed.rowCount,
        columnMapping: null,
        qualityReport,
        contentHash,
        bankName: bankName || null,
        status: "uploaded"
      });
      if (fileToReplace) {
        console.log(`Cleaning up replaced file: ${fileToReplace.fileName} (${fileToReplace.id})`);
        try {
          await storage.deleteMatchesByFile(fileToReplace.id);
          await storage.deleteTransactionsByFile(fileToReplace.id);
          await storage.deleteFile(fileToReplace.id);
          await objectStorageService.deleteFile(fileToReplace.fileUrl);
          console.log(`Successfully cleaned up old file, its transactions, and related matches`);
        } catch (cleanupError) {
          console.warn("Could not fully clean up old file:", cleanupError);
        }
      }
      res.json({
        file: uploadedFile,
        preview: {
          headers: parsed.headers,
          rows: DataNormalizer.normalizePreviewRows(parsed.rows.slice(0, 5)),
          totalRows: parsed.rowCount
        },
        suggestedMappings: suggestedMappingsObject,
        qualityReport
      });
    } catch (error) {
      console.error("Error uploading file:", error);
      const detail = error?.message || String(error);
      res.status(500).json({ error: `Failed to upload file: ${detail}` });
    }
  });
  app2.get("/api/files/:fileId/preview", isAuthenticated, async (req, res) => {
    try {
      const file = await storage.getFile(req.params.fileId);
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }
      const objectFile = await objectStorageService.getFile(file.fileUrl);
      const [buffer] = await objectFile.download();
      const parsed = await fileParser.parse(buffer, file.fileType);
      const suggestedMappingsArray = fileParser.autoDetectColumns(parsed.headers);
      const suggestedMappings = {};
      for (const mapping of suggestedMappingsArray) {
        suggestedMappings[mapping.detectedColumn] = mapping.suggestedMapping;
      }
      const detectedPreset = fileParser.detectSourcePreset(parsed.headers);
      const columnLabels = {};
      for (const header of parsed.headers) {
        columnLabels[header] = fileParser.getColumnLabel(header, parsed.headers);
      }
      const normalizedPreview = [];
      const fullAnalysisStats = {
        totalRows: parsed.rowCount,
        validTransactions: 0,
        cardTransactions: 0,
        cashTransactions: 0,
        unknownPaymentType: 0,
        skippedRows: {
          headerRows: 0,
          emptyDate: 0,
          zeroOrInvalidAmount: 0,
          pageBreaks: 0,
          other: 0
        }
      };
      const mappingToUse = file.columnMapping || suggestedMappings;
      if (mappingToUse && Object.keys(mappingToUse).length > 0) {
        for (let i = 0; i < parsed.rows.length; i++) {
          const row = parsed.rows[i];
          const extracted = fileParser.extractTransactionData(
            row,
            mappingToUse,
            parsed.headers,
            file.sourceType
          );
          if (i < 5) {
            normalizedPreview.push(extracted);
          }
          const validation = fileParser.isValidTransactionRow(
            extracted,
            row,
            mappingToUse
          );
          if (!validation.valid) {
            switch (validation.reason) {
              case "header_row":
                fullAnalysisStats.skippedRows.headerRows++;
                break;
              case "empty_date":
                fullAnalysisStats.skippedRows.emptyDate++;
                break;
              case "zero_or_invalid_amount":
                fullAnalysisStats.skippedRows.zeroOrInvalidAmount++;
                break;
              case "page_break":
                fullAnalysisStats.skippedRows.pageBreaks++;
                break;
              default:
                fullAnalysisStats.skippedRows.other++;
            }
          } else {
            fullAnalysisStats.validTransactions++;
            if (extracted.isCardTransaction === "yes") {
              fullAnalysisStats.cardTransactions++;
            } else if (extracted.isCardTransaction === "no") {
              fullAnalysisStats.cashTransactions++;
            } else {
              fullAnalysisStats.unknownPaymentType++;
            }
          }
        }
      }
      res.json({
        headers: parsed.headers,
        rows: DataNormalizer.normalizePreviewRows(parsed.rows.slice(0, 5)),
        totalRows: parsed.rowCount,
        suggestedMappings,
        currentMapping: file.columnMapping,
        detectedPreset: detectedPreset ? {
          name: detectedPreset.name,
          description: detectedPreset.description
        } : null,
        columnLabels,
        normalizedPreview,
        qualityReport: file.qualityReport,
        fullAnalysisStats
      });
    } catch (error) {
      console.error("Error fetching file preview:", error);
      res.status(500).json({ error: "Failed to fetch file preview" });
    }
  });
  app2.post("/api/files/:fileId/column-mapping", isAuthenticated, async (req, res) => {
    try {
      const validatedMapping = columnMappingSchema.parse(req.body.columnMapping);
      const file = await storage.getFile(req.params.fileId);
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }
      const mappedFields = {};
      const duplicates = [];
      for (const [column, field] of Object.entries(validatedMapping)) {
        if (field === "ignore") continue;
        if (mappedFields[field]) {
          const existing = duplicates.find((d) => d.field === field);
          if (existing) {
            existing.columns.push(column);
          } else {
            duplicates.push({ field, columns: [mappedFields[field], column] });
          }
        } else {
          mappedFields[field] = column;
        }
      }
      if (duplicates.length > 0) {
        const errorMessages = duplicates.map(
          (d) => `"${d.field}" is mapped to both "${d.columns.join('" and "')}" - please choose only ONE column for each field`
        );
        return res.status(400).json({
          error: "Duplicate mappings detected",
          duplicates,
          message: errorMessages.join(". ")
        });
      }
      await storage.updateFile(req.params.fileId, {
        columnMapping: validatedMapping,
        status: "mapped"
      });
      res.json({ success: true });
    } catch (error) {
      console.error("Error saving column mapping:", error?.message || String(error));
      res.status(400).json({ error: error?.message || "Invalid column mapping data" });
    }
  });
  app2.post("/api/periods/:periodId/files/:fileId/process", isAuthenticated, async (req, res) => {
    try {
      const file = await storage.getFile(req.params.fileId);
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }
      if (file.periodId !== req.params.periodId) {
        return res.status(400).json({ error: "File does not belong to this period" });
      }
      if (!file.columnMapping) {
        return res.status(400).json({ error: "Column mapping not set" });
      }
      await storage.deleteTransactionsByFile(file.id);
      const objectFile = await objectStorageService.getFile(file.fileUrl);
      const [buffer] = await objectFile.download();
      const parsed = await fileParser.parse(buffer, file.fileType);
      const skipStats = {
        header_row: 0,
        empty_date: 0,
        zero_or_invalid_amount: 0,
        page_break: 0,
        total_skipped: 0,
        total_processed: 0
      };
      const validTransactions = [];
      for (const row of parsed.rows) {
        const extracted = fileParser.extractTransactionData(
          row,
          file.columnMapping,
          parsed.headers,
          file.sourceType
        );
        const validation = fileParser.isValidTransactionRow(
          extracted,
          row,
          file.columnMapping
        );
        if (!validation.valid) {
          skipStats.total_skipped++;
          if (validation.reason && validation.reason in skipStats) {
            skipStats[validation.reason]++;
          }
          continue;
        }
        skipStats.total_processed++;
        validTransactions.push({
          fileId: file.id,
          periodId: file.periodId,
          sourceType: file.sourceType,
          sourceName: file.sourceName,
          rawData: row,
          transactionDate: extracted.transactionDate,
          transactionTime: extracted.transactionTime || null,
          amount: extracted.amount,
          description: extracted.description || "",
          referenceNumber: extracted.referenceNumber || "",
          cardNumber: extracted.cardNumber || null,
          paymentType: extracted.paymentType || null,
          isCardTransaction: extracted.isCardTransaction,
          attendant: extracted.attendant || null,
          cashier: extracted.cashier || null,
          pump: extracted.pump || null,
          matchStatus: "unmatched",
          matchId: null
        });
      }
      let reversalStats = null;
      if (file.sourceType.startsWith("bank")) {
        const detectedPreset = fileParser.detectSourcePreset(parsed.headers);
        const presetName = detectedPreset?.name || null;
        reversalStats = detectAndExcludeReversals(validTransactions, presetName);
        if (reversalStats.totalExcluded > 0) {
          console.log(`[PROCESS] Reversal detection: ${reversalStats.totalExcluded} excluded (${reversalStats.declined} declined, ${reversalStats.reversed} reversed, ${reversalStats.cancelled} cancelled, ${reversalStats.pairedApprovals} paired approvals)`);
        }
      }
      console.log(`[PROCESS] Creating ${validTransactions.length} transactions for file ${file.id}, period ${file.periodId}`);
      const { count: createdCount } = await storage.createTransactions(validTransactions);
      console.log(`[PROCESS] Created ${createdCount} transactions in database`);
      await storage.updateFile(file.id, {
        status: "processed",
        rowCount: createdCount
      });
      res.json({
        success: true,
        transactionsCreated: createdCount,
        totalRows: parsed.rowCount,
        skipStats,
        reversalStats
      });
    } catch (error) {
      console.error("Error processing file:", error);
      res.status(500).json({ error: "Failed to process file" });
    }
  });
  app2.delete("/api/files/:fileId", isAuthenticated, async (req, res) => {
    try {
      const file = await storage.getFile(req.params.fileId);
      if (file) {
        await storage.deleteMatchesByFile(file.id);
        await storage.deleteTransactionsByFile(file.id);
        if (file.fileUrl) {
          await objectStorageService.deleteFile(file.fileUrl);
        }
        await storage.deleteFile(file.id);
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting file:", error);
      res.status(500).json({ error: "Failed to delete file" });
    }
  });
  app2.get("/api/periods/:periodId/transactions", isAuthenticated, async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = Math.min(parseInt(req.query.limit) || 100, 500);
      const offset = (page - 1) * limit;
      const sourceType = req.query.sourceType;
      const matchStatus = req.query.matchStatus;
      const isCardTransaction = req.query.isCardTransaction;
      console.log(`[TRANSACTIONS] Fetching for period ${req.params.periodId}, page ${page}, limit ${limit}`);
      const result = await storage.getTransactionsByPeriodPaginated(
        req.params.periodId,
        { limit, offset, sourceType, matchStatus, isCardTransaction }
      );
      console.log(`[TRANSACTIONS] Found ${result.total} total, returning ${result.transactions.length} on page ${page}`);
      res.json({
        transactions: result.transactions,
        total: result.total,
        page,
        limit,
        totalPages: Math.ceil(result.total / limit)
      });
    } catch (error) {
      console.error("Error fetching transactions:", error);
      res.status(500).json({ error: "Failed to fetch transactions" });
    }
  });
  app2.get("/api/periods/:periodId/verification-summary", isAuthenticated, async (req, res) => {
    try {
      const summary = await storage.getVerificationSummary(req.params.periodId);
      res.json(summary);
    } catch (error) {
      console.error("Error fetching verification summary:", error);
      res.status(500).json({ error: "Failed to fetch verification summary" });
    }
  });
  app2.get("/api/periods/:periodId/matching-rules", isAuthenticated, async (req, res) => {
    try {
      const rules = await storage.getMatchingRules(req.params.periodId);
      res.json(rules);
    } catch (error) {
      console.error("Error fetching matching rules:", error);
      res.status(500).json({ error: "Failed to fetch matching rules" });
    }
  });
  app2.post("/api/periods/:periodId/matching-rules", isAuthenticated, async (req, res) => {
    try {
      const validatedRules = matchingRulesConfigSchema.parse(req.body);
      const saved = await storage.saveMatchingRules(req.params.periodId, validatedRules);
      res.json({ success: true, rules: saved });
    } catch (error) {
      if (error instanceof z2.ZodError) {
        console.error("Validation error:", error.errors);
        return res.status(400).json({ error: "Invalid matching rules data", details: error.errors });
      }
      console.error("Error saving matching rules:", error);
      res.status(500).json({ error: "Failed to save matching rules" });
    }
  });
  function groupFuelByInvoice(fuelTransactions, groupByInvoice) {
    if (!groupByInvoice) {
      return fuelTransactions.map((tx) => ({
        invoiceNumber: tx.id,
        items: [tx],
        totalAmount: parseFloat(tx.amount),
        firstDate: tx.transactionDate,
        firstTime: tx.transactionTime,
        cardNumber: tx.cardNumber
      }));
    }
    const invoices = {};
    for (const tx of fuelTransactions) {
      const invoiceNum = tx.referenceNumber || tx.id;
      if (!invoices[invoiceNum]) {
        invoices[invoiceNum] = {
          invoiceNumber: invoiceNum,
          items: [],
          totalAmount: 0,
          firstDate: tx.transactionDate,
          firstTime: tx.transactionTime,
          cardNumber: tx.cardNumber
        };
      }
      invoices[invoiceNum].items.push(tx);
      invoices[invoiceNum].totalAmount += parseFloat(tx.amount);
    }
    return Object.values(invoices);
  }
  function parseTimeToMinutes(timeStr) {
    if (!timeStr) return null;
    const match = timeStr.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (!match) return null;
    const hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    return hours * 60 + minutes;
  }
  function parseDateToDays(dateStr) {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return null;
    return Math.floor(date.getTime() / (1e3 * 60 * 60 * 24));
  }
  app2.post("/api/periods/:periodId/auto-match", isAuthenticated, async (req, res) => {
    try {
      await storage.resetMatchesByPeriod(req.params.periodId);
      const rules = await storage.getMatchingRules(req.params.periodId);
      const transactions2 = await storage.getTransactionsByPeriod(req.params.periodId);
      const fuelTransactions = transactions2.filter(
        (t) => t.sourceType === "fuel" && t.isCardTransaction === "yes" && t.matchStatus === "unmatched"
      );
      const bankTransactions = transactions2.filter(
        (t) => t.sourceType && t.sourceType.startsWith("bank") && t.matchStatus === "unmatched"
      );
      const fuelDates = fuelTransactions.map((t) => t.transactionDate).filter((d) => d && d.trim()).map((d) => new Date(d).getTime()).filter((d) => !isNaN(d));
      const bankDates = bankTransactions.map((t) => t.transactionDate).filter((d) => d && d.trim()).map((d) => new Date(d).getTime()).filter((d) => !isNaN(d));
      let unmatchableBankTransactions = [];
      let dateRangeWarning = "";
      if (fuelDates.length > 0 && bankDates.length > 0) {
        const maxFuelDate = Math.max(...fuelDates);
        const minFuelDate = Math.min(...fuelDates);
        const maxBankDate = Math.max(...bankDates);
        const minBankDate = Math.min(...bankDates);
        unmatchableBankTransactions = bankTransactions.filter((t) => {
          if (!t.transactionDate) return false;
          const bankTime = new Date(t.transactionDate).getTime();
          if (isNaN(bankTime)) return false;
          return bankTime > maxFuelDate || bankTime < minFuelDate;
        });
        if (unmatchableBankTransactions.length > 0) {
          const maxFuelDateStr = new Date(maxFuelDate).toISOString().split("T")[0];
          const minFuelDateStr = new Date(minFuelDate).toISOString().split("T")[0];
          dateRangeWarning = `${unmatchableBankTransactions.length} bank transaction(s) are outside your fuel data date range (${minFuelDateStr} to ${maxFuelDateStr}) and cannot be matched.`;
          await storage.updateTransactionsBatch(
            unmatchableBankTransactions.map((tx) => ({ id: tx.id, data: { matchStatus: "unmatchable", matchId: null } }))
          );
        }
      }
      const matchableBankTransactions = bankTransactions.filter(
        (t) => !unmatchableBankTransactions.includes(t)
      );
      const fuelInvoices = groupFuelByInvoice(fuelTransactions, rules.groupByInvoice);
      const invoicesByDate = /* @__PURE__ */ new Map();
      for (const invoice of fuelInvoices) {
        const dayKey = parseDateToDays(invoice.firstDate || "");
        if (dayKey !== null) {
          for (let offset = -1; offset <= rules.dateWindowDays; offset++) {
            const key = dayKey + offset;
            if (!invoicesByDate.has(key)) invoicesByDate.set(key, []);
            invoicesByDate.get(key).push(invoice);
          }
        }
      }
      let matchCount = 0;
      let skippedNonCardCount = transactions2.filter(
        (t) => t.sourceType === "fuel" && t.isCardTransaction !== "yes"
      ).length;
      const matchedInvoices = /* @__PURE__ */ new Set();
      const pendingMatches = [];
      for (const bankTx of matchableBankTransactions) {
        let bestMatch = null;
        const bankDayKey = parseDateToDays(bankTx.transactionDate || "");
        const candidateInvoices = bankDayKey !== null ? invoicesByDate.get(bankDayKey) || [] : fuelInvoices;
        const seen = /* @__PURE__ */ new Set();
        for (const invoice of candidateInvoices) {
          if (seen.has(invoice.invoiceNumber)) continue;
          seen.add(invoice.invoiceNumber);
          if (matchedInvoices.has(invoice.invoiceNumber)) continue;
          if (invoice.items.some((item) => item.matchStatus === "matched")) continue;
          const reasons = [];
          const bankAmount = parseFloat(bankTx.amount);
          const fuelAmount = invoice.totalAmount;
          const amountDiff = Math.abs(bankAmount - fuelAmount);
          if (amountDiff > rules.amountTolerance) continue;
          if (amountDiff === 0) {
            reasons.push("Exact amount match");
          } else {
            reasons.push(`Amount within R${amountDiff.toFixed(2)} (tolerance: R${rules.amountTolerance})`);
          }
          const fuelDate = parseDateToDays(invoice.firstDate || "");
          const bankDate = parseDateToDays(bankTx.transactionDate || "");
          if (fuelDate === null || bankDate === null) continue;
          const dateDiff = bankDate - fuelDate;
          if (dateDiff < -1 || dateDiff > rules.dateWindowDays) continue;
          let confidence = 70;
          if (dateDiff === 0) {
            confidence = 85;
            reasons.push("Same day transaction");
          } else if (Math.abs(dateDiff) === 1) {
            confidence = 75;
            reasons.push("1 day difference");
          } else if (Math.abs(dateDiff) === 2) {
            confidence = 68;
            reasons.push("2 days difference");
          } else {
            confidence = 65;
            reasons.push(`${Math.abs(dateDiff)} days difference (weekend/holiday processing)`);
          }
          const fuelTime = parseTimeToMinutes(invoice.firstTime || "");
          const bankTime = parseTimeToMinutes(bankTx.transactionTime || "");
          let timeDiff = 0;
          if (dateDiff === 0 && fuelTime !== null && bankTime !== null) {
            timeDiff = Math.abs(fuelTime - bankTime);
            if (timeDiff <= 5) {
              confidence = 100;
              reasons.push("Times within 5 minutes");
            } else if (timeDiff <= 15) {
              confidence = 95;
              reasons.push("Times within 15 minutes");
            } else if (timeDiff <= 30) {
              confidence = 85;
              reasons.push("Times within 30 minutes");
            } else if (timeDiff <= rules.timeWindowMinutes) {
              confidence = 75;
              reasons.push(`Times within ${timeDiff} minutes`);
            } else {
              confidence = 75;
              reasons.push(`Time difference: ${timeDiff} minutes`);
            }
          }
          if (amountDiff > 0) {
            const amountPenalty = Math.min(5, amountDiff / rules.amountTolerance * 5);
            confidence -= amountPenalty;
          }
          let cardMatch = "unknown";
          if (rules.requireCardMatch) {
            if (!bankTx.cardNumber || !invoice.cardNumber) continue;
            if (bankTx.cardNumber !== invoice.cardNumber) continue;
            cardMatch = "yes";
            confidence += 25;
            reasons.push("Card numbers match (required)");
          } else {
            if (bankTx.cardNumber && invoice.cardNumber) {
              if (bankTx.cardNumber === invoice.cardNumber) {
                cardMatch = "yes";
                confidence += 25;
                reasons.push("Card numbers match (strong)");
              } else {
                cardMatch = "no";
                confidence -= 30;
                reasons.push("Card numbers differ (penalty)");
              }
            }
          }
          if (invoice.items.length > 1) {
            reasons.push(`Grouped invoice: ${invoice.items.length} items`);
          }
          confidence = Math.min(100, Math.max(0, confidence));
          if (confidence < rules.minimumConfidence) continue;
          const absDiff = Math.abs(dateDiff);
          const cardMatchScore = cardMatch === "yes" ? 2 : cardMatch === "unknown" ? 1 : 0;
          const bestCardScore = bestMatch ? bestMatch.reasons.some((r) => r.includes("Card numbers match")) ? 2 : bestMatch.reasons.some((r) => r.includes("Card numbers differ")) ? 0 : 1 : -1;
          if (!bestMatch || confidence > bestMatch.confidence || confidence === bestMatch.confidence && cardMatchScore > bestCardScore || confidence === bestMatch.confidence && cardMatchScore === bestCardScore && absDiff < bestMatch.dateDiff || confidence === bestMatch.confidence && cardMatchScore === bestCardScore && absDiff === bestMatch.dateDiff && timeDiff < bestMatch.timeDiff) {
            bestMatch = { invoice, confidence, timeDiff, dateDiff: absDiff, amountDiff, reasons };
          }
        }
        if (bestMatch) {
          const matchType = bestMatch.confidence >= rules.autoMatchThreshold ? "auto" : "auto_review";
          pendingMatches.push({
            matchData: {
              periodId: req.params.periodId,
              fuelTransactionId: bestMatch.invoice.items[0].id,
              bankTransactionId: bankTx.id,
              matchType,
              matchConfidence: String(bestMatch.confidence)
            },
            bankTxId: bankTx.id,
            fuelItemIds: bestMatch.invoice.items.map((item) => item.id)
          });
          matchedInvoices.add(bestMatch.invoice.invoiceNumber);
          matchCount++;
        }
      }
      console.log(`[MATCH] Creating ${pendingMatches.length} matches in bulk...`);
      const createdMatches = await storage.createMatchesBatch(
        pendingMatches.map((pm) => pm.matchData)
      );
      const txUpdates = [];
      for (let i = 0; i < createdMatches.length; i++) {
        const match = createdMatches[i];
        const pending = pendingMatches[i];
        txUpdates.push({ id: pending.bankTxId, data: { matchStatus: "matched", matchId: match.id } });
        for (const fuelId of pending.fuelItemIds) {
          txUpdates.push({ id: fuelId, data: { matchStatus: "matched", matchId: match.id } });
        }
      }
      console.log(`[MATCH] Updating ${txUpdates.length} transactions in bulk...`);
      await storage.updateTransactionsBatch(txUpdates);
      const matchableCount = matchableBankTransactions.length;
      const matchRate = matchableCount > 0 ? (matchCount / matchableCount * 100).toFixed(1) : "0";
      await storage.updatePeriod(req.params.periodId, { status: "complete" });
      res.json({
        success: true,
        matchesCreated: matchCount,
        cardTransactionsProcessed: fuelTransactions.length,
        invoicesCreated: fuelInvoices.length,
        bankTransactionsTotal: bankTransactions.length,
        bankTransactionsMatchable: matchableCount,
        bankTransactionsUnmatchable: unmatchableBankTransactions.length,
        nonCardTransactionsSkipped: skippedNonCardCount,
        matchRate: `${matchRate}%`,
        rulesUsed: rules,
        warnings: dateRangeWarning ? [dateRangeWarning] : []
      });
    } catch (error) {
      console.error("Error auto-matching:", error);
      res.status(500).json({ error: "Failed to auto-match transactions" });
    }
  });
  app2.post("/api/matches/manual", isAuthenticated, async (req, res) => {
    try {
      const matchInput = insertMatchSchema.omit({ matchType: true, matchConfidence: true }).parse(req.body);
      const match = await storage.createMatch({
        ...matchInput,
        matchType: "manual",
        matchConfidence: "100"
      });
      await storage.updateTransaction(matchInput.fuelTransactionId, {
        matchStatus: "matched",
        matchId: match.id
      });
      await storage.updateTransaction(matchInput.bankTransactionId, {
        matchStatus: "matched",
        matchId: match.id
      });
      res.json({ success: true, match });
    } catch (error) {
      console.error("Error creating manual match:", error);
      res.status(400).json({ error: "Failed to create manual match" });
    }
  });
  app2.delete("/api/matches/:matchId", isAuthenticated, async (req, res) => {
    try {
      const match = await storage.getMatch(req.params.matchId);
      if (!match) {
        return res.status(404).json({ error: "Match not found" });
      }
      await storage.updateTransaction(match.fuelTransactionId, {
        matchStatus: "unmatched",
        matchId: null
      });
      await storage.updateTransaction(match.bankTransactionId, {
        matchStatus: "unmatched",
        matchId: null
      });
      await storage.deleteMatch(req.params.matchId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting match:", error);
      res.status(500).json({ error: "Failed to delete match" });
    }
  });
  app2.get("/api/periods/:periodId/resolutions", isAuthenticated, async (req, res) => {
    try {
      const resolutions = await storage.getResolutionsByPeriod(req.params.periodId);
      res.json(resolutions);
    } catch (error) {
      console.error("Error fetching resolutions:", error);
      res.status(500).json({ error: "Failed to fetch resolutions" });
    }
  });
  app2.get("/api/periods/:periodId/resolution-summary", isAuthenticated, async (req, res) => {
    try {
      const resolutions = await storage.getResolutionsByPeriod(req.params.periodId);
      const summary = {
        linked: 0,
        reviewed: 0,
        dismissed: 0,
        flagged: 0,
        writtenOff: 0
      };
      for (const r of resolutions) {
        switch (r.resolutionType) {
          case "linked":
            summary.linked++;
            break;
          case "reviewed":
            summary.reviewed++;
            break;
          case "dismissed":
            summary.dismissed++;
            break;
          case "flagged":
            summary.flagged++;
            break;
          case "written_off":
            summary.writtenOff++;
            break;
        }
      }
      res.json(summary);
    } catch (error) {
      console.error("Error fetching resolution summary:", error);
      res.status(500).json({ error: "Failed to fetch resolution summary" });
    }
  });
  app2.get("/api/transactions/:transactionId/resolutions", isAuthenticated, async (req, res) => {
    try {
      const resolutions = await storage.getResolutionsByTransaction(req.params.transactionId);
      res.json(resolutions);
    } catch (error) {
      console.error("Error fetching transaction resolutions:", error);
      res.status(500).json({ error: "Failed to fetch resolutions" });
    }
  });
  app2.post("/api/resolutions", isAuthenticated, async (req, res) => {
    try {
      const user = req.user;
      const { transactionId, periodId, resolutionType, reason, notes, linkedTransactionId, assignee } = req.body;
      if (!transactionId || !periodId || !resolutionType) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      const resolution = await storage.createResolution({
        transactionId,
        periodId,
        resolutionType,
        reason: reason || null,
        notes: notes || null,
        userId: user?.id || null,
        userName: user ? `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email : null,
        userEmail: user?.email || null,
        linkedTransactionId: linkedTransactionId || null,
        assignee: assignee || null
      });
      if (resolutionType !== "linked") {
        await storage.updateTransaction(transactionId, {
          matchStatus: "resolved"
        });
      }
      res.json({ success: true, resolution });
    } catch (error) {
      console.error("Error creating resolution:", error);
      res.status(500).json({ error: "Failed to create resolution" });
    }
  });
  app2.post("/api/resolutions/bulk-dismiss", isAuthenticated, async (req, res) => {
    try {
      const user = req.user;
      const { transactionIds, periodId } = req.body;
      if (!transactionIds || !Array.isArray(transactionIds) || !periodId) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      const resolutions = [];
      for (const transactionId of transactionIds) {
        const resolution = await storage.createResolution({
          transactionId,
          periodId,
          resolutionType: "dismissed",
          reason: "test_transaction",
          notes: "Bulk dismissed as low-value transaction",
          userId: user?.id || null,
          userName: user ? `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email : null,
          userEmail: user?.email || null,
          linkedTransactionId: null,
          assignee: null
        });
        resolutions.push(resolution);
        await storage.updateTransaction(transactionId, {
          matchStatus: "resolved"
        });
      }
      res.json({ success: true, count: resolutions.length });
    } catch (error) {
      console.error("Error bulk dismissing:", error);
      res.status(500).json({ error: "Failed to bulk dismiss transactions" });
    }
  });
  app2.post("/api/resolutions/bulk-flag", isAuthenticated, async (req, res) => {
    try {
      const user = req.user;
      const { transactionIds, periodId } = req.body;
      if (!transactionIds || !Array.isArray(transactionIds) || !periodId) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      const resolutions = [];
      for (const transactionId of transactionIds) {
        const resolution = await storage.createResolution({
          transactionId,
          periodId,
          resolutionType: "flagged",
          reason: null,
          notes: "Flagged for manager review",
          userId: user?.id || null,
          userName: user ? `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email : null,
          userEmail: user?.email || null,
          linkedTransactionId: null,
          assignee: null
        });
        resolutions.push(resolution);
        await storage.updateTransaction(transactionId, {
          matchStatus: "resolved"
        });
      }
      res.json({ success: true, count: resolutions.length });
    } catch (error) {
      console.error("Error bulk flagging:", error);
      res.status(500).json({ error: "Failed to bulk flag transactions" });
    }
  });
  app2.delete("/api/periods/:periodId/resolutions", isAuthenticated, async (req, res) => {
    try {
      const count = await storage.clearResolutionsByPeriod(req.params.periodId);
      res.json({ success: true, count });
    } catch (error) {
      console.error("Error clearing resolutions:", error);
      res.status(500).json({ error: "Failed to clear resolutions" });
    }
  });
  app2.post("/api/matches/bulk-confirm", isAuthenticated, async (req, res) => {
    try {
      const user = req.user;
      const { matches: matches2, periodId } = req.body;
      if (!matches2 || !Array.isArray(matches2) || !periodId) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      const createdMatches = [];
      for (const { bankId, fuelId } of matches2) {
        try {
          const match = await storage.createMatch({
            periodId,
            bankTransactionId: bankId,
            fuelTransactionId: fuelId,
            matchType: "manual",
            matchConfidence: "100"
          });
          createdMatches.push(match);
          await storage.updateTransaction(bankId, { matchStatus: "matched" });
          await storage.updateTransaction(fuelId, { matchStatus: "matched" });
          await storage.createResolution({
            transactionId: bankId,
            periodId,
            resolutionType: "linked",
            reason: null,
            notes: "Bulk confirmed as quick win match",
            userId: user?.id || null,
            userName: user ? `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email : null,
            userEmail: user?.email || null,
            linkedTransactionId: fuelId,
            assignee: null
          });
        } catch (matchError) {
          console.error(`Error creating match for bank ${bankId}:`, matchError);
        }
      }
      res.json({ success: true, count: createdMatches.length });
    } catch (error) {
      console.error("Error bulk confirming:", error);
      res.status(500).json({ error: "Failed to bulk confirm matches" });
    }
  });
  app2.get("/api/periods/:periodId/summary", isAuthenticated, async (req, res) => {
    try {
      const period = await storage.getPeriod(req.params.periodId);
      if (!period) {
        return res.status(404).json({ error: "Period not found" });
      }
      const summary = await storage.getPeriodSummary(req.params.periodId);
      res.json(summary);
    } catch (error) {
      console.error("Error fetching summary:", error);
      res.status(500).json({ error: "Failed to fetch summary" });
    }
  });
  app2.get("/api/periods/:periodId/attendant-summary", isAuthenticated, async (req, res) => {
    try {
      const period = await storage.getPeriod(req.params.periodId);
      if (!period) {
        return res.status(404).json({ error: "Period not found" });
      }
      const attendantSummary = await storage.getAttendantSummary(req.params.periodId);
      res.json(attendantSummary);
    } catch (error) {
      console.error("Error fetching attendant summary:", error);
      res.status(500).json({ error: "Failed to fetch attendant summary" });
    }
  });
  app2.get("/api/periods/:periodId/export", isAuthenticated, async (req, res) => {
    try {
      const period = await storage.getPeriod(req.params.periodId);
      if (!period) {
        return res.status(404).json({ error: "Period not found" });
      }
      const transactions2 = await storage.getTransactionsByPeriod(req.params.periodId);
      const matchesData = await storage.getMatchesByPeriod(req.params.periodId);
      const resolutions = await storage.getResolutionsByPeriod(req.params.periodId);
      const attendantSummary = await storage.getAttendantSummary(req.params.periodId);
      const matchMap = /* @__PURE__ */ new Map();
      for (const m of matchesData) {
        matchMap.set(m.bankTransactionId, m);
        matchMap.set(m.fuelTransactionId, m);
      }
      const resolutionMap = new Map(resolutions.map((r) => [r.transactionId, r]));
      const txMap = new Map(transactions2.map((t) => [t.id, t]));
      const bankTxns = transactions2.filter((t) => t.sourceType?.startsWith("bank"));
      const fuelTxns = transactions2.filter((t) => t.sourceType === "fuel");
      const matchedBank = bankTxns.filter((t) => t.matchStatus === "matched");
      const unmatchedBank = bankTxns.filter((t) => t.matchStatus === "unmatched" && parseFloat(t.amount) > 0);
      const excludedBank = bankTxns.filter((t) => t.matchStatus === "excluded");
      const outsideRange = bankTxns.filter((t) => t.matchStatus === "unmatchable");
      const matchableBank = bankTxns.filter((t) => t.matchStatus === "matched" || t.matchStatus === "unmatched");
      const XLSX2 = await import("xlsx");
      const wb = XLSX2.utils.book_new();
      const isDebtor = (t) => t.paymentType?.toLowerCase().includes("debtor") || t.paymentType?.toLowerCase().includes("account") || t.paymentType?.toLowerCase().includes("fleet");
      const debtorFuel = fuelTxns.filter((t) => t.isCardTransaction === "yes" && isDebtor(t));
      const cardOnlyFuel = fuelTxns.filter((t) => t.isCardTransaction === "yes" && !isDebtor(t));
      const cashFuel = fuelTxns.filter((t) => t.isCardTransaction === "no");
      const sumAmount = (txns) => txns.reduce((s, t) => s + parseFloat(t.amount), 0);
      const cardOnlyAmount = sumAmount(cardOnlyFuel);
      const debtorAmount = sumAmount(debtorFuel);
      const cashAmount = sumAmount(cashFuel);
      const totalFuelAmount = sumAmount(fuelTxns);
      const matchedBankAmount = sumAmount(matchedBank);
      const unmatchedBankAmount = sumAmount(unmatchedBank);
      const excludedBankAmount = sumAmount(excludedBank);
      const matchedFuelAmount = matchesData.reduce((s, m) => {
        const fuel = txMap.get(m.fuelTransactionId);
        return s + (fuel ? parseFloat(fuel.amount) : 0);
      }, 0);
      const cardFuelAmount = sumAmount(fuelTxns.filter((t) => t.isCardTransaction === "yes"));
      const bankApprovedAmount = matchedBankAmount + unmatchedBankAmount;
      const fileSurplus = bankApprovedAmount - cardFuelAmount;
      const matchedSurplus = matchedBankAmount - matchedFuelAmount;
      const unmatchedFuelCard = fuelTxns.filter((t) => t.isCardTransaction === "yes" && t.matchStatus !== "matched" && parseFloat(t.amount) > 0);
      const unmatchedFuelCardAmount = sumAmount(unmatchedFuelCard);
      const totalFuelCardReconciled = matchedFuelAmount + unmatchedFuelCardAmount;
      const reconSurplus = unmatchedFuelCardAmount + fileSurplus;
      const outsideRangeAmount = sumAmount(outsideRange);
      const matchRate = matchableBank.length > 0 ? Math.round(matchedBank.length / matchableBank.length * 100) : 0;
      const bankBySource = /* @__PURE__ */ new Map();
      for (const t of bankTxns) {
        const name = t.sourceName || "Bank";
        if (!bankBySource.has(name)) bankBySource.set(name, { approved: [], declined: [], cancelled: [] });
        const entry = bankBySource.get(name);
        if (t.matchStatus === "excluded") {
          const desc2 = (t.description || "").toLowerCase();
          if (desc2.includes("declined")) entry.declined.push(t);
          else entry.cancelled.push(t);
        } else {
          entry.approved.push(t);
        }
      }
      const fmt = (n) => parseFloat(n.toFixed(2));
      const summaryRows = [
        { Metric: "Period", Count: "", Amount: period.name },
        { Metric: "Period Dates", Count: "", Amount: `${period.startDate} to ${period.endDate}` },
        { Metric: "" },
        { Metric: "FUEL TRANSACTIONS", Count: "Count", Amount: "Amount" },
        { Metric: "  Card", Count: cardOnlyFuel.length, Amount: fmt(cardOnlyAmount) }
      ];
      if (debtorFuel.length > 0) {
        summaryRows.push({ Metric: "  Debtor / Account", Count: debtorFuel.length, Amount: fmt(debtorAmount) });
      }
      summaryRows.push(
        { Metric: "  Cash", Count: cashFuel.length, Amount: fmt(cashAmount) },
        { Metric: "  Total", Count: fuelTxns.length, Amount: fmt(totalFuelAmount) },
        { Metric: "" },
        { Metric: "BANK TRANSACTIONS" },
        { Metric: "  Total", Count: bankTxns.length },
        { Metric: "  Matchable", Count: matchableBank.length },
        { Metric: "  Outside Date Range", Count: outsideRange.length, Amount: outsideRangeAmount > 0 ? fmt(outsideRangeAmount) : void 0 },
        { Metric: "  Excluded (reversed/declined/cancelled)", Count: excludedBank.length }
      );
      if (bankBySource.size > 0) {
        summaryRows.push({ Metric: "" });
        const bankNames = Array.from(bankBySource.keys()).sort();
        const headerRow = { Metric: "" };
        for (const name of bankNames) headerRow[name] = name;
        headerRow["Total"] = "Total";
        summaryRows.push(headerRow);
        for (const { label, getter } of [
          { label: "Declined", getter: (e) => e.declined },
          { label: "Cancelled", getter: (e) => e.cancelled },
          { label: "Approved", getter: (e) => e.approved }
        ]) {
          const countRow = { Metric: label };
          let totalCount = 0;
          for (const name of bankNames) {
            const c = getter(bankBySource.get(name)).length;
            countRow[name] = c;
            totalCount += c;
          }
          countRow["Total"] = totalCount;
          summaryRows.push(countRow);
          const amtRow = { Metric: "Amount" };
          let totalAmt = 0;
          for (const name of bankNames) {
            const a = sumAmount(getter(bankBySource.get(name)));
            amtRow[name] = a > 0 ? fmt(a) : "-";
            totalAmt += a;
          }
          amtRow["Total"] = totalAmt > 0 ? fmt(totalAmt) : "-";
          summaryRows.push(amtRow);
        }
      }
      summaryRows.push(
        { Metric: "" },
        { Metric: "MATCHING" },
        { Metric: "  Matched", Count: matchedBank.length },
        { Metric: "  Match Rate", Count: `${matchRate}%` },
        { Metric: "  Unmatched Bank", Count: unmatchedBank.length },
        { Metric: "" },
        { Metric: "FINANCIAL RECONCILIATION", Count: "", Amount: "Amount" },
        { Metric: "  Fuel Card Sales Amount", Amount: fmt(cardFuelAmount) },
        { Metric: "  Bank Approved Amount", Amount: fmt(bankApprovedAmount) },
        { Metric: "  File Surplus / Shortfall", Amount: fmt(fileSurplus) },
        { Metric: "" },
        { Metric: "  Matched Bank Amount", Amount: fmt(matchedBankAmount) },
        { Metric: "  Corresponding Fuel Amount", Amount: fmt(matchedFuelAmount) },
        { Metric: "  Matched Surplus / Shortfall", Amount: fmt(matchedSurplus) },
        { Metric: "  Unmatched Bank Amount", Amount: unmatchedBankAmount > 0 ? fmt(unmatchedBankAmount) : "-" },
        { Metric: "" },
        { Metric: "  Unmatched Fuel Card", Amount: fmt(unmatchedFuelCardAmount) },
        { Metric: "  Total Fuel Card Reconciled", Amount: fmt(totalFuelCardReconciled) },
        { Metric: "  Reconciliation Surplus / Shortfall", Amount: fmt(reconSurplus) },
        { Metric: "" },
        { Metric: "  Excluded Bank Amount", Amount: fmt(excludedBankAmount) }
      );
      XLSX2.utils.book_append_sheet(wb, XLSX2.utils.json_to_sheet(summaryRows), "Summary");
      const matchedRows = matchesData.map((m) => {
        const bank = txMap.get(m.bankTransactionId);
        const fuel = txMap.get(m.fuelTransactionId);
        const bankAmt = bank ? parseFloat(bank.amount) : 0;
        const fuelAmt = fuel ? parseFloat(fuel.amount) : 0;
        return {
          "Date": bank?.transactionDate || fuel?.transactionDate || "",
          "Bank Time": bank?.transactionTime || "",
          "Fuel Time": fuel?.transactionTime || "",
          "Bank Amount": bankAmt,
          "Fuel Amount": fuelAmt,
          "Difference": Math.round((bankAmt - fuelAmt) * 100) / 100,
          "Bank Source": bank?.sourceName || "",
          "Bank Description": bank?.description || "",
          "Fuel Description": fuel?.description || "",
          "Card Number": bank?.cardNumber || "",
          "Payment Type": fuel?.paymentType || "",
          "Attendant": fuel?.attendant || "",
          "Cashier": fuel?.cashier || "",
          "Pump": fuel?.pump || "",
          "Confidence": m.matchConfidence ? `${m.matchConfidence}%` : "",
          "Match Type": m.matchType === "auto" ? "Auto Matched" : m.matchType === "auto_review" ? "Suggestion Accepted" : m.matchType === "manual" ? "Manual Accepted" : m.matchType || "Auto Matched"
        };
      });
      XLSX2.utils.book_append_sheet(wb, XLSX2.utils.json_to_sheet(matchedRows), "Matched");
      const unmatchedRows = unmatchedBank.map((t) => {
        const resolution = resolutionMap.get(t.id);
        return {
          "Date": t.transactionDate,
          "Time": t.transactionTime || "",
          "Amount": parseFloat(t.amount),
          "Bank": t.sourceName || t.sourceType,
          "Card Number": t.cardNumber || "",
          "Description": t.description || "",
          "Resolution": resolution ? resolution.resolutionType : "unresolved",
          "Reason": resolution?.reason || "",
          "Notes": resolution?.notes || ""
        };
      });
      XLSX2.utils.book_append_sheet(wb, XLSX2.utils.json_to_sheet(unmatchedRows), "Unmatched");
      if (excludedBank.length > 0) {
        const excludedRows = excludedBank.map((t) => {
          const reason = t.description?.match(/\[Excluded: (.+?)\]/)?.[1] || "Excluded";
          const cleanDesc = t.description?.replace(/\s*\[Excluded:.*?\]/g, "").trim() || "";
          return {
            "Date": t.transactionDate,
            "Time": t.transactionTime || "",
            "Amount": parseFloat(t.amount),
            "Bank": t.sourceName || t.sourceType,
            "Card Number": t.cardNumber || "",
            "Description": cleanDesc,
            "Reason": reason
          };
        });
        XLSX2.utils.book_append_sheet(wb, XLSX2.utils.json_to_sheet(excludedRows), "Excluded");
      }
      if (outsideRange.length > 0) {
        const outsideRows = outsideRange.map((t) => ({
          "Date": t.transactionDate,
          "Time": t.transactionTime || "",
          "Amount": parseFloat(t.amount),
          "Bank": t.sourceName || t.sourceType,
          "Card Number": t.cardNumber || "",
          "Description": t.description || ""
        }));
        XLSX2.utils.book_append_sheet(wb, XLSX2.utils.json_to_sheet(outsideRows), "Outside Date Range");
      }
      const fuelRows = fuelTxns.map((t) => {
        const match = matchMap.get(t.id);
        const bankTx = match ? txMap.get(match.bankTransactionId) : null;
        return {
          "Date": t.transactionDate,
          "Time": t.transactionTime || "",
          "Amount": parseFloat(t.amount),
          "Payment Type": t.paymentType || "",
          "Card Number": t.cardNumber || "",
          "Attendant": t.attendant || "",
          "Cashier": t.cashier || "",
          "Pump": t.pump || "",
          "Description": t.description || "",
          "Matched": match ? "Yes" : "No",
          "Bank Match Amount": bankTx ? parseFloat(bankTx.amount) : "",
          "Bank Source": bankTx?.sourceName || ""
        };
      });
      XLSX2.utils.book_append_sheet(wb, XLSX2.utils.json_to_sheet(fuelRows), "Fuel Transactions");
      const unmatchedFuel = fuelTxns.filter((t) => t.isCardTransaction === "yes" && t.matchStatus !== "matched");
      if (unmatchedFuel.length > 0) {
        const unmatchedFuelRows = unmatchedFuel.map((t) => ({
          "Date": t.transactionDate,
          "Time": t.transactionTime || "",
          "Amount": parseFloat(t.amount),
          "Payment Type": t.paymentType || "",
          "Card Number": t.cardNumber || "",
          "Reference": t.referenceNumber || "",
          "Attendant": t.attendant || "",
          "Cashier": t.cashier || "",
          "Pump": t.pump || "",
          "Description": t.description || ""
        }));
        const attendantTotals = /* @__PURE__ */ new Map();
        for (const t of unmatchedFuel) {
          const name = t.attendant || "Unknown";
          attendantTotals.set(name, (attendantTotals.get(name) || 0) + parseFloat(t.amount));
        }
        unmatchedFuelRows.push({});
        unmatchedFuelRows.push({ "Date": "", "Amount": fmt(unmatchedFuelCardAmount) });
        for (const [name, total] of Array.from(attendantTotals.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
          unmatchedFuelRows.push({ "Date": name, "Amount": fmt(total) });
        }
        unmatchedFuelRows.push({ "Date": "Fuel Card Unmatched", "Amount": fmt(unmatchedFuelCardAmount) });
        XLSX2.utils.book_append_sheet(wb, XLSX2.utils.json_to_sheet(unmatchedFuelRows), "Unmatched Fuel");
      }
      if (attendantSummary.length > 0) {
        const attendantRows = [];
        attendantRows.push({ "Attendant": "VERIFIED CARD SALES BY ATTENDANT" });
        attendantRows.push({});
        let grandVerifiedCount = 0;
        let grandVerifiedAmount = 0;
        for (const att of attendantSummary.filter((a) => a.matchedCount > 0).sort((a, b) => b.matchedBankAmount - a.matchedBankAmount)) {
          grandVerifiedCount += att.matchedCount;
          grandVerifiedAmount += att.matchedBankAmount;
          attendantRows.push({
            "Attendant": att.attendant,
            "Verified Sales": att.matchedCount,
            "Verified Amount (Fuel)": fmt(att.matchedAmount),
            "Verified Amount (Bank)": fmt(att.matchedBankAmount),
            "Unmatched Card Sales": att.unmatchedCount > 0 ? att.unmatchedCount : "",
            "Unmatched Amount": att.unmatchedCount > 0 ? fmt(att.unmatchedAmount) : ""
          });
          for (const bank of att.banks) {
            attendantRows.push({
              "Attendant": `  ${bank.bankName}`,
              "Verified Sales": bank.count,
              "Verified Amount (Bank)": fmt(bank.amount)
            });
          }
        }
        attendantRows.push({});
        attendantRows.push({
          "Attendant": "Total",
          "Verified Sales": grandVerifiedCount,
          "Verified Amount (Bank)": fmt(grandVerifiedAmount)
        });
        const unverified = attendantSummary.filter((a) => a.matchedCount === 0 && a.unmatchedCount > 0);
        if (unverified.length > 0) {
          attendantRows.push({});
          attendantRows.push({ "Attendant": "NO VERIFIED CARD SALES" });
          for (const att of unverified) {
            attendantRows.push({
              "Attendant": att.attendant,
              "Unmatched Card Sales": att.unmatchedCount,
              "Unmatched Amount": fmt(att.unmatchedAmount)
            });
          }
        }
        if (unmatchedBank.length > 0) {
          attendantRows.push({});
          attendantRows.push({
            "Attendant": "UNMATCHED BANK TRANSACTIONS",
            "Verified Sales": unmatchedBank.length,
            "Verified Amount (Bank)": fmt(unmatchedBankAmount)
          });
          attendantRows.push({ "Attendant": "These could not be attributed to any attendant \u2014 see Unmatched sheet" });
        }
        XLSX2.utils.book_append_sheet(wb, XLSX2.utils.json_to_sheet(attendantRows), "Attendant Summary");
      }
      const allRows = transactions2.map((t) => ({
        "Date": t.transactionDate,
        "Time": t.transactionTime || "",
        "Source": t.sourceType,
        "Source Name": t.sourceName || "",
        "Amount": parseFloat(t.amount),
        "Card Number": t.cardNumber || "",
        "Payment Type": t.paymentType || "",
        "Reference": t.referenceNumber || "",
        "Description": t.description || "",
        "Attendant": t.attendant || "",
        "Pump": t.pump || "",
        "Status": t.matchStatus
      }));
      XLSX2.utils.book_append_sheet(wb, XLSX2.utils.json_to_sheet(allRows), "All Transactions");
      const buffer = XLSX2.write(wb, { type: "buffer", bookType: "xlsx" });
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="Reconciliation_${period.name.replace(/\s+/g, "_")}.xlsx"`);
      res.send(buffer);
    } catch (error) {
      console.error("Error exporting reconciliation:", error);
      res.status(500).json({ error: "Failed to export reconciliation" });
    }
  });
  app2.get("/api/periods/:periodId/export-flagged", isAuthenticated, async (req, res) => {
    try {
      const period = await storage.getPeriod(req.params.periodId);
      if (!period) {
        return res.status(404).json({ error: "Period not found" });
      }
      const resolutions = await storage.getResolutionsByPeriod(req.params.periodId);
      const flaggedResolutions = resolutions.filter((r) => r.resolutionType === "flagged");
      if (flaggedResolutions.length === 0) {
        return res.status(404).json({ error: "No flagged transactions found" });
      }
      const transactions2 = await storage.getTransactionsByPeriod(req.params.periodId);
      const transactionMap = new Map(transactions2.map((t) => [t.id, t]));
      const flaggedData = flaggedResolutions.map((r) => {
        const tx = transactionMap.get(r.transactionId);
        return {
          "Bank Transaction Date": tx?.transactionDate || "",
          "Bank Amount": tx ? parseFloat(tx.amount) : 0,
          "Bank Reference": tx?.referenceNumber || "",
          "Description": tx?.description || "",
          "Flagged By": r.userName || r.userEmail || "Unknown",
          "Flagged Date": r.createdAt ? new Date(r.createdAt).toLocaleDateString("en-ZA") : "",
          "Notes": r.notes || ""
        };
      });
      const XLSX2 = await import("xlsx");
      const ws2 = XLSX2.utils.json_to_sheet(flaggedData);
      const wb = XLSX2.utils.book_new();
      XLSX2.utils.book_append_sheet(wb, ws2, "Flagged Transactions");
      const buffer = XLSX2.write(wb, { type: "buffer", bookType: "xlsx" });
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="Flagged_Transactions_${period.name.replace(/\s+/g, "_")}.xlsx"`);
      res.send(buffer);
    } catch (error) {
      console.error("Error exporting flagged transactions:", error);
      res.status(500).json({ error: "Failed to export flagged transactions" });
    }
  });
  const httpServer = createServer(app2);
  return httpServer;
}

// server/api.ts
var app = express();
app.use(express.json({
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: false }));
var isReady = false;
var initError = null;
var readyPromise = (async () => {
  try {
    await registerRoutes(app);
    app.use((err, _req, res, _next) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";
      res.status(status).json({ message });
    });
    isReady = true;
  } catch (err) {
    console.error("INIT ERROR:", err);
    initError = err;
  }
})();
async function handler(req, res) {
  if (!isReady) {
    await readyPromise;
  }
  if (initError) {
    res.status(500).json({ error: "Server initialization failed" });
    return;
  }
  return app(req, res);
}
export {
  handler as default
};
