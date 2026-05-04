import { audit } from "./auditLog";
import { storage } from "./storage";
import type {
  OrgRole,
  ReconciliationPeriod,
  UploadedFile,
} from "../shared/schema";

export async function isAdmin(req: any, res: any, next: any) {
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
}

export async function resolveOrgContext(
  req: any,
  res: any,
): Promise<{ orgId: string; role: OrgRole } | null> {
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
    const verified = await storage.getUserRoleInOrg(userId, orgId);
    if (!verified) {
      res.status(403).json({ error: "org_access_revoked" });
      return null;
    }

    role = verified;
    req.user.currentOrgRole = role;
  }

  return { orgId, role: role! };
}

export async function assertPeriodAccess(
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
    audit(req, {
      action: "access.denied",
      resourceType: "period",
      resourceId: periodId,
      outcome: "denied",
      detail: `Org mismatch: ${period.organizationId}`,
    });
    res.status(403).json({ error: "Access denied" });
    return null;
  }

  if (mode === "write" && ctx.role === "viewer") {
    audit(req, {
      action: "access.denied",
      resourceType: "period",
      resourceId: periodId,
      outcome: "denied",
      detail: "viewer attempted write",
    });
    res.status(403).json({
      error: "read_only",
      message: "Your role does not permit this action",
    });
    return null;
  }

  return period;
}

export function assertPeriodOwner(periodId: string, req: any, res: any) {
  return assertPeriodAccess(periodId, req, res, "read");
}

export function assertPeriodWrite(periodId: string, req: any, res: any) {
  return assertPeriodAccess(periodId, req, res, "write");
}

export async function assertFileOwner(
  fileId: string,
  req: any,
  res: any,
  mode: "read" | "write" = "read",
): Promise<UploadedFile | null> {
  const file = await storage.getFile(fileId);
  if (!file) {
    res.status(404).json({ error: "File not found" });
    return null;
  }

  const period = await assertPeriodAccess(file.periodId, req, res, mode);
  if (!period) return null;

  return file;
}

export function assertFileWrite(fileId: string, req: any, res: any) {
  return assertFileOwner(fileId, req, res, "write");
}
