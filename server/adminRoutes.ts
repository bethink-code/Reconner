import type { Express } from "express";
import { isAuthenticated } from "./auth";
import { isAdmin, resolveOrgContext } from "./routeAccess";
import { storage } from "./storage";
import { audit, queryAuditLogs } from "./auditLog";
import { pool } from "./db";
import { ORG_ROLES, type OrgRole } from "../shared/schema";

// Admin console backend: user management, invites, access requests, security
// overview, audit log, AI usage. All gated behind isAdmin (platform owners are
// granted isAdmin automatically on login — see auth.ts).
export function registerAdminRoutes(app: Express): void {
  // ----- USERS -----
  app.get("/api/admin/users", isAuthenticated, isAdmin, async (_req, res) => {
    try {
      const users = await storage.getAllUsers();
      res.json(users);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  app.patch("/api/admin/users/:id/admin", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { isAdmin: makeAdmin } = req.body;
      if (typeof makeAdmin !== "boolean") {
        return res.status(400).json({ message: "isAdmin must be a boolean" });
      }
      // Prevent removing own admin status
      if (req.params.id === req.user.claims.sub && !makeAdmin) {
        return res.status(400).json({ message: "Cannot remove your own admin status" });
      }
      const updated = await storage.setUserAdmin(req.params.id, makeAdmin);
      if (!updated) {
        return res.status(404).json({ message: "User not found" });
      }
      audit(req, { action: makeAdmin ? "admin.grant" : "admin.revoke", resourceType: "user", resourceId: req.params.id, detail: updated.email || undefined });
      res.json(updated);
    } catch (error) {
      console.error("Error updating user admin status:", error);
      res.status(500).json({ message: "Failed to update user" });
    }
  });

  // ----- INVITES -----
  // Scoped per org. Platform owner can pass any orgId; org admin/owner only
  // sees and invites into their current org.
  app.get("/api/admin/invites", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const me = await storage.getUser(userId);
      const orgIdFilter = req.query.organizationId as string | undefined;
      if (me?.isPlatformOwner) {
        const invites = await storage.getInvitedUsers(orgIdFilter);
        return res.json(invites);
      }
      const ctx = await resolveOrgContext(req, res);
      if (!ctx) return;
      if (ctx.role === "viewer") {
        return res.status(403).json({ error: "Admin access required" });
      }
      const invites = await storage.getInvitedUsers(ctx.orgId);
      res.json(invites);
    } catch (error) {
      console.error("Error fetching invites:", error);
      res.status(500).json({ error: "Failed to fetch invites" });
    }
  });

  app.post("/api/admin/invites", isAuthenticated, async (req: any, res) => {
    try {
      const { email, organizationId, role } = req.body;
      if (!email || typeof email !== "string") {
        return res.status(400).json({ error: "Email is required" });
      }
      if (!organizationId) {
        return res.status(400).json({ error: "organizationId is required" });
      }
      const inviteRole: OrgRole = (role && ORG_ROLES.includes(role) ? role : "viewer") as OrgRole;
      const trimmed = email.trim().toLowerCase();
      if (!trimmed.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
        return res.status(400).json({ error: "Invalid email address" });
      }

      // Authorisation: platform owner OR owner/admin of the target org
      const userId = req.user?.claims?.sub;
      const me = await storage.getUser(userId);
      let allowed = !!me?.isPlatformOwner;
      if (!allowed) {
        const myRole = await storage.getUserRoleInOrg(userId, organizationId);
        allowed = myRole === "owner" || myRole === "admin";
      }
      if (!allowed) {
        return res.status(403).json({ error: "Not allowed to invite to this organization" });
      }

      const isAlready = await storage.isEmailInvited(trimmed);
      if (isAlready) {
        return res.status(409).json({ error: "This email is already invited" });
      }
      const invited = await storage.inviteUser(trimmed, organizationId, inviteRole, userId);
      audit(req, { action: "invite.create", resourceType: "invite", resourceId: invited.id, detail: `${trimmed} → ${organizationId} (${inviteRole})` });
      res.json(invited);
    } catch (error) {
      console.error("Error creating invite:", error);
      res.status(500).json({ error: "Failed to create invite" });
    }
  });

  app.delete("/api/admin/invites/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      await storage.removeInvite(req.params.id);
      audit(req, { action: "invite.revoke", resourceType: "invite", resourceId: req.params.id });
      res.json({ success: true });
    } catch (error) {
      console.error("Error removing invite:", error);
      res.status(500).json({ error: "Failed to remove invite" });
    }
  });

  // ----- ACCESS REQUESTS -----
  app.get("/api/admin/access-requests", isAuthenticated, isAdmin, async (_req, res) => {
    try {
      const requests = await storage.getAccessRequests();
      res.json(requests);
    } catch (error) {
      console.error("Error fetching access requests:", error);
      res.status(500).json({ error: "Failed to fetch access requests" });
    }
  });

  app.patch("/api/admin/access-requests/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { status, organizationId, role } = req.body;
      if (!status || !["approved", "declined"].includes(status)) {
        return res.status(400).json({ error: "Status must be 'approved' or 'declined'" });
      }
      if (status === "approved" && !organizationId) {
        return res.status(400).json({ error: "organizationId required when approving" });
      }
      const updated = await storage.updateAccessRequestStatus(req.params.id, status);
      if (!updated) {
        return res.status(404).json({ error: "Request not found" });
      }
      // Auto-invite on approval — must be assigned to a specific org
      if (status === "approved") {
        const isAlready = await storage.isEmailInvited(updated.email);
        if (!isAlready) {
          const userId = req.user?.claims?.sub;
          const inviteRole: OrgRole = (role && ORG_ROLES.includes(role) ? role : "viewer") as OrgRole;
          await storage.inviteUser(updated.email, organizationId, inviteRole, userId);
        }
      }
      audit(req, { action: `access_request.${status}`, resourceType: "access_request", resourceId: req.params.id, detail: updated.email });
      res.json(updated);
    } catch (error) {
      console.error("Error updating access request:", error);
      res.status(500).json({ error: "Failed to update access request" });
    }
  });

  // ----- SECURITY OVERVIEW -----
  app.get("/api/admin/security-overview", isAuthenticated, isAdmin, async (_req, res) => {
    try {
      const sessionsResult = await pool.query(`SELECT COUNT(*) as count FROM sessions WHERE expire > NOW()`);
      const activeSessions = parseInt(sessionsResult.rows[0]?.count || "0");

      const usersResult = await pool.query(`SELECT COUNT(*) as count FROM users`);
      const totalUsers = parseInt(usersResult.rows[0]?.count || "0");

      const termsResult = await pool.query(`SELECT COUNT(*) as count FROM users WHERE terms_accepted_at IS NOT NULL`);
      const termsAccepted = parseInt(termsResult.rows[0]?.count || "0");

      const pendingInvitesResult = await pool.query(
        `SELECT COUNT(*) as count FROM invited_users iu WHERE NOT EXISTS (SELECT 1 FROM users u WHERE LOWER(u.email) = LOWER(iu.email))`,
      );
      const pendingInvites = parseInt(pendingInvitesResult.rows[0]?.count || "0");

      const last24h = await pool.query(
        `SELECT action, outcome, COUNT(*) as count FROM audit_logs WHERE created_at > NOW() - INTERVAL '24 hours' GROUP BY action, outcome ORDER BY count DESC`,
      );

      const denials7d = await pool.query(
        `SELECT user_email, ip_address, detail, created_at FROM audit_logs WHERE outcome = 'denied' AND created_at > NOW() - INTERVAL '7 days' ORDER BY created_at DESC LIMIT 20`,
      );

      const auditTotalResult = await pool.query(`SELECT COUNT(*) as count FROM audit_logs`);
      const totalAuditEvents = parseInt(auditTotalResult.rows[0]?.count || "0");

      res.json({
        activeSessions,
        totalUsers,
        termsAccepted,
        pendingInvites,
        totalAuditEvents,
        last24h: last24h.rows,
        recentDenials: denials7d.rows,
      });
    } catch (error) {
      console.error("Error fetching security overview:", error);
      res.status(500).json({ error: "Failed to fetch security overview" });
    }
  });

  // ----- AUDIT LOG -----
  app.get("/api/admin/audit-logs", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const result = await queryAuditLogs({
        userId: req.query.userId as string | undefined,
        action: req.query.action as string | undefined,
        resourceType: req.query.resourceType as string | undefined,
        outcome: req.query.outcome as string | undefined,
        from: req.query.from as string | undefined,
        to: req.query.to as string | undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 100,
        offset: req.query.offset ? parseInt(req.query.offset as string) : 0,
      });
      res.json(result);
    } catch (error) {
      console.error("Error fetching audit logs:", error);
      res.status(500).json({ error: "Failed to fetch audit logs" });
    }
  });

  // ----- AI USAGE -----
  app.get("/api/admin/ai-usage", isAuthenticated, isAdmin, async (_req, res) => {
    try {
      const summary = await pool.query(`
        SELECT
          COUNT(*) as total_calls,
          COALESCE(SUM(input_tokens), 0) as total_input_tokens,
          COALESCE(SUM(output_tokens), 0) as total_output_tokens,
          COALESCE(SUM(estimated_cost_usd::numeric), 0) as total_cost_usd
        FROM ai_usage
      `);
      const byUser = await pool.query(`
        SELECT user_email, COUNT(*) as calls, COALESCE(SUM(estimated_cost_usd::numeric), 0) as cost_usd
        FROM ai_usage
        GROUP BY user_email
        ORDER BY cost_usd DESC
      `);
      const recent = await pool.query(`
        SELECT user_email, action, model, input_tokens, output_tokens, estimated_cost_usd, created_at
        FROM ai_usage
        ORDER BY created_at DESC
        LIMIT 50
      `);
      res.json({
        summary: summary.rows[0],
        byUser: byUser.rows,
        recent: recent.rows,
      });
    } catch (error) {
      console.error("Error fetching AI usage:", error);
      res.status(500).json({ error: "Failed to fetch AI usage" });
    }
  });
}
