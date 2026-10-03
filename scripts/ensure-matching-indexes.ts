import { config } from "dotenv";
config({ path: ".env.local" });
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL || process.env.DIRECT_URL;

if (!connectionString) {
  console.error("Missing DATABASE_URL or DIRECT_URL in environment.");
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  console.log("Ensuring required PostgreSQL extensions and performance indexes on Neon...");

  const queries = [
    `CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`,
    `CREATE EXTENSION IF NOT EXISTS pg_trgm;`,
    `CREATE INDEX IF NOT EXISTS idx_jobs_published_at_id_partial 
     ON public.jobs (published_at DESC, id DESC) 
     WHERE status = 'published';`,
    `CREATE INDEX IF NOT EXISTS idx_jobs_published_country_pagination 
     ON public.jobs (country_id, published_at DESC, id DESC) 
     WHERE status = 'published';`,
    `CREATE INDEX IF NOT EXISTS idx_jobs_published_emp_type 
     ON public.jobs (employment_type, published_at DESC, id DESC) 
     WHERE status = 'published';`,
    `CREATE INDEX IF NOT EXISTS idx_jobs_job_role_title_trgm 
     ON public.jobs USING gin (job_role_title gin_trgm_ops)
     WHERE status = 'published';`,
  ];

  for (const q of queries) {
    const start = performance.now();
    await pool.query(q);
    const ms = Math.round(performance.now() - start);
    console.log(`✓ Executed index statement (${ms}ms)`);
  }

  console.log("All matching indexes are active and ready!");
  await pool.end();
}

main().catch((err) => {
  console.error("Migration error:", err);
  pool.end();
  process.exit(1);
});
