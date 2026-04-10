import "dotenv/config";
import { db } from "../server/db";
import { users, reconciliationPeriods, organizations, organizationMembers, properties } from "../shared/schema";

async function main() {
  const allUsers = await db.select().from(users);
  console.log("USERS:", JSON.stringify(allUsers.map(u => ({ id: u.id, email: u.email, isAdmin: u.isAdmin, isPlatformOwner: u.isPlatformOwner })), null, 2));

  const orgs = await db.select().from(organizations);
  console.log("ORGS:", JSON.stringify(orgs.map(o => ({ id: o.id, name: o.name, slug: o.slug })), null, 2));

  const props = await db.select().from(properties);
  console.log("PROPERTIES:", JSON.stringify(props.map(p => ({ id: p.id, name: p.name, organizationId: p.organizationId })), null, 2));

  const members = await db.select().from(organizationMembers);
  console.log("MEMBERS:", JSON.stringify(members, null, 2));

  const periods = await db.select().from(reconciliationPeriods);
  console.log("PERIODS:", periods.length, "total");
  const byOrg: Record<string, number> = {};
  const byProp: Record<string, number> = {};
  periods.forEach(p => {
    byOrg[p.organizationId || "null"] = (byOrg[p.organizationId || "null"] || 0) + 1;
    byProp[p.propertyId || "null"] = (byProp[p.propertyId || "null"] || 0) + 1;
  });
  console.log("  by organizationId:", byOrg);
  console.log("  by propertyId:", byProp);
  console.log("  first 3 periods:", periods.slice(0, 3).map(p => ({ id: p.id, name: p.name, organizationId: p.organizationId, propertyId: p.propertyId, userId: p.userId })));
  process.exit(0);
}
main().catch(err => { console.error(err); process.exit(1); });
