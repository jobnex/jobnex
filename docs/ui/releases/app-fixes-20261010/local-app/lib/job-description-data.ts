import { Job } from "@/types";

export interface StructuredJobDescription {
  overview: string;
  responsibilities: string[];
  requirements: string[];
  preferredQualifications: string[];
  skills: string[];
  benefits: string[];
  aboutCompany: string;
  workArrangement: string;
  visaStatus: string;
  experienceLevel: string;
  companyWebsite?: string;
  companyIndustry?: string;
  companySize?: string;
  isFromDb: boolean;
}

/**
 * Parses raw plain text from real database job descriptions into structured sections.
 */
function parseDbPlainText(text: string, companyName: string) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  
  let currentSection = "intro";
  const sections: Record<string, string[]> = {
    aboutCompany: [],
    aboutRole: [],
    responsibilities: [],
    requirements: [],
    preferred: [],
    benefits: [],
    other: []
  };

  const isAboutCompanyHeader = (l: string) => 
    new RegExp(`^about\\s+(${companyName}|the\\s+company|our\\s+company)`, "i").test(l);
  
  const isAboutRoleHeader = (l: string) => 
    /^about\s+(the\s+)?(role|position|job|team|opportunity)/i.test(l) || /^role\s+overview/i.test(l) || /^overview/i.test(l);

  const isResponsibilitiesHeader = (l: string) =>
    /^(what\s+you(’|'|\\')?ll\s+do|what\s+you\s+will\s+do|responsibilities|key\s+responsibilities|your\s+role|core\s+responsibilities|day\s+to\s+day)/i.test(l);

  const isRequirementsHeader = (l: string) =>
    /^(what\s+(we(’|'|\\')?re\s+looking\s+for|we\s+look\s+for|you(’|'|\\')?ll\s+need|you\s+bring)|requirements|qualifications|basic\s+qualifications|minimum\s+qualifications|about\s+you|you\s+may\s+be\s+a\s+good\s+fit|we(’|'|\\')d\s+love\s+to\s+hear\s+from\s+you)/i.test(l);

  const isPreferredHeader = (l: string) =>
    /^(preferred\s+qualifications|bonus\s+if\s+you|bonus\s+points|added\s+plus|nice\s+to\s+have|while\s+it(’|'|\\')s\s+not\s+required)/i.test(l);

  const isBenefitsHeader = (l: string) =>
    /^(benefits|perks|what\s+we\s+offer|compensation\s+(&|and)\s+benefits|why\s+join\s+us)/i.test(l);

  for (const line of lines) {
    const cleanLine = line.replace(/[:：]+$/, "").trim();

    if (isAboutCompanyHeader(cleanLine)) {
      currentSection = "aboutCompany";
      continue;
    } else if (isAboutRoleHeader(cleanLine)) {
      currentSection = "aboutRole";
      continue;
    } else if (isResponsibilitiesHeader(cleanLine)) {
      currentSection = "responsibilities";
      continue;
    } else if (isRequirementsHeader(cleanLine)) {
      currentSection = "requirements";
      continue;
    } else if (isPreferredHeader(cleanLine)) {
      currentSection = "preferred";
      continue;
    } else if (isBenefitsHeader(cleanLine)) {
      currentSection = "benefits";
      continue;
    }

    if (sections[currentSection]) {
      sections[currentSection].push(line);
    } else {
      sections.other.push(line);
    }
  }

  // Helper to convert lines into clean bullet items
  const toBullets = (items: string[]) => {
    const result: string[] = [];
    for (const item of items) {
      // Clean leading bullet marks: -, *, •, 1., etc.
      const cleaned = item.replace(/^[-*•–—\d.)]+\s*/, "").trim();
      if (cleaned.length > 5) {
        result.push(cleaned);
      }
    }
    return result;
  };

  const aboutCompanyText = sections.aboutCompany.join(" ").trim();
  const aboutRoleText = sections.aboutRole.join(" ").trim();
  const introText = sections.other.slice(0, 3).join(" ").trim();

  return {
    aboutCompany: aboutCompanyText || "",
    overview: aboutRoleText || introText || "",
    responsibilities: toBullets(sections.responsibilities),
    requirements: toBullets(sections.requirements),
    preferredQualifications: toBullets(sections.preferred),
    benefits: toBullets(sections.benefits)
  };
}

/**
 * Extracts recognized technology keywords from job title and description text.
 */
function extractSkills(text: string, title: string): string[] {
  const combined = (title + " " + text).toLowerCase();
  const TECH_KEYWORDS = [
    "TypeScript", "JavaScript", "React", "Next.js", "Node.js", "Python", "Go", 
    "Rust", "Java", "C++", "SQL", "PostgreSQL", "MySQL", "MongoDB", "Redis", 
    "GraphQL", "REST", "AWS", "GCP", "Azure", "Docker", "Kubernetes", "Terraform", 
    "Linux", "CI/CD", "Git", "Figma", "Tailwind CSS", "Redux", "Zustand", "Kafka", 
    "Microservices", "Machine Learning", "LLMs", "PyTorch", "TensorFlow", "Spark", 
    "Snowflake", "Databricks", "SaaS", "Enterprise Sales", "Product Strategy", "B2B"
  ];

  const found: string[] = [];
  for (const tech of TECH_KEYWORDS) {
    const escaped = tech.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`\\b${escaped}\\b`, "i");
    if (regex.test(combined)) {
      found.push(tech);
    }
  }

  return found.length >= 2 ? found.slice(0, 10) : [];
}

