import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { Pool } from "pg";

async function migrateResumesTable() {
  const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("No database connection string found in .env.local");
  }

  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  const client = await pool.connect();
  console.log("Applying resumes table & foreign keys migration...");

  try {
    await client.query("BEGIN;");

    // 1. Ensure columns exist on resumes table
    await client.query(`
      ALTER TABLE "resumes" ADD COLUMN IF NOT EXISTS "file_key" text;
      ALTER TABLE "resumes" ADD COLUMN IF NOT EXISTS "file_name" text;
      ALTER TABLE "resumes" ADD COLUMN IF NOT EXISTS "file_size" integer;
    `);

    // 2. Ensure unique index on resumes(user_id) to enforce strictly 1 resume per user account
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "idx_resumes_user_id_unique" ON "resumes" ("user_id");
    `);

    // 3. Add active_resume_id foreign key to user_job_preferences
    await client.query(`
      ALTER TABLE "user_job_preferences" 
      ADD COLUMN IF NOT EXISTS "active_resume_id" uuid REFERENCES "resumes"("id") ON DELETE SET NULL;

      CREATE INDEX IF NOT EXISTS "idx_user_job_preferences_active_resume_id" 
      ON "user_job_preferences" ("active_resume_id");
    `);

    await client.query("COMMIT;");
    console.log("✅ Schema migration committed successfully.");

    // Verify columns on resumes table
    const resumesCols = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'resumes'
      ORDER BY ordinal_position;
    `);
    console.log("\nVerified 'resumes' columns:");
    console.table(resumesCols.rows);

    // Verify columns on user_job_preferences table
    const prefCols = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'user_job_preferences'
      ORDER BY ordinal_position;
    `);
    console.log("\nVerified 'user_job_preferences' columns:");
    console.table(prefCols.rows);

  } catch (err) {
    await client.query("ROLLBACK;");
    console.error("❌ Migration failed and rolled back:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrateResumesTable();
