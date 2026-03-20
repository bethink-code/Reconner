import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, decimal, jsonb, integer, boolean, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table for session/user management
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table for session/user management
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  isAdmin: boolean("is_admin").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

// Reconciliation Period
export const reconciliationPeriods = pgTable("reconciliation_periods", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  status: text("status").notNull().default("in_progress"),
  userId: varchar("user_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertReconciliationPeriodSchema = createInsertSchema(reconciliationPeriods).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertReconciliationPeriod = z.infer<typeof insertReconciliationPeriodSchema>;
export type ReconciliationPeriod = typeof reconciliationPeriods.$inferSelect;

// Uploaded Files
export const uploadedFiles = pgTable("uploaded_files", {
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
  bankName: text("bank_name"), // For bank files: FNB, ABSA, Standard Bank, Nedbank, Other
  uploadedAt: timestamp("uploaded_at").defaultNow(),
  status: text("status").notNull().default("uploaded"),
}, (table) => [
  index("IDX_uploaded_files_period_id").on(table.periodId),
]);

export const insertUploadedFileSchema = createInsertSchema(uploadedFiles).omit({
  id: true,
  uploadedAt: true,
});

export type InsertUploadedFile = z.infer<typeof insertUploadedFileSchema>;
export type UploadedFile = typeof uploadedFiles.$inferSelect;

// Transactions
export const transactions = pgTable("transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fileId: varchar("file_id").notNull().references(() => uploadedFiles.id, { onDelete: "cascade" }),
  periodId: varchar("period_id").notNull().references(() => reconciliationPeriods.id, { onDelete: "cascade" }),
  sourceType: text("source_type").notNull(),
  sourceName: text("source_name"), // Name of the source (e.g., "FNB Merchant", "Fuel Master")
  rawData: jsonb("raw_data").notNull(),
  transactionDate: text("transaction_date").notNull(),
  transactionTime: text("transaction_time"),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  description: text("description"),
  referenceNumber: text("reference_number"),
  cardNumber: text("card_number"), // Masked card number like ****1234 for matching
  paymentType: text("payment_type"), // 'card', 'cash', 'credit_card', etc.
  isCardTransaction: text("is_card_transaction").default("unknown"), // 'yes', 'no', 'unknown' - for filtering reconciliation
  attendant: text("attendant"), // Pump attendant name
  cashier: text("cashier"), // Cashier name (may differ from attendant)
  pump: text("pump"), // Pump number
  matchStatus: text("match_status").notNull().default("unmatched"),
  matchId: varchar("match_id"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("IDX_transactions_period_id").on(table.periodId),
  index("IDX_transactions_file_id").on(table.fileId),
  index("IDX_transactions_match_status").on(table.matchStatus),
]);

export const insertTransactionSchema = createInsertSchema(transactions).omit({
  id: true,
  createdAt: true,
});

export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type Transaction = typeof transactions.$inferSelect;

// Matches
export const matches = pgTable("matches", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  periodId: varchar("period_id").notNull().references(() => reconciliationPeriods.id, { onDelete: "cascade" }),
  fuelTransactionId: varchar("fuel_transaction_id").notNull().references(() => transactions.id, { onDelete: "cascade" }),
  bankTransactionId: varchar("bank_transaction_id").notNull().references(() => transactions.id, { onDelete: "cascade" }),
  matchType: text("match_type").notNull(),
  matchConfidence: decimal("match_confidence", { precision: 5, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("IDX_matches_period_id").on(table.periodId),
]);

export const insertMatchSchema = createInsertSchema(matches).omit({
  id: true,
  createdAt: true,
});

export type InsertMatch = z.infer<typeof insertMatchSchema>;
export type Match = typeof matches.$inferSelect;

// Matching Rules - User-configurable matching settings per period
export const matchingRules = pgTable("matching_rules", {
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
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertMatchingRulesSchema = createInsertSchema(matchingRules).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertMatchingRules = z.infer<typeof insertMatchingRulesSchema>;
export type MatchingRules = typeof matchingRules.$inferSelect;

// Zod schema for API validation
export const matchingRulesConfigSchema = z.object({
  amountTolerance: z.number().min(0).max(50),
  dateWindowDays: z.number().int().min(0).max(7),
  timeWindowMinutes: z.number().int().min(15).max(1440),
  groupByInvoice: z.boolean(),
  requireCardMatch: z.boolean(),
  minimumConfidence: z.number().int().min(0).max(100),
  autoMatchThreshold: z.number().int().min(0).max(100),
});

export type MatchingRulesConfig = z.infer<typeof matchingRulesConfigSchema>;

// Transaction Resolutions - Audit trail for resolved transactions
export const transactionResolutions = pgTable("transaction_resolutions", {
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
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("IDX_transaction_resolutions_transaction_id").on(table.transactionId),
  index("IDX_transaction_resolutions_period_id").on(table.periodId),
]);

export const insertTransactionResolutionSchema = createInsertSchema(transactionResolutions).omit({
  id: true,
  createdAt: true,
});

export type InsertTransactionResolution = z.infer<typeof insertTransactionResolutionSchema>;
export type TransactionResolution = typeof transactionResolutions.$inferSelect;

// Audit Logs — tracks security-sensitive operations
export const auditLogs = pgTable("audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  userEmail: text("user_email"),
  action: text("action").notNull(), // e.g. 'period.delete', 'file.upload', 'auth.login_failed'
  resourceType: text("resource_type"), // e.g. 'period', 'file', 'match', 'user'
  resourceId: varchar("resource_id"),
  outcome: text("outcome").notNull().default("success"), // 'success', 'denied', 'error'
  detail: text("detail"), // Additional context (e.g. "Ownership check failed")
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("IDX_audit_logs_user_id").on(table.userId),
  index("IDX_audit_logs_action").on(table.action),
  index("IDX_audit_logs_created_at").on(table.createdAt),
]);

export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = typeof auditLogs.$inferInsert;

// Invited Users — only these emails can log in
export const invitedUsers = pgTable("invited_users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").notNull().unique(),
  invitedBy: varchar("invited_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export type InvitedUser = typeof invitedUsers.$inferSelect;
export type InsertInvitedUser = typeof invitedUsers.$inferInsert;

// Access Requests — uninvited users can request access
export const accessRequests = pgTable("access_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  email: varchar("email").notNull(),
  cell: text("cell").notNull(),
  status: text("status").notNull().default("pending"), // 'pending', 'approved', 'declined'
  createdAt: timestamp("created_at").defaultNow(),
});

export type AccessRequest = typeof accessRequests.$inferSelect;

// Resolution reason options
export const RESOLUTION_REASONS = [
  { value: "timing_difference", label: "Timing difference (posted next day)" },
  { value: "cash_as_card", label: "Cash recorded as card (or vice versa)" },
  { value: "test_transaction", label: "Test/pre-auth transaction" },
  { value: "different_merchant", label: "Different merchant account" },
  { value: "refund_reversal", label: "Refund/reversal" },
  { value: "bank_fee", label: "Bank fee/charge" },
  { value: "other", label: "Other" },
] as const;
