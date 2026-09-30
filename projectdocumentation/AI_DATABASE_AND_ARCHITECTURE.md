# AI System Context & Schema Contract: Strawberry Jobs

> **Target Consumer:** Autonomous AI Coding Agents, LLMs, and Code Generation Pipelines  
> **Repository:** `geeth-chand/strawberryjobs` (`my-app`)  
> **Purpose:** Authoritative technical specification, database schema contract, API schemas, and code generation guidelines. Do NOT hallucinate types or schemas; adhere strictly to the contracts below.

---

## 1. System Metadata & Technical Stack Invariants

```yaml
framework: "Next.js 16.3.0 (App Router)"
react_version: "19.2.8"
typescript_version: "^5.0.0"
database_engine: "PostgreSQL (Neon Serverless)"
orm: "Drizzle ORM 0.45.2 / Drizzle Kit 0.31.10"
auth_provider: "Neon Auth (@neondatabase/auth 0.5.0-beta)"
server_state: "TanStack React Query 5.101.4"
client_state: "Zustand 5.0.15"
styling: "Tailwind CSS v4 (@tailwindcss/postcss), CSS variables in globals.css"
forms: "React Hook Form 7.85.0 + Zod 3.25.76 + @hookform/resolvers"
icons: "lucide-react 1.31.0"
toasts: "sonner 2.0.8"
markdown_engine: "react-markdown 10.1.0 + remark-gfm 4.0.1 + turndown 7.2.4"
path_alias: "@/* -> ./*"
```

### Critical Next.js 16 & Serverless Invariants
1. **Dynamic Route Params are Promises:** In Next.js 16, route parameters (`params`) in page components and API route handlers are async Promises.
   ```typescript
   // CORRECT:
   export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
     const { id } = await params;
   }
   // WRONG (will throw runtime error):
   export async function POST(req: Request, { params }: { params: { id: string } }) {
     const id = params.id;
   }
   ```
2. **Database Connection Pool:** Never create new unpooled database clients in API handlers. Import `db` directly from `@/lib/db`. The connection pool is bound to Vercel Fluid Compute via `attachDatabasePool(pool)`.
3. **Tailwind CSS v4 `@theme`:** Tailwind v4 does not use `tailwind.config.js`. Design tokens are defined in `app/globals.css`. Never generate custom hex values when design tokens exist (`bg-brand-lime`, `bg-brand-dark`, `border-border-color`, `text-text-primary`).

---

## 2. Exhaustive Database Schema Specification

### 2.1. Table: `jobs`
**Schema File:** `lib/db/schema/jobs.ts`  
**SQL Table Name:** `jobs`

```typescript
export const jobs = pgTable("jobs", {
  id: uuid("id").defaultRandom().primaryKey().notNull(),
  sourceService: text("source_service"), // Recruiter ID or ingestion pipeline service
  jobRoleTitle: text("job_role_title").notNull(),
  jobDescription: text("job_description").notNull(),
  companyName: text("company_name").notNull(),
  location: text("location").notNull(),
  countryId: uuid("country_id").references(() => countries.id),
  employmentType: text("employment_type", {
    enum: ["full_time", "part_time", "contract", "freelance", "internship"],
  }).notNull(),
  workModel: text("work_model", {
    enum: ["remote", "on_site", "hybrid"],
  }).notNull(),
  salaryMin: integer("salary_min"),
  salaryMax: integer("salary_max"),
  currency: text("currency").default("USD"),
  status: text("status", {
    enum: ["draft", "published", "closed", "archived"],
  }).default("draft").notNull(),
  isExternal: boolean("is_external").default(true).notNull(),
  externalApplyUrl: text("external_apply_url").default("https://google.com"),
  requirements: jsonb("requirements").default([]).notNull(), // string[]
  jobSource: text("job_source"),
  experienceRequired: integer("experience_required"),
  visaSponsorship: boolean("visa_sponsorship").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true, mode: "date" }),
});
```

