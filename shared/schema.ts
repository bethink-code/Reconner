import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, decimal, jsonb, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Reconciliation Period
export const reconciliationPeriods = pgTable("reconciliation_periods", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  status: text("status").notNull().default("draft"),
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
  uploadedAt: timestamp("uploaded_at").defaultNow(),
  status: text("status").notNull().default("uploaded"),
});

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
  matchStatus: text("match_status").notNull().default("unmatched"),
  matchId: varchar("match_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

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
});

export const insertMatchSchema = createInsertSchema(matches).omit({
  id: true,
  createdAt: true,
});

export type InsertMatch = z.infer<typeof insertMatchSchema>;
export type Match = typeof matches.$inferSelect;
