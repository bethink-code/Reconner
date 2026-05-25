// Migrate Pieter's login identity from pieter@molo.page to pieter@bethink.co.za,
// keeping all of his Desert Trading data. Users are keyed by Google `sub`, so a
// new Google account is a NEW user row — this reassigns everything to it.
//
//   DATABASE_URL=<PROD> npx tsx scripts/migrate-pieter-identity.ts            (dry run)
//   DATABASE_URL=<PROD> npx tsx scripts/migrate-pieter-identity.ts --apply    (commit)
//
// Idempotent and re-runnable. It works in two passes because the new Google
// `sub` only exists after Pieter signs in:
//
//   Pass 1 (new user not present yet): seed an owner invite to Desert Trading
//     and set the org billingEmail. Then ask Pieter to sign in with the new
//     Google account at work.lekana.app.
//   Pass 2 (new user present): make the new account a platform owner + Desert
//     Trading owner, reassign every users.id reference old -> new, then delete
//     the old pieter@molo.page user. Wrapped in a single transaction.

import { db } from "../server/db";
import {
  users,
  organizations,
  organizationMembers,
  reconciliationPeriods,
  transactionResolutions,
  auditLogs,
  aiUsage,
  invitedUsers,
  pricingScenarios,
} from "../shared/schema";
import { eq, and, sql } from "drizzle-orm";

const OLD_EMAIL = "pieter@molo.page";
const NEW_EMAIL = "pieter@bethink.co.za";
const ORG_SLUG = "desert-trading";
const GARTH_EMAIL = "garth@bethink.co.za";

const APPLY = process.argv.includes("--apply");
const tag = APPLY ? "[APPLY]" : "[DRY ]";
const log = (...a: unknown[]) => console.log(tag, ...a);

async function userByEmail(email: string) {
  return (await db.select().from(users).where(eq(users.email, email)))[0];
}

async function countWhere(table: any, column: any, value: string): Promise<number> {
  const r = await db.select({ n: sql<number>`count(*)` }).from(table).where(eq(column, value));
  return Number(r[0]?.n ?? 0);
}

