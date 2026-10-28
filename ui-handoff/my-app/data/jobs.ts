import { Job } from "@/types";

export type { Job };

const baseJobsData: Job[] = [
  // --- PAGE 1 (Jobs 1 - 12) ---
  {
    id: "1",
    jobRoleTitle: "Frontend Engineer",
    company: "TechCorp Inc.",
    type: "Full-time",
    location: "San Francisco, US",
    salary: "$120k - $150k",
    jobDescription: "Build interactive, bold web interfaces using React, TypeScript, and modern component systems. Join our fast-paced global product team.",

    categories: ["engineering", "remote", "all"]
  },
  {
    id: "2",
    jobRoleTitle: "UI/UX Designer",
    company: "Creative Studio",
    type: "Contract",
    location: "New York, US",
    salary: "$80/hr",
    jobDescription: "Looking for a designer who crafts accessible, delightful interfaces. Deep Figma expertise, design tokens, and high aesthetic polish required.",

    categories: ["design", "all"]
  },
  {
    id: "3",
    jobRoleTitle: "Backend Developer",
    company: "DataFlow Systems",
    type: "Full-time",
    location: "Austin, US",
    salary: "$130k+",
    jobDescription: "Architect robust microservice APIs, caching layers, and high-concurrency event pipelines using Node.js, Go, and PostgreSQL.",
    categories: ["engineering", "all"]
  },
  {
    id: "4",
    jobRoleTitle: "Product Manager",
    company: "InnovateHQ",
    type: "Full-time",
    location: "Bengaluru, IN",
    salary: "₹28L - ₹40L",
    jobDescription: "Lead cross-functional engineering and design squads to deliver high-impact products. Strong user empathy and data fluency required.",
    categories: ["product", "all"]
  },
  {
    id: "5",
    jobRoleTitle: "DevOps Engineer",
    company: "CloudNative Labs",
    type: "Full-time",
    location: "London, UK",
    salary: "£90k - £120k",
    jobDescription: "Manage multi-region AWS cloud infrastructure, CI/CD automation, and Kubernetes clusters. Terraform & IaC expertise is required.",

    categories: ["engineering", "remote", "all"]
  },
  {
    id: "6",
    jobRoleTitle: "Marketing Lead",
    company: "BrandBoost",
    type: "Full-time",
    location: "London, UK",
    salary: "£85k - £110k",
    jobDescription: "Drive global growth marketing campaigns and brand positioning. Craft multi-channel strategies that deliver measurable customer acquisition.",
    categories: ["marketing", "all"]
  },
  {
    id: "7",
    jobRoleTitle: "Data Scientist",
    company: "Insight Analytics",
    type: "Full-time",
    location: "Hyderabad, IN",
    salary: "₹24L - ₹36L",
    jobDescription: "Transform high-velocity data streams into predictive business insights. Strong Python, SQL, and practical machine learning experience required.",
    categories: ["engineering", "remote", "all"]
  },
  {
    id: "8",
    jobRoleTitle: "Content Marketing Intern",
    company: "Wordsmith Agency",
    type: "Intern",
    location: "Chicago, US",
    salary: "$35/hr",
    jobDescription: "Write crisp, memorable copy for top tech brands. We look for a distinct, human-centric tone, sharp headlines, and storytelling prowess.",
    categories: ["marketing", "remote", "all"]
  },
  {
    id: "9",
    jobRoleTitle: "Mobile Developer",
    company: "AppWorks",
    type: "Full-time",
    location: "Bengaluru, IN",
    salary: "₹22L - ₹32L",
    jobDescription: "Build smooth, native iOS and Android experiences using React Native or Flutter. Heavy focus on 60fps micro-interactions and offline sync.",
    categories: ["engineering", "all"]
  },
  {
    id: "10",
    jobRoleTitle: "Sales Executive",
    company: "Growth Dynamics",
    type: "Full-time",
    location: "Chicago, US",
    salary: "Base + Uncapped",
    jobDescription: "Close high-value enterprise accounts and expand software market share. Proven background in B2B enterprise SaaS sales is required.",
    categories: ["product", "all"]
  },
  {
    id: "11",
    jobRoleTitle: "Security Analyst",
    company: "SecureNet",
    type: "Full-time",
    location: "Manchester, UK",
    salary: "£75k - £95k",
    jobDescription: "Safeguard cloud infrastructure and production services against vulnerabilities. Lead internal security reviews and automated testing.",
    categories: ["engineering", "remote", "all"]
  },
  {
    id: "12",
    jobRoleTitle: "Community Manager",
    company: "Vibe Check",
    type: "Part-time",
    location: "Mumbai, IN",
    salary: "₹12L - ₹18L",
    jobDescription: "Moderate conversations, coordinate community initiatives, and connect with creators across Discord, Twitter/X, and social channels.",
    categories: ["marketing", "remote", "all"]
  },

  // --- PAGE 2 (Jobs 13 - 24) ---
  {
    id: "13",
    jobRoleTitle: "AI Research Engineer",
    company: "NeuralPulse Labs",
    type: "Full-time",
    location: "San Francisco, US",
    salary: "$175k - $220k",
    jobDescription: "Develop cutting-edge LLM evaluation benchmarks and fine-tuning pipelines. Deep PyTorch, transformer architectures, and CUDA optimization experience required.",

    categories: ["engineering", "all"]
  },
  {
    id: "14",
    jobRoleTitle: "Principal Design Systems Architect",
    company: "Nexus Design Group",
    type: "Full-time",
    location: "London, UK",
    salary: "£95k - £130k",
    jobDescription: "Architect multi-brand component libraries and design tokens across web and mobile. Champion strict accessibility (WCAG AAA) and frictionless developer handoff.",

    categories: ["design", "remote", "all"]
  },
  {
    id: "15",
    jobRoleTitle: "Staff Rust Systems Engineer",
    company: "HyperScale DB",
    type: "Full-time",
    location: "Austin, US",
    salary: "$180k - $230k",
    jobDescription: "Engineer ultra-low-latency distributed storage engines. Deep expertise in lock-free concurrency, memory safety, and high-throughput network I/O.",
    categories: ["engineering", "remote", "all"]
  },
  {
    id: "16",
    jobRoleTitle: "VP of Product Growth",
    company: "SaaSify Global",
    type: "Full-time",
    location: "New York, US",
    salary: "$190k - $240k",
    jobDescription: "Drive self-serve acquisition funnels, onboarding experiments, and monetization strategies across a 2M+ active user base.",

    categories: ["product", "all"]
  },
  {
    id: "17",
    jobRoleTitle: "Developer Relations Engineer",
    company: "DevKit OpenSource",
    type: "Full-time",
    location: "London, UK",
    salary: "£90k - £120k",
    jobDescription: "Empower our open-source developer ecosystem through technical guides, SDK documentation, conference talks, and interactive code sandboxes.",

    categories: ["marketing", "all"]
  },
  {
    id: "18",
    jobRoleTitle: "Motion & 3D Interactive Designer",
    company: "Studio Kinetic",
    type: "Contract",
    location: "Bengaluru, IN",
    salary: "₹25L - ₹35L",
    jobDescription: "Create breathtaking 3D WebGL scenes, shader animations, and micro-interactions for flagship landing pages and brand activations.",
    categories: ["design", "remote", "all"]
  },
  {
    id: "19",
    jobRoleTitle: "Site Reliability Engineer (Fintech)",
    company: "Apex Clearinghouse",
    type: "Full-time",
    location: "Chicago, US",
    salary: "$150k - $185k",
    jobDescription: "Guarantee 99.999% uptime for multi-million dollar transaction processing rails. Lead automated incident response, chaos testing, and observability.",
    categories: ["engineering", "all"]
  },
  {
    id: "20",
    jobRoleTitle: "Technical Content & SEO Strategist",
    company: "CloudVantage Media",
    type: "Full-time",
    location: "Edinburgh, UK",
    salary: "£65k - £85k",
    jobDescription: "Produce in-depth software architecture teardowns, cloud comparison matrices, and high-intent technical documentation that drives organic developer signups.",
    categories: ["marketing", "remote", "all"]
  },
  {
    id: "21",
    jobRoleTitle: "Senior Product Designer (Mobile)",
    company: "Orbit Social",
    type: "Full-time",
    location: "Delhi NCR, IN",
    salary: "₹26L - ₹38L",
    jobDescription: "Shape next-generation social feeds, spatial audio rooms, and gestural navigation for millions of iOS and Android creators worldwide.",

    categories: ["design", "all"]
  },
  {
    id: "22",
    jobRoleTitle: "Enterprise Solutions Architect",
    company: "Fortress Cloud",
    type: "Full-time",
    location: "Austin, US",
    salary: "$165k - $200k",
    jobDescription: "Partner with Fortune 500 engineering leaders to design secure hybrid cloud migrations, zero-trust perimeter security, and API integrations.",
    categories: ["product", "all"]
  },
  {
    id: "23",
    jobRoleTitle: "Senior QA Automation Engineer",
    company: "OmniTest Systems",
    type: "Full-time",
    location: "Hyderabad, IN",
    salary: "₹20L - ₹30L",
    jobDescription: "Build scalable Playwright and Cypress end-to-end testing frameworks. Integrate automated visual regression suites directly into CI/CD pipelines.",
    categories: ["engineering", "remote", "all"]
  },
  {
    id: "24",
    jobRoleTitle: "Lifecycle Marketing Manager",
    company: "Aura Health & Fitness",
    type: "Full-time",
    location: "New York, US",
    salary: "$110k - $135k",
    jobDescription: "Design behavioral email sequences, push notification triggers, and user re-engagement campaigns that maximize long-term subscriber retention.",

    categories: ["marketing", "all"]
  },

  // --- PAGE 3 (Jobs 25 - 36) ---
  {
    id: "25",
    jobRoleTitle: "Lead WebGL / 3D Graphics Engineer",
    company: "Metaview Interactive",
    type: "Full-time",
    location: "San Francisco, US",
    salary: "$165k - $210k",
    jobDescription: "Pioneer browser-based 3D simulation tools using Three.js, WebGPU, and custom GLSL shaders. Push real-time client performance to 120 FPS.",

    categories: ["engineering", "remote", "all"]
  },
  {
    id: "26",
    jobRoleTitle: "Senior UX Researcher",
    company: "FinFlow Technologies",
    type: "Full-time",
    location: "Bengaluru, IN",
    salary: "₹24L - ₹34L",
    jobDescription: "Lead qualitative interviews, tree-testing, and longitudinal usability studies for complex institutional trading dashboards.",
    categories: ["design", "all"]
  },
  {
    id: "27",
    jobRoleTitle: "Head of Technical Product",
    company: "Aether AI Platform",
    type: "Full-time",
    location: "London, UK",
    salary: "£120k - £160k",
    jobDescription: "Define the roadmap for our enterprise AI inference orchestration engine. Work closely with AI researchers to productize frontier model capabilities.",

    categories: ["product", "all"]
  },
  {
    id: "28",
    jobRoleTitle: "Senior Data Platform Engineer",
    company: "DataStream Analytics",
    type: "Full-time",
    location: "Austin, US",
    salary: "$150k - $185k",
    jobDescription: "Scale distributed batch and real-time streaming architectures using Apache Kafka, DuckDB, ClickHouse, and dbt. Process billions of telemetry events daily.",

    categories: ["engineering", "remote", "all"]
  },
  {
    id: "29",
    jobRoleTitle: "Brand & Visual Identity Designer",
    company: "Vanguard Studio",
    type: "Full-time",
    location: "London, UK",
    salary: "£75k - £95k",
    jobDescription: "Craft bespoke visual design languages, custom typography systems, packaging, and digital collateral for high-growth tech disruptors.",
    categories: ["design", "all"]
  },
  {
    id: "30",
    jobRoleTitle: "Growth & Performance Marketer",
    company: "ScaleWave Media",
    type: "Full-time",
    location: "Mumbai, IN",
    salary: "₹18L - ₹26L",
    jobDescription: "Manage a $500k/month multi-channel ad budget across Meta, Google Ads, LinkedIn, and TikTok. Execute rapid A/B creative testing loops.",
    categories: ["marketing", "all"]
  },
  {
    id: "31",
    jobRoleTitle: "Staff Cryptography & Security Engineer",
    company: "CipherShield Labs",
    type: "Full-time",
    location: "San Francisco, US",
    salary: "$190k - $240k",
    jobDescription: "Implement zero-knowledge proof protocols and post-quantum cryptographic primitives. Conduct rigorous audits on end-to-end encrypted messaging layers.",

    categories: ["engineering", "remote", "all"]
  },
  {
    id: "32",
    jobRoleTitle: "Senior Product Manager (Payments)",
    company: "CheckoutGlobal",
    type: "Full-time",
    location: "New York, US",
    salary: "$155k - $190k",
    jobDescription: "Scale local payment method integrations across 40+ countries. Reduce transaction authorization friction while minimizing fraud exposure.",
    categories: ["product", "all"]
  },
  {
    id: "33",
    jobRoleTitle: "Software Engineering Intern",
    company: "PocketPulse Health",
    type: "Intern",
    location: "Bengaluru, IN",
    salary: "₹8L - ₹12L",
    jobDescription: "Architect offline-first health tracking experiences with SwiftUI, CoreData, and Apple HealthKit. Prioritize smooth 120Hz animations and low power drain.",

    categories: ["engineering", "remote", "all"]
  },
  {
    id: "34",
    jobRoleTitle: "Design Technologist / UI Engineer",
    company: "Interface Atelier",
    type: "Contract",
    location: "Manchester, UK",
    salary: "£450 - £600/day",
    jobDescription: "Bridge the gap between product design and production React code. Build high-fidelity interactive prototypes, micro-animations, and fluid gesture interactions.",
    categories: ["design", "engineering", "remote", "all"]
  },
  {
    id: "35",
    jobRoleTitle: "Event & Partner Marketing Lead",
    company: "TechNexus Global",
    type: "Full-time",
    location: "San Francisco, US",
    salary: "$125k - $155k",
    jobDescription: "Plan and execute flagship developer summits, hackathons, and strategic co-marketing partnerships with major cloud providers.",
    categories: ["marketing", "all"]
  },
  {
    id: "36",
    jobRoleTitle: "Senior Director of Enterprise Sales",
    company: "OmniCloud Security",
    type: "Full-time",
    location: "Chicago, US",
    salary: "$180k Base / $360k OTE",
    jobDescription: "Lead enterprise revenue growth for cybersecurity SaaS products. Manage enterprise account executives and negotiate multi-year six-figure contracts.",

    categories: ["product", "remote", "all"]
  }
];

