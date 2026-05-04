import * as client from "openid-client";
import { Strategy, type VerifyFunction } from "openid-client/passport";

import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import memoize from "memoizee";
import connectPg from "connect-pg-simple";
import { storage } from "./storage";
import { db } from "./db";
import { auditLogs, users as usersTable } from "../shared/schema";
import type { OrgRole } from "../shared/schema";
import { eq } from "drizzle-orm";

// Hardcoded Lekana platform staff. Anyone in this list is auto-flagged as platform
// owner on login (regardless of which environment they land in). Add new staff here
// only — never remove without confirming the user is actually leaving.
const PLATFORM_OWNER_EMAILS = new Set<string>([
  "garth@bethink.co.za",
]);

interface SessionUser {
  claims: Record<string, string | number | undefined>;
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
  currentOrgId?: string;
  currentOrgRole?: OrgRole;
  currentPropertyId?: string;
}

const getOidcConfig = memoize(
  async () => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new Error(
        "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set"
      );
    }
    const config = await client.discovery(
      new URL("https://accounts.google.com"),
      clientId,
      clientSecret,
    );
    return config;
  },
  { maxAge: 3600 * 1000 }
);

function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SESSION_SECRET environment variable is required in production");
    }
    return "dev-only-insecure-secret";
  }
  return secret;
}

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: true,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  return session({
    secret: getSessionSecret(),
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      path: "/",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: sessionTtl,
    },
  });
}

function updateUserSession(
  user: SessionUser,
  tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers
) {
  user.claims = tokens.claims() as Record<string, string | number | undefined>;
  user.access_token = tokens.access_token;
  user.refresh_token = tokens.refresh_token;
  user.expires_at = user.claims?.exp as number | undefined;
}

async function upsertUser(claims: Record<string, string | number | undefined>) {
  const dbUser = await storage.upsertUser({
    id: claims["sub"] as string,
    email: claims["email"] as string,
    firstName: claims["given_name"] as string,
    lastName: claims["family_name"] as string,
    profileImageUrl: claims["picture"] as string,
  });
  // Auto-flag Lekana platform staff. Cheap to re-apply on every login — keeps
  // the flag in sync if the hardcoded list ever changes.
  const email = String(claims["email"] || "").toLowerCase();
  if (PLATFORM_OWNER_EMAILS.has(email) && (!dbUser.isPlatformOwner || !dbUser.isAdmin)) {
    await db.update(usersTable)
      .set({ isPlatformOwner: true, isAdmin: true, updatedAt: new Date() })
      .where(eq(usersTable.id, dbUser.id));
    return { ...dbUser, isPlatformOwner: true, isAdmin: true };
  }
  return dbUser;
}

// Pick an initial org for a freshly-authed user. Redeems any pending invite,
// joins the user as a member, then returns { orgId, role } to seed the session.
async function resolveInitialOrg(userId: string, email: string): Promise<{ orgId: string; role: OrgRole } | null> {
  // Existing memberships first
  const memberships = await storage.getUserOrganizations(userId);
  if (memberships.length > 0) {
    const first = memberships[0];
    return { orgId: first.organization.id, role: first.role };
  }

  // No memberships — check for an invite to redeem
  const invite = await storage.getInvitedUserByEmail(email);
  if (invite && invite.organizationId) {
    const role = (invite.role as OrgRole) || "viewer";
    await storage.addOrganizationMember(invite.organizationId, userId, role);
    // Invite consumed: delete it so it can't be used twice
    await storage.removeInvite(invite.id);
    return { orgId: invite.organizationId, role };
  }

  return null;
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  passport.serializeUser((user: Express.User, cb) => cb(null, user));
  passport.deserializeUser((user: Express.User, cb) => cb(null, user));

  // Lazy strategy setup: resolve OIDC config on first auth request (avoids cold-start timeout)
  let strategyReady = false;
  async function ensureStrategy() {
    if (strategyReady) return;
    const config = await getOidcConfig();
    const callbackUrl =
      process.env.AUTH_CALLBACK_URL || "http://localhost:5000/api/callback";

    const verify: VerifyFunction = async (
      tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers,
      verified: passport.AuthenticateCallback
    ) => {
      const claims = tokens.claims() as Record<string, string | number | undefined>;
      const email = String(claims.email || "").toLowerCase();

      // Allowed in if EITHER: there's an open invite OR the user already exists
      // with at least one org membership (returning users must never be locked out
      // by an invite cleanup).
      const isInvited = await storage.isEmailInvited(email);
      let isExistingMember = false;
      if (!isInvited) {
        const sub = String(claims.sub || "");
        const existingById = sub ? await storage.getUser(sub) : undefined;
        const candidate = existingById; // upsertUser handles email-based merging on insert
        if (candidate) {
          const memberships = await storage.getUserOrganizations(candidate.id);
          isExistingMember = memberships.length > 0;
        }
      }
      if (!isInvited && !isExistingMember) {
        console.log(`[AUTH] Login blocked for uninvited email: ${email}`);
        // Log directly since there's no req.user at this point
        try {
          await db.insert(auditLogs).values({
            userId: null,
            userEmail: email,
            action: "auth.blocked_uninvited",
            resourceType: "user",
            outcome: "denied",
            detail: `Uninvited email attempted login: ${email}`,
          });
        } catch (e) {
          console.error("[AUDIT] Failed to log blocked login:", e);
        }
        verified(null, false, { message: "not_invited" });
        return;
      }

      const user = {} as SessionUser;
      updateUserSession(user, tokens);
      const dbUser = await upsertUser(claims);
      // Seed currentOrgId on the session so middleware can scope queries
      const initialOrg = await resolveInitialOrg(dbUser.id, email);
      if (initialOrg) {
        user.currentOrgId = initialOrg.orgId;
        user.currentOrgRole = initialOrg.role;
        // Default to first property in the org so the dashboard has something to show
        const props = await storage.getPropertiesByOrg(initialOrg.orgId);
        if (props.length > 0) {
          user.currentPropertyId = props[0].id;
        }
      }
      verified(null, user);
    };

    const strategy = new Strategy(
      {
        name: "google",
        config,
        scope: "openid email profile",
        callbackURL: callbackUrl,
      },
      verify,
    );
    // Override to add access_type=offline for Google refresh tokens
    const origParams = strategy.authorizationRequestParams.bind(strategy);
    strategy.authorizationRequestParams = (req, options) => {
      const params = origParams(req, options) || {};
      const result = params instanceof URLSearchParams ? params : new URLSearchParams(Object.entries(params));
      result.set("access_type", "offline");
      return result;
    };

    passport.use(strategy);
    strategyReady = true;
  }

  app.get("/api/login", async (req, res, next) => {
    try {
      await ensureStrategy();
      passport.authenticate("google", {
        prompt: "select_account",
      })(req, res, next);
    } catch (err) {
      console.error("Login init error:", err);
      res.status(500).json({ error: "Authentication service unavailable, please retry" });
    }
  });

  app.get("/api/callback", async (req, res, next) => {
    try {
      await ensureStrategy();
      passport.authenticate("google", (err: any, user: any, info: any) => {
        if (err) {
          console.error("Auth error:", err);
          try { db.insert(auditLogs).values({ action: "auth.error", outcome: "error", detail: String(err?.message || err), ipAddress: req.headers?.["x-forwarded-for"]?.toString()?.split(",")[0]?.trim() || req.socket?.remoteAddress || null }); } catch {}
          return res.redirect("/api/login");
        }
        if (!user) {
          // Not invited — redirect to landing with error
          if (info?.message === "not_invited") {
            return res.redirect("/?error=not_invited");
          }
          return res.redirect("/api/login");
        }
        req.logIn(user, (loginErr) => {
          if (loginErr) {
            console.error("Login error:", loginErr);
            return res.redirect("/api/login");
          }
          return res.redirect("/");
        });
      })(req, res, next);
    } catch (err) {
      console.error("Callback init error:", err);
      res.redirect("/api/login");
    }
  });

  app.get("/api/logout", (req, res) => {
    req.logout(() => {
      res.redirect("/");
    });
  });
}

