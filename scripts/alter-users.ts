import { db } from "../lib/db";
import { sql } from "drizzle-orm";

async function main() {
  try {
    await db.execute(sql`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS country text;`);
    console.log("Added country column to user_profiles table successfully.");
  } catch (error) {
    console.error("Error:", error);
  } finally {
    process.exit(0);
  }
}

main();
