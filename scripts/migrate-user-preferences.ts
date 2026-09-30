import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { Pool } from "pg";

async function migrate() {
  const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("No database connection string found in .env.local");
  }

  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  const client = await pool.connect();
  console.log("Applying user_job_preferences migration to database...");

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS "user_job_preferences" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_id" text NOT NULL,
        "preferences" jsonb DEFAULT '{}'::jsonb NOT NULL,
        "resume_details" jsonb DEFAULT '{}'::jsonb NOT NULL,
        "preferences_created_at" timestamp with time zone,
        "preferences_updated_at" timestamp with time zone,
        "resume_details_created_at" timestamp with time zone,
        "resume_details_updated_at" timestamp with time zone,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL
      );

      CREATE UNIQUE INDEX IF NOT EXISTS "idx_user_job_preferences_user_id" ON "user_job_preferences" ("user_id");
    `);

    const res = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'user_job_preferences'
      ORDER BY ordinal_position;
    `);

    console.log("Table columns verified:", res.rows.map(r => `${r.column_name} (${r.data_type})`).join(", "));
    console.log("Migration finished successfully!");
  } catch (err) {
    console.error("Migration error:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