// Resolves the current org context for the request. Must run AFTER isAuthenticated.
// Sets req.orgId and req.orgRole. Errors with 403 if user has no org membership at all.
//
// Auto-recovers from archived orgs/properties: if the session points at a stale entity,
// it falls back to the first active one rather than serving stale data.
export const requireOrg: RequestHandler = async (req, res, next) => {
  const user = req.user as SessionUser | undefined;
  if (!user?.claims?.sub) return res.status(401).json({ error: "Unauthorized" });

  // Helper: load all *active* memberships for this user
  const loadActiveMemberships = () => storage.getUserOrganizations(user.claims.sub as string);

  // 1. Verify the session's currentOrgId still resolves to an active membership.
  let needsReseed = !user.currentOrgId;
  if (user.currentOrgId) {
    const role = await storage.getUserRoleInOrg(user.claims.sub as string, user.currentOrgId);
    const org = await storage.getOrganization(user.currentOrgId);
    if (!role || !org || org.status !== "active") {
      needsReseed = true;
    } else {
      user.currentOrgRole = role;
    }
  }

  if (needsReseed) {
    const memberships = await loadActiveMemberships();
    if (memberships.length === 0) {
      return res.status(403).json({ error: "no_organization", message: "You are not a member of any active organization" });
    }
    user.currentOrgId = memberships[0].organization.id;
    user.currentOrgRole = memberships[0].role;
    user.currentPropertyId = undefined; // force property re-seed below
  }

  // 2. Verify currentPropertyId is still valid (belongs to current org and active)
  if (user.currentPropertyId) {
    const prop = await storage.getProperty(user.currentPropertyId);
    if (!prop || prop.organizationId !== user.currentOrgId || prop.status !== "active") {
      user.currentPropertyId = undefined;
    }
  }
  if (!user.currentPropertyId) {
    const props = await storage.getPropertiesByOrg(user.currentOrgId!);
    user.currentPropertyId = props[0]?.id;
  }

  (req as any).orgId = user.currentOrgId;
  (req as any).orgRole = user.currentOrgRole;
  (req as any).propertyId = user.currentPropertyId;
  next();
};

// Block viewers from mutation endpoints. Must run AFTER requireOrg.
export const requireWriter: RequestHandler = (req, res, next) => {
  const role = (req as any).orgRole as OrgRole | undefined;
  if (role !== "owner" && role !== "admin") {
    return res.status(403).json({ error: "read_only", message: "Your role does not permit this action" });
  }
  next();
};

// Block non-owners from owner-only endpoints (e.g. delete org, change billing)
export const requireOrgOwner: RequestHandler = (req, res, next) => {
  const role = (req as any).orgRole as OrgRole | undefined;
  if (role !== "owner") {
    return res.status(403).json({ error: "owner_only", message: "Only org owners can perform this action" });
  }
  next();
};

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  const user = req.user as SessionUser | undefined;

  if (!req.isAuthenticated() || !user?.expires_at) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const now = Math.floor(Date.now() / 1000);
  if (now <= user.expires_at) {
    return next();
  }

  const refreshToken = user.refresh_token;
  if (!refreshToken) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  try {
    const config = await getOidcConfig();
    const tokenResponse = await client.refreshTokenGrant(config, refreshToken);
    updateUserSession(user, tokenResponse);
    return next();
  } catch (error) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
};
