import type { Express } from "express";
import { createServer, type Server } from "http";
import { createHash } from "crypto";
import multer from "multer";
import { storage } from "./storage";
import { pool } from "./db";
import { fileParser, DataNormalizer, SOURCE_PRESETS, detectAndExcludeReversals, detectAndExcludeDuplicates } from "./fileParser";
import { dataQualityValidator } from "./dataQualityValidator";
import { objectStorageService } from "./objectStorage";
import { setupAuth, isAuthenticated, requireOrg, requireWriter, requireOrgOwner } from "./auth";
import { audit, queryAuditLogs } from "./auditLog";
import { computeConfidenceScore, extractTablesWithAI } from "./pdfAiExtractor";
import rateLimit from "express-rate-limit";
import {
  insertReconciliationPeriodSchema,
  insertUploadedFileSchema,
  insertTransactionSchema,
  insertMatchSchema,
  matchingRulesConfigSchema,
  ORG_ROLES,
  type User,
  type ReconciliationPeriod,
  type UploadedFile,
  type OrgRole
} from "../shared/schema";
import { z } from "zod";

function computeContentHash(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex").slice(0, 16);
}

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024,
  }
});

// Expanded column mapping schema to include time and payment type
const columnMappingSchema = z.record(z.enum(['date', 'amount', 'reference', 'description', 'time', 'paymentType', 'cardNumber', 'attendant', 'cashier', 'pump', 'ignore']));