### 2.2. Table: `countries`
**Schema File:** `lib/db/schema/countries.ts`  
**SQL Table Name:** `countries`

```typescript
export const countries = pgTable("countries", {
  id: uuid("id").defaultRandom().primaryKey().notNull(),
  name: text("name").notNull().unique(), // e.g. "United States", "United Kingdom", "India"
  code: text("code").notNull().unique(), // e.g. "US", "UK", "IN"
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});
```

### 2.3. Table: `skills` & `job_skills`
**Schema File:** `lib/db/schema/jobs.ts`  
**SQL Table Names:** `skills`, `job_skills`

```typescript
export const skills = pgTable("skills", {
  id: uuid("id").defaultRandom().primaryKey().notNull(),
  name: text("name").notNull().unique(),
  category: text("category", {
    enum: [
      "programming_language",
      "framework",
      "library",
      "database",
      "cloud",
      "devops",
      "tool",
      "soft_skill",
      "domain",
      "other",
    ],
  }).default("other").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

export const jobSkills = pgTable("job_skills", {
  jobId: uuid("job_id").references(() => jobs.id, { onDelete: "cascade" }).notNull(),
  skillId: uuid("skill_id").references(() => skills.id, { onDelete: "cascade" }).notNull(),
  isCoreSkill: boolean("is_core_skill").default(false).notNull(),
});
```

### 2.4. Table: `saved_jobs`
**Schema File:** `lib/db/schema/jobs.ts`  
**SQL Table Name:** `saved_jobs`

```typescript
export const savedJobs = pgTable("saved_jobs", {
  id: uuid("id").defaultRandom().primaryKey().notNull(),
  userId: text("user_id").notNull(), // Foreign key to neon_auth.users.id
  jobId: uuid("job_id").references(() => jobs.id, { onDelete: "cascade" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  index("idx_saved_jobs_user_id").on(table.userId),
  uniqueIndex("idx_unique_user_job_save").on(table.userId, table.jobId),
]);
```

### 2.5. Table: `user_profiles`
**Schema File:** `lib/db/schema/users.ts`  
**SQL Table Name:** `user_profiles`

```typescript
export const userProfiles = pgTable("user_profiles", {
  userId: text("user_id").primaryKey().notNull(), // Primary key directly mapping to neon_auth.users.id
  fullName: text("full_name"),
  phoneNumber: text("phone_number"),
  location: text("location"),
  bio: text("bio"),
  linkedinUrl: text("linkedin_url"),
  githubUrl: text("github_url"),
  portfolioUrl: text("portfolio_url"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  index("idx_user_profiles_user_id").on(table.userId),
]);
```

### 2.6. Tables: `resumes`, `applications`, & `match_results`
**Schema File:** `lib/db/schema/applications.ts`  
**SQL Table Names:** `resumes`, `applications`, `match_results`

```typescript
export const resumes = pgTable("resumes", {
  id: uuid("id").defaultRandom().primaryKey().notNull(),
  userId: text("user_id").notNull(), // References neon_auth.users.id
  title: text("title").notNull(),
  isPrimary: boolean("is_primary").default(false).notNull(),
  content: text("content"), // Raw Markdown or text
  parsedData: jsonb("parsed_data").default({}), // ParsedResume AST
  fileUrl: text("file_url"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

export const applications = pgTable("applications", {
  id: uuid("id").defaultRandom().primaryKey().notNull(),
  userId: text("user_id").notNull(),
  jobId: uuid("job_id").references(() => jobs.id, { onDelete: "cascade" }).notNull(),
  resumeId: uuid("resume_id").references(() => resumes.id, { onDelete: "set null" }),
  status: text("status", {
    enum: [
      "applied",
      "screening",
      "assessment",
      "interview",
      "offer",
      "hired",
      "rejected",
      "withdrawn",
    ],
  }).default("applied").notNull(),
  notes: text("notes"),
  matchScore: real("match_score"),
  appliedAt: timestamp("applied_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

export const matchResults = pgTable("match_results", {
  id: uuid("id").defaultRandom().primaryKey().notNull(),
  applicationId: uuid("application_id").references(() => applications.id, { onDelete: "cascade" }).notNull(),
  overallScore: real("overall_score").notNull(),
  skillScore: real("skill_score"),
  experienceScore: real("experience_score"),
  educationScore: real("education_score"),
  explanation: jsonb("explanation").default({}).notNull(),
  missingSkills: jsonb("missing_skills").default([]).notNull(),
  matchedSkills: jsonb("matched_skills").default([]).notNull(),
  computedAt: timestamp("computed_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});
```

