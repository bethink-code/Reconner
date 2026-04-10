// One-off migration: introduce organisations.
//
// Run AFTER `npm run db:push` has applied the new schema.
//
//   npx tsx scripts/migrate-multi-tenant.ts            (dry run, prints plan)
//   npx tsx scripts/migrate-multi-tenant.ts --apply    (executes)
//
// Idempotent: safe to re-run. Each step checks current state before writing.

import "dotenv/config";
import { db } from "../server/db";
import {
  organizations,
  organizationMembers,
  users,
  reconciliationPeriods,
  invitedUsers,
  auditLogs,
  aiUsage,
  properties,
} from "../shared/schema";
import { eq, isNull, sql, inArray, and } from "drizzle-orm";

const APPLY = process.argv.includes("--apply");

const PLATFORM_OWNER_EMAIL = "garth@bethink.co.za";
const DESERT_TRADING_NAME = "Desert Trading";
const DESERT_TRADING_SLUG = "desert-trading";
const DESERT_TRADING_OWNER_EMAIL = "pieter@molo.page";

function log(...args: any[]) {
  console.log(APPLY ? "[APPLY]" : "[DRY ]", ...args);
}

async function main() {
  log("Starting multi-tenant migration");

  // 1. Wipe stale invites (per user instruction)
  const existingInvites = await db.select().from(invitedUsers);
  log(`Found ${existingInvites.length} existing invites — will delete all of them`);
  if (APPLY && existingInvites.length > 0) {
    await db.delete(invitedUsers);
    log("  deleted");
  }

  // 2. Ensure Desert Trading org exists
  let desertTrading = (await db.select().from(organizations).where(eq(organizations.slug, DESERT_TRADING_SLUG)))[0];
  if (!desertTrading) {
    log(`Creating org "${DESERT_TRADING_NAME}"`);
    if (APPLY) {
      [desertTrading] = await db.insert(organizations).values({
        name: DESERT_TRADING_NAME,
        slug: DESERT_TRADING_SLUG,
        billingEmail: DESERT_TRADING_OWNER_EMAIL,
      }).returning();
      log(`  created id=${desertTrading.id}`);
    }
  } else {
    log(`Org "${DESERT_TRADING_NAME}" already exists id=${desertTrading.id}`);
  }

  // 3. Find or create platform owner user (garth)
  let garth = (await db.select().from(users).where(eq(users.email, PLATFORM_OWNER_EMAIL)))[0];
  if (!garth) {
    log(`Platform owner user ${PLATFORM_OWNER_EMAIL} not found in users table`);
    log(`  -> will be created on first login. Marking via invite seed only.`);
  } else {
    if (!garth.isPlatformOwner || !garth.isAdmin) {
      log(`Flagging ${PLATFORM_OWNER_EMAIL} as platform owner + admin`);
      if (APPLY) {
        await db.update(users)
          .set({ isPlatformOwner: true, isAdmin: true, updatedAt: new Date() })
          .where(eq(users.id, garth.id));
      }
    } else {
      log(`${PLATFORM_OWNER_EMAIL} already platform owner`);
    }
  }

  // 4. Identify everyone who currently owns periods — they all get added as members of Desert Trading.
  // (Each environment has different actual users — dev has garth, prod has pieter.)
  const allPeriods = await db.select().from(reconciliationPeriods);
  const periodOwnerIds = Array.from(new Set(allPeriods.map(p => p.userId).filter((x): x is string => !!x)));
  log(`${allPeriods.length} periods in DB owned by ${periodOwnerIds.length} distinct user(s)`);

  let periodOwners: typeof users.$inferSelect[] = [];
  if (periodOwnerIds.length > 0) {
    periodOwners = await db.select().from(users).where(inArray(users.id, periodOwnerIds));
  }
  for (const u of periodOwners) {
    log(`  → ${u.email} (id=${u.id})`);
  }

  // Also try to find pieter explicitly so prod migration links him
  const pieter = (await db.select().from(users).where(eq(users.email, DESERT_TRADING_OWNER_EMAIL)))[0];
  if (pieter && !periodOwners.find(u => u.id === pieter.id)) {
    periodOwners.push(pieter);
    log(`  → ${pieter.email} (explicitly found, no periods yet)`);
  }

  // 5. Add memberships — each period owner becomes "owner" of Desert Trading.
  if (desertTrading) {
    for (const owner of periodOwners) {
      // Don't double-add garth as "owner" if he's also platform owner — give him "admin" instead
      const isGarth = garth && owner.id === garth.id;
      const role = isGarth ? "admin" : "owner";
      const existing = await db.select().from(organizationMembers)
        .where(eq(organizationMembers.userId, owner.id));
      const inOrg = existing.find(m => m.organizationId === desertTrading!.id);
      if (!inOrg) {
        log(`Adding ${owner.email} as ${role} of Desert Trading`);
        if (APPLY) {
          await db.insert(organizationMembers).values({
            organizationId: desertTrading.id,
            userId: owner.id,
            role,
          });
        }
      } else {
        log(`${owner.email} already member of Desert Trading (role=${inOrg.role})`);
      }
    }
    // Ensure garth is a member even if he didn't own any periods (e.g. on prod)
    if (garth && !periodOwners.find(u => u.id === garth.id)) {
      const existing = await db.select().from(organizationMembers)
        .where(eq(organizationMembers.userId, garth.id));
      if (existing.length === 0) {
        log(`Adding ${garth.email} as admin of Desert Trading (platform support)`);
        if (APPLY) {
          await db.insert(organizationMembers).values({
            organizationId: desertTrading.id,
            userId: garth.id,
            role: "admin",
          });
        }
      }
    }
  }

  // 6. Seed invites for both pieter (org owner) and garth (platform admin) so each can
  // log in to whichever environment they're currently missing from. Idempotent —
  // skipped if an invite already exists for that email.
  async function seedInviteIfMissing(email: string, role: "owner" | "admin") {
    if (!desertTrading) return;
    const existing = await db.select().from(invitedUsers).where(eq(invitedUsers.email, email));
    if (existing.length > 0) {
      log(`Invite for ${email} already exists — skipping`);
      return;
    }
    log(`Seeding invite for ${email} → Desert Trading (${role})`);
    if (APPLY) {
      await db.insert(invitedUsers).values({
        email,
        organizationId: desertTrading.id,
        role,
        invitedBy: garth?.id || null,
      });
    }
  }

  if (desertTrading) {
    if (!pieter) await seedInviteIfMissing(DESERT_TRADING_OWNER_EMAIL, "owner");
    if (!garth) await seedInviteIfMissing(PLATFORM_OWNER_EMAIL, "admin");
  }

  // 7. Backfill organizationId on existing periods
  if (desertTrading) {
    const orphanPeriods = await db.select().from(reconciliationPeriods)
      .where(isNull(reconciliationPeriods.organizationId));
    log(`Found ${orphanPeriods.length} periods with no organizationId — assigning to Desert Trading`);
    if (APPLY && orphanPeriods.length > 0) {
      await db.update(reconciliationPeriods)
        .set({ organizationId: desertTrading.id })
        .where(isNull(reconciliationPeriods.organizationId));
    }
  }

  // 7a. Ensure Desert Trading has a "Main" property and assign all unscoped periods to it
  if (desertTrading) {
    const existingProps = await db.select().from(properties).where(eq(properties.organizationId, desertTrading.id));
    let mainProperty = existingProps[0];
    if (!mainProperty) {
      log(`Creating "Main" property for Desert Trading`);
      if (APPLY) {
        [mainProperty] = await db.insert(properties).values({
          organizationId: desertTrading.id,
          name: "Main",
        }).returning();
      }
    } else {
      log(`Desert Trading already has property "${mainProperty.name}" id=${mainProperty.id}`);
    }
    if (mainProperty) {
      const orphanByProperty = await db.select().from(reconciliationPeriods)
        .where(and(eq(reconciliationPeriods.organizationId, desertTrading.id), isNull(reconciliationPeriods.propertyId)));
      log(`Found ${orphanByProperty.length} periods with no propertyId — assigning to "${mainProperty.name}"`);
      if (APPLY && orphanByProperty.length > 0) {
        await db.update(reconciliationPeriods)
          .set({ propertyId: mainProperty.id })
          .where(and(eq(reconciliationPeriods.organizationId, desertTrading.id), isNull(reconciliationPeriods.propertyId)));
      }
    }
  }

  // 8. Backfill auditLogs and aiUsage where the user is a Desert Trading member
  if (desertTrading) {
    const memberIds = (await db.select().from(organizationMembers)
      .where(eq(organizationMembers.organizationId, desertTrading.id))).map(m => m.userId);
    if (memberIds.length > 0) {
      log(`Backfilling auditLogs.organizationId for ${memberIds.length} member(s)`);
      if (APPLY) {
        for (const uid of memberIds) {
          await db.execute(sql`UPDATE audit_logs SET organization_id = ${desertTrading.id} WHERE organization_id IS NULL AND user_id = ${uid}`);
          await db.execute(sql`UPDATE ai_usage SET organization_id = ${desertTrading.id} WHERE organization_id IS NULL AND user_id = ${uid}`);
        }
      }
    }
  }

  log("Done.");
  if (!APPLY) log("Run again with --apply to commit changes.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
