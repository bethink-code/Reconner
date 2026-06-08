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
  // Platform owner = Lekana staff. Can belong to multiple orgs and switch between them.
  isPlatformOwner: boolean("is_platform_owner").notNull().default(false),
  termsAcceptedAt: timestamp("terms_accepted_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

// Organizations — each customer (e.g. "Desert Trading") is one org. All business data is scoped to an org.
export const organizations = pgTable("organizations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  slug: varchar("slug").notNull().unique(),
  // Billing fields (populated later, kept here so future invoicing has a stable home)
  billingEmail: varchar("billing_email"),
  billingAddress: text("billing_address"),
  vatNumber: varchar("vat_number"),
  // Business type — every property in this org inherits this vertical. Property-level
  // overrides aren't supported (an org IS a business). Defaults to 'fuel' for safety on
  // existing rows; new orgs pick at create time via the admin form.
  verticalId: text("vertical_id").notNull().default("fuel"),
  status: text("status").notNull().default("active"), // 'active', 'suspended'
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type Organization = typeof organizations.$inferSelect;
export type InsertOrganization = typeof organizations.$inferInsert;

// Membership: user ↔ org with role. Regular users have one row. Platform owner may have many.
export const organizationMembers = pgTable("organization_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("viewer"), // 'owner' | 'admin' | 'viewer'
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("IDX_org_members_org_id").on(table.organizationId),
  index("IDX_org_members_user_id").on(table.userId),
]);

export type OrganizationMember = typeof organizationMembers.$inferSelect;
export type InsertOrganizationMember = typeof organizationMembers.$inferInsert;

export const ORG_ROLES = ["owner", "admin", "viewer"] as const;
export type OrgRole = typeof ORG_ROLES[number];

// Properties — physical sites within an organization. Most petrol-station owners run multiple stations.
// One period currently belongs to one property; cross-property roll-ups are a future feature.
export const properties = pgTable("properties", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  code: varchar("code"), // Optional short code, e.g. "DT-01"
  address: text("address"),
  verticalId: text("vertical_id").notNull().default("fuel"), // business type: 'fuel' | 'retail' — drives vocabulary, insights, sales-side sourceType
  status: text("status").notNull().default("active"), // 'active' | 'archived'
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("IDX_properties_org_id").on(table.organizationId),
]);

export type Property = typeof properties.$inferSelect;
export type InsertProperty = typeof properties.$inferInsert;