---

## 3. Database Column vs. Frontend Interface Mapping Contract

The frontend uses canonical interface `Job` (`types/job.ts`). Always use this strict translation matrix when reading from or writing to `jobs`:

| Database Column (`jobs`) | Drizzle Property | Frontend `Job` Property | Type Conversion / Mapping Rule |
|---|---|---|---|
| `id` | `id` | `id: string` | Direct string representation of UUID |
| `job_role_title` | `jobRoleTitle` | `jobRoleTitle: string` | Direct string |
| `company_name` | `companyName` | `company: string` | Map `row.companyName \|\| "Unknown Company"` |
| `employment_type` | `employmentType` | `type: JobType` | `mapDBJobTypeToUI()` (see below) |
| `location` + `countries.name` | `location`, `countryName` | `location: string` | `countryName ? "${row.location}, ${countryName}" : row.location` |
| `salary_min`, `salary_max`, `currency` | `salaryMin`, `salaryMax`, `currency` | `salary: string` | Formatted salary string (e.g. `"$120k - $160k"`) via `formatSalary()` |
| `job_description` | `jobDescription` | `jobDescription: string` | Direct text |
| `requirements` | `requirements` | `requirements: string[]` | `jsonb` array of strings |
| `work_model` | `workModel` | `workModel?: string` | Direct text (`"remote" \| "on_site" \| "hybrid"`) |
| `work_model === "remote"` | `workModel` | `isRemote?: boolean` | `row.workModel === "remote"` |
| `work_model === "hybrid"` | `workModel` | `isHybrid?: boolean` | `row.workModel === "hybrid"` |
| `visa_sponsorship` | `visaSponsorship` | `visaSponsorship?: boolean` | Direct boolean |
| `experience_required` | `experienceRequired` | `experienceRequired?: number` | Direct integer |
| `job_source` | `jobSource` | `jobSource?: string` | Direct string |
| `external_apply_url` | `externalApplyUrl` | `externalApplyUrl?: string` | Direct URL string |
| `created_at` | `createdAt` | `postedAt: string` | `row.createdAt.toISOString()` |

### Enum Mapping Functions
```typescript
export const mapDBJobTypeToUI = (type: string): "Full-time" | "Part-time" | "Intern" | "Contract" => {
  switch (type) {
    case "full_time": return "Full-time";
    case "part_time": return "Part-time";
    case "internship": return "Intern";
    case "contract": return "Contract";
    default: return "Full-time";
  }
};

export const mapUIJobTypeToDB = (type: string): "full_time" | "part_time" | "contract" | "freelance" | "internship" => {
  switch (type.toLowerCase()) {
    case "full-time": return "full_time";
    case "part-time": return "part_time";
    case "intern": return "internship";
    case "contract": return "contract";
    default: return "full_time";
  }
};
```

---

## 4. Query Construction & Filter Engine (`lib/db/job-filters.ts`)

Any API route implementing job querying MUST use `buildJobFilterConditions(searchParams)`:

