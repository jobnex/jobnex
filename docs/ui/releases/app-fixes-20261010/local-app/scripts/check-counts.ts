import { config } from "dotenv";
config({ path: ".env.local" });
import { Pool } from "pg";

async function check() {
  const pool = new Pool({ connectionString: process.env.DIRECT_URL });
  const client = await pool.connect();
  const tables = [
    "jobs",
    "job_skills",
    "saved_jobs",
    "skills",
    "countries",
    "applications",
    "match_results",
    "resumes",
    "user_profiles",
  ];
  console.log("--- Current Table Counts ---");
  for (const t of tables) {
    try {
      const res = await client.query(`SELECT count(*) FROM "${t}"`);
      console.log(`${t}: ${res.rows[0].count} rows`);
    } catch (e: any) {
      console.log(`${t}: error - ${e.message}`);
    }
  }
  await client.release();
  await pool.end();
}
check();
