import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
process.env.DATABASE_URL = process.env.DIRECT_URL;
import { db } from "./lib/db";
import { sql } from "drizzle-orm";

async function cleanup() {
  console.log("Cleaning up recommendation tables...");
  try {
    await db.execute(sql`
      DROP TABLE IF EXISTS "skill_relationships" CASCADE;
      DROP TABLE IF EXISTS "domain_relationships" CASCADE;
      DROP TABLE IF EXISTS "domains" CASCADE;
    `);
    console.log("Dropped tables.");

    // The skills we injected earlier today were all category = 'other'.
    // We can delete them to clean up the skills table.
    // Wait, the skills table had default category 'other'. Let's delete skills created today.
    // For safety, let's just delete the skills that we know were added. We added ~200.
    // Or simpler: delete from skills where created_at >= NOW() - INTERVAL '1 day' AND category = 'other'
    await db.execute(sql`
      DELETE FROM "skills" 
      WHERE "created_at" >= NOW() - INTERVAL '1 day' 
      AND "category" = 'other';
    `);
    console.log("Cleaned up injected skills.");
  } catch (err) {
    console.error("Cleanup error:", err);
  }
}

cleanup().finally(() => process.exit(0));
