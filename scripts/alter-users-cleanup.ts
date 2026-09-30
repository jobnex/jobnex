import { db } from "../lib/db";
import { sql } from "drizzle-orm";

async function main() {
  try {
    await db.execute(sql`
      ALTER TABLE user_profiles 
      DROP COLUMN IF EXISTS bio, 
      DROP COLUMN IF EXISTS linkedin_url, 
      DROP COLUMN IF EXISTS github_url, 
      DROP COLUMN IF EXISTS portfolio_url,
      ADD COLUMN IF NOT EXISTS country_code text;
    `);
    console.log("Cleaned up user_profiles table successfully.");
  } catch (error) {
    console.error("Error:", error);
  } finally {
    process.exit(0);
  }
}

main();
