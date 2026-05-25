// READ-ONLY production inspection for the Pieter identity migration.
// Connects via whatever DATABASE_URL is in the environment (point it at PROD).
// Performs SELECTs only — no inserts, updates, or deletes.
//
//   DATABASE_URL=<prod> npx tsx scripts/inspect-pieter-prod.ts

import { db } from "../server/db";
import {
  users,
  organizations,
  organizationMembers,
  reconciliationPeriods,
  invitedUsers,
  auditLogs,
  aiUsage,
} from "../shared/schema";
import { eq, ilike, or, inArray, sql } from "drizzle-orm";

function hr(label: string) {
  console.log(`\n===== ${label} =====`);
}

async function main() {
  hr("USERS matching 'pieter' or the two target emails");
  const pieterUsers = await db
    .select()
    .from(users)
    .where(
      or(
        ilike(users.email, "%pieter%"),
        inArray(users.email, ["pieter@molo.page", "pieter@bethink.co.za"]),
      ),
    );
  for (const u of pieterUsers) {
    console.log(
      `  id(sub)=${u.id}\n    email=${u.email} name=${u.firstName ?? ""} ${u.lastName ?? ""}` +
        ` platformOwner=${u.isPlatformOwner} admin=${u.isAdmin} created=${u.createdAt?.toISOString?.() ?? u.createdAt}`,
    );
  }
  if (pieterUsers.length === 0) console.log("  (none found)");
  const pieterIds = pieterUsers.map((u) => u.id);

  hr("ORGANISATIONS (all)");
  const orgs = await db.select().from(organizations);
  for (const o of orgs) {
    console.log(`  id=${o.id} name="${o.name}" slug=${o.slug} status=${o.status} billingEmail=${o.billingEmail ?? "-"}`);
  }
  const desert = orgs.find((o) => o.slug === "desert-trading");

  hr("MEMBERS of Desert Trading");
  if (desert) {
    const members = await db
      .select()
      .from(organizationMembers)
      .where(eq(organizationMembers.organizationId, desert.id));
    for (const m of members) {
      const u = (await db.select().from(users).where(eq(users.id, m.userId)))[0];
      console.log(`  userId=${m.userId} role=${m.role} email=${u?.email ?? "(unknown user)"}`);
    }
    if (members.length === 0) console.log("  (no members)");
  } else {
    console.log("  Desert Trading org not found.");
  }

  hr("RECONCILIATION PERIODS owned by Pieter user(s)");
  if (pieterIds.length) {
    const periods = await db
      .select()
      .from(reconciliationPeriods)
      .where(inArray(reconciliationPeriods.userId, pieterIds));
    console.log(`  ${periods.length} period(s) with userId in Pieter set`);
    for (const p of periods) {
      console.log(`    "${p.name}" id=${p.id} userId=${p.userId} orgId=${p.organizationId} propertyId=${p.propertyId}`);
    }
  }
  if (desert) {
    const orgPeriods = await db
      .select({ n: sql<number>`count(*)` })
      .from(reconciliationPeriods)
      .where(eq(reconciliationPeriods.organizationId, desert.id));
    console.log(`  Desert Trading total periods (by org): ${orgPeriods[0]?.n ?? 0}`);
  }

  hr("PENDING INVITES for the two emails");
  const invites = await db
    .select()
    .from(invitedUsers)
    .where(inArray(invitedUsers.email, ["pieter@molo.page", "pieter@bethink.co.za"]));
  for (const i of invites) console.log(`  email=${i.email} orgId=${i.organizationId} role=${i.role}`);
  if (invites.length === 0) console.log("  (none)");

  hr("ATTRIBUTION COUNTS for Pieter user(s)");
  if (pieterIds.length) {
    const al = await db.select({ n: sql<number>`count(*)` }).from(auditLogs).where(inArray(auditLogs.userId, pieterIds));
    const ai = await db.select({ n: sql<number>`count(*)` }).from(aiUsage).where(inArray(aiUsage.userId, pieterIds));
    console.log(`  audit_logs rows: ${al[0]?.n ?? 0}`);
    console.log(`  ai_usage rows:   ${ai[0]?.n ?? 0}`);
  }

  console.log("\n(read-only inspection complete)");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
