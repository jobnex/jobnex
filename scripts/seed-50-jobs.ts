import { config } from "dotenv";
config({ path: ".env.local" });

process.env.DATABASE_URL = process.env.DIRECT_URL?.replace("&channel_binding=require", "");

async function main() {
  console.log("Seeding 50 dummy jobs...");
  
  const { db } = await import("../lib/db");
  const { jobs, countries } = await import("../lib/db/schema");

  try {
    const allCountries = await db.select().from(countries);
    if (allCountries.length === 0) {
      throw new Error("No countries found. Please run regular seed first.");
    }
    
    const usId = allCountries.find(c => c.code === "US")?.id || allCountries[0].id;
    const ukId = allCountries.find(c => c.code === "UK")?.id || allCountries[0].id;
    const inId = allCountries.find(c => c.code === "IN")?.id || allCountries[0].id;

    const countryMap = [
      { id: usId, locations: ["San Francisco, CA", "New York, NY", "Austin, TX", "Seattle, WA", "Chicago, IL"] },
      { id: ukId, locations: ["London, UK", "Manchester, UK", "Edinburgh, UK", "Bristol, UK"] },
      { id: inId, locations: ["Bangalore, IN", "Hyderabad, IN", "Pune, IN", "Mumbai, IN", "Gurgaon, IN"] }
    ];

    const jobRoles = [
      "Software Engineer", "Frontend Developer", "Backend Developer", "Fullstack Engineer",
      "DevOps Engineer", "Data Scientist", "Product Manager", "UI/UX Designer",
      "Mobile Developer", "QA Engineer", "Systems Architect", "Cloud Engineer"
    ];

    const companies = [
      "TechNova", "CloudScale", "AppSprint", "DevCorp", "Nexus Labs",
      "Quantum Innovations", "Vertex AI", "Horizon Tech", "CyberDynamics", "Pioneer Software"
    ];

    const workModels = ["remote", "on_site", "hybrid"] as const;
    const employmentTypes = ["full_time", "part_time", "contract", "freelance", "internship"] as const;

    const dummyJobs: any[] = [];

    for (let i = 0; i < 50; i++) {
      const cMap = countryMap[Math.floor(Math.random() * countryMap.length)];
      const location = cMap.locations[Math.floor(Math.random() * cMap.locations.length)];
      const title = jobRoles[Math.floor(Math.random() * jobRoles.length)];
      const company = companies[Math.floor(Math.random() * companies.length)];
      const workModel = workModels[Math.floor(Math.random() * workModels.length)];
      const empType = employmentTypes[Math.floor(Math.random() * employmentTypes.length)];
      
      let currency = "USD";
      if (cMap.id === ukId) currency = "GBP";
      if (cMap.id === inId) currency = "INR";

      const baseSalary = currency === "INR" ? 1500000 : (currency === "GBP" ? 60000 : 90000);
      const minS = baseSalary + Math.floor(Math.random() * 40000);
      const maxS = minS + Math.floor(Math.random() * 50000);

      dummyJobs.push({
        recruiterId: "mock_recruiter_id_123",
        title: `${title} ${Math.random() > 0.5 ? "(Senior)" : ""}`.trim(),
        description: `We are looking for a highly skilled ${title} to join ${company}. You will be working on exciting new technologies and contributing to major products in a fast-paced environment.`,
        companyName: company,
        location: location,
        countryId: cMap.id,
        employmentType: empType,
        workModel: workModel,
        salaryMin: minS,
        salaryMax: maxS,
        currency: currency,
        status: "published",
        requirements: ["Strong communication skills", "Proven track record in similar roles", "Ability to work independently"],
      });
    }

    // Insert in batches of 25
    console.log("Inserting batch 1...");
    await db.insert(jobs).values(dummyJobs.slice(0, 25));
    console.log("Inserting batch 2...");
    await db.insert(jobs).values(dummyJobs.slice(25, 50));

    console.log("Successfully inserted 50 dummy jobs!");

  } catch (error) {
    console.error("Error seeding 50 jobs:", error);
  }
  process.exit(0);
}

main();
