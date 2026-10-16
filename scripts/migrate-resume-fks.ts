import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { Pool } from "pg";

const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("Missing DATABASE_URL / DIRECT_URL in .env.local");
}

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

async function run() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN;");

    console.log("Updating resume_generations foreign key to ON DELETE SET NULL...");
    await client.query(`
      ALTER TABLE "resume_generations"
      DROP CONSTRAINT IF EXISTS "resume_generations_base_resume_id_fkey",
      ADD CONSTRAINT "resume_generations_base_resume_id_fkey"
        FOREIGN KEY ("base_resume_id")
        REFERENCES "user_pref_resumes"("id")
        ON DELETE SET NULL;
    `);
    console.log("✅ resume_generations FK updated.");

    console.log("Updating resume_generation_requests foreign key to ON DELETE SET NULL...");
    await client.query(`
      ALTER TABLE "resume_generation_requests"
      DROP CONSTRAINT IF EXISTS "resume_generation_requests_base_resume_id_fkey",
      ADD CONSTRAINT "resume_generation_requests_base_resume_id_fkey"
        FOREIGN KEY ("base_resume_id")
        REFERENCES "user_pref_resumes"("id")
        ON DELETE SET NULL;
    `);
    console.log("✅ resume_generation_requests FK updated.");

    await client.query("COMMIT;");
    console.log("\n🎉 Foreign keys successfully migrated to ON DELETE SET NULL!");
  } catch (err) {
    await client.query("ROLLBACK;");
    console.error("❌ Migration failed, rolled back:", err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
