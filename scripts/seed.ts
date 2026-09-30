import { config } from "dotenv";
config({ path: ".env.local" });

process.env.DATABASE_URL = process.env.DIRECT_URL?.replace("&channel_binding=require", "");
console.log("Using URL:", process.env.DATABASE_URL ? "Loaded" : "Empty");

async function main() {
  console.log("Seeding database...");
  
  // Dynamic import AFTER env variables are loaded
  const { db } = await import("../lib/db");
  const { jobs, skills, jobSkills, countries } = await import("../lib/db/schema");

  try {
    const recruiter = {
      id: "mock_recruiter_id_123",
    };

    console.log("Created mock recruiter ID:", recruiter.id);

    // 1.5 Create countries
    const createdCountries = await db.insert(countries).values([
      { name: "United States", code: "US" },
      { name: "United Kingdom", code: "UK" },
      { name: "India", code: "IN" },
    ]).returning();

    console.log("Created countries:", createdCountries.length);
    const getCountryId = (code: string) => createdCountries.find((c) => c.code === code)?.id!;

    // 2. Create some common skills
    const createdSkills = await db.insert(skills).values([
      { name: "React", category: "framework" },
      { name: "TypeScript", category: "programming_language" },
      { name: "Node.js", category: "framework" },
      { name: "PostgreSQL", category: "database" },
      { name: "Next.js", category: "framework" },
      { name: "Tailwind CSS", category: "library" },
    ]).returning();

    console.log("Created skills:", createdSkills.length);

    // Helper to get skill IDs
    const getSkillId = (name: string) => createdSkills.find((s) => s.name === name)?.id!;

    // 3. Create dummy jobs
    const createdJobs = await db.insert(jobs).values([
      {
        sourceService: recruiter.id,
        jobRoleTitle: "Senior Frontend Developer",
        jobDescription: "We are looking for an experienced frontend developer to lead our core product team. You will be building cutting-edge UIs with Next.js and Tailwind.",
        companyName: "TechNova Solutions",
        location: "San Francisco, CA",
        countryId: getCountryId("US"),
        employmentType: "full_time",
        workModel: "hybrid",
        salaryMin: 120000,
        salaryMax: 160000,
        currency: "USD",
        status: "published",
        requirements: ["5+ years of React experience", "Deep knowledge of TypeScript", "Experience with modern CSS frameworks"],
      },
      {
        sourceService: recruiter.id,
        jobRoleTitle: "Backend Engineer (Node.js)",
        jobDescription: "Join our fast-growing startup to build scalable backend systems. You will work closely with PostgreSQL and Node.js microservices.",
        companyName: "CloudScale Inc",
        location: "New York, NY",
        countryId: getCountryId("US"),
        employmentType: "full_time",
        workModel: "remote",
        salaryMin: 100000,
        salaryMax: 140000,
        currency: "USD",
        status: "published",
        requirements: ["Strong Node.js skills", "Experience with SQL databases", "API design experience"],
      },
      {
        sourceService: recruiter.id,
        jobRoleTitle: "React Native Developer",
        jobDescription: "Help us build our flagship mobile application. Great opportunity for a React developer wanting to transition into mobile.",
        companyName: "AppSprint",
        location: "London, UK",
        countryId: getCountryId("UK"),
        employmentType: "contract",
        workModel: "remote",
        salaryMin: 80000,
        salaryMax: 110000,
        currency: "GBP",
        status: "published",
        requirements: ["React Native or React experience", "Understanding of mobile deployment", "Self-starter"],
      },
      {
        sourceService: recruiter.id,
        jobRoleTitle: "Fullstack Engineer",
        jobDescription: "Work on both the frontend and backend of our main application. Fast-paced environment.",
        companyName: "DevCorp India",
        location: "Bangalore, KA",
        countryId: getCountryId("IN"),
        employmentType: "full_time",
        workModel: "hybrid",
        salaryMin: 2000000,
        salaryMax: 3500000,
        currency: "INR",
        status: "published",
        requirements: ["React", "Node.js", "PostgreSQL"],
      }
    ]).returning();

    console.log("Created jobs:", createdJobs.length);

    // 4. Link jobs and skills
    await db.insert(jobSkills).values([
      // Senior Frontend
      { jobId: createdJobs[0].id, skillId: getSkillId("React"), isCoreSkill: true },
      { jobId: createdJobs[0].id, skillId: getSkillId("TypeScript"), isCoreSkill: true },
      { jobId: createdJobs[0].id, skillId: getSkillId("Next.js"), isCoreSkill: true },
      { jobId: createdJobs[0].id, skillId: getSkillId("Tailwind CSS"), isCoreSkill: false },
      
      // Backend
      { jobId: createdJobs[1].id, skillId: getSkillId("Node.js"), isCoreSkill: true },
      { jobId: createdJobs[1].id, skillId: getSkillId("PostgreSQL"), isCoreSkill: true },
      { jobId: createdJobs[1].id, skillId: getSkillId("TypeScript"), isCoreSkill: false },
      
      // React Native
      { jobId: createdJobs[2].id, skillId: getSkillId("React"), isCoreSkill: true },
      { jobId: createdJobs[2].id, skillId: getSkillId("TypeScript"), isCoreSkill: false },

      // Fullstack
      { jobId: createdJobs[3].id, skillId: getSkillId("React"), isCoreSkill: true },
      { jobId: createdJobs[3].id, skillId: getSkillId("Node.js"), isCoreSkill: true },
    ]);

    console.log("Successfully seeded database with dummy data!");

  } catch (error) {
    console.error("Error seeding database:", error);
  } process.exit(0);
}

main();

