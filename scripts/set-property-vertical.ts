/**
 * Dev helper: list properties or set a property's vertical (until the Admin UI has a selector).
 *
 *   npx tsx scripts/set-property-vertical.ts                       # list all properties
 *   npx tsx scripts/set-property-vertical.ts "<name substring>" retail   # set matching property
 *
 * Uses DATABASE_URL from .env (the dev Neon branch). Additive, reversible (set back to "fuel").
 */
import "dotenv/config";
import { Pool } from "@neondatabase/serverless";

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const [nameArg, verticalArg] = process.argv.slice(2);

  if (!nameArg) {
    const { rows } = await pool.query(
      "SELECT id, name, vertical_id, organization_id FROM properties ORDER BY name",
    );
    console.log("Properties:");
    for (const r of rows) console.log(`  ${r.vertical_id.padEnd(8)} ${r.name}  (${r.id})`);
    await pool.end();
    return;
  }

  const vertical = verticalArg || "retail";
  const { rows } = await pool.query(
    "UPDATE properties SET vertical_id = $1, updated_at = now() WHERE name ILIKE '%' || $2 || '%' RETURNING id, name, vertical_id",
    [vertical, nameArg],
  );
  if (rows.length === 0) console.log(`No property matched "${nameArg}".`);
  for (const r of rows) console.log(`Set ${r.name} → ${r.vertical_id}`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
