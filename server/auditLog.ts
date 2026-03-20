import { db } from "./db";
import { auditLogs } from "../shared/schema";
import { desc, eq, and, gte, lte, sql } from "drizzle-orm";

interface AuditEntry {
  action: string;
  resourceType?: string;
  resourceId?: string;
  outcome?: "success" | "denied" | "error";
  detail?: string;
}

/**
 * Log a security-sensitive operation to the audit_logs table.
 * Extracts userId, userEmail, and IP from the Express request.
 * Never throws — audit failures are logged to console but don't break the request.
 */
export async function audit(req: any, entry: AuditEntry): Promise<void> {
  try {
    const userId = req.user?.claims?.sub || null;
    const userEmail = req.user?.claims?.email || null;
    const ipAddress = req.headers?.["x-forwarded-for"]?.split(",")[0]?.trim()
      || req.socket?.remoteAddress
      || null;

    await db.insert(auditLogs).values({
      userId,
      userEmail,
      action: entry.action,
      resourceType: entry.resourceType || null,
      resourceId: entry.resourceId || null,
      outcome: entry.outcome || "success",
      detail: entry.detail || null,
      ipAddress,
    });
  } catch (err) {
    console.error("[AUDIT] Failed to write audit log:", err);
  }
}

/**
 * Query audit logs with optional filters. Used by the admin endpoint.
 */
export async function queryAuditLogs(filters: {
  userId?: string;
  action?: string;
  resourceType?: string;
  outcome?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}) {
  const conditions = [];

  if (filters.userId) conditions.push(eq(auditLogs.userId, filters.userId));
  if (filters.action) conditions.push(eq(auditLogs.action, filters.action));
  if (filters.resourceType) conditions.push(eq(auditLogs.resourceType, filters.resourceType));
  if (filters.outcome) conditions.push(eq(auditLogs.outcome, filters.outcome));
  if (filters.from) conditions.push(gte(auditLogs.createdAt, new Date(filters.from)));
  if (filters.to) conditions.push(lte(auditLogs.createdAt, new Date(filters.to)));

  const limit = Math.min(filters.limit || 100, 500);
  const offset = filters.offset || 0;

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [logs, countResult] = await Promise.all([
    db.select().from(auditLogs)
      .where(where)
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(auditLogs).where(where),
  ]);

  return {
    logs,
    total: Number(countResult[0]?.count || 0),
    limit,
    offset,
  };
}