```typescript
import { eq, or, ilike, gte, SQL } from "drizzle-orm";
import { jobs, countries } from "@/lib/db/schema";

export function buildJobFilterConditions(searchParams: URLSearchParams): SQL[] {
  const keyword = searchParams.get("keyword")?.toLowerCase().trim() || "";
  const location = searchParams.get("location")?.toLowerCase().trim() || "all";
  const jobType = searchParams.get("type")?.toLowerCase().trim() || "all";
  const minSalaryParam = searchParams.get("minSalary");
  const minSalary = minSalaryParam ? parseInt(minSalaryParam, 10) : 0;
  const postedTime = searchParams.get("postedTime")?.toLowerCase().trim() || "all";
  const categoriesParam = searchParams.get("categories");
  const categories = categoriesParam ? categoriesParam.split(",") : [];
  const seniority = searchParams.get("seniority")?.toLowerCase().trim() || "all";
  const visaSponsorship = searchParams.get("visaSponsorship")?.toLowerCase().trim() || "all";
  const workMode = searchParams.get("workMode")?.toLowerCase().trim() || "all";

  const conditions: SQL[] = [];

  // Enforce published status
  conditions.push(eq(jobs.status, 'published'));

  if (keyword) {
    conditions.push(
      or(
        ilike(jobs.jobRoleTitle, `%${keyword}%`),
        ilike(jobs.companyName, `%${keyword}%`)
      )!
    );
  }

  if (location !== "all" && location !== "") {
    conditions.push(ilike(countries.name, `%${location}%`));
  }

  if (jobType && jobType !== "all") {
    conditions.push(eq(jobs.employmentType, mapUIJobTypeToDB(jobType)));
  }

  if (minSalary > 0) {
    conditions.push(gte(jobs.salaryMin, minSalary));
  }

  if (postedTime && postedTime !== "all") {
    let maxHours = 0;
    if (postedTime === "1h") maxHours = 1;
    else if (postedTime === "12h") maxHours = 12;
    else if (postedTime === "24h" || postedTime === "1d") maxHours = 24;
    else if (postedTime === "7d" || postedTime === "1w") maxHours = 168;

    if (maxHours > 0) {
      const thresholdDate = new Date(Date.now() - maxHours * 60 * 60 * 1000);
      conditions.push(gte(jobs.createdAt, thresholdDate));
    }
  }

  if (categories.length > 0) {
    const categoryConditions = categories.map(cat => 
      or(
        ilike(jobs.jobRoleTitle, `%${cat}%`),
        ilike(jobs.jobDescription, `%${cat}%`)
      )
    );
    conditions.push(or(...categoryConditions)!);
  }

  if (seniority && seniority !== "all") {
    conditions.push(
      or(
        ilike(jobs.jobRoleTitle, `%${seniority}%`),
        ilike(jobs.jobDescription, `%${seniority}%`)
      )!
    );
  }

  if (visaSponsorship === "sponsored") {
    conditions.push(eq(jobs.visaSponsorship, true));
  }

  if (workMode && workMode !== "all") {
    const dbWorkMode = workMode === "on-site" ? "on_site" : workMode as "remote" | "hybrid";
    conditions.push(eq(jobs.workModel, dbWorkMode));
  }

  return conditions;
}
```

---

## 5. API Contracts & Payload Specifications

### 5.1. `GET /api/jobs`
**Purpose:** Public paginated job listings with multi-faceted filtering.

**Request Query Parameters:**
```typescript
interface JobsQueryParams {
  keyword?: string;           // Substring match on jobRoleTitle or companyName
  location?: string;          // Substring match on countries.name
  type?: string;              // "full-time" | "part-time" | "contract" | "intern"
  minSalary?: string;         // Minimum annual salary (e.g. "100000")
  postedTime?: string;        // "1h" | "12h" | "24h" | "7d"
  categories?: string;        // Comma-separated category strings (e.g. "engineering,design")
  seniority?: string;         // "entry" | "mid" | "senior" | "lead"
  visaSponsorship?: string;   // "sponsored" | "all"
  workMode?: string;          // "remote" | "hybrid" | "on-site"
  page?: string;              // 1-indexed page integer (default "1")
  limit?: string;             // Results per page (default "12")
}
```