async function main() {
  const org = (await db.select().from(organizations).where(eq(organizations.slug, ORG_SLUG)))[0];
  if (!org) throw new Error(`Org "${ORG_SLUG}" not found`);

  const oldUser = await userByEmail(OLD_EMAIL);
  const newUser = await userByEmail(NEW_EMAIL);
  const garth = await userByEmail(GARTH_EMAIL);

  log(`Org "${org.name}" id=${org.id} billingEmail=${org.billingEmail ?? "-"}`);
  log(`Old user (${OLD_EMAIL}): ${oldUser ? oldUser.id : "MISSING"}`);
  log(`New user (${NEW_EMAIL}): ${newUser ? newUser.id : "not present yet"}`);

  // ---- Pass 1: prep (billingEmail + invite). Always safe / idempotent. ----
  if (org.billingEmail !== NEW_EMAIL) {
    log(`billingEmail: "${org.billingEmail}" -> "${NEW_EMAIL}"`);
    if (APPLY) await db.update(organizations).set({ billingEmail: NEW_EMAIL }).where(eq(organizations.id, org.id));
  } else {
    log("billingEmail already correct");
  }

  if (!newUser) {
    const invite = (await db.select().from(invitedUsers).where(eq(invitedUsers.email, NEW_EMAIL)))[0];
    if (!invite) {
      log(`Seed invite: ${NEW_EMAIL} -> "${org.name}" (owner)`);
      if (APPLY) {
        await db.insert(invitedUsers).values({
          email: NEW_EMAIL,
          organizationId: org.id,
          role: "owner",
          invitedBy: garth?.id ?? null,
        });
      }
    } else {
      log(`Invite for ${NEW_EMAIL} already exists (org=${invite.organizationId}, role=${invite.role})`);
    }
    log("");
    log("PASS 1 complete. Next: Pieter signs in at https://work.lekana.app with the");
    log(`Google account ${NEW_EMAIL}. Then re-run this script to reassign + clean up.`);
    if (!APPLY) log("\nRe-run with --apply to commit pass 1.");
    process.exit(0);
  }

  // ---- Pass 2: reassign old -> new, then delete old user. ----
  if (!oldUser) {
    log("Old user already gone — migration already complete. Nothing to do.");
    process.exit(0);
  }
  if (oldUser.id === newUser.id) throw new Error("Old and new emails resolve to the same user id");

  const counts = {
    organization_members: await countWhere(organizationMembers, organizationMembers.userId, oldUser.id),
    reconciliation_periods: await countWhere(reconciliationPeriods, reconciliationPeriods.userId, oldUser.id),
    transaction_resolutions: await countWhere(transactionResolutions, transactionResolutions.userId, oldUser.id),
    audit_logs: await countWhere(auditLogs, auditLogs.userId, oldUser.id),
    ai_usage: await countWhere(aiUsage, aiUsage.userId, oldUser.id),
    invited_users_invitedBy: await countWhere(invitedUsers, invitedUsers.invitedBy, oldUser.id),
    pricing_scenarios_createdBy: await countWhere(pricingScenarios, pricingScenarios.createdBy, oldUser.id),
  };
  log("Rows referencing OLD user that will move to NEW user:");
  for (const [k, v] of Object.entries(counts)) log(`  ${k.padEnd(28)} ${v}`);

  const newMember = (await db.select().from(organizationMembers)
    .where(and(eq(organizationMembers.organizationId, org.id), eq(organizationMembers.userId, newUser.id))))[0];
  log(`New user Desert Trading membership: ${newMember ? newMember.role : "MISSING (will add as owner)"}`);
  log(`New user flags now: platformOwner=${newUser.isPlatformOwner} admin=${newUser.isAdmin} -> set both true`);
  log(`Then DELETE old user ${OLD_EMAIL} (id=${oldUser.id})`);

  if (!APPLY) {
    log("\nRe-run with --apply to commit pass 2.");
    process.exit(0);
  }

  await db.transaction(async (tx) => {
    // New account: platform owner + admin
    await tx.update(users).set({ isPlatformOwner: true, isAdmin: true, updatedAt: new Date() }).where(eq(users.id, newUser.id));

    // New account: owner of Desert Trading
    if (!newMember) {
      await tx.insert(organizationMembers).values({ organizationId: org.id, userId: newUser.id, role: "owner" });
    } else if (newMember.role !== "owner") {
      await tx.update(organizationMembers).set({ role: "owner" }).where(eq(organizationMembers.id, newMember.id));
    }

    // Reassign every users.id reference old -> new
    await tx.update(reconciliationPeriods).set({ userId: newUser.id }).where(eq(reconciliationPeriods.userId, oldUser.id));
    await tx.update(transactionResolutions).set({ userId: newUser.id }).where(eq(transactionResolutions.userId, oldUser.id));
    await tx.update(auditLogs).set({ userId: newUser.id }).where(eq(auditLogs.userId, oldUser.id));
    await tx.update(aiUsage).set({ userId: newUser.id }).where(eq(aiUsage.userId, oldUser.id));
    await tx.update(invitedUsers).set({ invitedBy: newUser.id }).where(eq(invitedUsers.invitedBy, oldUser.id));
    await tx.update(pricingScenarios).set({ createdBy: newUser.id }).where(eq(pricingScenarios.createdBy, oldUser.id));
    await tx.update(pricingScenarios).set({ createdByEmail: NEW_EMAIL }).where(eq(pricingScenarios.createdByEmail, OLD_EMAIL));

    // Remove the old user's memberships, then the old user row itself.
    await tx.delete(organizationMembers).where(eq(organizationMembers.userId, oldUser.id));
    await tx.delete(users).where(eq(users.id, oldUser.id));
  });

  log("PASS 2 applied. Old user deleted; all data + ownership now on the new account.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
