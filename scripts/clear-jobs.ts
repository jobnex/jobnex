import { config } from "dotenv";
config({ path: ".env.local" });
import { Pool } from "pg";

async function clearJobsOnly() {
  console.log("Connecting to database to clear jobs data...");
  const connectionString = process.env.DIRECT_URL;
  if (!connectionString) {
    throw new Error("DIRECT_URL is not set in .env.local");
  }

  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  const client = await pool.connect();

  try {
    // 1. Check current counts
    const preJobs = await client.query('SELECT count(*) FROM "jobs"');
    console.log(`Found ${preJobs.rows[0].count} jobs before clearing.`);

    // 2. Perform deletion - schema, indexes, constraints, and other tables remain intact
    console.log("Deleting all records from 'jobs' (dependent records will cascade)...");
    const deleteResult = await client.query('DELETE FROM "jobs"');
    console.log(`Successfully deleted ${deleteResult.rowCount} rows from 'jobs'.`);

    // 3. Verify counts
    const postJobs = await client.query('SELECT count(*) FROM "jobs"');
    const postJobSkills = await client.query('SELECT count(*) FROM "job_skills"');
    const postSavedJobs = await client.query('SELECT count(*) FROM "saved_jobs"');
    const postCountries = await client.query('SELECT count(*) FROM "countries"');
    const postSkills = await client.query('SELECT count(*) FROM "skills"');
    const postUsers = await client.query('SELECT count(*) FROM "user_profiles"');

    console.log("\n--- Verification Summary ---");
    console.log(`jobs:         ${postJobs.rows[0].count} rows (cleared)`);
    console.log(`job_skills:   ${postJobSkills.rows[0].count} rows (cleared via cascade)`);
    console.log(`saved_jobs:   ${postSavedJobs.rows[0].count} rows (cleared via cascade)`);
    console.log(`countries:    ${postCountries.rows[0].count} rows (preserved intact)`);
    console.log(`skills:       ${postSkills.rows[0].count} rows (preserved intact)`);
    console.log(`user_profiles:${postUsers.rows[0].count} rows (preserved intact)`);
    console.log("----------------------------");
    console.log("Database schema and taxonomy intact. Ready for real jobs data insertion!");
  } catch (err: any) {
    console.error("Error clearing jobs data:", err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

clearJobsOnly();