export function getStructuredJobDescription(job: Job): StructuredJobDescription {
  // Format work arrangement from real DB booleans
  let workArrangement = "Hybrid / On-site";
  if (job.isRemote) {
    workArrangement = "100% Fully Remote";
  } else if (job.isHybrid) {
    workArrangement = "Hybrid (Flexible)";
  } else if (job.location && job.location.toLowerCase().includes("remote")) {
    workArrangement = "Fully Remote";
  }

  // Format visa sponsorship from real DB boolean
  let visaStatus = "Check with Hiring Team";
  if (job.visaSponsorship === true) {
    visaStatus = "Visa Sponsorship Available";
  } else if (job.visaSponsorship === false) {
    visaStatus = "No Visa Sponsorship";
  }

  // Format experience level from real DB text
  let experienceLevel = "Mid - Senior";
  if (job.experienceLevel) {
    const exp = job.experienceLevel.toLowerCase();
    if (exp === "fresher" || exp === "junior") experienceLevel = "Entry Level";
    else if (exp === "mid") experienceLevel = "Mid-Level";
    else if (exp === "senior") experienceLevel = "Senior Level";
    else if (exp === "lead") experienceLevel = "Lead / Staff";
    else if (exp === "principal") experienceLevel = "Principal";
    else if (exp === "executive") experienceLevel = "Executive / Director";
    else experienceLevel = job.experienceLevel.charAt(0).toUpperCase() + job.experienceLevel.slice(1);
  }

  // CASE 1: Real DB Structured Blocks (if DB has descriptionBlocks)
  if (job.descriptionBlocks && Array.isArray(job.descriptionBlocks) && job.descriptionBlocks.length > 0) {
    let overview = "";
    const responsibilities: string[] = [];
    const requirements: string[] = [];
    const skills: string[] = [];
    const benefits: string[] = [];

    for (const block of job.descriptionBlocks) {
      const title = (block.title || "").toLowerCase();
      const items = block.items || (block.text ? [block.text] : []);
      if (title.includes("about") || title.includes("role") || title.includes("overview")) {
        overview = items.join(" ");
      } else if (title.includes("skill") || title.includes("tech")) {
        skills.push(...items);
      } else if (title.includes("responsibilit") || title.includes("what you")) {
        responsibilities.push(...items);
      } else if (title.includes("require") || title.includes("qualification")) {
        requirements.push(...items);
      } else if (title.includes("benefit")) {
        benefits.push(...items);
      }
    }

    return {
      overview: overview || job.jobDescription || `Opportunity at ${job.company} for a ${job.jobRoleTitle}.`,
      responsibilities: responsibilities.length > 0 ? responsibilities : [
        `Deliver high-impact contributions as a ${job.jobRoleTitle} at ${job.company}.`,
        "Collaborate closely with distributed cross-functional teams.",
        "Maintain code quality, architecture scalability, and operational excellence."
      ],
      requirements: requirements.length > 0 ? requirements : [
        `Demonstrated experience in ${job.jobRoleTitle} role or related domain.`,
        "Strong problem-solving abilities and communication skills.",
        "Ability to thrive in a fast-paced, collaborative environment."
      ],
      preferredQualifications: [
        "Experience building and maintaining production cloud infrastructure",
        "Active involvement in technical communities or open-source initiatives"
      ],
      skills: skills.length > 0 ? skills : extractSkills(job.jobDescription || "", job.jobRoleTitle),
      benefits: benefits.length > 0 ? benefits : [
        `Competitive salary: ${job.salary || "Competitive compensation package"}`,
        "Comprehensive health, dental, and vision insurance",
        "Flexible work hours and generous paid time off",
        "Home office stipend and wellness benefits"
      ],
      aboutCompany: job.companyOverview || `${job.company} is a leading organization creating industry-defining technologies.`,
      workArrangement,
      visaStatus,
      experienceLevel,
      companyWebsite: job.companyWebsite,
      companyIndustry: job.companyIndustry,
      companySize: job.companySize,
      isFromDb: true
    };
  }

  // CASE 2: Real DB Plain Text Description (when text is rich/substantial from Neon DB)
  const fullText = job.descriptionPlain || job.jobDescription || "";
  if (fullText.length > 150) {
    const parsed = parseDbPlainText(fullText, job.company);
    const extractedSkills = extractSkills(fullText, job.jobRoleTitle);

    // Build real company description
    let companySummary = parsed.aboutCompany;
    if (!companySummary) {
      if (job.companyIndustry && job.companySize) {
        companySummary = `${job.company} is an industry-leading ${job.companyIndustry} organization with ${job.companySize} employees.`;
      } else {
        companySummary = `${job.company} is a high-growth technology company building cutting-edge products for global teams.`;
      }
    }

    return {
      overview: parsed.overview || fullText.slice(0, 400).trim() + "...",
      responsibilities: parsed.responsibilities.length > 0 ? parsed.responsibilities : [
        `Drive key initiatives and own execution for ${job.jobRoleTitle} deliverables.`,
        "Collaborate with engineering, product, and operational stakeholders to deliver value.",
        "Establish scalable patterns and champion technical craft across teams."
      ],
      requirements: parsed.requirements.length > 0 ? parsed.requirements : [
        `Demonstrated track record of excellence in a ${job.jobRoleTitle} capacity.`,
        "Strong analytical problem-solving and consultative execution.",
        "Outstanding written and verbal communication skills."
      ],
      preferredQualifications: parsed.preferredQualifications.length > 0 ? parsed.preferredQualifications : [
        "Prior experience in high-growth environments or top-tier technology organizations",
        "Familiarity with modern collaborative developer ecosystems"
      ],
      skills: extractedSkills.length > 0 ? extractedSkills : ["TypeScript", "React", "Cloud", "SaaS", "APIs"],
      benefits: parsed.benefits.length > 0 ? parsed.benefits : [
        `Competitive compensation package: ${job.salary || "Competitive salary"} with equity opportunities`,
        "Comprehensive healthcare (medical, dental, vision) coverage",
        "Flexible paid time off, parental leave, and company recharge days",
        "Remote office equipment allowance and learning budget"
      ],
      aboutCompany: companySummary,
      workArrangement,
      visaStatus,
      experienceLevel,
      companyWebsite: job.companyWebsite,
      companyIndustry: job.companyIndustry,
      companySize: job.companySize,
      isFromDb: true
    };
  }

  // CASE 3: Short Mock Fallback (for brief mock jobs in test data)
  const titleLower = job.jobRoleTitle.toLowerCase();
  let domainSkills = ["TypeScript", "Git", "REST APIs", "Agile"];
  let domainResponsibilities = [
    "Design, develop, and maintain high-quality, production-grade applications.",
    "Collaborate directly with cross-functional team members across engineering, product, and design.",
    "Participate in code reviews, technical design discussions, and system architecture planning.",
    "Identify bottlenecks, optimize performance, and improve code maintainability."
  ];
  let domainRequirements = [
    "Proven experience building and maintaining software in modern production environments.",
    "Solid understanding of computer science fundamentals, data structures, and algorithms.",
    "Strong communication skills and enthusiasm for iterative, team-oriented development.",
    "Track record of writing clean, testable, and maintainable code."
  ];

  if (titleLower.includes("frontend") || titleLower.includes("ui") || titleLower.includes("web")) {
    domainSkills = ["React", "TypeScript", "Next.js", "Tailwind CSS", "Figma", "Web Performance"];
    domainResponsibilities = [
      "Architect and implement responsive, accessible, and delight-inducing user interfaces.",
      "Translate designs into pixel-perfect web components.",
      "Optimize client-side rendering performance, Core Web Vitals, and asset delivery pipelines."
    ];
    domainRequirements = [
      "3+ years of experience with modern React, Next.js, and TypeScript.",
      "Deep understanding of semantic HTML5, CSS layouts, and WCAG accessibility.",
      "Passion for micro-interactions, responsive craft, and UI performance."
    ];
  } else if (titleLower.includes("backend") || titleLower.includes("data") || titleLower.includes("engineer")) {
    domainSkills = ["Node.js", "PostgreSQL", "Go", "Python", "Docker", "AWS", "Redis"];
    domainResponsibilities = [
      "Architect and scale fault-tolerant distributed services and RESTful APIs.",
      "Design relational database schemas, query optimizations, and data pipelines.",
      "Implement robust security layers, authentication, and error budgets."
    ];
    domainRequirements = [
      "3+ years of backend engineering in cloud environments.",
      "Strong proficiency with SQL and caching mechanisms.",
      "Experience with automated unit, integration, and performance testing."
    ];
  }

  return {
    overview: job.jobDescription || `Exciting opportunity at ${job.company} for a ${job.jobRoleTitle}.`,
    responsibilities: domainResponsibilities,
    requirements: domainRequirements,
    preferredQualifications: [
      "Experience with modern cloud-native developer tooling",
      "Demonstrated ability to deliver autonomously in fast-paced environments"
    ],
    skills: domainSkills,
    benefits: [
      `Competitive compensation: ${job.salary || "Competitive salary"} with equity`,
      "Full health, dental, and vision insurance coverage",
      "Flexible PTO policy and home office equipment allowance",
      "401(k) retirement matching program"
    ],
    aboutCompany: `${job.company} is an innovative technology company building modern digital solutions for global customers.`,
    workArrangement,
    visaStatus,
    experienceLevel,
    companyWebsite: job.companyWebsite,
    companyIndustry: job.companyIndustry,
    companySize: job.companySize,
    isFromDb: false
  };
}
