import type { Express } from "express";
import { isAuthenticated } from "./auth";
import { audit } from "./auditLog";
import { resolveOrgContext } from "./routeAccess";
import { storage } from "./storage";

export function registerAccountRoutes(app: Express) {
  app.get("/api/auth/user", isAuthenticated, async (req: any, res) => {
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
      if (!req.user.currentOrgId && memberships.length > 0) {
        req.user.currentOrgId = memberships[0].organization.id;
        req.user.currentOrgRole = memberships[0].role;
      }

      const currentOrgId = req.user.currentOrgId || null;
      const currentOrgRole = req.user.currentOrgRole || null;
      const currentOrg = currentOrgId
        ? memberships.find((membership) => membership.organization.id === currentOrgId)?.organization || null
        : null;

      const orgProperties = currentOrgId
        ? await storage.getPropertiesByOrg(currentOrgId)
        : [];

      if (currentOrgId && !req.user.currentPropertyId && orgProperties.length > 0) {
        req.user.currentPropertyId = orgProperties[0].id;
      }

      const currentPropertyId = req.user.currentPropertyId || null;
      const currentProperty = currentPropertyId
        ? orgProperties.find((property) => property.id === currentPropertyId) || null
        : null;

      res.json({
        ...user,
        organizations: memberships.map((membership) => ({
          ...membership.organization,
          role: membership.role,
        })),
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

  app.post("/api/me/switch-org", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const { organizationId } = req.body || {};
      if (!organizationId) {
        return res.status(400).json({ error: "organizationId required" });
      }

      const role = await storage.getUserRoleInOrg(userId, organizationId);
      if (!role) {
        return res.status(403).json({ error: "Not a member of that organization" });
      }

      req.user.currentOrgId = organizationId;
      req.user.currentOrgRole = role;

      const props = await storage.getPropertiesByOrg(organizationId);
      req.user.currentPropertyId = props[0]?.id;

      const org = await storage.getOrganization(organizationId);
      audit(req, {
        action: "org.switch",
        resourceType: "organization",
        resourceId: organizationId,
      });
      res.json({
        success: true,
        organization: org,
        role,
        currentPropertyId: req.user.currentPropertyId,
      });
    } catch (error) {
      console.error("Error switching org:", error);
      res.status(500).json({ error: "Failed to switch organization" });
    }
  });

  app.post("/api/me/switch-property", isAuthenticated, async (req: any, res) => {
    try {
      const ctx = await resolveOrgContext(req, res);
      if (!ctx) return;

      const { propertyId } = req.body || {};
      if (!propertyId) {
        return res.status(400).json({ error: "propertyId required" });
      }

      const prop = await storage.getProperty(propertyId);
      if (!prop || prop.organizationId !== ctx.orgId) {
        return res.status(403).json({
          error: "Property does not belong to current organization",
        });
      }

      req.user.currentPropertyId = propertyId;
      audit(req, {
        action: "property.switch",
        resourceType: "property",
        resourceId: propertyId,
      });
      res.json({ success: true, property: prop });
    } catch (error) {
      console.error("Error switching property:", error);
      res.status(500).json({ error: "Failed to switch property" });
    }
  });

  app.get("/api/properties", isAuthenticated, async (req: any, res) => {
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

  app.post("/api/properties", isAuthenticated, async (req: any, res) => {
    try {
      const ctx = await resolveOrgContext(req, res);
      if (!ctx) return;
      if (ctx.role === "viewer") {
        return res.status(403).json({ error: "read_only" });
      }

      const { name, code, address } = req.body || {};
      if (!name) {
        return res.status(400).json({ error: "name required" });
      }

      const prop = await storage.createProperty({
        organizationId: ctx.orgId,
        name,
        code,
        address,
      });
      audit(req, {
        action: "property.create",
        resourceType: "property",
        resourceId: prop.id,
        detail: name,
      });
      res.json(prop);
    } catch (error) {
      console.error("Error creating property:", error);
      res.status(500).json({ error: "Failed to create property" });
    }
  });

  app.patch("/api/properties/:id", isAuthenticated, async (req: any, res) => {
    try {
      const ctx = await resolveOrgContext(req, res);
      if (!ctx) return;
      if (ctx.role === "viewer") {
        return res.status(403).json({ error: "read_only" });
      }

      const prop = await storage.getProperty(req.params.id);
      if (!prop) {
        return res.status(404).json({ error: "Not found" });
      }
      if (prop.organizationId !== ctx.orgId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const { name, code, address, status } = req.body || {};
      const updated = await storage.updateProperty(req.params.id, {
        name,
        code,
        address,
        status,
      });
      audit(req, {
        action: "property.update",
        resourceType: "property",
        resourceId: req.params.id,
      });
      res.json(updated);
    } catch (error) {
      console.error("Error updating property:", error);
      res.status(500).json({ error: "Failed to update property" });
    }
  });

  app.delete("/api/properties/:id", isAuthenticated, async (req: any, res) => {
    try {
      const ctx = await resolveOrgContext(req, res);
      if (!ctx) return;
      if (ctx.role === "viewer") {
        return res.status(403).json({ error: "read_only" });
      }

      const prop = await storage.getProperty(req.params.id);
      if (!prop) {
        return res.status(404).json({ error: "Not found" });
      }
      if (prop.organizationId !== ctx.orgId) {
        return res.status(403).json({ error: "Access denied" });
      }

      await storage.updateProperty(req.params.id, { status: "archived" });
      audit(req, {
        action: "property.archive",
        resourceType: "property",
        resourceId: req.params.id,
      });
      res.json({ success: true, archived: true });
    } catch (error) {
      console.error("Error archiving property:", error);
      res.status(500).json({ error: "Failed to archive property" });
    }
  });

  app.post("/api/properties/:id/restore", isAuthenticated, async (req: any, res) => {
    try {
      const ctx = await resolveOrgContext(req, res);
      if (!ctx) return;
      if (ctx.role === "viewer") {
        return res.status(403).json({ error: "read_only" });
      }

      const prop = await storage.getProperty(req.params.id);
      if (!prop) {
        return res.status(404).json({ error: "Not found" });
      }
      if (prop.organizationId !== ctx.orgId) {
        return res.status(403).json({ error: "Access denied" });
      }

      await storage.updateProperty(req.params.id, { status: "active" });
      audit(req, {
        action: "property.restore",
        resourceType: "property",
        resourceId: req.params.id,
      });
      res.json({ success: true });
    } catch (error) {
      console.error("Error restoring property:", error);
      res.status(500).json({ error: "Failed to restore property" });
    }
  });

  app.post("/api/user/accept-terms", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const updated = await storage.acceptTerms(userId);
      if (!updated) {
        return res.status(404).json({ error: "User not found" });
      }

      audit(req, {
        action: "terms.accepted",
        resourceType: "user",
        resourceId: userId,
      });
      res.json({ success: true });
    } catch (error) {
      console.error("Error accepting terms:", error);
      res.status(500).json({ error: "Failed to accept terms" });
    }
  });
}
