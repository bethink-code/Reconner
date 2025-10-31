import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, decimal, jsonb } from "drizzle-orm/pg-core";
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

// Reconciliation Period Schema
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

// Transaction Schema
export const transactionSchema = z.object({
  id: z.string(),
  date: z.string(),
  amount: z.number(),
  reference: z.string(),
  description: z.string().optional(),
  source: z.enum(["fuel", "bank1", "bank2"]),
  matchStatus: z.enum(["matched", "unmatched", "partial"]).optional(),
  matchedWith: z.string().optional(),
  notes: z.string().optional(),
});

export type Transaction = z.infer<typeof transactionSchema>;

// File Upload Schema
export const fileUploadSchema = z.object({
  id: z.string(),
  fileName: z.string(),
  fileType: z.string(),
  fileSize: z.number(),
  source: z.enum(["fuel", "bank1", "bank2"]),
  uploadedAt: z.string(),
  status: z.enum(["uploading", "processing", "completed", "error"]),
});

export type FileUpload = z.infer<typeof fileUploadSchema>;

// Column Mapping Schema
export const columnMappingSchema = z.object({
  detectedColumn: z.string(),
  mappedTo: z.enum(["date", "amount", "reference", "description", "ignore"]),
});

export type ColumnMapping = z.infer<typeof columnMappingSchema>;

// Reconciliation Report Schema
export const reconciliationReportSchema = z.object({
  periodId: z.string(),
  totalTransactions: z.number(),
  matchedCount: z.number(),
  unmatchedCount: z.number(),
  partialMatchCount: z.number(),
  reconciliationRate: z.number(),
  totalAmount: z.number(),
  discrepancy: z.number(),
  generatedAt: z.string(),
});

export type ReconciliationReport = z.infer<typeof reconciliationReportSchema>;
