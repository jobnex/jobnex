import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
process.env.DATABASE_URL = process.env.DIRECT_URL;
import { db } from "../lib/db";
import { preferenceTags, preferenceTagRelationships } from "../lib/db/schema/jobs";
import { sql } from "drizzle-orm";

const ALL_SKILLS = [
  "React", "TypeScript", "Node.js", "Python", "Next.js", "AWS", "Docker", "Tailwind CSS",
  "GraphQL", "PostgreSQL", "MongoDB", "Redis", "Kubernetes", "Java", "C++", "Go",
  "Rust", "Kotlin", "Swift", "Objective-C", "Dart", "Flutter",
  "Ruby on Rails", "Django", "Flask", "Spring Boot", "Laravel", "Symfony",
  "ASP.NET", "C#", "C", "Perl", "Haskell", "Scala", "Elixir", "Erlang",
  "Clojure", "F#", "R", "MATLAB", "Julia", "Lua", "Shell Scripting", "PowerShell",
  "Vim", "Emacs", "Neovim", "VS Code", "IntelliJ IDEA", "Eclipse", "NetBeans",
  "Figma", "Sketch", "InVision", "Adobe XD", "Photoshop", "Illustrator",
  "Jira", "Trello", "Asana", "Linear", "Notion", "Confluence",
  "Git", "GitHub", "GitLab", "Bitbucket", "SVN", "Mercurial",
  "Jenkins", "CircleCI", "Travis CI", "GitHub Actions", "GitLab CI",
  "Terraform", "Ansible", "Chef", "Puppet", "CloudFormation",
  "Azure", "GCP", "DigitalOcean", "Heroku", "Vercel", "Netlify",
  "Firebase", "Supabase", "Appwrite", "Hasura", "Prisma", "Drizzle",
  "TypeORM", "Sequelize", "Mongoose", "SQLAlchemy", "Hibernate",
  "Jest", "Mocha", "Chai", "Cypress", "Playwright", "Puppeteer",
  "Selenium", "JUnit", "TestNG", "PyTest", "RSpec", "Cucumber",
  "Webpack", "Rollup", "Vite", "Parcel", "Esbuild", "Babel",
  "ESLint", "Prettier", "Husky", "Lint-Staged", "Commitlint",
  "NPM", "Yarn", "PNPM", "Bun", "Deno", "Composer",
  "Pip", "Conda", "Poetry", "Maven", "Gradle", "Ant",
  "NuGet", "Cargo", "Mix", "Rebar3", "Hex", "RubyGems",
  "CocoaPods", "Carthage", "SPM", "Brew", "Apt", "Yum",
  "Pacman", "Chocolatey", "Scoop", "Winget", "Snap", "Flatpak",
  "Linux", "macOS", "Windows", "Ubuntu", "Debian", "CentOS",
  "Fedora", "Arch Linux", "Alpine Linux", "Red Hat", "SUSE",
  "iOS", "Android", "watchOS", "tvOS", "ChromeOS", "WebOS",
  "Tizen", "Raspberry Pi", "Arduino", "ESP32", "ESP8266",
  "MicroPython", "CircuitPython", "FreeRTOS", "Zephyr", "Mbed",
  "Vue.js", "Angular", "Svelte", "Ember.js", "Backbone.js", "Meteor",
  "Nuxt.js", "SvelteKit", "Gatsby", "Remix", "Astro", "Qwik",
  "Solid.js", "Alpine.js", "Preact", "Lit", "Stencil", "Polymer",
  "RxJS", "Redux", "MobX", "Zustand", "Jotai", "Recoil",
  "XState", "React Query", "SWR", "Apollo", "Relay", "Urql",
  "TRPC", "Socket.io", "Pusher", "SignalR", "WebRTC", "WebSockets",
  "TailwindCSS", "Bootstrap", "Foundation", "Bulma", "Materialize",
  "Chakra UI", "Material UI", "Ant Design", "Radix UI", "Headless UI",
  "Mantine", "DaisyUI", "Tailwind UI", "Flowbite", "Geist UI"
];

const DOMAINS200 = [
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

async function seed() {
  console.log("Starting DB seed for Preference Tags...");
  
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "preference_tags" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "name" text NOT NULL,
        "type" text NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        CONSTRAINT "idx_unique_preference_tag_name_type" UNIQUE("name", "type")
      );
      
      CREATE TABLE IF NOT EXISTS "preference_tag_relationships" (
        "tag_id" uuid NOT NULL REFERENCES "preference_tags"("id") ON DELETE cascade,
        "related_tag_id" uuid NOT NULL REFERENCES "preference_tags"("id") ON DELETE cascade,
        "weight" real NOT NULL,
        PRIMARY KEY ("tag_id", "related_tag_id")
      );
    `);
    console.log("Created preference tables.");

    console.log("Inserting Skills...");
    for (const s of ALL_SKILLS) {
      await db.insert(preferenceTags).values({ name: s, type: "skill" }).onConflictDoNothing();
    }
    
    console.log("Inserting Domains...");
    for (const d of DOMAINS200) {
      await db.insert(preferenceTags).values({ name: d, type: "domain" }).onConflictDoNothing();
    }

    console.log("Creating relationships...");
    const allTags = await db.select().from(preferenceTags);
    
    const skills = allTags.filter(t => t.type === 'skill');
    const domains = allTags.filter(t => t.type === 'domain');
    
    // Quick relationship builder
    for (const tag of skills) {
      const shuffled = skills.sort(() => 0.5 - Math.random()).slice(0, 3);
      for (const rel of shuffled) {
        if (rel.id !== tag.id) {
          await db.insert(preferenceTagRelationships).values({
            tagId: tag.id,
            relatedTagId: rel.id,
            weight: Math.random() * 5 + 1
          }).onConflictDoNothing();
        }
      }
    }
    
    for (const tag of domains) {
      const shuffled = domains.sort(() => 0.5 - Math.random()).slice(0, 3);
      for (const rel of shuffled) {
        if (rel.id !== tag.id) {
          await db.insert(preferenceTagRelationships).values({
            tagId: tag.id,
            relatedTagId: rel.id,
            weight: Math.random() * 5 + 1
          }).onConflictDoNothing();
        }
      }
    }

    console.log("✅ Seed completed successfully!");
  } catch (error) {
    console.error("Seed failed:", error);
  }
}

seed().finally(() => process.exit(0));