// Reconciliation Period
export const reconciliationPeriods = pgTable("reconciliation_periods", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
  propertyId: varchar("property_id").references(() => properties.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  status: text("status").notNull().default("in_progress"),
  userId: varchar("user_id").references(() => users.id), // creator (kept for audit/history)
  // Cash Gap input — total cash the owner says they received this period. Null = not yet entered.
  // Discrepancy (the leak) = POS cash sales − this. See shared/cashGap.ts.
  cashReceivedAmount: decimal("cash_received_amount", { precision: 12, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("IDX_periods_org_id").on(table.organizationId),
  index("IDX_periods_property_id").on(table.propertyId),
]);

export const insertReconciliationPeriodSchema = createInsertSchema(reconciliationPeriods).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertReconciliationPeriod = z.infer<typeof insertReconciliationPeriodSchema>;
export type ReconciliationPeriod = typeof reconciliationPeriods.$inferSelect;

// Cash spent — one row per item the owner spent from the till in cash during a period
// (food, Uber, paid-for-X). Each item has an amount, a date, and a reason. Trusted because
// the owner captured it. Summed, it feeds the "cash in hand" line (received − spent) — it does
// NOT affect the leak. paymentDate lets the daily breakdown attribute spend to specific days.
export const periodCashPayments = pgTable("period_cash_payments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  periodId: varchar("period_id").notNull().references(() => reconciliationPeriods.id, { onDelete: "cascade" }),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  paymentDate: text("payment_date").notNull(),
  reason: text("reason").notNull(),
  userId: varchar("user_id").references(() => users.id),
  userName: text("user_name"),
  userEmail: text("user_email"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("IDX_period_cash_payments_period_id").on(table.periodId),
]);

export const insertPeriodCashPaymentSchema = createInsertSchema(periodCashPayments).omit({
  id: true,
  createdAt: true,
});

export type InsertPeriodCashPayment = z.infer<typeof insertPeriodCashPaymentSchema>;
export type PeriodCashPayment = typeof periodCashPayments.$inferSelect;

// Uploaded Files
export const uploadedFiles = pgTable("uploaded_files", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  periodId: varchar("period_id").notNull().references(() => reconciliationPeriods.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  fileType: text("file_type").notNull(),
  sourceType: text("source_type").notNull(),
  sourceName: text("source_name").notNull(),
  fileUrl: text("file_url").notNull(),
  fileData: text("file_data"), // base64-encoded file buffer (for serverless persistence)
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

  // Attendant submission delay in minutes for exact same-day slip submission lag
  attendantSubmissionDelayMinutes: integer("attendant_submission_delay_minutes").notNull().default(120),
  
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
  attendantSubmissionDelayMinutes: z.number().int().min(0).max(480),
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
  organizationId: varchar("organization_id").references(() => organizations.id, { onDelete: "set null" }),
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
  index("IDX_audit_logs_org_id").on(table.organizationId),
]);

export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = typeof auditLogs.$inferInsert;

// Invited Users — only these emails can log in. Each invite is scoped to an org with a role.
export const invitedUsers = pgTable("invited_users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").notNull().unique(),
  organizationId: varchar("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("viewer"), // 'owner' | 'admin' | 'viewer'
  invitedBy: varchar("invited_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("IDX_invited_users_org_id").on(table.organizationId),
]);

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

// AI Usage tracking for billing — tracked per user AND per org so invoices can roll up to org.
export const aiUsage = pgTable("ai_usage", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").references(() => organizations.id, { onDelete: "set null" }),
  userId: varchar("user_id").references(() => users.id),
  userEmail: text("user_email"),
  action: text("action").notNull(), // e.g. 'convert.ai_extract'
  model: text("model").notNull(),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  estimatedCostUsd: decimal("estimated_cost_usd", { precision: 10, scale: 6 }).notNull().default("0"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("IDX_ai_usage_user_id").on(table.userId),
  index("IDX_ai_usage_created_at").on(table.createdAt),
  index("IDX_ai_usage_org_id").on(table.organizationId),
]);

export type AiUsageRecord = typeof aiUsage.$inferSelect;

// Pricing / viability scenarios — internal Bethink tooling, shared across the
// platform owners (Garth + Pieter). Deliberately NOT tenant-scoped: this is
// company strategy data, gated behind isPlatformOwner and never exposed to a
// customer org. `inputs` holds the full model input set (DEFAULT_INPUTS shape).
export const pricingScenarios = pgTable("pricing_scenarios", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  inputs: jsonb("inputs").notNull(),
  createdBy: varchar("created_by").references(() => users.id),
  createdByEmail: text("created_by_email"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("IDX_pricing_scenarios_created_at").on(table.createdAt),
]);

export type PricingScenario = typeof pricingScenarios.$inferSelect;
export type InsertPricingScenario = typeof pricingScenarios.$inferInsert;

// Resolution reasons are now vertical-specific — see shared/verticals (resolutionReasons).

// ─── Pilot Enrollment ──────────────────────────────────────────────────────────
// Three-stage enrollment flow: Data Policy → Pilot Terms → Application.
// These tables are pre-auth: they capture prospective customers before they have
// a Lekana account. policyAcknowledgmentId is the stable link across all stages.

export const policyAcknowledgments = pgTable("policy_acknowledgments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fullName: varchar("full_name", { length: 255 }).notNull(),
  businessName: varchar("business_name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  cellNumber: varchar("cell_number", { length: 20 }).notNull(),
  dataPolicyAcknowledged: boolean("data_policy_acknowledged").notNull().default(false),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  submittedAt: timestamp("submitted_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("IDX_policy_ack_email").on(table.email),
  index("IDX_policy_ack_submitted_at").on(table.submittedAt),
]);

export type PolicyAcknowledgment = typeof policyAcknowledgments.$inferSelect;

export const termsAcknowledgments = pgTable("terms_acknowledgments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // Nullable: terms is now step 1, so no policy ID exists yet at creation time.
  // Linked when policy is submitted in step 2.
  policyAcknowledgmentId: varchar("policy_acknowledgment_id").references(() => policyAcknowledgments.id, { onDelete: "cascade" }),
  pilotTermsAcknowledged: boolean("pilot_terms_acknowledged").notNull().default(false),
  feedbackPermissionGranted: boolean("feedback_permission_granted").notNull().default(false),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  submittedAt: timestamp("submitted_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("IDX_terms_ack_policy_id").on(table.policyAcknowledgmentId),
  index("IDX_terms_ack_submitted_at").on(table.submittedAt),
]);

export type TermsAcknowledgment = typeof termsAcknowledgments.$inferSelect;

export const pilotApplications = pgTable("pilot_applications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  policyAcknowledgmentId: varchar("policy_acknowledgment_id").notNull().references(() => policyAcknowledgments.id, { onDelete: "cascade" }),
  termsAcknowledgmentId: varchar("terms_acknowledgment_id").notNull().references(() => termsAcknowledgments.id, { onDelete: "cascade" }),
  fullName: varchar("full_name", { length: 255 }).notNull(),
  businessName: varchar("business_name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  cellNumber: varchar("cell_number", { length: 20 }).notNull(),
  numSites: integer("num_sites").notNull(),
  posSystem: varchar("pos_system", { length: 255 }).notNull(),
  banks: text("banks").notNull(), // JSON array stored as text: '["FNB","ABSA"]'
  successStory: text("success_story").notNull(),
  readyToProceed: boolean("ready_to_proceed").notNull().default(false),
  pilotStatus: text("pilot_status").notNull().default("pending_approval"), // pending_approval | approved | onboarding | running | completed | withdrawn
  pilotStartDate: text("pilot_start_date"),
  pilotEndDate: text("pilot_end_date"),
  approvedAt: timestamp("approved_at"),
  approvedBy: text("approved_by"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  submittedAt: timestamp("submitted_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("IDX_pilot_apps_email").on(table.email),
  index("IDX_pilot_apps_submitted_at").on(table.submittedAt),
  index("IDX_pilot_apps_status").on(table.pilotStatus),
  index("IDX_pilot_apps_policy_id").on(table.policyAcknowledgmentId),
]);

export type PilotApplicationRecord = typeof pilotApplications.$inferSelect;

// Audit trail for enrollment + pilot lifecycle.
// policyAcknowledgmentId is set for all stages.
// pilotApplicationId is null until Stage 3.
export const pilotWorkflowLog = pgTable("pilot_workflow_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  pilotApplicationId: varchar("pilot_application_id").references(() => pilotApplications.id, { onDelete: "cascade" }),
  policyAcknowledgmentId: varchar("policy_acknowledgment_id").references(() => policyAcknowledgments.id, { onDelete: "cascade" }),
  eventType: text("event_type").notNull(), // policy_acknowledged | terms_acknowledged | application_submitted | approved | withdrawn
  stage: text("stage"), // policy | terms | application | onboarding | running | post_pilot
  eventDescription: text("event_description"),
  triggeredBy: text("triggered_by"), // system | pieter@bethink.co.za | etc.
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  eventAt: timestamp("event_at").defaultNow(),
}, (table) => [
  index("IDX_workflow_log_app_id").on(table.pilotApplicationId),
  index("IDX_workflow_log_policy_id").on(table.policyAcknowledgmentId),
  index("IDX_workflow_log_event_type").on(table.eventType),
  index("IDX_workflow_log_event_at").on(table.eventAt),
]);