**Response Payload (JSON):**
```typescript
interface JobsResponse {
  jobs: Job[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}
```

---

### 5.2. `POST` & `DELETE /api/jobs/[id]/save`
**Purpose:** Toggle candidate bookmark for target job. Requires active Neon Auth session.

**Route Parameters:** `{ params: Promise<{ id: string }> }`

**Authentication Check:**
```typescript
const sessionRes = await auth.getSession();
const user = (sessionRes as any)?.user || (sessionRes as any)?.data?.user;
if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
```

**Response (JSON):**
```typescript
// POST:
{ message: "Job saved successfully", isSaved: true }
// DELETE:
{ message: "Job removed from saved", isSaved: false }
```

---

### 5.3. `GET /api/jobs/saved`
**Purpose:** Filtered and paginated list of jobs saved by the currently authenticated user.

**Authentication:** Required (`auth.getSession()`).  
**Query Parameters:** Same as `/api/jobs` (`keyword`, `location`, `type`, `page`, `limit`, etc.).  
**Response:** `JobsResponse`

---

### 5.4. `GET /api/jobs/saved/ids`
**Purpose:** Returns raw array of `jobId` UUIDs bookmarked by the authenticated user for optimistic UI hydration.

**Authentication:** Optional. If unauthenticated, returns `{ savedJobIds: [] }`.  
**Response:**
```json
{
  "savedJobIds": ["0c934375-9b24-4f51-b847-a8a25cbf066f", "380b2a95-b0ff-4e78-beee-826a798544e4"]
}
```

---

### 5.5. `GET /api/locations`
**Purpose:** Retrieves active country regions with dynamic job inventory count.

**Response (JSON):**
```typescript
type LocationResponse = Array<{
  id: string;        // Country UUID
  country: string;   // Country Name (e.g. "United States")
  code: string;      // Country ISO code (e.g. "US")
  roleCount: number; // Aggregate count of published jobs
}>;
```

---

### 5.6. `GET` & `POST /api/resume/payload`
**Purpose:** Bridge between web client resume state and local/remote Typst compilation service.  
**File Location:** `data/resume-compile-payload.json`

**Payload Schema:**
```typescript
interface TypstCompilePayload {
  theme: number;                    // 1 to 8 (TypstThemeId)
  templateId: string;               // e.g. "mit-capd" | "modern-clean" | "executive"
  templateName: string;             // e.g. "MIT CAPD Classical"
  include_base64: boolean;          // true
  destination_endpoint: string;     // Optional webhook callback
  updatedAt: string;                // ISO 8601 timestamp
  markdown: string;                 // Raw markdown string conforming to AST contract
}
```

---

## 6. Client State Management Specifications

### 6.1. Zustand Store: `useJobStore` (`store/useJobStore.ts`)
Controls transient UI parameters. Do NOT store remote API job datasets here; React Query handles server data.

```typescript
// Key State Slices:
interface JobStoreState {
  // Shared
  location: string;                                   // Default: "United States"
  isFilterMenuOpen: boolean;
  isModalOpen: boolean;
  selectedJob: Job | null;                            // Job selected for ApplyModal
  isJdOpen: boolean;                                  // Controls Split-View side panel
  activeJdJob: Job | null;                            // Active job rendered in JobDescriptionPanel
  savedJobIds: string[];                              // Array of bookmarked job UUIDs
  toggleSavedJob: (jobId: string) => Promise<void>;   // Optimistic toggle + API dispatch

  // Main Job Board Filters
  searchQuery: string;
  categories: string[];
  jobType: string;
  seniority: string;
  minSalary: number;
  postedTime: string;
  visaSponsorship: string;
  workMode: string;
  page: number;

  // Saved Jobs Portal Filters
  savedSearchQuery: string;
  savedCategories: string[];
  savedJobType: string;
  savedSeniority: string;
  savedMinSalary: number;
  savedPostedTime: string;
  savedVisaSponsorship: string;
  savedWorkMode: string;
  savedPage: number;
}
```

