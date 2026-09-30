import { config } from "dotenv";
config({ path: ".env.local" });

process.env.DATABASE_URL = process.env.DIRECT_URL?.replace("&channel_binding=require", "");

async function main() {
  console.log("Clearing all data from database...");
  
  const { db } = await import("../lib/db");
  const { jobs, skills, jobSkills, applications, resumes, matchResults, userProfiles, countries } = await import("../lib/db/schema");
  const { sql } = await import("drizzle-orm");

  try {
    // Truncate all tables and cascade the deletion to any foreign key relations
    await db.execute(sql`
      TRUNCATE TABLE 
        ${matchResults}, 
        ${applications}, 
        ${resumes}, 
        ${jobSkills}, 
        ${skills}, 
        ${jobs}, 
        ${userProfiles}, 
        ${countries} 
      CASCADE;
    `);

    console.log("Successfully wiped all data! Database is completely empty again.");

  } catch (error) {
    console.error("Error clearing database:", error);
  } process.exit(0);
}

main();