export async function registerRoutes(app: Express): Promise<Server> {
  // Setup authentication
  await setupAuth(app);

  // Auth endpoint to get current user — now also returns org memberships and current org context
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      if (!req.user?.claims?.sub) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      const memberships = await storage.getUserOrganizations(userId);
      // If session has no current org but user has memberships, default to first
      if (!req.user.currentOrgId && memberships.length > 0) {
        req.user.currentOrgId = memberships[0].organization.id;
        req.user.currentOrgRole = memberships[0].role;
      }
      const currentOrgId = req.user.currentOrgId || null;
      const currentOrgRole = req.user.currentOrgRole || null;
      const currentOrg = currentOrgId
        ? memberships.find(m => m.organization.id === currentOrgId)?.organization || null
        : null;
      // Properties for the current org. Auto-pick the first one if session is empty.
      const orgProperties = currentOrgId ? await storage.getPropertiesByOrg(currentOrgId) : [];
      if (currentOrgId && !req.user.currentPropertyId && orgProperties.length > 0) {
        req.user.currentPropertyId = orgProperties[0].id;
      }
      const currentPropertyId = req.user.currentPropertyId || null;
      const currentProperty = currentPropertyId
        ? orgProperties.find(p => p.id === currentPropertyId) || null
        : null;
      res.json({
        ...user,
        organizations: memberships.map(m => ({ ...m.organization, role: m.role })),
        currentOrg,
        currentOrgId,
        currentOrgRole,
        properties: orgProperties,
        currentProperty,
        currentPropertyId,
      });
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Switch active organization (platform owner only, or any user with multiple memberships)
  app.post('/api/me/switch-org', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const { organizationId } = req.body || {};
      if (!organizationId) return res.status(400).json({ error: "organizationId required" });
      const role = await storage.getUserRoleInOrg(userId, organizationId);
      if (!role) return res.status(403).json({ error: "Not a member of that organization" });
      req.user.currentOrgId = organizationId;
      req.user.currentOrgRole = role;
      // Reset property to first one in the new org
      const props = await storage.getPropertiesByOrg(organizationId);
      req.user.currentPropertyId = props[0]?.id;
      const org = await storage.getOrganization(organizationId);
      audit(req, { action: "org.switch", resourceType: "organization", resourceId: organizationId });
      res.json({ success: true, organization: org, role, currentPropertyId: req.user.currentPropertyId });
    } catch (error) {
      console.error("Error switching org:", error);
      res.status(500).json({ error: "Failed to switch organization" });
    }
  });

  // Switch active property (within current org)
  app.post('/api/me/switch-property', isAuthenticated, async (req: any, res) => {
    try {
      const ctx = await resolveOrgContext(req, res);
      if (!ctx) return;
      const { propertyId } = req.body || {};
      if (!propertyId) return res.status(400).json({ error: "propertyId required" });
      const prop = await storage.getProperty(propertyId);
      if (!prop || prop.organizationId !== ctx.orgId) {
        return res.status(403).json({ error: "Property does not belong to current organization" });
      }
      req.user.currentPropertyId = propertyId;
      audit(req, { action: "property.switch", resourceType: "property", resourceId: propertyId });
      res.json({ success: true, property: prop });
    } catch (error) {
      console.error("Error switching property:", error);
      res.status(500).json({ error: "Failed to switch property" });
    }
  });

  // ----- PROPERTIES -----
  // List properties in current org. Any member can list.
  // Pass ?includeArchived=true to also return archived properties (admin view).
  app.get('/api/properties', isAuthenticated, async (req: any, res) => {
    try {
      const ctx = await resolveOrgContext(req, res);
      if (!ctx) return;
      const includeArchived = req.query.includeArchived === "true";
      const props = await storage.getPropertiesByOrg(ctx.orgId, includeArchived);
      res.json(props);
    } catch (error) {
      console.error("Error fetching properties:", error);
      res.status(500).json({ error: "Failed to fetch properties" });
    }
  });

  app.post('/api/properties', isAuthenticated, async (req: any, res) => {
    try {
      const ctx = await resolveOrgContext(req, res);
      if (!ctx) return;
      if (ctx.role === "viewer") return res.status(403).json({ error: "read_only" });
      const { name, code, address } = req.body || {};
      if (!name) return res.status(400).json({ error: "name required" });
      const prop = await storage.createProperty({ organizationId: ctx.orgId, name, code, address });
      audit(req, { action: "property.create", resourceType: "property", resourceId: prop.id, detail: name });
      res.json(prop);
    } catch (error) {
      console.error("Error creating property:", error);
      res.status(500).json({ error: "Failed to create property" });
    }
  });

  app.patch('/api/properties/:id', isAuthenticated, async (req: any, res) => {
    try {
      const ctx = await resolveOrgContext(req, res);
      if (!ctx) return;
      if (ctx.role === "viewer") return res.status(403).json({ error: "read_only" });
      const prop = await storage.getProperty(req.params.id);
      if (!prop) return res.status(404).json({ error: "Not found" });
      if (prop.organizationId !== ctx.orgId) return res.status(403).json({ error: "Access denied" });
      const { name, code, address, status } = req.body || {};
      const updated = await storage.updateProperty(req.params.id, { name, code, address, status });
      audit(req, { action: "property.update", resourceType: "property", resourceId: req.params.id });
      res.json(updated);
    } catch (error) {
      console.error("Error updating property:", error);
      res.status(500).json({ error: "Failed to update property" });
    }
  });

  // Archive property (soft delete). Owner or admin can archive — periods stay intact,
  // the property just disappears from the switcher and default lists.
  app.delete('/api/properties/:id', isAuthenticated, async (req: any, res) => {
    try {
      const ctx = await resolveOrgContext(req, res);
      if (!ctx) return;
      if (ctx.role === "viewer") return res.status(403).json({ error: "read_only" });
      const prop = await storage.getProperty(req.params.id);
      if (!prop) return res.status(404).json({ error: "Not found" });
      if (prop.organizationId !== ctx.orgId) return res.status(403).json({ error: "Access denied" });
      await storage.updateProperty(req.params.id, { status: "archived" });
      audit(req, { action: "property.archive", resourceType: "property", resourceId: req.params.id });
      res.json({ success: true, archived: true });
    } catch (error) {
      console.error("Error archiving property:", error);
      res.status(500).json({ error: "Failed to archive property" });
    }
  });

  // Restore archived property
  app.post('/api/properties/:id/restore', isAuthenticated, async (req: any, res) => {
    try {
      const ctx = await resolveOrgContext(req, res);
      if (!ctx) return;
      if (ctx.role === "viewer") return res.status(403).json({ error: "read_only" });
      const prop = await storage.getProperty(req.params.id);
      if (!prop) return res.status(404).json({ error: "Not found" });
      if (prop.organizationId !== ctx.orgId) return res.status(403).json({ error: "Access denied" });
      await storage.updateProperty(req.params.id, { status: "active" });
      audit(req, { action: "property.restore", resourceType: "property", resourceId: req.params.id });
      res.json({ success: true });
    } catch (error) {
      console.error("Error restoring property:", error);
      res.status(500).json({ error: "Failed to restore property" });
    }
  });

  // Accept terms of use
  app.post('/api/user/accept-terms', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const updated = await storage.acceptTerms(userId);
      if (!updated) return res.status(404).json({ error: "User not found" });
      audit(req, { action: "terms.accepted", resourceType: "user", resourceId: userId });
      res.json({ success: true });
    } catch (error) {
      console.error("Error accepting terms:", error);
      res.status(500).json({ error: "Failed to accept terms" });
    }
  });

  // Admin middleware - checks if user is admin
  const isAdmin = async (req: any, res: any, next: any) => {
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

  // Resolves the current org for a request. Falls back to loading membership if session is empty.
  // Returns null and sends 403 if the user has no org or no access to their session org.
  async function resolveOrgContext(req: any, res: any): Promise<{ orgId: string; role: OrgRole } | null> {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return null;
    }
    let orgId: string | undefined = req.user?.currentOrgId;
    let role: OrgRole | undefined = req.user?.currentOrgRole;
    if (!orgId) {
      const memberships = await storage.getUserOrganizations(userId);
      if (memberships.length === 0) {
        res.status(403).json({ error: "no_organization" });
        return null;
      }
      orgId = memberships[0].organization.id;
      role = memberships[0].role;
      req.user.currentOrgId = orgId;
      req.user.currentOrgRole = role;
    } else {
      // Re-verify against DB; user could have been removed from org
      const verified = await storage.getUserRoleInOrg(userId, orgId);
      if (!verified) {
        res.status(403).json({ error: "org_access_revoked" });
        return null;
      }
      role = verified;
      req.user.currentOrgRole = role;
    }
    return { orgId: orgId!, role: role! };
  }

  // Ownership helpers — return the entity if the caller's current org owns it, else 403/404.
  // The `mode` flag enforces role: 'read' allows viewer, 'write' requires owner/admin.
  async function assertPeriodAccess(
    periodId: string,
    req: any,
    res: any,
    mode: "read" | "write" = "read",
  ): Promise<ReconciliationPeriod | null> {
    const ctx = await resolveOrgContext(req, res);
    if (!ctx) return null;
    const period = await storage.getPeriod(periodId);
    if (!period) {
      res.status(404).json({ error: "Period not found" });
      return null;
    }
    if (period.organizationId !== ctx.orgId) {
      audit(req, { action: "access.denied", resourceType: "period", resourceId: periodId, outcome: "denied", detail: `Org mismatch: ${period.organizationId}` });
      res.status(403).json({ error: "Access denied" });
      return null;
    }
    if (mode === "write" && ctx.role === "viewer") {
      audit(req, { action: "access.denied", resourceType: "period", resourceId: periodId, outcome: "denied", detail: "viewer attempted write" });
      res.status(403).json({ error: "read_only", message: "Your role does not permit this action" });
      return null;
    }
    return period;
  }

  // Backwards-compat aliases used throughout this file
  const assertPeriodOwner = (periodId: string, req: any, res: any) => assertPeriodAccess(periodId, req, res, "read");
  const assertPeriodWrite = (periodId: string, req: any, res: any) => assertPeriodAccess(periodId, req, res, "write");

  async function assertFileOwner(fileId: string, req: any, res: any, mode: "read" | "write" = "read"): Promise<UploadedFile | null> {
    const file = await storage.getFile(fileId);
    if (!file) {
      res.status(404).json({ error: "File not found" });
      return null;
    }
    const period = await assertPeriodAccess(file.periodId, req, res, mode);
    if (!period) return null;
    return file;
  }
  const assertFileWrite = (fileId: string, req: any, res: any) => assertFileOwner(fileId, req, res, "write");

  // Admin routes - get all users
  app.get('/api/admin/users', isAuthenticated, isAdmin, async (req, res) => {
    try {
      const users = await storage.getAllUsers();
      res.json(users);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  // Admin routes - set user admin status
  app.patch('/api/admin/users/:id/admin', isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { isAdmin: makeAdmin } = req.body;
      if (typeof makeAdmin !== 'boolean') {
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

  // Admin invite management — scoped per org. Platform owner can pass any orgId.
  // Org admin/owner can only invite into their current org.
  app.get('/api/admin/invites', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const me = await storage.getUser(userId);
      const orgIdFilter = req.query.organizationId as string | undefined;
      // Platform owner sees all invites if no filter; otherwise filter by query
      if (me?.isPlatformOwner) {
        const invites = await storage.getInvitedUsers(orgIdFilter);
        return res.json(invites);
      }
      // Otherwise must be admin/owner of an org and only sees their org's invites
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

  app.post('/api/admin/invites', isAuthenticated, async (req: any, res) => {
    try {
      const { email, organizationId, role } = req.body;
      if (!email || typeof email !== 'string') {
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

      // Authorisation: must be platform owner OR owner/admin of the target org
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

  // ----- ORGANIZATION MANAGEMENT -----
  // List organizations. Platform owner sees all; everyone else sees only their orgs.
  // Pass ?includeArchived=true to include archived orgs (admin view only).
  app.get('/api/organizations', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const me = await storage.getUser(userId);
      const includeArchived = req.query.includeArchived === "true";
      if (me?.isPlatformOwner) {
        const orgs = await storage.getOrganizations(includeArchived);
        return res.json(orgs);
      }
      // Non-platform-owners only ever see their own active memberships
      const memberships = await storage.getUserOrganizations(userId);
      res.json(memberships.map(m => ({ ...m.organization, role: m.role })));
    } catch (error) {
      console.error("Error fetching organizations:", error);
      res.status(500).json({ error: "Failed to fetch organizations" });
    }
  });

  // Create organization — platform owner only.
  app.post('/api/organizations', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const me = await storage.getUser(userId);
      if (!me?.isPlatformOwner) {
        return res.status(403).json({ error: "Only the platform owner can create organizations" });
      }
      const { name, slug, billingEmail, billingAddress, vatNumber } = req.body;
      if (!name || !slug) return res.status(400).json({ error: "name and slug required" });
      if (!/^[a-z0-9-]+$/.test(slug)) return res.status(400).json({ error: "slug must be lowercase alphanumeric with hyphens" });
      const org = await storage.createOrganization({ name, slug, billingEmail, billingAddress, vatNumber });
      // Auto-add the platform owner as admin so they can manage it
      await storage.addOrganizationMember(org.id, userId, "admin");
      // Auto-create a default "Main" property so the org has somewhere to put periods immediately
      await storage.createProperty({ organizationId: org.id, name: "Main", code: null, address: null });
      audit(req, { action: "org.create", resourceType: "organization", resourceId: org.id, detail: name });
      res.json(org);
    } catch (error: any) {
      if (error?.code === '23505') return res.status(409).json({ error: "An organization with that slug already exists" });
      console.error("Error creating organization:", error);
      res.status(500).json({ error: "Failed to create organization" });
    }
  });

  // Get a single org (must be member or platform owner)
  app.get('/api/organizations/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const me = await storage.getUser(userId);
      const org = await storage.getOrganization(req.params.id);
      if (!org) return res.status(404).json({ error: "Not found" });
      if (!me?.isPlatformOwner) {
        const role = await storage.getUserRoleInOrg(userId, req.params.id);
        if (!role) return res.status(403).json({ error: "Access denied" });
      }
      res.json(org);
    } catch (error) {
      console.error("Error fetching organization:", error);
      res.status(500).json({ error: "Failed to fetch organization" });
    }
  });

  // Update org (owner or platform owner). Used for billing details, name changes.
  app.patch('/api/organizations/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const me = await storage.getUser(userId);
      let allowed = !!me?.isPlatformOwner;
      if (!allowed) {
        const role = await storage.getUserRoleInOrg(userId, req.params.id);
        allowed = role === "owner";
      }
      if (!allowed) return res.status(403).json({ error: "Only owner or platform owner can update" });
      const { name, billingEmail, billingAddress, vatNumber, status } = req.body;
      const updated = await storage.updateOrganization(req.params.id, { name, billingEmail, billingAddress, vatNumber, status });
      audit(req, { action: "org.update", resourceType: "organization", resourceId: req.params.id });
      res.json(updated);
    } catch (error) {
      console.error("Error updating organization:", error);
      res.status(500).json({ error: "Failed to update organization" });
    }
  });

  // Archive org (soft delete) — platform owner only. Data and history are preserved;
  // the org just becomes invisible from switchers and default lists.
  // No hard-delete endpoint exists by design — losing years of reconciliation data on
  // a single click is too dangerous. Restore is an explicit action.
  app.delete('/api/organizations/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const me = await storage.getUser(userId);
      if (!me?.isPlatformOwner) {
        return res.status(403).json({ error: "Only the platform owner can archive organizations" });
      }
      await storage.updateOrganization(req.params.id, { status: "archived" });
      audit(req, { action: "org.archive", resourceType: "organization", resourceId: req.params.id });
      res.json({ success: true, archived: true });
    } catch (error) {
      console.error("Error archiving organization:", error);
      res.status(500).json({ error: "Failed to archive organization" });
    }
  });

  // Restore archived org — platform owner only.
  app.post('/api/organizations/:id/restore', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const me = await storage.getUser(userId);
      if (!me?.isPlatformOwner) {
        return res.status(403).json({ error: "Only the platform owner can restore organizations" });
      }
      await storage.updateOrganization(req.params.id, { status: "active" });
      audit(req, { action: "org.restore", resourceType: "organization", resourceId: req.params.id });
      res.json({ success: true });
    } catch (error) {
      console.error("Error restoring organization:", error);
      res.status(500).json({ error: "Failed to restore organization" });
    }
  });

  // List members of an org
  app.get('/api/organizations/:id/members', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const me = await storage.getUser(userId);
      let allowed = !!me?.isPlatformOwner;
      if (!allowed) {
        const role = await storage.getUserRoleInOrg(userId, req.params.id);
        allowed = !!role;
      }
      if (!allowed) return res.status(403).json({ error: "Access denied" });
      const members = await storage.getOrganizationMembers(req.params.id);
      res.json(members);
    } catch (error) {
      console.error("Error fetching members:", error);
      res.status(500).json({ error: "Failed to fetch members" });
    }
  });

  // Update member role (owner or platform owner)
  app.patch('/api/organizations/:id/members/:userId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const me = await storage.getUser(userId);
      let allowed = !!me?.isPlatformOwner;
      if (!allowed) {
        const role = await storage.getUserRoleInOrg(userId, req.params.id);
        allowed = role === "owner";
      }
      if (!allowed) return res.status(403).json({ error: "Only owner or platform owner can change roles" });
      const { role } = req.body;
      if (!ORG_ROLES.includes(role)) return res.status(400).json({ error: "Invalid role" });
      const updated = await storage.updateOrganizationMemberRole(req.params.id, req.params.userId, role);
      audit(req, { action: "org.member.role_changed", resourceType: "organization", resourceId: req.params.id, detail: `${req.params.userId} → ${role}` });
      res.json(updated);
    } catch (error) {
      console.error("Error updating member role:", error);
      res.status(500).json({ error: "Failed to update member role" });
    }
  });

  // Remove member (owner or platform owner)
  app.delete('/api/organizations/:id/members/:userId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const me = await storage.getUser(userId);
      let allowed = !!me?.isPlatformOwner;
      if (!allowed) {
        const role = await storage.getUserRoleInOrg(userId, req.params.id);
        allowed = role === "owner";
      }
      if (!allowed) return res.status(403).json({ error: "Only owner or platform owner can remove members" });
      await storage.removeOrganizationMember(req.params.id, req.params.userId);
      audit(req, { action: "org.member.removed", resourceType: "organization", resourceId: req.params.id, detail: req.params.userId });
      res.json({ success: true });
    } catch (error) {
      console.error("Error removing member:", error);
      res.status(500).json({ error: "Failed to remove member" });
    }
  });

  app.delete('/api/admin/invites/:id', isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      await storage.removeInvite(req.params.id);
      audit(req, { action: "invite.revoke", resourceType: "invite", resourceId: req.params.id });
      res.json({ success: true });
    } catch (error) {
      console.error("Error removing invite:", error);
      res.status(500).json({ error: "Failed to remove invite" });
    }
  });

  // Public: request access (no auth required)
  app.post('/api/request-access', async (req, res) => {
    try {
      const { name, email, cell } = req.body;
      if (!name || !email || !cell) {
        return res.status(400).json({ error: "Name, email, and cell number are required" });
      }
      const trimmedEmail = String(email).trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
        return res.status(400).json({ error: "Invalid email address" });
      }
      await storage.createAccessRequest(String(name).trim(), trimmedEmail, String(cell).trim());
      audit(req, { action: "access_request.submitted", resourceType: "access_request", detail: `${String(name).trim()} (${trimmedEmail})` });
      res.json({ success: true });
    } catch (error) {
      console.error("Error creating access request:", error);
      res.status(500).json({ error: "Failed to submit request" });
    }
  });

  // Admin: access requests
  app.get('/api/admin/access-requests', isAuthenticated, isAdmin, async (req, res) => {
    try {
      const requests = await storage.getAccessRequests();
      res.json(requests);
    } catch (error) {
      console.error("Error fetching access requests:", error);
      res.status(500).json({ error: "Failed to fetch access requests" });
    }
  });

  app.patch('/api/admin/access-requests/:id', isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { status, organizationId, role } = req.body;
      if (!status || !['approved', 'declined'].includes(status)) {
        return res.status(400).json({ error: "Status must be 'approved' or 'declined'" });
      }
      if (status === 'approved' && !organizationId) {
        return res.status(400).json({ error: "organizationId required when approving" });
      }
      const updated = await storage.updateAccessRequestStatus(req.params.id, status);
      if (!updated) {
        return res.status(404).json({ error: "Request not found" });
      }
      // Auto-invite on approval — must be assigned to a specific org
      if (status === 'approved') {
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

  // Admin security overview
  app.get('/api/admin/security-overview', isAuthenticated, isAdmin, async (req, res) => {
    try {
      // Active sessions (not expired)
      const sessionsResult = await pool.query(
        `SELECT COUNT(*) as count FROM sessions WHERE expire > NOW()`
      );
      const activeSessions = parseInt(sessionsResult.rows[0]?.count || '0');

      // Total users
      const usersResult = await pool.query(`SELECT COUNT(*) as count FROM users`);
      const totalUsers = parseInt(usersResult.rows[0]?.count || '0');

      // Users who accepted terms
      const termsResult = await pool.query(
        `SELECT COUNT(*) as count FROM users WHERE terms_accepted_at IS NOT NULL`
      );
      const termsAccepted = parseInt(termsResult.rows[0]?.count || '0');

      // Pending invites (invited but never logged in)
      const pendingInvitesResult = await pool.query(
        `SELECT COUNT(*) as count FROM invited_users iu WHERE NOT EXISTS (SELECT 1 FROM users u WHERE LOWER(u.email) = LOWER(iu.email))`
      );
      const pendingInvites = parseInt(pendingInvitesResult.rows[0]?.count || '0');

      // Audit stats from last 24 hours
      const last24h = await pool.query(
        `SELECT action, outcome, COUNT(*) as count FROM audit_logs WHERE created_at > NOW() - INTERVAL '24 hours' GROUP BY action, outcome ORDER BY count DESC`
      );

      // Access denials from last 7 days
      const denials7d = await pool.query(
        `SELECT user_email, ip_address, detail, created_at FROM audit_logs WHERE outcome = 'denied' AND created_at > NOW() - INTERVAL '7 days' ORDER BY created_at DESC LIMIT 20`
      );

      // Audit totals
      const auditTotalResult = await pool.query(
        `SELECT COUNT(*) as count FROM audit_logs`
      );
      const totalAuditEvents = parseInt(auditTotalResult.rows[0]?.count || '0');

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

  // Admin audit log endpoint
  app.get('/api/admin/audit-logs', isAuthenticated, isAdmin, async (req: any, res) => {
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

  // ── AI Usage admin endpoint ──

  app.get('/api/admin/ai-usage', isAuthenticated, isAdmin, async (req, res) => {
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

  // ── PDF Converter routes ──

  const aiExtractLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 10,
    message: { error: "AI extraction limit reached. Try again later." },
  });

  app.post("/api/convert/parse", isAuthenticated, upload.single("file"), async (req: any, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: "No file uploaded" });
      const isPDF = req.file.mimetype === "application/pdf" || req.file.originalname?.endsWith(".pdf");
      if (!isPDF) return res.status(400).json({ error: "Only PDF files are accepted" });

      const parsed = await fileParser.parsePDF(req.file.buffer);
      const confidence = computeConfidenceScore(parsed);
      const aiAvailable = !!process.env.ANTHROPIC_API_KEY;

      audit(req, { action: "convert.parse", outcome: "success", detail: `${parsed.rowCount} rows, confidence ${confidence}%` });
      res.json({ headers: parsed.headers, rows: parsed.rows, rowCount: parsed.rowCount, confidence, aiAvailable });
    } catch (error: any) {
      audit(req, { action: "convert.parse", outcome: "error", detail: error.message });
      res.status(422).json({ error: error.message || "Failed to extract data from PDF" });
    }
  });

  app.post("/api/convert/ai-extract", isAuthenticated, aiExtractLimiter, upload.single("file"), async (req: any, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: "No file uploaded" });
      const isPDF = req.file.mimetype === "application/pdf" || req.file.originalname?.endsWith(".pdf");
      if (!isPDF) return res.status(400).json({ error: "Only PDF files are accepted" });

      if (!process.env.ANTHROPIC_API_KEY) {
        return res.status(503).json({ error: "AI extraction is not configured" });
      }

      // Cap at 10MB for AI extraction
      if (req.file.size > 10 * 1024 * 1024) {
        return res.status(400).json({ error: "PDF too large for AI extraction. Maximum 10MB." });
      }

      const result = await extractTablesWithAI(req.file.buffer);
      const { usage } = result;

      // Log to audit trail
      audit(req, {
        action: "convert.ai_extract",
        outcome: "success",
        detail: `${result.rowCount} rows | ${usage.inputTokens} in / ${usage.outputTokens} out | $${usage.estimatedCostUsd}`,
      });

      // Log to usage table for billing — tracked per user AND per org so invoicing can roll up
      try {
        const rawSub = req.user?.claims?.sub;
        const userId = rawSub != null ? String(rawSub) : undefined;
        const userEmail = req.user?.claims?.email || req.user?.email;
        const orgId = req.user?.currentOrgId || null;
        await pool.query(
          `INSERT INTO ai_usage (user_id, user_email, organization_id, action, model, input_tokens, output_tokens, estimated_cost_usd)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [userId, userEmail, orgId, "convert.ai_extract", usage.model, usage.inputTokens, usage.outputTokens, usage.estimatedCostUsd]
        );
      } catch (e) {
        console.error("Failed to log AI usage:", e);
      }

      res.json({ headers: result.headers, rows: result.rows, rowCount: result.rowCount, usage });
    } catch (error: any) {
      audit(req, { action: "convert.ai_extract", outcome: "error", detail: error.message });
      const status = error.message?.includes("not configured") ? 503 : 422;
      res.status(status).json({ error: error.message || "AI extraction failed" });
    }
  });

  app.get("/api/periods", isAuthenticated, async (req: any, res) => {
    try {
      const ctx = await resolveOrgContext(req, res);
      if (!ctx) return;
      // Filter by current property if one is set in the session.
      // ?propertyId=all bypasses the filter (for org-wide views).
      const queryProperty = req.query.propertyId as string | undefined;
      let propertyId: string | undefined = req.user?.currentPropertyId;
      if (queryProperty === "all") propertyId = undefined;
      else if (queryProperty) propertyId = queryProperty;
      const periods = await storage.getPeriods(ctx.orgId, propertyId);
      res.json(periods);
    } catch (error) {
      console.error("Error fetching periods:", error);
      res.status(500).json({ error: "Failed to fetch periods" });
    }
  });

  app.get("/api/periods/:id", isAuthenticated, async (req: any, res) => {
    try {
      const period = await assertPeriodOwner(req.params.id, req, res);
      if (!period) return;
      res.json(period);
    } catch (error) {
      console.error("Error fetching period:", error);
      res.status(500).json({ error: "Failed to fetch period" });
    }
  });

  app.post("/api/periods", isAuthenticated, async (req: any, res) => {
    try {
      const ctx = await resolveOrgContext(req, res);
      if (!ctx) return;
      if (ctx.role === "viewer") {
        return res.status(403).json({ error: "read_only" });
      }
      const userId = req.user?.claims?.sub;
      const validated = insertReconciliationPeriodSchema.parse(req.body);
      // Property is required: use body.propertyId, fall back to session, then 400.
      const propertyId: string | undefined = (req.body?.propertyId as string | undefined) || req.user?.currentPropertyId;
      if (!propertyId) {
        return res.status(400).json({ error: "propertyId required — pick a property first" });
      }
      // Verify the property belongs to the current org
      const prop = await storage.getProperty(propertyId);
      if (!prop || prop.organizationId !== ctx.orgId) {
        return res.status(403).json({ error: "Property does not belong to current organization" });
      }
      const period = await storage.createPeriod({ ...validated, userId, organizationId: ctx.orgId, propertyId });
      audit(req, { action: "period.create", resourceType: "period", resourceId: period.id, detail: `property=${propertyId}` });
      res.json(period);
    } catch (error) {
      console.error("Error creating period:", error);
      res.status(400).json({ error: "Invalid period data" });
    }
  });

  app.patch("/api/periods/:id", isAuthenticated, async (req: any, res) => {
    try {
      const period = await assertPeriodWrite(req.params.id, req, res);
      if (!period) return;
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

  app.delete("/api/periods/:id", isAuthenticated, async (req: any, res) => {
    try {
      const period = await assertPeriodWrite(req.params.id, req, res);
      if (!period) return;
      await storage.deletePeriod(req.params.id);
      audit(req, { action: "period.delete", resourceType: "period", resourceId: req.params.id, detail: period.name });
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting period:", error);
      res.status(500).json({ error: "Failed to delete period" });
    }
  });

  app.get("/api/periods/:periodId/files", isAuthenticated, async (req: any, res) => {
    try {
      const period = await assertPeriodOwner(req.params.periodId, req, res);
      if (!period) return;
      const files = await storage.getFilesByPeriod(req.params.periodId);
      res.json(files);
    } catch (error) {
      console.error("Error fetching files:", error);
      res.status(500).json({ error: "Failed to fetch files" });
    }
  });

  app.post("/api/periods/:periodId/files/upload", isAuthenticated, upload.single("file"), async (req: any, res) => {
    try {
      const period = await assertPeriodWrite(req.params.periodId, req, res);
      if (!period) return;

      if (!req.file) {
        return res.status(400).json({ error: "No file provided" });
      }

      const { sourceType, sourceName, bankName } = req.body;
      if (!sourceType || !sourceName) {
        return res.status(400).json({ error: "sourceType and sourceName are required" });
      }

      // Compute content hash for smart re-upload detection
      const contentHash = computeContentHash(req.file.buffer);

      // Check for existing file with same sourceType/sourceName
      const existingFiles = await storage.getFilesByPeriod(req.params.periodId);
      const existingFile = existingFiles.find(f => 
        f.sourceType === sourceType && f.sourceName === sourceName
      );
      
      // Smart re-upload detection: if same content hash, re-parse for mappings but skip DB insert
      if (existingFile && existingFile.contentHash === contentHash) {
        console.log(`Same file re-uploaded, re-parsing for mappings: ${existingFile.fileName}`);

        // Re-parse to get fresh suggested mappings (needed for mapping confirmation step)
        const isCSVReupload = req.file.mimetype.includes('csv') ||
                      req.file.mimetype === 'text/csv' ||
                      req.file.mimetype === 'text/plain' ||
                      req.file.originalname.toLowerCase().endsWith('.csv') ||
                      req.file.originalname.toLowerCase().endsWith('.txt');
        const fileType = isCSVReupload ? 'csv' : 'excel';
        const reuploadParsed = await fileParser.parse(req.file.buffer, fileType);
        const reuploadMappingsArray = fileParser.autoDetectColumns(reuploadParsed.headers);
        const reuploadDetectedPreset = fileParser.detectSourcePreset(reuploadParsed.headers);

        // Build suggested mappings: preset mappings take priority, then auto-detect
        const reuploadMappings: Record<string, string> = {};
        if (reuploadDetectedPreset) {
          for (const header of reuploadParsed.headers) {
            reuploadMappings[header] = reuploadDetectedPreset.mappings[header] || 'ignore';
          }
        } else {
          for (const mapping of reuploadMappingsArray) {
            reuploadMappings[mapping.detectedColumn] = mapping.mappedTo || 'ignore';
          }
          // Fill in unmapped headers
          for (const header of reuploadParsed.headers) {
            if (!reuploadMappings[header]) {
              reuploadMappings[header] = 'ignore';
            }
          }
        }

        return res.json({
          file: existingFile,
          parsed: {
            headers: reuploadParsed.headers,
            rows: [],
            rowCount: existingFile.rowCount || reuploadParsed.rowCount,
          },
          suggestedMappings: reuploadMappings,
          qualityReport: existingFile.qualityReport || { hasIssues: false, totalRows: reuploadParsed.rowCount, cleanRows: reuploadParsed.rowCount, issues: [] },
          isReupload: true,
          message: "Same file detected, using existing data"
        });
      }
      
      // Store existing file info for cleanup AFTER successful upload
      const fileToReplace = existingFile ? {
        id: existingFile.id,
        fileName: existingFile.fileName,
        fileUrl: existingFile.fileUrl
      } : null;
      
      if (fileToReplace) {
        console.log(`Will replace existing file after successful upload: ${fileToReplace.fileName} (${fileToReplace.id})`);
      }

      const isCSV = req.file.mimetype.includes('csv') ||
                    req.file.mimetype === 'text/csv' ||
                    req.file.mimetype === 'text/plain' ||
                    req.file.originalname.endsWith('.csv') ||
                    req.file.originalname.endsWith('.txt');
      
      const isExcel = req.file.mimetype.includes('spreadsheet') || 
                      req.file.mimetype.includes('excel') ||
                      req.file.originalname.endsWith('.xlsx') || 
                      req.file.originalname.endsWith('.xls');

      const isPDF = req.file.mimetype === 'application/pdf' ||
                    req.file.originalname.endsWith('.pdf');

      if (!isCSV && !isExcel && !isPDF) {
        return res.status(400).json({
          error: "Invalid file format. Please upload CSV, TXT, Excel, or PDF files only."
        });
      }

      const fileType = isCSV ? 'csv' : isExcel ? 'xlsx' : 'pdf';

      const parsed = await fileParser.parse(req.file.buffer, fileType);

      // Decompression bomb protection — reject files with excessive rows
      if (parsed.rowCount > 500000) {
        return res.status(400).json({
          error: `File contains ${parsed.rowCount.toLocaleString()} rows, which exceeds the 500,000 row limit. Please upload a smaller file.`
        });
      }

      const columnMappings = fileParser.autoDetectColumns(parsed.headers);

      // Detect source preset to validate file type
      const detectedPreset = fileParser.detectSourcePreset(parsed.headers);
      
      // Validate source type matches file content using preset's category
      // sourceType can be 'fuel', 'bank', 'bank1', 'bank2', etc.
      // category is always 'fuel' or 'bank'
      const normalizeSourceType = (st: string) => st.replace(/\d+$/, ''); // 'bank1' -> 'bank'
      if (detectedPreset && detectedPreset.category !== normalizeSourceType(sourceType)) {
        const detectedCategory = detectedPreset.category;
        const expectedCategory = normalizeSourceType(sourceType);
        console.warn(`Source type mismatch: expected ${expectedCategory}, detected ${detectedCategory} (${detectedPreset.name})`);
        return res.status(400).json({ 
          error: `This looks like a ${detectedCategory === 'bank' ? 'bank statement' : 'fuel system export'}, but you're uploading it as ${expectedCategory === 'bank' ? 'bank data' : 'fuel data'}. Please check you're on the right step.`,
          detectedType: detectedCategory,
          expectedType: expectedCategory,
          detectedPreset: detectedPreset.name
        });
      }

      const suggestedMappingsObject: Record<string, string> = {};
      for (const mapping of columnMappings) {
        suggestedMappingsObject[mapping.detectedColumn] = mapping.suggestedMapping;
      }

      // Run data quality validation
      const rawQualityReport = dataQualityValidator.validate(
        parsed,
        sourceType as 'fuel' | 'bank',
        sourceName
      );
      
      // Transform quality report to match frontend expectations
      const normalizeIssueType = (type: string): string => {
        const normalized = type.toLowerCase();
        // Normalize to canonical types
        if (normalized.includes('column_shift')) return 'column_shift';
        if (normalized.includes('page_break')) return 'page_break';
        if (normalized.includes('repeated_header')) return 'repeated_header';
        if (normalized.includes('empty_column')) return 'empty_column';
        if (normalized.includes('type_mismatch') || normalized.includes('data_type_mismatch')) return 'type_mismatch';
        if (normalized.includes('missing_required')) return 'missing_data';
        if (normalized.includes('inconsistent')) return 'inconsistent_data';
        return normalized;
      };

      const qualityReport = {
        hasIssues: rawQualityReport.hasIssues,
        hasCriticalIssues: rawQualityReport.hasCriticalIssues,
        overallScore: 100 - (rawQualityReport.problematicRows / rawQualityReport.totalRows * 100),
        totalRows: rawQualityReport.totalRows,
        cleanRows: rawQualityReport.cleanRows,
        problematicRows: rawQualityReport.problematicRows,
        issues: rawQualityReport.issues.map(issue => ({
          type: normalizeIssueType(issue.type),
          severity: issue.severity.toLowerCase(),
          message: issue.message,
          details: issue.details,
          affectedColumns: issue.details?.columns,
          rowNumbers: issue.affectedRows,
          suggestedFix: issue.suggestedFix,
        })),
        columnAnalysis: rawQualityReport.columnAnalysis.map(col => ({
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
          consistencyScore: 100 - (col.headerLikeValues + col.pageLikeValues) / (col.nonNullCount || 1) * 100,
        })),
        suggestedMapping: rawQualityReport.suggestedColumnMapping,
        suggestedColumnMapping: rawQualityReport.suggestedColumnMapping, // Keep legacy field too
        rowsToRemove: rawQualityReport.rowsToRemove,
        columnShiftDetected: rawQualityReport.columnShiftDetected,
        shiftDetails: rawQualityReport.shiftDetails,
        detectedPreset: rawQualityReport.detectedPreset,
      };

      // Sanitize filename — strip path traversal, special chars, limit length
      const safeFileName = req.file.originalname
        .replace(/[^a-zA-Z0-9._\- ]/g, '_')
        .slice(0, 200);

      const fileUrl = await objectStorageService.uploadFile(
        req.file.buffer,
        safeFileName,
        req.file.mimetype
      );

      const uploadedFile = await storage.createFile({
        periodId: req.params.periodId,
        fileName: safeFileName,
        fileType,
        sourceType,
        sourceName,
        fileUrl,
        fileData: req.file.buffer.toString('base64'),
        fileSize: req.file.size,
        rowCount: parsed.rowCount,
        columnMapping: null,
        qualityReport: qualityReport,
        contentHash,
        bankName: bankName || null,
        status: 'uploaded'
      });

      // NOW that new file is successfully created, safely delete the old one
      if (fileToReplace) {
        console.log(`Cleaning up replaced file: ${fileToReplace.fileName} (${fileToReplace.id})`);
        try {
          // First delete matches that reference this file's transactions (explicit cleanup)
          await storage.deleteMatchesByFile(fileToReplace.id);
          // Then delete transactions
          await storage.deleteTransactionsByFile(fileToReplace.id);
          // Then delete the file record
          await storage.deleteFile(fileToReplace.id);
          // Finally clean up object storage
          await objectStorageService.deleteFile(fileToReplace.fileUrl);
          console.log(`Successfully cleaned up old file, its transactions, and related matches`);
        } catch (cleanupError) {
          console.warn("Could not fully clean up old file:", cleanupError);
          // Don't fail the upload if cleanup fails
        }
      }

      audit(req, { action: "file.upload", resourceType: "file", resourceId: uploadedFile.id, detail: `${safeFileName} (${sourceType}/${sourceName})` });

      res.json({
        file: uploadedFile,
        preview: {
          headers: parsed.headers,
          rows: DataNormalizer.normalizePreviewRows(parsed.rows.slice(0, 5)),
          totalRows: parsed.rowCount,
        },
        suggestedMappings: suggestedMappingsObject,
        qualityReport,
      });
    } catch (error: any) {
      console.error("Error uploading file:", error);
      console.error("Upload error detail:", error?.message || String(error));
      res.status(500).json({ error: "Failed to upload file" });
    }
  });

  app.get("/api/files/:fileId/preview", isAuthenticated, async (req: any, res) => {
    try {
      const file = await assertFileOwner(req.params.fileId, req, res);
      if (!file) return;

      // Read file buffer: prefer DB, fall back to filesystem
      let buffer: Buffer;
      if (file.fileData) {
        buffer = Buffer.from(file.fileData, 'base64');
      } else {
        const objectFile = await objectStorageService.getFile(file.fileUrl);
        [buffer] = await objectFile.download();
      }

      const parsed = await fileParser.parse(buffer, file.fileType);
      const suggestedMappingsArray = fileParser.autoDetectColumns(parsed.headers);
      
      const suggestedMappings: Record<string, string> = {};
      for (const mapping of suggestedMappingsArray) {
        suggestedMappings[mapping.detectedColumn] = mapping.suggestedMapping;
      }

      // Detect source preset and get column labels
      const detectedPreset = fileParser.detectSourcePreset(parsed.headers);
      const columnLabels: Record<string, string> = {};
      for (const header of parsed.headers) {
        columnLabels[header] = fileParser.getColumnLabel(header, parsed.headers);
      }

      // Generate normalized preview if we have a current mapping
      const normalizedPreview: Array<{
        transactionDate: string;
        transactionTime: string;
        amount: string;
        referenceNumber: string;
        description: string;
        paymentType: string;
        isCardTransaction: 'yes' | 'no' | 'unknown';
      }> = [];
      
      // Full file analysis stats
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
          other: 0,
        }
      };
      
      const mappingToUse = file.columnMapping || suggestedMappings;
      if (mappingToUse && Object.keys(mappingToUse).length > 0) {
        // Analyze all rows for stats
        for (let i = 0; i < parsed.rows.length; i++) {
          const row = parsed.rows[i];
          const extracted = fileParser.extractTransactionData(
            row,
            mappingToUse as Record<string, string>,
            parsed.headers,
            file.sourceType
          );
          
          // Get first 5 for preview
          if (i < 5) {
            normalizedPreview.push(extracted);
          }
          
          // Validate for full stats
          const validation = fileParser.isValidTransactionRow(
            extracted,
            row,
            mappingToUse as Record<string, string>
          );
          
          if (!validation.valid) {
            switch (validation.reason) {
              case 'header_row':
                fullAnalysisStats.skippedRows.headerRows++;
                break;
              case 'empty_date':
                fullAnalysisStats.skippedRows.emptyDate++;
                break;
              case 'zero_or_invalid_amount':
                fullAnalysisStats.skippedRows.zeroOrInvalidAmount++;
                break;
              case 'page_break':
                fullAnalysisStats.skippedRows.pageBreaks++;
                break;
              default:
                fullAnalysisStats.skippedRows.other++;
            }
          } else {
            fullAnalysisStats.validTransactions++;
            if (extracted.isCardTransaction === 'yes') {
              fullAnalysisStats.cardTransactions++;
            } else if (extracted.isCardTransaction === 'no') {
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
          description: detectedPreset.description,
        } : null,
        columnLabels,
        normalizedPreview,
        qualityReport: file.qualityReport,
        fullAnalysisStats,
      });
    } catch (error) {
      console.error("Error fetching file preview:", error);
      res.status(500).json({ error: "Failed to fetch file preview" });
    }
  });

  app.post("/api/files/:fileId/column-mapping", isAuthenticated, async (req: any, res) => {
    try {
      const validatedMapping = columnMappingSchema.parse(req.body.columnMapping);

      const file = await assertFileWrite(req.params.fileId, req, res);
      if (!file) return;

      // Check for duplicate mappings (same field mapped to multiple columns)
      const mappedFields: Record<string, string> = {};
      const duplicates: { field: string; columns: string[] }[] = [];
      
      for (const [column, field] of Object.entries(validatedMapping)) {
        if (field === 'ignore') continue;
        
        if (mappedFields[field]) {
          // Found a duplicate - check if we already have this field in duplicates
          const existing = duplicates.find(d => d.field === field);
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
        const errorMessages = duplicates.map(d => 
          `"${d.field}" is mapped to both "${d.columns.join('" and "')}" - please choose only ONE column for each field`
        );
        return res.status(400).json({ 
          error: "Duplicate mappings detected",
          duplicates: duplicates,
          message: errorMessages.join('. ')
        });
      }

      await storage.updateFile(req.params.fileId, { 
        columnMapping: validatedMapping,
        status: 'mapped'
      });

      res.json({ success: true });
    } catch (error: any) {
      console.error("Error saving column mapping:", error?.message || String(error));
      console.error("Column mapping error:", error?.message || String(error));
      res.status(400).json({ error: "Invalid column mapping data" });
    }
  });

  // Alias route for periods-based URL pattern used by the flow components
  app.post("/api/periods/:periodId/files/:fileId/process", isAuthenticated, async (req: any, res) => {
    try {
      const period = await assertPeriodWrite(req.params.periodId, req, res);
      if (!period) return;

      const file = await storage.getFile(req.params.fileId);
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }

      // Validate file belongs to the period
      if (file.periodId !== req.params.periodId) {
        return res.status(400).json({ error: "File does not belong to this period" });
      }

      if (!file.columnMapping) {
        return res.status(400).json({ error: "Column mapping not set" });
      }

      // Delete existing transactions from this file before reprocessing
      await storage.deleteTransactionsByFile(file.id);

      // Read file buffer: prefer DB (survives serverless cold starts), fall back to filesystem
      let buffer: Buffer;
      if (file.fileData) {
        buffer = Buffer.from(file.fileData, 'base64');
      } else {
        const objectFile = await objectStorageService.getFile(file.fileUrl);
        [buffer] = await objectFile.download();
      }

      const parsed = await fileParser.parse(buffer, file.fileType);

      if (parsed.rowCount > 500000) {
        return res.status(400).json({
          error: `File contains ${parsed.rowCount.toLocaleString()} rows, which exceeds the 500,000 row limit.`
        });
      }

      // Track skip statistics
      const skipStats = {
        header_row: 0,
        empty_date: 0,
        zero_or_invalid_amount: 0,
        page_break: 0,
        total_skipped: 0,
        total_processed: 0,
      };
      
      const validTransactions: any[] = [];
      
      for (const row of parsed.rows) {
        const extracted = fileParser.extractTransactionData(
          row, 
          file.columnMapping as Record<string, string>,
          parsed.headers,
          file.sourceType
        );
        
        const validation = fileParser.isValidTransactionRow(
          extracted,
          row,
          file.columnMapping as Record<string, string>
        );
        
        if (!validation.valid) {
          skipStats.total_skipped++;
          if (validation.reason && validation.reason in skipStats) {
            (skipStats as any)[validation.reason]++;
          }
          continue;
        }
        
        skipStats.total_processed++;
        
        // Scrub sensitive fields (card numbers) from raw data before storage
        const scrubbedRow = { ...row };
        const mapping = file.columnMapping as Record<string, string>;
        for (const [col, field] of Object.entries(mapping)) {
          if (field === 'cardNumber' && scrubbedRow[col]) {
            const val = String(scrubbedRow[col]);
            scrubbedRow[col] = val.length > 4 ? '****' + val.slice(-4) : val;
          }
        }

        validTransactions.push({
          fileId: file.id,
          periodId: file.periodId,
          sourceType: file.sourceType,
          sourceName: file.sourceName,
          rawData: scrubbedRow,
          transactionDate: extracted.transactionDate,
          transactionTime: extracted.transactionTime || null,
          amount: extracted.amount,
          description: extracted.description || '',
          referenceNumber: extracted.referenceNumber || '',
          cardNumber: extracted.cardNumber || null,
          paymentType: extracted.paymentType || null,
          isCardTransaction: extracted.isCardTransaction,
          attendant: extracted.attendant || null,
          cashier: extracted.cashier || null,
          pump: extracted.pump || null,
          matchStatus: 'unmatched' as const,
          matchId: null,
        });
      }

      // For bank files, detect and exclude duplicate transactions (same RRN)
      let duplicateStats = null;
      if (file.sourceType.startsWith('bank')) {
        duplicateStats = detectAndExcludeDuplicates(validTransactions);
        if (duplicateStats.duplicatesExcluded > 0) {
          console.log(`[PROCESS] Duplicate detection: ${duplicateStats.duplicatesExcluded} excluded from ${duplicateStats.duplicateGroups} RRN groups`);
        }
      }

      // For bank files, detect and exclude reversed/declined/cancelled transactions
      let reversalStats = null;
      if (file.sourceType.startsWith('bank')) {
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
        status: 'processed',
        rowCount: createdCount,
        fileData: null, // free DB storage after processing
      });

      res.json({
        success: true,
        transactionsCreated: createdCount,
        totalRows: parsed.rowCount,
        skipStats: skipStats,
        duplicateStats: duplicateStats,
        reversalStats: reversalStats,
      });
    } catch (error) {
      console.error("Error processing file:", error);
      res.status(500).json({ error: "Failed to process file" });
    }
  });

  app.delete("/api/files/:fileId", isAuthenticated, async (req: any, res) => {
    try {
      const file = await assertFileWrite(req.params.fileId, req, res);
      if (!file) return;
      await storage.deleteMatchesByFile(file.id);
      await storage.deleteTransactionsByFile(file.id);
      if (file.fileUrl) {
        await objectStorageService.deleteFile(file.fileUrl);
      }
      await storage.deleteFile(file.id);
      audit(req, { action: "file.delete", resourceType: "file", resourceId: file.id, detail: file.fileName });
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting file:", error);
      res.status(500).json({ error: "Failed to delete file" });
    }
  });

  app.get("/api/periods/:periodId/transactions", isAuthenticated, async (req: any, res) => {
    try {
      const period = await assertPeriodOwner(req.params.periodId, req, res);
      if (!period) return;
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
      const offset = (page - 1) * limit;
      const sourceType = req.query.sourceType as string | undefined;
      const matchStatus = req.query.matchStatus as string | undefined;
      const isCardTransaction = req.query.isCardTransaction as string | undefined;
      
      console.log(`[TRANSACTIONS] Fetching for period ${req.params.periodId}, page ${page}, limit ${limit}`);
      
      // Look up matching rules for date window, scope transactions to period dates
      const rules = await storage.getMatchingRules(req.params.periodId);
      const periodDates = {
        startDate: period.startDate,
        endDate: period.endDate,
        dateWindowDays: rules.dateWindowDays,
      };

      const result = await storage.getTransactionsByPeriodPaginated(
        req.params.periodId,
        { limit, offset, sourceType, matchStatus, isCardTransaction, periodDates }
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

  // ============================================
  // VERIFICATION SUMMARY ENDPOINT
  // ============================================
  
  app.get("/api/periods/:periodId/verification-summary", isAuthenticated, async (req: any, res) => {
    try {
      const period = await assertPeriodOwner(req.params.periodId, req, res);
      if (!period) return;
      const summary = await storage.getVerificationSummary(req.params.periodId);
      res.json(summary);
    } catch (error) {
      console.error("Error fetching verification summary:", error);
      res.status(500).json({ error: "Failed to fetch verification summary" });
    }
  });

  // ============================================
  // MATCHING RULES ENDPOINTS
  // ============================================
  
  app.get("/api/periods/:periodId/matching-rules", isAuthenticated, async (req: any, res) => {
    try {
      const period = await assertPeriodOwner(req.params.periodId, req, res);
      if (!period) return;
      const rules = await storage.getMatchingRules(req.params.periodId);
      res.json(rules);
    } catch (error) {
      console.error("Error fetching matching rules:", error);
      res.status(500).json({ error: "Failed to fetch matching rules" });
    }
  });

  app.post("/api/periods/:periodId/matching-rules", isAuthenticated, async (req: any, res) => {
    try {
      const period = await assertPeriodWrite(req.params.periodId, req, res);
      if (!period) return;
      const validatedRules = matchingRulesConfigSchema.parse(req.body);
      const saved = await storage.saveMatchingRules(req.params.periodId, validatedRules);
      res.json({ success: true, rules: saved });
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error("Validation error:", error.errors);
        console.error("Matching rules validation:", error.errors);
        return res.status(400).json({ error: "Invalid matching rules data" });
      }
      console.error("Error saving matching rules:", error);
      res.status(500).json({ error: "Failed to save matching rules" });
    }
  });

  // ============================================
  // INVOICE GROUPING TYPES AND HELPERS
  // ============================================
  
  interface FuelInvoice {
    invoiceNumber: string;
    items: any[];
    totalAmount: number;
    firstDate: string;
    firstTime: string | null;
    cardNumber: string | null;
  }

  // Group fuel transactions by invoice/reference number
  function groupFuelByInvoice(fuelTransactions: any[], groupByInvoice: boolean): FuelInvoice[] {
    if (!groupByInvoice) {
      // Treat each transaction as its own "invoice"
      return fuelTransactions.map(tx => ({
        invoiceNumber: tx.id,
        items: [tx],
        totalAmount: parseFloat(tx.amount),
        firstDate: tx.transactionDate,
        firstTime: tx.transactionTime,
        cardNumber: tx.cardNumber
      }));
    }

    const invoices: Record<string, FuelInvoice> = {};

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

  // Helper function to parse time strings and calculate minutes from midnight
  function parseTimeToMinutes(timeStr: string): number | null {
    if (!timeStr) return null;
    const match = timeStr.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (!match) return null;
    const hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    return hours * 60 + minutes;
  }

  // Helper function to parse date and calculate days difference
  function parseDateToDays(dateStr: string): number | null {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return null;
    return Math.floor(date.getTime() / (1000 * 60 * 60 * 24));
  }

  // Score a bank tx against candidate invoices using the same rules as the main matcher.
  // Returns the best match or null. Used by the lag-detection pass to find out-of-period
  // fuel that could explain an unmatched in-period bank tx.
  type BestInvoiceMatch = {
    invoice: FuelInvoice;
    confidence: number;
    timeDiff: number;
    dateDiff: number;
    amountDiff: number;
    reasons: string[];
  };
  function scoreBankToInvoices(
    bankTx: any,
    candidateInvoices: FuelInvoice[],
    usedInvoices: Set<string>,
    rules: { amountTolerance: number; dateWindowDays: number; timeWindowMinutes: number; requireCardMatch: boolean; minimumConfidence: number }
  ): BestInvoiceMatch | null {
    let bestMatch: BestInvoiceMatch | null = null;
    const seen = new Set<string>();

    for (const invoice of candidateInvoices) {
      if (seen.has(invoice.invoiceNumber)) continue;
      seen.add(invoice.invoiceNumber);
      if (usedInvoices.has(invoice.invoiceNumber)) continue;
      if (invoice.items.some(item => item.matchStatus === 'matched')) continue;

      const reasons: string[] = [];

      const bankAmount = parseFloat(bankTx.amount);
      const amountDiff = Math.abs(bankAmount - invoice.totalAmount);
      if (amountDiff > rules.amountTolerance) continue;

      const fuelDate = parseDateToDays(invoice.firstDate || '');
      const bankDate = parseDateToDays(bankTx.transactionDate || '');
      if (fuelDate === null || bankDate === null) continue;
      const dateDiff = bankDate - fuelDate;
      if (dateDiff < -1 || dateDiff > rules.dateWindowDays) continue;

      let confidence = 70;
      if (dateDiff === 0) confidence = 85;
      else if (Math.abs(dateDiff) === 1) confidence = 75;
      else if (Math.abs(dateDiff) === 2) confidence = 68;
      else confidence = 65;

      const fuelTime = parseTimeToMinutes(invoice.firstTime || '');
      const bankTime = parseTimeToMinutes(bankTx.transactionTime || '');
      let timeDiff = 0;
      if (dateDiff === 0 && fuelTime !== null && bankTime !== null) {
        timeDiff = Math.abs(fuelTime - bankTime);
        if (timeDiff <= 5) confidence = 100;
        else if (timeDiff <= 15) confidence = 95;
        else if (timeDiff <= 30) confidence = 85;
        else confidence = 75;
      }

      if (amountDiff > 0) {
        confidence -= Math.min(5, (amountDiff / rules.amountTolerance) * 5);
      }

      let cardMatch: 'yes' | 'no' | 'unknown' = 'unknown';
      if (rules.requireCardMatch) {
        if (!bankTx.cardNumber || !invoice.cardNumber) continue;
        if (bankTx.cardNumber !== invoice.cardNumber) continue;
        cardMatch = 'yes';
        confidence += 25;
        reasons.push('card-match-required');
      } else if (bankTx.cardNumber && invoice.cardNumber) {
        if (bankTx.cardNumber === invoice.cardNumber) {
          cardMatch = 'yes';
          confidence += 25;
          reasons.push('card-match-strong');
        } else {
          cardMatch = 'no';
          confidence -= 30;
          reasons.push('card-differ');
        }
      }

      confidence = Math.min(100, Math.max(0, confidence));
      if (confidence < rules.minimumConfidence) continue;

      const absDiff = Math.abs(dateDiff);
      const cardMatchScore = cardMatch === 'yes' ? 2 : cardMatch === 'unknown' ? 1 : 0;
      const bestCardScore = bestMatch
        ? (bestMatch.reasons.some(r => r.startsWith('card-match')) ? 2
           : bestMatch.reasons.some(r => r === 'card-differ') ? 0 : 1)
        : -1;

      if (!bestMatch ||
          confidence > bestMatch.confidence ||
          (confidence === bestMatch.confidence && cardMatchScore > bestCardScore) ||
          (confidence === bestMatch.confidence && cardMatchScore === bestCardScore && absDiff < bestMatch.dateDiff) ||
          (confidence === bestMatch.confidence && cardMatchScore === bestCardScore && absDiff === bestMatch.dateDiff && timeDiff < bestMatch.timeDiff)) {
        bestMatch = { invoice, confidence, timeDiff, dateDiff: absDiff, amountDiff, reasons };
      }
    }

    return bestMatch;
  }

  // ============================================
  // AUTO-MATCH WITH INVOICE GROUPING
  // ============================================
  
  app.post("/api/periods/:periodId/auto-match", isAuthenticated, async (req: any, res) => {
    try {
      const period = await assertPeriodWrite(req.params.periodId, req, res);
      if (!period) return;
      // Reset previous matches so re-running always gives accurate totals
      await storage.resetMatchesByPeriod(req.params.periodId);

      // Get user-configured matching rules (or defaults)
      const rules = await storage.getMatchingRules(req.params.periodId);

      const transactions = await storage.getTransactionsByPeriod(req.params.periodId);

      // *** PERIOD IS MASTER — fuel scoped to period dates ***
      const periodStartDay = new Date(period.startDate + 'T00:00:00').getTime();
      const periodEndDay = new Date(period.endDate + 'T00:00:00').getTime();
      const dateBufferMs = rules.dateWindowDays * 86400000;

      // Helper to get date-only (midnight) from a timestamp
      const toDateOnly = (d: number) => {
        const dt = new Date(d);
        return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).getTime();
      };

      // Filter fuel transactions to ONLY confirmed card transactions within the period
      // Cash, unknown, and debtor/account/fleet are excluded from matching but kept for reporting
      const isDebtorTx = (t: typeof transactions[0]) =>
        t.paymentType?.toLowerCase().includes('debtor') ||
        t.paymentType?.toLowerCase().includes('account') ||
        t.paymentType?.toLowerCase().includes('fleet');
      const fuelTransactions = transactions.filter(t => {
        if (t.sourceType !== 'fuel' || t.isCardTransaction !== 'yes' || isDebtorTx(t) || t.matchStatus !== 'unmatched') return false;
        // Scope to period dates
        if (!t.transactionDate) return false;
        const day = toDateOnly(new Date(t.transactionDate).getTime());
        return !isNaN(day) && day >= periodStartDay && day <= periodEndDay;
      });

      // All bank transactions — NOT scoped to period. The user may upload a wider
      // range so that weekend/holiday settlements outside the period still match.
      const bankTransactions = transactions.filter(t =>
        t.sourceType &&
        t.sourceType.startsWith('bank') &&
        t.matchStatus === 'unmatched'
      );


      console.log(`[AUTO-MATCH] Period: ${period.name} (${period.startDate} to ${period.endDate}), Fuel txns: ${fuelTransactions.length}, Bank txns: ${bankTransactions.length}`);
      if (fuelTransactions.length > 0) {
        const fuelDateSet = new Set(fuelTransactions.map(t => t.transactionDate?.substring(0, 10)));
        console.log(`[AUTO-MATCH] Fuel dates: ${[...fuelDateSet].sort().join(', ')}`);
      }
      if (bankTransactions.length > 0) {
        const bankDateSet = new Set(bankTransactions.map(t => t.transactionDate?.substring(0, 10)));
        console.log(`[AUTO-MATCH] Bank dates: ${[...bankDateSet].sort().join(', ')}`);
      }

      // *** DATE RANGE VALIDATION ***
      // Bank transactions outside the period range + date window buffer cannot match any fuel record.
      // Bank can be up to dateWindowDays AFTER period end (settlement lag) or 1 day BEFORE period start (timezone).
      let unmatchableBankTransactions: typeof bankTransactions = [];
      let dateRangeWarning = '';

      unmatchableBankTransactions = bankTransactions.filter(t => {
        if (!t.transactionDate) return false;
        const bankTime = new Date(t.transactionDate).getTime();
        if (isNaN(bankTime)) return false;
        const bankDay = toDateOnly(bankTime);
        // Bank is too far after period end OR too far before period start
        return bankDay > periodEndDay + dateBufferMs || bankDay < periodStartDay - 86400000;
      });

      if (unmatchableBankTransactions.length > 0) {
        dateRangeWarning = `${unmatchableBankTransactions.length} bank transaction(s) are outside the period date range (${period.startDate} to ${period.endDate}) + ${rules.dateWindowDays}-day window and cannot be matched.`;
        // Mark these as unmatchable in bulk
        await storage.updateTransactionsBatch(
          unmatchableBankTransactions.map(tx => ({ id: tx.id, data: { matchStatus: 'unmatchable', matchId: null } }))
        );
      }

      // Filter out unmatchable transactions for matching
      const matchableBankTransactions = bankTransactions.filter(
        t => !unmatchableBankTransactions.includes(t)
      );
      

      // *** KEY STEP: Group fuel by invoice ***
      const fuelInvoices = groupFuelByInvoice(fuelTransactions, rules.groupByInvoice);

      // Pre-index invoices by date bucket for O(1) lookup per date
      const invoicesByDate = new Map<number, FuelInvoice[]>();
      for (const invoice of fuelInvoices) {
        const dayKey = parseDateToDays(invoice.firstDate || '');
        if (dayKey !== null) {
          // Index into each day within the matching window
          for (let offset = -1; offset <= rules.dateWindowDays; offset++) {
            const key = dayKey + offset;
            if (!invoicesByDate.has(key)) invoicesByDate.set(key, []);
            invoicesByDate.get(key)!.push(invoice);
          }
        }
      }

      let matchCount = 0;
      let skippedNonCardCount = transactions.filter(t => {
        if (t.sourceType !== 'fuel' || t.isCardTransaction === 'yes') return false;
        if (!t.transactionDate) return false;
        const day = toDateOnly(new Date(t.transactionDate).getTime());
        return !isNaN(day) && day >= periodStartDay && day <= periodEndDay;
      }).length;

      // Track matched invoices to avoid double-matching
      const matchedInvoices = new Set<string>();

      // Collect matches and transaction updates for bulk creation
      const pendingMatches: Array<{
        matchData: { periodId: string; fuelTransactionId: string; bankTransactionId: string; matchType: string; matchConfidence: string };
        bankTxId: string;
        fuelItemIds: string[];
      }> = [];

      // Match bank transactions to invoices (only matchable ones)
      for (const bankTx of matchableBankTransactions) {
        let bestMatch: { 
          invoice: FuelInvoice; 
          confidence: number; 
          timeDiff: number; 
          dateDiff: number;
          amountDiff: number;
          reasons: string[];
        } | null = null;

        // Look up candidate invoices by bank transaction date
        const bankDayKey = parseDateToDays(bankTx.transactionDate || '');
        const candidateInvoices = bankDayKey !== null ? (invoicesByDate.get(bankDayKey) || []) : fuelInvoices;
        // Deduplicate candidates (same invoice may appear in multiple date buckets)
        const seen = new Set<string>();

        for (const invoice of candidateInvoices) {
          if (seen.has(invoice.invoiceNumber)) continue;
          seen.add(invoice.invoiceNumber);
          // Skip if already matched
          if (matchedInvoices.has(invoice.invoiceNumber)) continue;
          if (invoice.items.some(item => item.matchStatus === 'matched')) continue;

          const reasons: string[] = [];

          // Amount matching with configurable tolerance
          const bankAmount = parseFloat(bankTx.amount);
          const fuelAmount = invoice.totalAmount;
          const amountDiff = Math.abs(bankAmount - fuelAmount);

          if (amountDiff > rules.amountTolerance) continue; // Outside tolerance

          if (amountDiff === 0) {
            reasons.push('Exact amount match');
          } else {
            reasons.push(`Amount within R${amountDiff.toFixed(2)} (tolerance: R${rules.amountTolerance})`);
          }

          // Date matching with configurable window
          const fuelDate = parseDateToDays(invoice.firstDate || '');
          const bankDate = parseDateToDays(bankTx.transactionDate || '');

          if (fuelDate === null || bankDate === null) continue;

          const dateDiff = bankDate - fuelDate; // Positive = bank is later

          // Allow bank to be 0-N days after fuel (based on rules)
          // Also allow bank to be 1 day before fuel (timezone differences)
          if (dateDiff < -1 || dateDiff > rules.dateWindowDays) continue;

          // Calculate base confidence from date difference
          let confidence = 70;
          if (dateDiff === 0) {
            confidence = 85;
            reasons.push('Same day transaction');
          } else if (Math.abs(dateDiff) === 1) {
            confidence = 75;
            reasons.push('1 day difference');
          } else if (Math.abs(dateDiff) === 2) {
            confidence = 68;
            reasons.push('2 days difference');
          } else {
            confidence = 65;
            reasons.push(`${Math.abs(dateDiff)} days difference (weekend/holiday processing)`);
          }

          // Time matching (only for same-day transactions)
          const fuelTime = parseTimeToMinutes(invoice.firstTime || '');
          const bankTime = parseTimeToMinutes(bankTx.transactionTime || '');

          let timeDiff = 0;

          if (dateDiff === 0 && fuelTime !== null && bankTime !== null) {
            timeDiff = Math.abs(fuelTime - bankTime);

            if (timeDiff <= 5) {
              confidence = 100;
              reasons.push('Times within 5 minutes');
            } else if (timeDiff <= 15) {
              confidence = 95;
              reasons.push('Times within 15 minutes');
            } else if (timeDiff <= 30) {
              confidence = 85;
              reasons.push('Times within 30 minutes');
            } else if (timeDiff <= rules.timeWindowMinutes) {
              confidence = 75;
              reasons.push(`Times within ${timeDiff} minutes`);
            } else {
              confidence = 75;
              reasons.push(`Time difference: ${timeDiff} minutes`);
            }
          }

          // Amount penalty (the further from exact, the lower confidence)
          // Reduced from max 10 to max 5 to ensure within-tolerance amounts can still match
          if (amountDiff > 0) {
            const amountPenalty = Math.min(5, (amountDiff / rules.amountTolerance) * 5);
            confidence -= amountPenalty;
          }

          // Card number check - CRITICAL for disambiguation when multiple matches exist
          // Card numbers are normalized to last 4 digits during import
          let cardMatch: 'yes' | 'no' | 'unknown' = 'unknown';
          
          if (rules.requireCardMatch) {
            if (!bankTx.cardNumber || !invoice.cardNumber) continue;
            if (bankTx.cardNumber !== invoice.cardNumber) continue;
            cardMatch = 'yes';
            confidence += 25; // Strong boost for required card match
            reasons.push('Card numbers match (required)');
          } else {
            // When card numbers are available, they're the strongest discriminator
            // for ambiguous cases (e.g., R200 on same day from different cards)
            if (bankTx.cardNumber && invoice.cardNumber) {
              if (bankTx.cardNumber === invoice.cardNumber) {
                cardMatch = 'yes';
                confidence += 25; // Strong boost - card match is highly reliable
                reasons.push('Card numbers match (strong)');
              } else {
                cardMatch = 'no';
                confidence -= 30; // Strong penalty - different cards should not match
                reasons.push('Card numbers differ (penalty)');
              }
            }
            // If fuel has no card number, don't penalize - fuel systems often lack card data
            // Only card mismatch (both have cards but different) gets penalized above
          }

          // Multi-line invoice note
          if (invoice.items.length > 1) {
            reasons.push(`Grouped invoice: ${invoice.items.length} items`);
          }

          // Cap confidence
          confidence = Math.min(100, Math.max(0, confidence));

          // Check minimum confidence threshold
          if (confidence < rules.minimumConfidence) continue;

          // Prefer matches with: highest confidence, then card match, then smallest date diff, then smallest time diff
          const absDiff = Math.abs(dateDiff);
          const cardMatchScore = cardMatch === 'yes' ? 2 : cardMatch === 'unknown' ? 1 : 0;
          const bestCardScore = bestMatch ? 
            (bestMatch.reasons.some(r => r.includes('Card numbers match')) ? 2 : 
             bestMatch.reasons.some(r => r.includes('Card numbers differ')) ? 0 : 1) : -1;
          
          if (!bestMatch || 
              confidence > bestMatch.confidence ||
              (confidence === bestMatch.confidence && cardMatchScore > bestCardScore) ||
              (confidence === bestMatch.confidence && cardMatchScore === bestCardScore && absDiff < bestMatch.dateDiff) ||
              (confidence === bestMatch.confidence && cardMatchScore === bestCardScore && absDiff === bestMatch.dateDiff && timeDiff < bestMatch.timeDiff)) {
            bestMatch = { invoice, confidence, timeDiff, dateDiff: absDiff, amountDiff, reasons };
          }
        }

        // Collect match for bulk creation
        if (bestMatch) {
          const isExact = Math.abs(bestMatch.amountDiff) < 0.005;
          const aboveThreshold = bestMatch.confidence >= rules.autoMatchThreshold;
          const matchType = isExact && aboveThreshold ? 'auto_exact'
            : isExact ? 'auto_exact_review'
            : aboveThreshold ? 'auto_rules'
            : 'auto_rules_review';

          pendingMatches.push({
            matchData: {
              periodId: req.params.periodId,
              fuelTransactionId: bestMatch.invoice.items[0].id,
              bankTransactionId: bankTx.id,
              matchType,
              matchConfidence: String(bestMatch.confidence),
            },
            bankTxId: bankTx.id,
            fuelItemIds: bestMatch.invoice.items.map(item => item.id),
          });

          matchedInvoices.add(bestMatch.invoice.invoiceNumber);
          matchCount++;
        }
      }

      // *** PHASE 1: LAG DETECTION ***
      // For each still-unmatched in-period bank tx, run the same matcher against
      // out-of-period fuel. A hit means the bank is explained by fuel belonging to
      // another period — don't create a match record, but tag the bank as
      // 'lag_explained' so it drops out of Review Bank without disappearing silently.
      const matchedBankIds = new Set(pendingMatches.map(pm => pm.bankTxId));
      const unmatchedInPeriodBank = matchableBankTransactions.filter(bt => {
        if (matchedBankIds.has(bt.id)) return false;
        if (!bt.transactionDate) return false;
        const day = toDateOnly(new Date(bt.transactionDate).getTime());
        return !isNaN(day) && day >= periodStartDay && day <= periodEndDay;
      });

      const outOfPeriodCardFuel = transactions.filter(t => {
        if (t.sourceType !== 'fuel' || t.isCardTransaction !== 'yes' || isDebtorTx(t)) return false;
        if (t.matchStatus === 'matched' || t.matchStatus === 'excluded') return false;
        if (!t.transactionDate) return false;
        const day = toDateOnly(new Date(t.transactionDate).getTime());
        if (isNaN(day)) return false;
        return day < periodStartDay || day > periodEndDay;
      });

      const outOfPeriodInvoices = groupFuelByInvoice(outOfPeriodCardFuel, rules.groupByInvoice);
      const outOfPeriodByDate = new Map<number, FuelInvoice[]>();
      for (const invoice of outOfPeriodInvoices) {
        const dayKey = parseDateToDays(invoice.firstDate || '');
        if (dayKey !== null) {
          for (let offset = -1; offset <= rules.dateWindowDays; offset++) {
            const key = dayKey + offset;
            if (!outOfPeriodByDate.has(key)) outOfPeriodByDate.set(key, []);
            outOfPeriodByDate.get(key)!.push(invoice);
          }
        }
      }

      const lagUsedInvoices = new Set<string>();
      const lagExplainedBankIds: string[] = [];
      for (const bankTx of unmatchedInPeriodBank) {
        const bankDayKey = parseDateToDays(bankTx.transactionDate || '');
        const candidates = bankDayKey !== null ? (outOfPeriodByDate.get(bankDayKey) || []) : outOfPeriodInvoices;
        const bestMatch = scoreBankToInvoices(bankTx, candidates, lagUsedInvoices, rules);
        if (bestMatch) {
          lagExplainedBankIds.push(bankTx.id);
          lagUsedInvoices.add(bestMatch.invoice.invoiceNumber);
        }
      }
      console.log(`[AUTO-MATCH] Lag-explained bank: ${lagExplainedBankIds.length} of ${unmatchedInPeriodBank.length} in-period unmatched`);

      // Bulk create all matches at once
      console.log(`[MATCH] Creating ${pendingMatches.length} matches in bulk...`);
      const createdMatches = await storage.createMatchesBatch(
        pendingMatches.map(pm => pm.matchData)
      );

      // Build transaction updates from created matches
      const txUpdates: Array<{ id: string; data: { matchStatus: string; matchId: string | null } }> = [];
      for (let i = 0; i < createdMatches.length; i++) {
        const match = createdMatches[i];
        const pending = pendingMatches[i];
        txUpdates.push({ id: pending.bankTxId, data: { matchStatus: 'matched', matchId: match.id } });
        for (const fuelId of pending.fuelItemIds) {
          txUpdates.push({ id: fuelId, data: { matchStatus: 'matched', matchId: match.id } });
        }
      }
      for (const bankId of lagExplainedBankIds) {
        txUpdates.push({ id: bankId, data: { matchStatus: 'lag_explained', matchId: null } });
      }

      // Bulk update all transactions
      console.log(`[MATCH] Updating ${txUpdates.length} transactions in bulk...`);
      await storage.updateTransactionsBatch(txUpdates);

      // Calculate match rate based on matchable transactions (excluding unmatchable)
      const matchableCount = matchableBankTransactions.length;
      const matchRate = matchableCount > 0
        ? ((matchCount / matchableCount) * 100).toFixed(1)
        : '0';

      // Update period status to complete after matching
      await storage.updatePeriod(req.params.periodId, { status: 'complete' });

      audit(req, { action: "reconciliation.run", resourceType: "period", resourceId: req.params.periodId, detail: `${matchCount} matches created` });

      res.json({
        success: true,
        matchesCreated: matchCount,
        cardTransactionsProcessed: fuelTransactions.length,
        invoicesCreated: fuelInvoices.length,
        bankTransactionsTotal: bankTransactions.length,
        bankTransactionsMatchable: matchableCount,
        bankTransactionsUnmatchable: unmatchableBankTransactions.length,
        bankTransactionsLagExplained: lagExplainedBankIds.length,
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

  app.post("/api/matches/manual", isAuthenticated, async (req: any, res) => {
    try {
      const matchInput = insertMatchSchema.omit({ matchType: true, matchConfidence: true }).parse(req.body);

      const period = await assertPeriodWrite(matchInput.periodId, req, res);
      if (!period) return;

      const match = await storage.createMatch({
        ...matchInput,
        matchType: 'user_confirmed',
        matchConfidence: '100',
      });

      await storage.updateTransaction(matchInput.fuelTransactionId, { 
        matchStatus: 'matched',
        matchId: match.id 
      });
      await storage.updateTransaction(matchInput.bankTransactionId, {
        matchStatus: 'matched',
        matchId: match.id
      });

      audit(req, { action: "match.manual", resourceType: "match", resourceId: match.id, detail: `Fuel ${matchInput.fuelTransactionId.slice(0,8)}... ↔ Bank ${matchInput.bankTransactionId.slice(0,8)}...` });
      res.json({ success: true, match });
    } catch (error) {
      console.error("Error creating manual match:", error);
      res.status(400).json({ error: "Failed to create manual match" });
    }
  });

  app.delete("/api/matches/:matchId", isAuthenticated, async (req: any, res) => {
    try {
      const match = await storage.getMatch(req.params.matchId);
      if (!match) {
        return res.status(404).json({ error: "Match not found" });
      }

      const period = await assertPeriodWrite(match.periodId, req, res);
      if (!period) return;

      await storage.updateTransaction(match.fuelTransactionId, {
        matchStatus: 'unmatched',
        matchId: null 
      });
      await storage.updateTransaction(match.bankTransactionId, { 
        matchStatus: 'unmatched',
        matchId: null 
      });

      await storage.deleteMatch(req.params.matchId);
      audit(req, { action: "match.delete", resourceType: "match", resourceId: req.params.matchId });

      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting match:", error);
      res.status(500).json({ error: "Failed to delete match" });
    }
  });

  // Matched pairs with full transaction details (includes matches + linked resolutions)
  app.get("/api/periods/:periodId/matches/details", isAuthenticated, async (req: any, res) => {
    try {
      const period = await assertPeriodOwner(req.params.periodId, req, res);
      if (!period) return;

      const [matchRecords, allTransactions, resolutions] = await Promise.all([
        storage.getMatchesByPeriod(req.params.periodId),
        storage.getTransactionsByPeriod(req.params.periodId),
        storage.getResolutionsByPeriod(req.params.periodId),
      ]);

      const txMap = new Map(allTransactions.map(t => [t.id, t]));

      // Match records (auto + manual matches)
      // Build a map of matchId → all fuel transactions in that match (for invoice grouping)
      const fuelByMatchId = new Map<string, typeof allTransactions>();
      for (const t of allTransactions) {
        if (t.matchId && t.sourceType === 'fuel') {
          if (!fuelByMatchId.has(t.matchId)) fuelByMatchId.set(t.matchId, []);
          fuelByMatchId.get(t.matchId)!.push(t);
        }
      }

      const matchedTxIds = new Set<string>();
      const details = matchRecords
        .map(m => {
          matchedTxIds.add(m.bankTransactionId);
          matchedTxIds.add(m.fuelTransactionId);
          const allFuelItems = fuelByMatchId.get(m.id) || [];
          // Mark all fuel items as matched
          for (const f of allFuelItems) matchedTxIds.add(f.id);
          return {
            match: m,
            bankTransaction: txMap.get(m.bankTransactionId),
            fuelTransaction: txMap.get(m.fuelTransactionId),
            // Include all fuel items when invoice grouping produced multiple items
            fuelItems: allFuelItems.length > 1 ? allFuelItems : undefined,
          };
        })
        .filter(d => d.bankTransaction && d.fuelTransaction);

      // Linked resolutions (manual reconciliation with reason)
      for (const r of resolutions) {
        if (r.resolutionType !== 'linked' || !r.linkedTransactionId) continue;
        if (matchedTxIds.has(r.transactionId)) continue; // already covered by a match record

        const bankTx = txMap.get(r.transactionId);
        const fuelTx = txMap.get(r.linkedTransactionId);
        if (!bankTx || !fuelTx) continue;

        details.push({
          match: {
            id: r.id,
            periodId: r.periodId,
            bankTransactionId: r.transactionId,
            fuelTransactionId: r.linkedTransactionId,
            matchType: 'linked',
            matchConfidence: null,
            createdAt: r.createdAt,
          },
          bankTransaction: bankTx,
          fuelTransaction: fuelTx,
        });
      }

      // Excluded transactions (reversed, declined, cancelled — bank only, no fuel pair)
      // Scoped to period dates — out-of-period excluded bank belongs to a different period
      for (const tx of allTransactions) {
        if (tx.matchStatus !== 'excluded') continue;
        if (!tx.sourceType?.startsWith('bank')) continue;
        if (!tx.transactionDate || tx.transactionDate < period.startDate || tx.transactionDate > period.endDate) continue;
        details.push({
          match: {
            id: `excluded_${tx.id}`,
            periodId: req.params.periodId,
            bankTransactionId: tx.id,
            fuelTransactionId: '',
            matchType: 'excluded',
            matchConfidence: null,
            createdAt: tx.createdAt,
          },
          bankTransaction: tx,
          fuelTransaction: null,
        });
      }

      res.json(details);
    } catch (error) {
      console.error("Error fetching match details:", error);
      res.status(500).json({ error: "Failed to fetch match details" });
    }
  });

  // Transaction Resolution Routes
  app.get("/api/periods/:periodId/resolutions", isAuthenticated, async (req: any, res) => {
    try {
      const period = await assertPeriodOwner(req.params.periodId, req, res);
      if (!period) return;
      const resolutions = await storage.getResolutionsByPeriod(req.params.periodId);
      res.json(resolutions);
    } catch (error) {
      console.error("Error fetching resolutions:", error);
      res.status(500).json({ error: "Failed to fetch resolutions" });
    }
  });

  // Resolution Summary - counts by type for completion state logic
  app.get("/api/periods/:periodId/resolution-summary", isAuthenticated, async (req: any, res) => {
    try {
      const period = await assertPeriodOwner(req.params.periodId, req, res);
      if (!period) return;
      const resolutions = await storage.getResolutionsByPeriod(req.params.periodId);
      
      const summary = {
        linked: 0,
        reviewed: 0,
        dismissed: 0,
        flagged: 0,
        writtenOff: 0,
      };
      
      for (const r of resolutions) {
        switch (r.resolutionType) {
          case 'linked':
            summary.linked++;
            break;
          case 'reviewed':
            summary.reviewed++;
            break;
          case 'dismissed':
            summary.dismissed++;
            break;
          case 'flagged':
            summary.flagged++;
            break;
          case 'written_off':
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

  app.get("/api/transactions/:transactionId/resolutions", isAuthenticated, async (req: any, res) => {
    try {
      const transaction = await storage.getTransaction(req.params.transactionId);
      if (!transaction) {
        return res.status(404).json({ error: "Transaction not found" });
      }
      const period = await assertPeriodOwner(transaction.periodId, req, res);
      if (!period) return;
      const resolutions = await storage.getResolutionsByTransaction(req.params.transactionId);
      res.json(resolutions);
    } catch (error) {
      console.error("Error fetching transaction resolutions:", error);
      res.status(500).json({ error: "Failed to fetch resolutions" });
    }
  });

  app.post("/api/resolutions", isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user as User;
      const { transactionId, periodId, resolutionType, reason, notes, linkedTransactionId, assignee } = req.body;

      if (!transactionId || !periodId || !resolutionType) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const period = await assertPeriodWrite(periodId, req, res);
      if (!period) return;

      const resolution = await storage.createResolution({
        transactionId,
        periodId,
        resolutionType,
        reason: reason || null,
        notes: notes || null,
        userId: user?.id || null,
        userName: user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email : null,
        userEmail: user?.email || null,
        linkedTransactionId: linkedTransactionId || null,
        assignee: assignee || null,
      });

      // Update the transaction's match status to 'resolved' for resolutions other than 'linked'
      if (resolutionType !== 'linked') {
        await storage.updateTransaction(transactionId, { 
          matchStatus: 'resolved'
        });
      }

      audit(req, { action: `resolution.${resolutionType}`, resourceType: "transaction", resourceId: transactionId, detail: reason || notes || undefined });
      res.json({ success: true, resolution });
    } catch (error) {
      console.error("Error creating resolution:", error);
      res.status(500).json({ error: "Failed to create resolution" });
    }
  });

  // Bulk dismiss low-value transactions
  app.post("/api/resolutions/bulk-dismiss", isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user as User;
      const { transactionIds, periodId } = req.body;

      if (!transactionIds || !Array.isArray(transactionIds) || !periodId) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const period = await assertPeriodWrite(periodId, req, res);
      if (!period) return;

      const resolutions = [];
      for (const transactionId of transactionIds) {
        const resolution = await storage.createResolution({
          transactionId,
          periodId,
          resolutionType: 'dismissed',
          reason: 'test_transaction',
          notes: 'Bulk dismissed as low-value transaction',
          userId: user?.id || null,
          userName: user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email : null,
          userEmail: user?.email || null,
          linkedTransactionId: null,
          assignee: null,
        });
        resolutions.push(resolution);

        await storage.updateTransaction(transactionId, { 
          matchStatus: 'resolved'
        });
      }

      audit(req, { action: "resolution.bulk_dismiss", resourceType: "period", resourceId: periodId, detail: `${resolutions.length} transactions dismissed` });
      res.json({ success: true, count: resolutions.length });
    } catch (error) {
      console.error("Error bulk dismissing:", error);
      res.status(500).json({ error: "Failed to bulk dismiss transactions" });
    }
  });

  // Bulk flag transactions for review
  app.post("/api/resolutions/bulk-flag", isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user as User;
      const { transactionIds, periodId } = req.body;

      if (!transactionIds || !Array.isArray(transactionIds) || !periodId) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const period = await assertPeriodWrite(periodId, req, res);
      if (!period) return;

      const resolutions = [];
      for (const transactionId of transactionIds) {
        const resolution = await storage.createResolution({
          transactionId,
          periodId,
          resolutionType: 'flagged',
          reason: null,
          notes: 'Flagged for manager review',
          userId: user?.id || null,
          userName: user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email : null,
          userEmail: user?.email || null,
          linkedTransactionId: null,
          assignee: null,
        });
        resolutions.push(resolution);

        await storage.updateTransaction(transactionId, { 
          matchStatus: 'resolved'
        });
      }

      audit(req, { action: "resolution.bulk_flag", resourceType: "period", resourceId: periodId, detail: `${resolutions.length} transactions flagged` });
      res.json({ success: true, count: resolutions.length });
    } catch (error) {
      console.error("Error bulk flagging:", error);
      res.status(500).json({ error: "Failed to bulk flag transactions" });
    }
  });

  // Delete resolution for a single transaction (unmatch)
  app.delete("/api/resolutions/:transactionId", isAuthenticated, async (req: any, res) => {
    try {
      const tx = await storage.getTransaction(req.params.transactionId);
      if (!tx) return res.status(404).json({ error: "Transaction not found" });
      const period = await assertPeriodWrite(tx.periodId, req, res);
      if (!period) return;
      const count = await storage.deleteResolutionByTransaction(req.params.transactionId);
      if (count === 0) return res.status(404).json({ error: "No resolution found" });
      res.json({ success: true, count });
    } catch (error) {
      console.error("Error deleting resolution:", error);
      res.status(500).json({ error: "Failed to delete resolution" });
    }
  });

  // Clear all resolutions for a period (undo)
  app.delete("/api/periods/:periodId/resolutions", isAuthenticated, async (req: any, res) => {
    try {
      const period = await assertPeriodWrite(req.params.periodId, req, res);
      if (!period) return;
      const count = await storage.clearResolutionsByPeriod(req.params.periodId);
      res.json({ success: true, count });
    } catch (error) {
      console.error("Error clearing resolutions:", error);
      res.status(500).json({ error: "Failed to clear resolutions" });
    }
  });

  // Declined transaction analysis
  app.get("/api/periods/:periodId/decline-analysis", isAuthenticated, async (req: any, res) => {
    try {
      const period = await assertPeriodOwner(req.params.periodId, req, res);
      if (!period) return;

      const allTransactions = await storage.getTransactionsByPeriod(req.params.periodId);

      // Scope to period dates (date window is for matching only)
      const bankTxns = allTransactions.filter(t =>
        t.sourceType?.startsWith('bank') &&
        t.transactionDate && t.transactionDate >= period.startDate && t.transactionDate <= period.endDate
      );
      const fuelTxns = allTransactions.filter(t =>
        t.sourceType === 'fuel' &&
        t.transactionDate && t.transactionDate >= period.startDate && t.transactionDate <= period.endDate
      );
      const excluded = bankTxns.filter(t => t.matchStatus === 'excluded');
      const approved = bankTxns.filter(t => t.matchStatus !== 'excluded' && t.matchStatus !== 'unmatchable');

      // Track which approved transactions have been claimed by a resubmission
      const claimedApprovals = new Set<string>();

      // Classify each excluded transaction
      const analysed = excluded.map(tx => {
        const desc = (tx.description || '').toLowerCase();
        const type = desc.includes('declined') ? 'Declined'
          : desc.includes('cancel') || desc.includes('revers') ? 'Cancelled / Reversed'
          : 'Excluded';
        const cleanDesc = tx.description?.replace(/\s*\[Excluded:.*?\]/g, '').trim() || '';
        const amt = parseFloat(tx.amount);
        const card = tx.cardNumber || '';
        const date = tx.transactionDate;

        // Resubmission matching is done in a second pass (below)
        // Determine note and financial impact
        let note = '';
        let recoveredAmount = 0;
        let isRecovered = false;

        // Find attendant/cashier from nearest fuel transaction
        const nearestFuel = (() => {
          if (!tx.transactionTime) return null;
          const txMin = parseInt(tx.transactionTime.split(':')[0]) * 60 + parseInt(tx.transactionTime.split(':')[1] || '0');
          let best: typeof fuelTxns[0] | null = null;
          let bestDiff = Infinity;
          for (const f of fuelTxns) {
            if (f.transactionDate !== date || !f.transactionTime) continue;
            // Prefer same card number if available
            if (card && f.cardNumber === card) { best = f; break; }
            const fMin = parseInt(f.transactionTime.split(':')[0]) * 60 + parseInt(f.transactionTime.split(':')[1] || '0');
            const diff = Math.abs(fMin - txMin);
            if (diff < bestDiff && diff <= 30) { bestDiff = diff; best = f; }
          }
          return best;
        })();

        return {
          id: tx.id,
          date,
          time: tx.transactionTime || '',
          amount: amt,
          bank: tx.sourceName || tx.sourceType,
          cardNumber: card,
          description: cleanDesc,
          type,
          note,
          recoveredAmount,
          isRecovered,
          resubmittedTxId: null as string | null,
          attendant: nearestFuel?.attendant || null,
          cashier: nearestFuel?.cashier || null,
        };
      });

      // Second pass: match approvals to nearest preceding decline (by time)
      // Each approval can only cover one decline
      const toMinutes = (t: string) => {
        const parts = t.split(':');
        return parseInt(parts[0]) * 60 + parseInt(parts[1] || '0');
      };
      for (const appr of approved) {
        if (!appr.cardNumber || claimedApprovals.has(appr.id)) continue;
        const apprTime = appr.transactionTime ? toMinutes(appr.transactionTime) : null;
        // Find all unclaimed declines for same card + date
        const candidates = analysed.filter(d =>
          !d.isRecovered && d.cardNumber === appr.cardNumber && d.date === appr.transactionDate
        );
        if (candidates.length === 0) continue;
        // Pick the closest decline BEFORE the approval
        let best: typeof candidates[0] | null = null;
        let bestDiff = Infinity;
        for (const c of candidates) {
          if (apprTime !== null && c.time) {
            const cTime = toMinutes(c.time);
            if (cTime <= apprTime) {
              const diff = apprTime - cTime;
              if (diff < bestDiff) { bestDiff = diff; best = c; }
            }
          }
        }
        // If no preceding decline, pick the closest overall
        if (!best) {
          for (const c of candidates) {
            if (apprTime !== null && c.time) {
              const diff = Math.abs(toMinutes(c.time) - apprTime);
              if (diff < bestDiff) { bestDiff = diff; best = c; }
            }
          }
        }
        if (best) {
          const apprAmt = parseFloat(appr.amount);
          const shortfall = best.amount - apprAmt;
          if (shortfall > 0.50) {
            // Partial recovery — amount went through for less
            best.note = `partial resubmission at ${appr.transactionTime || 'unknown'} — shortfall ${shortfall.toFixed(2)}`;
            best.recoveredAmount = apprAmt;
            best.isRecovered = false; // NOT fully recovered
          } else {
            best.note = `resubmitted at ${appr.transactionTime || 'unknown'}`;
            best.recoveredAmount = apprAmt;
            best.isRecovered = true;
          }
          best.resubmittedTxId = appr.id;
          claimedApprovals.add(appr.id);
        }
      }

      // Suspicious patterns
      const suspicious: { pattern: string; severity: 'high' | 'medium' | 'low'; detail: string; cardNumber: string; amount: number; shortfall: number; attendant: string | null }[] = [];

      // Helper: find attendant for a decline by looking at fuel transactions near the same time
      const findAttendant = (d: { date: string; time: string; cardNumber: string }) => {
        // First try: fuel transaction with same card number on same date
        const byCard = fuelTxns.find(f => f.cardNumber === d.cardNumber && f.transactionDate === d.date);
        if (byCard?.attendant) return byCard.attendant;
        // Second try: nearest fuel transaction by time on same date
        if (!d.time) return null;
        const dMin = parseInt(d.time.split(':')[0]) * 60 + parseInt(d.time.split(':')[1] || '0');
        let nearest: typeof fuelTxns[0] | null = null;
        let nearestDiff = Infinity;
        for (const f of fuelTxns) {
          if (f.transactionDate !== d.date || !f.transactionTime) continue;
          const fMin = parseInt(f.transactionTime.split(':')[0]) * 60 + parseInt(f.transactionTime.split(':')[1] || '0');
          const diff = Math.abs(fMin - dMin);
          if (diff < nearestDiff && diff <= 30) { nearestDiff = diff; nearest = f; }
        }
        return nearest?.attendant || null;
      };

      // Group declines by card
      const declinesByCard = new Map<string, typeof analysed>();
      for (const d of analysed) {
        if (!d.cardNumber) continue;
        if (!declinesByCard.has(d.cardNumber)) declinesByCard.set(d.cardNumber, []);
        declinesByCard.get(d.cardNumber)!.push(d);
      }

      for (const [card, declines] of declinesByCard) {
        // Pattern: repeated decline attempts (3+ on same card)
        if (declines.length >= 3) {
          const att = findAttendant(declines[0]);
          suspicious.push({
            pattern: 'Repeated decline attempts',
            severity: 'high',
            detail: `Card ${card} was declined ${declines.length} times on ${declines[0].date}`,
            cardNumber: card,
            amount: declines.reduce((s, d) => s + d.amount, 0),
            shortfall: 0,
            attendant: att,
          });
        }

        // Pattern: declined then lower approved amount (partial payment)
        for (const d of declines) {
          if (d.isRecovered) continue;
          const laterApproved = approved.find(a =>
            a.cardNumber === card && a.transactionDate === d.date
            && parseFloat(a.amount) < d.amount
            && a.transactionTime && d.time && a.transactionTime > d.time
          );
          if (laterApproved) {
            const shortfall = d.amount - parseFloat(laterApproved.amount);
            const att = findAttendant(d);
            suspicious.push({
              pattern: 'Declined then lower amount approved',
              severity: 'high',
              detail: `Card ${card}: declined R${d.amount.toFixed(2)}, then approved R${parseFloat(laterApproved.amount).toFixed(2)} (shortfall R${shortfall.toFixed(2)})`,
              cardNumber: card,
              amount: d.amount,
              shortfall,
              attendant: att,
            });
          }
        }
      }

      // Pattern: declined card, then cash payment at similar time (within 30 min)
      for (const d of analysed) {
        if (d.isRecovered || !d.time) continue;
        const dMinutes = parseInt(d.time.split(':')[0]) * 60 + parseInt(d.time.split(':')[1] || '0');
        const cashNearby = fuelTxns.filter(f => {
          if (f.isCardTransaction !== 'no' || f.transactionDate !== d.date || !f.transactionTime) return false;
          const fMinutes = parseInt(f.transactionTime.split(':')[0]) * 60 + parseInt(f.transactionTime.split(':')[1] || '0');
          return fMinutes > dMinutes && (fMinutes - dMinutes) <= 5;
        });
        for (const cash of cashNearby) {
          const cashAmt = parseFloat(cash.amount);
          if (cashAmt > 0 && cashAmt >= d.amount * 0.5 && cashAmt < d.amount) {
            suspicious.push({
              pattern: 'Declined then cash payment',
              severity: 'medium',
              detail: `Card ${d.cardNumber} declined R${d.amount.toFixed(2)} at ${d.time}, cash R${cashAmt.toFixed(2)} at ${cash.transactionTime} by ${cash.attendant || 'Unknown'} (shortfall R${(d.amount - cashAmt).toFixed(2)})`,
              cardNumber: d.cardNumber,
              amount: d.amount,
              shortfall: d.amount - cashAmt,
              attendant: cash.attendant || null,
            });
          }
        }
      }

      // Pattern: late-night declines (22:00-05:00)
      const lateNight = analysed.filter(d => {
        if (!d.time) return false;
        const hour = parseInt(d.time.split(':')[0]);
        return hour >= 22 || hour < 5;
      });
      if (lateNight.length > 0) {
        suspicious.push({
          pattern: 'Late-night declines',
          severity: 'low',
          detail: `${lateNight.length} decline${lateNight.length !== 1 ? 's' : ''} between 22:00–05:00`,
          cardNumber: '',
          amount: lateNight.reduce((s, d) => s + d.amount, 0),
          shortfall: 0,
          attendant: null,
        });
      }

      // Summary
      const totalDeclined = analysed.length;
      const resubmittedCount = analysed.filter(d => d.isRecovered).length;
      const unrecovered = analysed.filter(d => !d.isRecovered);
      const netUnrecoveredAmount = unrecovered.reduce((s, d) => s + d.amount, 0);

      res.json({
        summary: {
          totalDeclined,
          resubmittedCount,
          unrecoveredCount: unrecovered.length,
          netUnrecoveredAmount,
          totalDeclinedAmount: analysed.reduce((s, d) => s + d.amount, 0),
        },
        transactions: analysed,
        suspicious: suspicious.sort((a, b) => {
          const sev = { high: 0, medium: 1, low: 2 };
          return sev[a.severity] - sev[b.severity];
        }),
      });
    } catch (error) {
      console.error("Error analysing declines:", error);
      res.status(500).json({ error: "Failed to analyse declined transactions" });
    }
  });

  // Bulk confirm matches (quick wins)
  app.post("/api/matches/bulk-confirm", isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user as User;
      const { matches, periodId } = req.body;

      if (!matches || !Array.isArray(matches) || !periodId) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const period = await assertPeriodWrite(periodId, req, res);
      if (!period) return;

      const createdMatches = [];
      for (const { bankId, fuelId } of matches) {
        try {
          // Create the match
          const match = await storage.createMatch({
            periodId,
            bankTransactionId: bankId,
            fuelTransactionId: fuelId,
            matchType: 'user_confirmed',
            matchConfidence: '100',
          });
          createdMatches.push(match);

          // Update transaction statuses
          await storage.updateTransaction(bankId, { matchStatus: 'matched', matchId: match.id });
          await storage.updateTransaction(fuelId, { matchStatus: 'matched', matchId: match.id });

          // Create resolution for audit trail
          await storage.createResolution({
            transactionId: bankId,
            periodId,
            resolutionType: 'linked',
            reason: null,
            notes: 'Bulk confirmed as quick win match',
            userId: user?.id || null,
            userName: user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email : null,
            userEmail: user?.email || null,
            linkedTransactionId: fuelId,
            assignee: null,
          });
        } catch (matchError) {
          console.error(`Error creating match for bank ${bankId}:`, matchError);
        }
      }

      audit(req, { action: "match.bulk_confirm", resourceType: "period", resourceId: periodId, detail: `${createdMatches.length} matches confirmed` });
      res.json({ success: true, count: createdMatches.length });
    } catch (error) {
      console.error("Error bulk confirming:", error);
      res.status(500).json({ error: "Failed to bulk confirm matches" });
    }
  });


  app.get("/api/periods/:periodId/summary", isAuthenticated, async (req: any, res) => {
    try {
      const period = await assertPeriodOwner(req.params.periodId, req, res);
      if (!period) return;

      const summary = await storage.getPeriodSummary(req.params.periodId);
      
      res.json(summary);
    } catch (error) {
      console.error("Error fetching summary:", error);
      res.status(500).json({ error: "Failed to fetch summary" });
    }
  });

  // Attendant summary — per-attendant breakdown of matched/unmatched fuel transactions
  app.get("/api/periods/:periodId/attendant-summary", isAuthenticated, async (req: any, res) => {
    try {
      const period = await assertPeriodOwner(req.params.periodId, req, res);
      if (!period) return;
      const attendantSummary = await storage.getAttendantSummary(req.params.periodId);
      res.json(attendantSummary);
    } catch (error) {
      console.error("Error fetching attendant summary:", error);
      res.status(500).json({ error: "Failed to fetch attendant summary" });
    }
  });

  // Export full reconciliation report as Excel
  app.get("/api/periods/:periodId/export", isAuthenticated, async (req: any, res) => {
    try {
      const period = await assertPeriodOwner(req.params.periodId, req, res);
      if (!period) return;

      const [allTransactions, matchesData, resolutions, attendantSummary, matchingRulesData] = await Promise.all([
        storage.getTransactionsByPeriod(req.params.periodId),
        storage.getMatchesByPeriod(req.params.periodId),
        storage.getResolutionsByPeriod(req.params.periodId),
        storage.getAttendantSummary(req.params.periodId),
        storage.getMatchingRules(req.params.periodId),
      ]);

      // Scope transactions to period dates (date window is for matching only)
      const transactions = allTransactions.filter(t =>
        t.transactionDate && t.transactionDate >= period.startDate && t.transactionDate <= period.endDate
      );

      // Build lookup maps
      const matchMap = new Map<string, typeof matchesData[0]>();
      for (const m of matchesData) {
        matchMap.set(m.bankTransactionId, m);
        matchMap.set(m.fuelTransactionId, m);
      }
      const resolutionMap = new Map(resolutions.map(r => [r.transactionId, r]));
      const txMap = new Map(transactions.map(t => [t.id, t]));

      // Build fuel items by matchId for invoice grouping
      const fuelByMatchId = new Map<string, typeof transactions>();
      for (const t of transactions) {
        if (t.matchId && t.sourceType === 'fuel') {
          if (!fuelByMatchId.has(t.matchId)) fuelByMatchId.set(t.matchId, []);
          fuelByMatchId.get(t.matchId)!.push(t);
        }
      }

      const bankTxns = transactions.filter(t => t.sourceType?.startsWith('bank'));
      const fuelTxns = transactions.filter(t => t.sourceType === 'fuel');
      const matchedBank = bankTxns.filter(t => t.matchStatus === 'matched');
      const unmatchedBank = bankTxns.filter(t => t.matchStatus === 'unmatched' && parseFloat(t.amount) > 0);
      const excludedBank = bankTxns.filter(t => t.matchStatus === 'excluded');
      const outsideRange = bankTxns.filter(t => t.matchStatus === 'unmatchable');
      const matchableBank = bankTxns.filter(t => t.matchStatus === 'matched' || t.matchStatus === 'unmatched');

      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();

      // Compute additional metrics for summary
      const isDebtor = (t: typeof fuelTxns[0]) =>
        t.paymentType?.toLowerCase().includes('debtor') ||
        t.paymentType?.toLowerCase().includes('account') ||
        t.paymentType?.toLowerCase().includes('fleet');
      // Debtors identified by payment_type regardless of is_card_transaction flag
      const debtorFuel = fuelTxns.filter(t => isDebtor(t));
      const cardOnlyFuel = fuelTxns.filter(t => t.isCardTransaction === 'yes' && !isDebtor(t));
      const cashFuel = fuelTxns.filter(t => t.isCardTransaction === 'no' && !isDebtor(t));

      const sumAmount = (txns: typeof fuelTxns) => txns.reduce((s, t) => s + parseFloat(t.amount), 0);

      const cardOnlyAmount = sumAmount(cardOnlyFuel);
      const debtorAmount = sumAmount(debtorFuel);
      const cashAmount = sumAmount(cashFuel);
      const totalFuelAmount = sumAmount(fuelTxns);
      const matchedBankAmount = sumAmount(matchedBank);
      const unmatchedBankAmount = sumAmount(unmatchedBank);
      const excludedBankAmount = sumAmount(excludedBank);

      // Corresponding fuel amounts for matched pairs (sum ALL grouped fuel items per match)
      const matchedFuelAmount = matchesData.reduce((s, m) => {
        const allFuelItems = fuelByMatchId.get(m.id) || [];
        if (allFuelItems.length > 0) {
          return s + allFuelItems.reduce((fs, f) => fs + parseFloat(f.amount), 0);
        }
        const fuel = txMap.get(m.fuelTransactionId);
        return s + (fuel ? parseFloat(fuel.amount) : 0);
      }, 0);

      const cardFuelAmount = sumAmount(fuelTxns.filter(t => t.isCardTransaction === 'yes'));
      // Card-only excludes debtors — debtors are their own category (like cash)
      const cardOnlyFuelAmount = cardOnlyAmount;
      const bankApprovedAmount = matchedBankAmount + unmatchedBankAmount;
      // File Surplus uses card-only (no debtors) — debtors aren't expected to have bank matches
      const fileSurplus = bankApprovedAmount - cardOnlyFuelAmount;
      const matchedSurplus = matchedBankAmount - matchedFuelAmount;
      // Unmatched fuel card excludes debtors
      const unmatchedFuelCard = fuelTxns.filter(t => t.isCardTransaction === 'yes' && !isDebtor(t) && t.matchStatus !== 'matched' && parseFloat(t.amount) > 0);
      const unmatchedFuelCardAmount = sumAmount(unmatchedFuelCard);
      const totalFuelCardReconciled = matchedFuelAmount + unmatchedFuelCardAmount;
      // Recon Surplus = Unmatched Fuel Card + File Surplus/Shortfall
      const reconSurplus = unmatchedFuelCardAmount + fileSurplus;
      const outsideRangeAmount = sumAmount(outsideRange);
      const matchRate = matchableBank.length > 0 ? Math.round((matchedBank.length / matchableBank.length) * 100) : 0;

      // Per-bank breakdown
      const bankBySource = new Map<string, { approved: typeof bankTxns; declined: typeof bankTxns; cancelled: typeof bankTxns }>();
      for (const t of bankTxns) {
        const name = t.sourceName || 'Bank';
        if (!bankBySource.has(name)) bankBySource.set(name, { approved: [], declined: [], cancelled: [] });
        const entry = bankBySource.get(name)!;
        if (t.matchStatus === 'excluded') {
          const desc = (t.description || '').toLowerCase();
          if (desc.includes('declined')) entry.declined.push(t);
          else entry.cancelled.push(t);
        } else {
          entry.approved.push(t);
        }
      }

      // Sheet 1: Summary — structured to match reconciliation report
      const fmt = (n: number) => parseFloat(n.toFixed(2));
      const summaryRows: { Metric: string; Count?: number | string; Amount?: number | string }[] = [
        { Metric: 'Period', Count: '', Amount: period.name },
        { Metric: 'Period Dates', Count: '', Amount: `${period.startDate} to ${period.endDate}` },
        { Metric: '' },
        { Metric: 'FUEL TRANSACTIONS', Count: 'Count', Amount: 'Amount' },
        { Metric: '  Card', Count: cardOnlyFuel.length, Amount: fmt(cardOnlyAmount) },
      ];
      if (debtorFuel.length > 0) {
        summaryRows.push({ Metric: '  Debtor / Account', Count: debtorFuel.length, Amount: fmt(debtorAmount) });
      }
      summaryRows.push(
        { Metric: '  Cash', Count: cashFuel.length, Amount: fmt(cashAmount) },
        { Metric: '  Total', Count: fuelTxns.length, Amount: fmt(totalFuelAmount) },
        { Metric: '' },
        { Metric: 'BANK TRANSACTIONS' },
        { Metric: '  Total', Count: bankTxns.length },
        { Metric: '  Matchable', Count: matchableBank.length },
        { Metric: '  Outside Date Range', Count: outsideRange.length, Amount: outsideRangeAmount > 0 ? fmt(outsideRangeAmount) : undefined },
        { Metric: '  Excluded (reversed/declined/cancelled)', Count: excludedBank.length },
      );

      // Per-bank breakdown — columnar layout with bank names as headers + Total
      if (bankBySource.size > 0) {
        summaryRows.push({ Metric: '' });
        const bankNames = Array.from(bankBySource.keys()).sort();
        // Header row with bank names
        const headerRow: Record<string, string> = { Metric: '' };
        for (const name of bankNames) headerRow[name] = name;
        headerRow['Total'] = 'Total';
        summaryRows.push(headerRow as any);

        for (const { label, getter } of [
          { label: 'Declined', getter: (e: { declined: typeof bankTxns; cancelled: typeof bankTxns; approved: typeof bankTxns }) => e.declined },
          { label: 'Cancelled', getter: (e: { declined: typeof bankTxns; cancelled: typeof bankTxns; approved: typeof bankTxns }) => e.cancelled },
          { label: 'Approved', getter: (e: { declined: typeof bankTxns; cancelled: typeof bankTxns; approved: typeof bankTxns }) => e.approved },
        ]) {
          // Count row
          const countRow: Record<string, any> = { Metric: label };
          let totalCount = 0;
          for (const name of bankNames) {
            const c = getter(bankBySource.get(name)!).length;
            countRow[name] = c;
            totalCount += c;
          }
          countRow['Total'] = totalCount;
          summaryRows.push(countRow as any);

          // Amount row
          const amtRow: Record<string, any> = { Metric: 'Amount' };
          let totalAmt = 0;
          for (const name of bankNames) {
            const a = sumAmount(getter(bankBySource.get(name)!));
            amtRow[name] = a > 0 ? fmt(a) : '-';
            totalAmt += a;
          }
          amtRow['Total'] = totalAmt > 0 ? fmt(totalAmt) : '-';
          summaryRows.push(amtRow as any);
        }
      }

      // Resolution counts for review progress
      const linkedResolutions = resolutions.filter(r => r.resolutionType === 'linked').length;
      const flaggedResolutions = resolutions.filter(r => r.resolutionType === 'flagged').length;
      const dismissedResolutions = resolutions.filter(r => r.resolutionType === 'dismissed').length;
      const totalReviewActions = linkedResolutions + flaggedResolutions + dismissedResolutions;

      summaryRows.push(
        { Metric: '' },
        { Metric: 'MATCHING' },
        { Metric: '  Matched', Count: matchedBank.length },
        { Metric: '  Match Rate', Count: `${matchRate}%` },
        { Metric: '  Unmatched Bank', Count: unmatchedBank.length },
      );

      // Matching rules
      if (matchingRulesData) {
        summaryRows.push(
          { Metric: '' },
          { Metric: 'MATCHING RULES' },
          { Metric: '  Amount Tolerance', Count: `±R ${Number(matchingRulesData.amountTolerance).toFixed(2)}` },
          { Metric: '  Date Window', Count: `${matchingRulesData.dateWindowDays} day${matchingRulesData.dateWindowDays !== 1 ? 's' : ''}` },
          { Metric: '  Time Window', Count: `${matchingRulesData.timeWindowMinutes} min` },
          { Metric: '  Min Confidence', Count: `${matchingRulesData.minimumConfidence}%` },
          { Metric: '  Auto-Match Threshold', Count: `${matchingRulesData.autoMatchThreshold}%` },
          { Metric: '  Invoice Grouping', Count: matchingRulesData.groupByInvoice ? 'On' : 'Off' },
          { Metric: '  Card Required', Count: matchingRulesData.requireCardMatch ? 'Yes' : 'No' },
        );
      }

      // Review progress
      summaryRows.push(
        { Metric: '' },
        { Metric: 'REVIEW PROGRESS' },
        { Metric: '  Matched by user', Count: linkedResolutions },
        { Metric: '  Flagged for investigation', Count: flaggedResolutions },
        { Metric: '  Dismissed (low value)', Count: dismissedResolutions },
        { Metric: '  Total review actions', Count: totalReviewActions },
        { Metric: '  Unresolved bank', Count: unmatchedBank.filter(t => !resolutionMap.has(t.id)).length },
        { Metric: '  Unresolved fuel', Count: unmatchedFuelCard.filter(t => !resolutionMap.has(t.id)).length },
      );

      // Card Sales Reconciliation — top-level gap
      const analysisTotal = fmt(matchedSurplus - unmatchedFuelCardAmount + unmatchedBankAmount);

      summaryRows.push(
        { Metric: '' },
        { Metric: 'CARD SALES RECONCILIATION', Count: '', Amount: 'Amount' },
        { Metric: '  Fuel Card Sales Amount', Amount: fmt(cardOnlyFuelAmount) },
        { Metric: '  Bank Approved Amount', Amount: fmt(bankApprovedAmount) },
        { Metric: '  Surplus / Shortfall', Amount: fmt(fileSurplus) },
        { Metric: '' },
        { Metric: 'SURPLUS / SHORTFALL ANALYSIS' },
        { Metric: '' },
        { Metric: '  Decimal matching error:' },
        { Metric: '    Matched fuel amount', Amount: fmt(matchedFuelAmount) },
        { Metric: '    Matched bank amount', Amount: fmt(matchedBankAmount) },
        { Metric: '    Decimal error', Amount: fmt(matchedSurplus) },
        { Metric: '' },
        { Metric: '  Fuel attendant error:' },
        { Metric: '    Unmatched fuel card transactions', Amount: fmt(unmatchedFuelCardAmount) },
        { Metric: '' },
        { Metric: '  Unmatched bank transactions', Amount: unmatchedBankAmount > 0 ? fmt(unmatchedBankAmount) : '-' },
        { Metric: '' },
        { Metric: '  Total Surplus / Shortfall', Amount: analysisTotal },
        { Metric: '' },
        { Metric: '  Excluded Bank Amount', Amount: fmt(excludedBankAmount) },
      );
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'Summary');

      // Sheet 2: Matched pairs (with invoice grouping support)
      const matchTypeLabel = (mt: string) =>
        mt === 'auto_exact' || mt === 'auto_exact_review' ? 'Lekana (Exact)'
        : mt === 'auto_rules' || mt === 'auto_rules_review' || mt === 'auto' || mt === 'auto_review' ? 'Lekana (Rules)'
        : mt === 'user_confirmed' || mt === 'manual' ? 'User (Confirmed)'
        : mt === 'linked' ? 'User (With reason)'
        : mt || 'Lekana (Rules)';

      const matchedRows = matchesData.map(m => {
        const bank = txMap.get(m.bankTransactionId);
        const fuel = txMap.get(m.fuelTransactionId);
        const allFuelItems = fuelByMatchId.get(m.id) || [];
        const bankAmt = bank ? parseFloat(bank.amount) : 0;
        // Sum all grouped fuel items (falls back to single fuel tx)
        const fuelAmt = allFuelItems.length > 0
          ? allFuelItems.reduce((s, f) => s + parseFloat(f.amount), 0)
          : (fuel ? parseFloat(fuel.amount) : 0);
        return {
          'Date': bank?.transactionDate || fuel?.transactionDate || '',
          'Bank Time': bank?.transactionTime || '',
          'Fuel Time': fuel?.transactionTime || '',
          'Bank Amount': bankAmt,
          'Fuel Amount': fuelAmt,
          'Fuel Items': allFuelItems.length > 1 ? allFuelItems.length : 1,
          'Difference': Math.round((bankAmt - fuelAmt) * 100) / 100,
          'Bank Source': bank?.sourceName || '',
          'Bank Description': bank?.description || '',
          'Fuel Description': allFuelItems.length > 1
            ? allFuelItems.map(f => `${f.description || ''} (${parseFloat(f.amount).toFixed(2)})`).join('; ')
            : (fuel?.description || ''),
          'Card Number': bank?.cardNumber || '',
          'Payment Type': fuel?.paymentType || '',
          'Attendant': fuel?.attendant || '',
          'Cashier': fuel?.cashier || '',
          'Pump': fuel?.pump || '',
          'Confidence': m.matchConfidence ? `${m.matchConfidence}%` : '',
          'Match Type': matchTypeLabel(m.matchType),
        };
      });
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(matchedRows), 'Matched');

      // Sheet 3: Unmatched bank transactions — with attendant/cashier from nearest fuel tx
      const unmatchedRows = unmatchedBank.map(t => {
        const resolution = resolutionMap.get(t.id);
        // Find attendant via card number or nearest fuel transaction by time
        let attendant = '';
        let cashier = '';
        if (t.cardNumber) {
          const byCard = fuelTxns.find(f => f.cardNumber === t.cardNumber && f.transactionDate === t.transactionDate);
          if (byCard) { attendant = byCard.attendant || ''; cashier = byCard.cashier || ''; }
        }
        if (!attendant && t.transactionTime) {
          const tMin = parseInt(t.transactionTime.split(':')[0]) * 60 + parseInt(t.transactionTime.split(':')[1] || '0');
          let best: typeof fuelTxns[0] | null = null;
          let bestDiff = Infinity;
          for (const f of fuelTxns) {
            if (f.transactionDate !== t.transactionDate || !f.transactionTime) continue;
            const fMin = parseInt(f.transactionTime.split(':')[0]) * 60 + parseInt(f.transactionTime.split(':')[1] || '0');
            const diff = Math.abs(fMin - tMin);
            if (diff < bestDiff && diff <= 30) { bestDiff = diff; best = f; }
          }
          if (best) { attendant = best.attendant || ''; cashier = best.cashier || ''; }
        }
        return {
          'Date': t.transactionDate,
          'Time': t.transactionTime || '',
          'Amount': parseFloat(t.amount),
          'Bank': t.sourceName || t.sourceType,
          'Card Number': t.cardNumber || '',
          'Description': t.description || '',
          'Attendant': attendant,
          'Cashier': cashier,
          'Resolution': resolution ? resolution.resolutionType : 'unresolved',
          'Reason': resolution?.reason || '',
          'Notes': resolution?.notes || '',
        };
      });
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(unmatchedRows), 'Unmatched');

      // Sheet 4: Excluded (reversed/declined/cancelled) — with type classification per bank
      if (excludedBank.length > 0) {
        const excludedRows = excludedBank.map(t => {
          const reason = t.description?.match(/\[Excluded: (.+?)\]/)?.[1] || 'Excluded';
          const cleanDesc = t.description?.replace(/\s*\[Excluded:.*?\]/g, '').trim() || '';
          const descLower = (t.description || '').toLowerCase();
          const type = descLower.includes('declined') ? 'Declined'
            : descLower.includes('cancel') || descLower.includes('revers') ? 'Cancelled / Reversed'
            : 'Excluded';
          return {
            'Date': t.transactionDate,
            'Time': t.transactionTime || '',
            'Amount': parseFloat(t.amount),
            'Bank': t.sourceName || t.sourceType,
            'Type': type,
            'Card Number': t.cardNumber || '',
            'Description': cleanDesc,
            'Reason': reason,
          };
        });
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(excludedRows), 'Excluded');
      }

      // Sheet 5: Outside Date Range
      if (outsideRange.length > 0) {
        const outsideRows = outsideRange.map(t => ({
          'Date': t.transactionDate,
          'Time': t.transactionTime || '',
          'Amount': parseFloat(t.amount),
          'Bank': t.sourceName || t.sourceType,
          'Card Number': t.cardNumber || '',
          'Description': t.description || '',
        }));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(outsideRows), 'Outside Date Range');
      }

      // Sheet 6: Fuel Transactions (with attendant/pump detail)
      const fuelRows = fuelTxns.map(t => {
        const match = matchMap.get(t.id);
        const bankTx = match ? txMap.get(match.bankTransactionId) : null;
        return {
          'Date': t.transactionDate,
          'Time': t.transactionTime || '',
          'Amount': parseFloat(t.amount),
          'Payment Type': t.paymentType || '',
          'Card Number': t.cardNumber || '',
          'Attendant': t.attendant || '',
          'Cashier': t.cashier || '',
          'Pump': t.pump || '',
          'Description': t.description || '',
          'Matched': match ? 'Yes' : 'No',
          'Bank Match Amount': bankTx ? parseFloat(bankTx.amount) : '',
          'Bank Source': bankTx?.sourceName || '',
        };
      });
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(fuelRows), 'Fuel Transactions');

      // Sheet 7: Unmatched Fuel (card transactions without a bank match)
      const unmatchedFuel = fuelTxns.filter(t => t.isCardTransaction === 'yes' && t.matchStatus !== 'matched');
      if (unmatchedFuel.length > 0) {
        const unmatchedFuelRows: Record<string, any>[] = unmatchedFuel.map(t => {
          const resolution = resolutionMap.get(t.id);
          return {
            'Date': t.transactionDate,
            'Time': t.transactionTime || '',
            'Amount': parseFloat(t.amount),
            'Payment Type': t.paymentType || '',
            'Card Number': t.cardNumber || '',
            'Reference': t.referenceNumber || '',
            'Attendant': t.attendant || '',
            'Cashier': t.cashier || '',
            'Pump': t.pump || '',
            'Description': t.description || '',
            'Resolution': resolution ? resolution.resolutionType : 'unresolved',
            'Reason': resolution?.reason || '',
            'Notes': resolution?.notes || '',
          };
        });

        // Per-attendant summary
        const attendantTotals = new Map<string, number>();
        for (const t of unmatchedFuel) {
          const name = t.attendant || 'Unknown';
          attendantTotals.set(name, (attendantTotals.get(name) || 0) + parseFloat(t.amount));
        }
        unmatchedFuelRows.push({});
        unmatchedFuelRows.push({ 'Date': '', 'Amount': fmt(unmatchedFuelCardAmount) });
        for (const [name, total] of Array.from(attendantTotals.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
          unmatchedFuelRows.push({ 'Date': name, 'Amount': fmt(total) });
        }
        unmatchedFuelRows.push({ 'Date': 'Fuel Card Unmatched', 'Amount': fmt(unmatchedFuelCardAmount) });

        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(unmatchedFuelRows), 'Unmatched Fuel');
      }

      // Sheet 8: Attendant Summary — per-attendant bank verification
      if (attendantSummary.length > 0) {
        const attendantRows: Record<string, any>[] = [];
        // Header context
        attendantRows.push({ 'Attendant': 'VERIFIED CARD SALES BY ATTENDANT' });
        attendantRows.push({});

        let grandVerifiedCount = 0;
        let grandVerifiedAmount = 0;

        for (const att of attendantSummary.filter(a => a.matchedCount > 0).sort((a, b) => b.matchedBankAmount - a.matchedBankAmount)) {
          grandVerifiedCount += att.matchedCount;
          grandVerifiedAmount += att.matchedBankAmount;

          attendantRows.push({
            'Attendant': att.attendant,
            'Verified Sales': att.matchedCount,
            'Verified Amount (Fuel)': fmt(att.matchedAmount),
            'Verified Amount (Bank)': fmt(att.matchedBankAmount),
            'Unmatched Card Sales': att.unmatchedCount > 0 ? att.unmatchedCount : '',
            'Unmatched Amount': att.unmatchedCount > 0 ? fmt(att.unmatchedAmount) : '',
            'Declined': att.declinedCount > 0 ? att.declinedCount : '',
            'Declined Amount': att.declinedCount > 0 ? fmt(att.declinedAmount) : '',
          });

          // Bank breakdown per attendant
          for (const bank of att.banks) {
            attendantRows.push({
              'Attendant': `  ${bank.bankName}`,
              'Verified Sales': bank.count,
              'Verified Amount (Bank)': fmt(bank.amount),
            });
          }
        }

        // Grand total
        attendantRows.push({});
        attendantRows.push({
          'Attendant': 'Total',
          'Verified Sales': grandVerifiedCount,
          'Verified Amount (Bank)': fmt(grandVerifiedAmount),
        });

        // Attendants with no verified sales
        const unverified = attendantSummary.filter(a => a.matchedCount === 0 && a.unmatchedCount > 0);
        if (unverified.length > 0) {
          attendantRows.push({});
          attendantRows.push({ 'Attendant': 'NO VERIFIED CARD SALES' });
          for (const att of unverified) {
            attendantRows.push({
              'Attendant': att.attendant,
              'Unmatched Card Sales': att.unmatchedCount,
              'Unmatched Amount': fmt(att.unmatchedAmount),
            });
          }
        }

        // Unmatched bank transactions
        if (unmatchedBank.length > 0) {
          attendantRows.push({});
          attendantRows.push({
            'Attendant': 'UNMATCHED BANK TRANSACTIONS',
            'Verified Sales': unmatchedBank.length,
            'Verified Amount (Bank)': fmt(unmatchedBankAmount),
          });
          attendantRows.push({ 'Attendant': 'These could not be attributed to any attendant — see Unmatched sheet' });
        }

        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(attendantRows), 'Attendant Summary');
      }

      // Sheet 9: All Transactions
      const allRows = transactions.map(t => ({
        'Date': t.transactionDate,
        'Time': t.transactionTime || '',
        'Source': t.sourceType,
        'Source Name': t.sourceName || '',
        'Amount': parseFloat(t.amount),
        'Card Number': t.cardNumber || '',
        'Payment Type': t.paymentType || '',
        'Reference': t.referenceNumber || '',
        'Description': t.description || '',
        'Attendant': t.attendant || '',
        'Pump': t.pump || '',
        'Status': t.matchStatus,
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(allRows), 'All Transactions');

      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      audit(req, { action: "data.export", resourceType: "period", resourceId: req.params.periodId, detail: `Full reconciliation export: ${period.name}` });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="Reconciliation_${period.name.replace(/\s+/g, '_')}.xlsx"`);
      res.send(buffer);
    } catch (error) {
      console.error("Error exporting reconciliation:", error);
      res.status(500).json({ error: "Failed to export reconciliation" });
    }
  });

  app.get("/api/periods/:periodId/export-flagged", isAuthenticated, async (req: any, res) => {
    try {
      const period = await assertPeriodOwner(req.params.periodId, req, res);
      if (!period) return;

      const resolutions = await storage.getResolutionsByPeriod(req.params.periodId);
      const flaggedResolutions = resolutions.filter(r => r.resolutionType === 'flagged');
      
      if (flaggedResolutions.length === 0) {
        return res.status(404).json({ error: "No flagged transactions found" });
      }

      const transactions = await storage.getTransactionsByPeriod(req.params.periodId);
      const transactionMap = new Map(transactions.map(t => [t.id, t]));
      
      const flaggedData = flaggedResolutions.map(r => {
        const tx = transactionMap.get(r.transactionId);
        return {
          'Bank Transaction Date': tx?.transactionDate || '',
          'Bank Amount': tx ? parseFloat(tx.amount) : 0,
          'Bank Reference': tx?.referenceNumber || '',
          'Description': tx?.description || '',
          'Flagged By': r.userName || r.userEmail || 'Unknown',
          'Flagged Date': r.createdAt ? new Date(r.createdAt).toLocaleDateString('en-ZA') : '',
          'Notes': r.notes || '',
        };
      });

      const XLSX = await import('xlsx');
      const ws = XLSX.utils.json_to_sheet(flaggedData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Flagged Transactions');
      
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      
      audit(req, { action: "data.export_flagged", resourceType: "period", resourceId: req.params.periodId, detail: `${flaggedResolutions.length} flagged transactions` });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="Flagged_Transactions_${period.name.replace(/\s+/g, '_')}.xlsx"`);
      res.send(buffer);
    } catch (error) {
      console.error("Error exporting flagged transactions:", error);
      res.status(500).json({ error: "Failed to export flagged transactions" });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
