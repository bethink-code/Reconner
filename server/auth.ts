import * as client from "openid-client";
import { Strategy, type VerifyFunction } from "openid-client/passport";

import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import memoize from "memoizee";
import connectPg from "connect-pg-simple";
import { storage } from "./storage";
import { db } from "./db";
import { auditLogs } from "../shared/schema";

interface SessionUser {
  claims: Record<string, string | number | undefined>;
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
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
  await storage.upsertUser({
    id: claims["sub"],
    email: claims["email"],
    firstName: claims["given_name"],
    lastName: claims["family_name"],
    profileImageUrl: claims["picture"],
  });
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

      // Invite-only: check if this email is in the invited_users table
      const isInvited = await storage.isEmailInvited(email);
      if (!isInvited) {
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
      await upsertUser(claims);
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

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  const user = req.user as SessionUser | undefined;

  if (!req.isAuthenticated() || !user.expires_at) {
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