### 6.2. Custom Hook: `useAppFilters(variant)`
Use `useAppFilters("default")` on `app/(main)/page.tsx` and `useAppFilters("saved")` on `app/(main)/saved-jobs/page.tsx` to ensure filter actions target the correct slice of state without filter collision.

---

## 7. Resume Markdown AST Specification (`lib/resume-parser.ts`)

AI agents creating or modifying resume tools must adhere to this markdown format:

```markdown
# [Candidate Full Name]
**[Professional Title]**
[Phone] | [Email] | [LinkedIn Profile URL] | [GitHub URL] | [City, State]

## Professional Summary
- [Bullet 1 summarizing core value proposition]
- [Bullet 2 highlighting technical scope]

## Technical Skills
- **Languages:** TypeScript, JavaScript, Python, Go, SQL
- **Frameworks:** React, Next.js, Node.js, Express, Tailwind CSS
- **Databases & Cloud:** PostgreSQL, Redis, AWS, Docker

## Professional Experience
### [Job Title] | [Company Name] | [City, State] | [Start Date – End Date]
- [Action verb] [what was accomplished] resulting in [quantifiable metric].
- Engineered [system] utilizing [technologies] to enhance performance by [percentage].

## Technical Projects
### [Project Title] | [Key Technologies] | [Dates or Link]
- Built [project details] with [features] handling [load or traffic].

## Education
**[University / Institution Name]** — [City, State]
*[Degree Name]* | [Graduation Year]
**Relevant Coursework: [Course 1, Course 2, Course 3]**
```

---

## 8. Code Generation Recipes for AI Agents

### Recipe 1: Adding a New Field to `jobs`
1. Update `lib/db/schema/jobs.ts`:
   ```typescript
   export const jobs = pgTable("jobs", {
     // ...existing
     isFeatured: boolean("is_featured").default(false).notNull(),
   });
   ```
2. Update TypeScript interface `types/job.ts`:
   ```typescript
   export interface Job {
     // ...existing
     isFeatured?: boolean;
   }
   ```
3. Update API mapping in `app/api/jobs/route.ts` and `app/api/jobs/saved/route.ts`:
   ```typescript
   isFeatured: row.isFeatured,
   ```
4. If filterable, update `buildJobFilterConditions()` in `lib/db/job-filters.ts`.

### Recipe 2: Creating an Authenticated API Endpoint
```typescript
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { db } from "@/lib/db";

export async function POST(req: Request) {
  try {
    const sessionRes = await auth.getSession();
    const user = (sessionRes as any)?.user || (sessionRes as any)?.data?.user;
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const userId = user.id; // neon_auth.users.id text

    // Perform database operations using db and schema
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("API error:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
```

---

## 9. Non-Negotiable Anti-Patterns & AI Guardrails

1. **DO NOT** use `params.id` synchronously in Next.js 16 App Router route handlers. Always `await params`.
2. **DO NOT** query database tables using raw table names or unchecked string interpolations. Always use Drizzle schema exports (`jobs`, `savedJobs`, `userProfiles`, `countries`).
3. **DO NOT** import `@/data/jobs` in production API routes. Production data must be queried dynamically via `db.select().from(jobs)`.
4. **DO NOT** write arbitrary colors (e.g. `#10b981`, `#6366f1`) in UI components. Use existing Tailwind design tokens (`brand-lime`, `brand-dark`, `border-border-color`).
5. **DO NOT** bypass `buildJobFilterConditions()` when creating job search or export endpoints. Filter logic must remain synchronized.
6. **DO NOT** mutate Zustand state directly. Always use the defined action setters.