export const jobsData: Job[] = baseJobsData.map((job) => ({
  ...job,
  externalApplyUrl: job.externalApplyUrl || `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(job.jobRoleTitle + " " + job.company)}`,
}));

/**
 * Partition IDs for Curated Roles vs Requested/Applications Roles
 * - Curated Standard (10 roles): IDs "1", "3", "5", "7", "9", "13", "15", "19", "25", "28"
 * - Requested / Applications (7 roles): IDs "2", "4", "6", "14", "16", "18", "27"
 */
export const CURATED_JOB_IDS = new Set(["1", "3", "5", "7", "9", "13", "15", "19", "25", "28"]);
export const REQUESTED_JOB_IDS = new Set(["2", "4", "6", "14", "16", "18", "27"]);

/**
 * Splits jobs for the Curated Job Hunt dashboard & Applications tracker:
 * - Exactly 10 distinct, non-overlapping roles for the 'Jobs' sub-tab
 * - Exactly 7 distinct, non-overlapping roles for the 'Requested' / 'Applications' tab
 * - Automatically filters search results dynamically with 100% fidelity!
 */
export function getCuratedPartition(jobs: Job[]): { standardJobs: Job[]; requestedJobs: Job[] } {
  const standardJobs = jobs.filter((job) => CURATED_JOB_IDS.has(job.id));
  const requestedJobs = jobs.filter((job) => REQUESTED_JOB_IDS.has(job.id));
  return { standardJobs, requestedJobs };
}
