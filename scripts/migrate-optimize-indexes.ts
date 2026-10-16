import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { Pool } from "pg";

async function applyIndexes() {
  const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    console.log("No database connection string found in .env.local; skipping index execution.");
    return;
  }

  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  const client = await pool.connect();
  console.log("Applying database index optimizations...");

  const queries = [
    // pg_trgm for ultra-fast text & keyword searching with GIN indexes
    `CREATE EXTENSION IF NOT EXISTS pg_trgm;`,
    `CREATE INDEX IF NOT EXISTS "idx_jobs_title_trgm" ON "jobs" USING gin ("job_role_title" gin_trgm_ops);`,
    `CREATE INDEX IF NOT EXISTS "idx_jobs_company_trgm" ON "jobs" USING gin ("company_name" gin_trgm_ops);`,
    `CREATE INDEX IF NOT EXISTS "idx_jobs_location_trgm" ON "jobs" USING gin ("location" gin_trgm_ops);`,

    // jobs indexes
    `CREATE INDEX IF NOT EXISTS "idx_jobs_status_created_at" ON "jobs" ("status", "created_at" DESC);`,
    `CREATE INDEX IF NOT EXISTS "idx_jobs_employment_type" ON "jobs" ("employment_type");`,
    `CREATE INDEX IF NOT EXISTS "idx_jobs_work_model" ON "jobs" ("work_model");`,
    `CREATE INDEX IF NOT EXISTS "idx_jobs_salary_min" ON "jobs" ("salary_min");`,
    `CREATE INDEX IF NOT EXISTS "idx_jobs_visa_sponsorship" ON "jobs" ("visa_sponsorship");`,
    `CREATE INDEX IF NOT EXISTS "idx_jobs_experience_required" ON "jobs" ("experience_required");`,
    
    // job_skills indexes
    `CREATE INDEX IF NOT EXISTS "idx_job_skills_skill_id" ON "job_skills" ("skill_id");`,
    
    // saved_jobs index
    `CREATE INDEX IF NOT EXISTS "idx_saved_jobs_user_created" ON "saved_jobs" ("user_id", "created_at" DESC);`,

    // resumes index
    `CREATE INDEX IF NOT EXISTS "idx_resumes_user_id" ON "resumes" ("user_id");`,

    // applications indexes
    `CREATE INDEX IF NOT EXISTS "idx_applications_user_id" ON "applications" ("user_id");`,
    `CREATE INDEX IF NOT EXISTS "idx_applications_job_id" ON "applications" ("job_id");`,
    `CREATE INDEX IF NOT EXISTS "idx_applications_user_applied" ON "applications" ("user_id", "applied_at" DESC);`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "idx_unique_user_job_application" ON "applications" ("user_id", "job_id");`,

    // match_results index
    `CREATE INDEX IF NOT EXISTS "idx_match_results_application_id" ON "match_results" ("application_id");`,

    // credit_transactions index
    `CREATE INDEX IF NOT EXISTS "idx_credit_tx_user_created" ON "credit_transactions" ("user_id", "created_at" DESC);`,
  ];

  try {
    for (const q of queries) {
      try {
        await client.query(q);
        console.log(`Executed: ${q.trim()}`);
      } catch (err: unknown) {
        console.warn(`Warning on query: ${q.trim()} ->`, err instanceof Error ? err.message : err);
      }
    }
    console.log("Database index optimizations completed successfully!");
  } catch (err) {
    console.error("Migration error:", err);
  } finally {
    client.release();
    await pool.end();
  }
}

applyIndexes();
