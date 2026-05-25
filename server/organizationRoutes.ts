import type { Express } from "express";
import { isAuthenticated } from "./auth";
import { storage } from "./storage";
import { audit } from "./auditLog";
import { ORG_ROLES } from "../shared/schema";

// Organization management: list, create, get, update, archive/restore, members.
// Platform owners can manage any org; org owners manage their own. Authorisation
// is checked inline per-handler (platform-owner flag or per-org role).
export function registerOrganizationRoutes(app: Express): void {
  // List organizations. Platform owner sees all; everyone else sees only their
  // orgs. Pass ?includeArchived=true to include archived orgs (admin view).
  app.get("/api/organizations", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const me = await storage.getUser(userId);
      const includeArchived = req.query.includeArchived === "true";
      if (me?.isPlatformOwner) {
        const orgs = await storage.getOrganizations(includeArchived);
        return res.json(orgs);
      }
      const memberships = await storage.getUserOrganizations(userId);
      res.json(memberships.map((m) => ({ ...m.organization, role: m.role })));
    } catch (error) {
      console.error("Error fetching organizations:", error);
      res.status(500).json({ error: "Failed to fetch organizations" });
    }
  });

  // Create organization — platform owner only.
  app.post("/api/organizations", isAuthenticated, async (req: any, res) => {
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
      if (error?.code === "23505") return res.status(409).json({ error: "An organization with that slug already exists" });
      console.error("Error creating organization:", error);
      res.status(500).json({ error: "Failed to create organization" });
    }
  });

  // Get a single org (must be member or platform owner)
  app.get("/api/organizations/:id", isAuthenticated, async (req: any, res) => {
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
  app.patch("/api/organizations/:id", isAuthenticated, async (req: any, res) => {
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

  // Archive org (soft delete) — platform owner only. Data and history are
  // preserved; the org just disappears from switchers and default lists. No
  // hard-delete endpoint exists by design — restore is an explicit action.
  app.delete("/api/organizations/:id", isAuthenticated, async (req: any, res) => {
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
  app.post("/api/organizations/:id/restore", isAuthenticated, async (req: any, res) => {
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
  app.get("/api/organizations/:id/members", isAuthenticated, async (req: any, res) => {
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
  app.patch("/api/organizations/:id/members/:userId", isAuthenticated, async (req: any, res) => {
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
  app.delete("/api/organizations/:id/members/:userId", isAuthenticated, async (req: any, res) => {
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
}
