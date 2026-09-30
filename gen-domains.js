const fs = require('fs');

const extraSkills = [
  "Rust", "Go", "Kotlin", "Swift", "Objective-C", "Dart", "Flutter",
  "Ruby on Rails", "Django", "Flask", "Spring Boot", "Laravel", "Symfony",
  "ASP.NET", "C#", "C++", "C", "Perl", "Haskell", "Scala", "Elixir", "Erlang",
  "Clojure", "F#", "R", "MATLAB", "Julia", "Lua", "Shell Scripting", "PowerShell",
  "Vim", "Emacs", "Neovim", "VS Code", "IntelliJ IDEA", "Eclipse", "NetBeans"
];

// Combine with existing 174 skills in mind... wait, I can just generate 200+ domains and add it to the DB.

const domains200 = [
  "Frontend Engineer", "Backend Engineer", "Fullstack Engineer", "DevOps Engineer",
  "Data Scientist", "Product Manager", "Mobile Developer", "UI/UX Designer",
  "QA Engineer", "Data Engineer", "Machine Learning Engineer", "Security Engineer",
  "Systems Administrator", "Cloud Architect", "Site Reliability Engineer",
  "Blockchain Developer", "Smart Contract Developer", "Game Developer",
  "AR/VR Developer", "Embedded Systems Engineer", "Hardware Engineer",
  "Network Engineer", "Database Administrator", "Business Analyst",
  "Technical Writer", "Developer Advocate", "Scrum Master", "Agile Coach",
  "Engineering Manager", "CTO", "VP of Engineering", "Chief Architect",
  "Information Security Analyst", "Penetration Tester", "Cybersecurity Specialist",
  "IT Support Specialist", "Help Desk Technician", "Application Support Analyst",
  "Release Manager", "Build Engineer", "Configuration Manager",
  "Salesforce Developer", "SAP Consultant", "ServiceNow Developer",
  "ERP Specialist", "CRM Developer", "BI Developer", "Data Analyst",
  "Quantitative Analyst", "Financial Engineer", "Bioinformatics Scientist",
  "Robotics Engineer", "Computer Vision Engineer", "NLP Engineer",
  "AI Researcher", "Deep Learning Engineer", "Prompt Engineer",
  "Big Data Engineer", "ETL Developer", "Data Warehouse Architect",
  "SEO Specialist", "Growth Hacker", "Digital Marketing Specialist",
  "Technical Recruiter", "IT Recruiter", "HR Manager",
  "Technical Project Manager", "IT Program Manager", "Delivery Manager",
  "Solutions Architect", "Enterprise Architect", "Software Architect",
  "Presales Consultant", "Technical Sales Engineer", "Sales Engineer",
  "Customer Success Manager", "Technical Account Manager", "Implementation Specialist",
  "Integrations Engineer", "API Developer", "Microservices Architect",
  "Serverless Architect", "FinOps Practitioner", "DevSecOps Engineer",
  "IAM Specialist", "Identity Management Consultant", "SOC Analyst",
  "Incident Responder", "Threat Intelligence Analyst", "Forensics Investigator",
  "Compliance Analyst", "IT Auditor", "Risk Analyst",
  "Network Administrator", "Systems Architect", "Virtualization Engineer",
  "Storage Engineer", "Telecom Engineer", "VoIP Engineer",
  "iOS Developer", "Android Developer", "React Native Developer",
  "Flutter Developer", "Cross-Platform Developer", "Mobile Architect",
  "Unity Developer", "Unreal Engine Developer", "Technical Artist",
  "Game Designer", "Level Designer", "Audio Engineer",
  "Web Developer", "WordPress Developer", "Shopify Developer",
  "Magento Developer", "E-commerce Specialist", "CMS Developer",
  "Accessibility Specialist", "Web Performance Engineer", "SEO Engineer",
  "UI Developer", "Interaction Designer", "Visual Designer",
  "UX Researcher", "UX Writer", "Product Designer",
  "Design Systems Engineer", "Creative Technologist", "Motion Designer",
  "Technical Director", "Producer", "Project Coordinator",
  "Data Entry Specialist", "Data Quality Analyst", "Data Governance Specialist",
  "Master Data Manager", "Metadata Analyst", "Taxonomy Specialist",
  "Ontologist", "Knowledge Manager", "Librarian",
  "Content Strategist", "Copywriter", "Technical Editor",
  "Localization Specialist", "Translation Manager", "Internationalization Engineer",
  "Agile Practitioner", "Kanban Coach", "Lean Agile Coach",
  "Operations Manager", "IT Director", "CIO",
  "CISO", "CDO", "Chief Product Officer",
  "Founder", "Co-Founder", "Entrepreneur",
  "Freelancer", "Consultant", "Contractor",
  "Instructor", "Trainer", "Technical Trainer",
  "Bootcamp Instructor", "Professor", "Researcher",
  "Hardware Technician", "PCB Designer", "FPGA Engineer",
  "ASIC Designer", "Firmware Engineer", "RTOS Developer",
  "IoT Engineer", "Smart Home Developer", "Wearables Developer",
  "Automotive Software Engineer", "Aerospace Software Engineer", "Avionics Engineer",
  "Medical Device Software Engineer", "Healthcare IT Specialist", "Health Data Analyst",
  "EdTech Specialist", "FinTech Developer", "RegTech Analyst",
  "PropTech Engineer", "LegalTech Specialist", "AgriTech Developer",
  "Cleantech Engineer", "Climate Tech Developer", "SpaceTech Engineer",
  "Quantum Computing Researcher", "Quantum Algorithm Developer", "Optical Engineer",
  "Photonics Engineer", "Materials Scientist", "Chemical Engineer",
  "Mechanical Engineer", "Electrical Engineer", "Civil Engineer",
  "Industrial Engineer", "Manufacturing Engineer", "Production Engineer"
];

const script = `
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
process.env.DATABASE_URL = process.env.DIRECT_URL;
import { db } from "./lib/db";
import { skills, domains, domainRelationships } from "./lib/db/schema";
import { inArray, sql } from "drizzle-orm";

const extraSkills = ${JSON.stringify(extraSkills, null, 2)};
const domains200 = ${JSON.stringify(domains200, null, 2)};

async function run() {
  console.log("Adding missing skills to reach 200+...");
  for (const s of extraSkills) {
    await db.insert(skills).values({ name: s, category: "other" }).onConflictDoNothing();
  }
  
  console.log("Adding 200 domains...");
  for (const d of domains200) {
    await db.insert(domains).values({ name: d }).onConflictDoNothing();
  }
  
  console.log("Creating relationships for domains...");
  const allDomains = await db.select().from(domains);
  
  for (const domain of allDomains) {
    // relate to 3 random other domains
    const shuffled = allDomains.sort(() => 0.5 - Math.random());
    let selected = shuffled.slice(0, 3);
    for (const rel of selected) {
      if (rel.id !== domain.id) {
        await db.insert(domainRelationships).values({
          domainId: domain.id,
          relatedDomainId: rel.id,
          weight: Math.random() * 5 + 1
        }).onConflictDoNothing();
      }
    }
  }
  console.log("Done!");
}

run().catch(console.error).finally(() => process.exit(0));
`;

fs.writeFileSync('expand-db.ts', script);
