# Strawberry Jobs — Architecture & Database Comprehensive Handbook

> **Target Audience:** Engineers, Architects, Technical Leads, and System Maintainers  
> **Repository:** `geeth-chand/strawberryjobs` (`my-app`)  
> **Stack:** Next.js 16.3 (App Router), React 19.2, TypeScript 5, Tailwind CSS v4, Drizzle ORM, Neon Serverless PostgreSQL, Neon Auth, TanStack Query v5, Zustand v5  
> **Last Updated:** September 2026

---

## 1. Executive Summary & System Overview

**Strawberry Jobs** (also identified as **Joberry**) is a high-performance talent discovery platform and automated job-hunting SaaS. The system bridges public candidates with curated opportunities across technical, product, design, and growth domains, while providing an authenticated **Job Hunt** control center that enables bookmark management, application lifecycle tracking, and an automated Markdown-to-Typst resume compilation engine.

### Core System Objectives
1. **Zero-Latency Talent Discovery:** Deliver sub-50ms search and multi-dimensional filtering across tens of thousands of job roles using a serverless PostgreSQL database with optimized indexes.
2. **Dual-Mode Candidate Interface:** Provide both a traditional 3-column macroscopic job board and an interactive split-view (collapsible list + sticky job description panel) that eliminates page thrashing.
3. **Automated Application Workflows:** Allow users to track application milestones (Applied, Interviewing, Offer) and curate custom job partitions.
4. **Dynamic Typst Resume Pipeline:** Parse candidate resumes to and from structured Markdown contracts and compile them into publication-grade PDFs via a dedicated Typst compiler pipeline.

---

## 2. High-Level Architecture Diagram

```mermaid
flowchart TB
    subgraph Client ["Client Layer (Browser)"]
        UI["React 19 / Next.js 16 Frontend"]
        Z_JOB["Zustand Store: useJobStore<br/>(Filters, JD Panel, Modals, Saved IDs)"]
        Z_RESUME["Zustand Store: useResumeStore<br/>(Markdown, Typst Templates)"]
        RQ["TanStack React Query Cache<br/>(staleTime: 5min, keepPreviousData)"]
        AUTH_CLIENT["@neondatabase/auth/next Client"]
    end

    subgraph Edge ["Next.js App Router (Server / Serverless)"]
        RSC["React Server Components & SSR"]
        PROXY["Auth Catch-All Route<br/>(/api/auth/[...path])"]
        API_JOBS["Jobs API Route<br/>(/api/jobs, /api/jobs/[id]/save, /api/jobs/saved)"]
        API_LOC["Locations API Route<br/>(/api/locations)"]
        API_RESUME["Resume Payload API<br/>(/api/resume/payload)"]
        AUTH_SERVER["@neondatabase/auth Server SDK<br/>(Session Verification)"]
    end

    subgraph DataLayer ["Data & Storage Layer"]
        subgraph NeonDB ["Neon Serverless PostgreSQL"]
            SCHEMA_PUBLIC["public schema<br/>(jobs, skills, job_skills, saved_jobs, countries, user_profiles, resumes, applications, match_results)"]
            SCHEMA_AUTH["neon_auth schema<br/>(users, sessions, email_otps)"]
        end
        LOCAL_PAYLOAD["data/resume-compile-payload.json<br/>(Typst Compiler Bridge)"]
    end

    subgraph External ["External Microservices"]
        TYPST["Typst Resume Microservice<br/>(PDF Compilation & Export)"]
    end

    UI --> Z_JOB
    UI --> Z_RESUME
    UI --> RQ
    AUTH_CLIENT --> PROXY
    RQ --> API_JOBS
    RQ --> API_LOC
    Z_RESUME --> API_RESUME

    PROXY --> SCHEMA_AUTH
    API_JOBS --> AUTH_SERVER
    AUTH_SERVER --> SCHEMA_AUTH
    API_JOBS --> SCHEMA_PUBLIC
    API_LOC --> SCHEMA_PUBLIC
    API_RESUME --> LOCAL_PAYLOAD
    LOCAL_PAYLOAD -.-> TYPST
```

---

## 3. Database Architecture & Schema Deep Dive

The persistent layer is powered by **PostgreSQL on Neon Serverless**, accessed via **Drizzle ORM** with `node-postgres` pooling managed specifically for serverless lifecycles using `@vercel/functions/attachDatabasePool`.

### 3.1. Connection Management (`lib/db.ts`)
Neon's autoscaling serverless architecture requires robust connection lifecycle management to avoid connection exhaustion during high concurrency:
- **Pool Max Connections:** 10 connections per serverless container.
- **SSL Configuration:** `{ rejectUnauthorized: false }` for development and serverless compatibility.
- **Vercel Fluid Compute Integration:** `attachDatabasePool(pool)` gracefully suspends and drains connections across serverless cold starts and scale-to-zero periods.

---

### 3.2. Entity Relationship Diagram (ERD)

```mermaid
erDiagram
    NEON_AUTH_USERS ||--o| USER_PROFILES : "has profile"
    NEON_AUTH_USERS ||--o{ SAVED_JOBS : "bookmarks"
    NEON_AUTH_USERS ||--o{ RESUMES : "owns"
    NEON_AUTH_USERS ||--o{ APPLICATIONS : "submits"
    
    COUNTRIES ||--o{ JOBS : "hosts"
    
    JOBS ||--o{ JOB_SKILLS : "demands"
    SKILLS ||--o{ JOB_SKILLS : "classified in"
    
    JOBS ||--o{ SAVED_JOBS : "saved in"
    JOBS ||--o{ APPLICATIONS : "receives"
    
    RESUMES ||--o{ APPLICATIONS : "attached to"
    APPLICATIONS ||--o{ MATCH_RESULTS : "analyzed by"

    NEON_AUTH_USERS {
        text id PK "Managed by Neon Auth"
        text email "User primary email"
    }

    USER_PROFILES {
        text user_id PK "FK -> neon_auth.users.id"
        text full_name
        text phone_number
        text location
        text bio
        text linkedin_url
        text github_url
        text portfolio_url
        timestamptz created_at
        timestamptz updated_at
    }

    COUNTRIES {
        uuid id PK "gen_random_uuid()"
        text name UK "e.g. United States"
        text code UK "e.g. US"
        timestamptz created_at
    }

    JOBS {
        uuid id PK "gen_random_uuid()"
        text source_service "Source dept/service or recruiter ID"
        text job_role_title "Standardized job title"
        text job_description "Full job description text"
        text company_name "Hiring organization"
        text location "City, State or Region"
        uuid country_id FK "References countries.id"
        text employment_type "full_time | part_time | contract | freelance | internship"
        text work_model "remote | on_site | hybrid"
        integer salary_min "Annual/Base min compensation"
        integer salary_max "Annual/Base max compensation"
        text currency "USD | GBP | INR"
        text status "draft | published | closed | archived"
        boolean is_external "External application flag"
        text external_apply_url "Direct application destination"
        jsonb requirements "Array of text requirements"
        text job_source "Source board (LinkedIn, Indeed, etc.)"
        integer experience_required "Required years"
        boolean visa_sponsorship "True if sponsored"
        timestamptz created_at
        timestamptz updated_at
        timestamptz published_at
    }

    SKILLS {
        uuid id PK "gen_random_uuid()"
        text name UK "Unique skill name"
        text category "programming_language | framework | database | etc."
        timestamptz created_at
    }

    JOB_SKILLS {
        uuid job_id FK "CASCADE -> jobs.id"
        uuid skill_id FK "CASCADE -> skills.id"
        boolean is_core_skill "Must-have vs nice-to-have"
    }

    SAVED_JOBS {
        uuid id PK "gen_random_uuid()"
        text user_id "FK -> neon_auth.users.id"
        uuid job_id FK "CASCADE -> jobs.id"
        timestamptz created_at
    }

    RESUMES {
        uuid id PK "gen_random_uuid()"
        text user_id "FK -> neon_auth.users.id"
        text title "Resume identifier"
        boolean is_primary "Default candidate resume"
        text content "Raw markdown or text"
        jsonb parsed_data "Structured AST data"
        text file_url "S3/Blob storage link"
        timestamptz created_at
        timestamptz updated_at
    }

    APPLICATIONS {
        uuid id PK "gen_random_uuid()"
        text user_id "FK -> neon_auth.users.id"
        uuid job_id FK "CASCADE -> jobs.id"
        uuid resume_id FK "SET NULL -> resumes.id"
        text status "applied | screening | assessment | interview | offer | hired | rejected | withdrawn"
        text notes "Candidate personal notes"
        real match_score "0-100 match percentage"
        timestamptz applied_at
        timestamptz updated_at
    }

    MATCH_RESULTS {
        uuid id PK "gen_random_uuid()"
        uuid application_id FK "CASCADE -> applications.id"
        real overall_score "Aggregate match score"
        real skill_score "Skills overlap score"
        real experience_score "Seniority match"
        real education_score "Degree match"
        jsonb explanation "AI matching rationale"
        jsonb missing_skills "Identified skill gaps"
        jsonb matched_skills "Matched competencies"
        timestamptz computed_at
    }
```

---

### 3.3. Detailed Table Specifications

#### 1. `jobs` Table (`lib/db/schema/jobs.ts`)
The centerpiece of the platform containing all public and curated job opportunities.

| Column | Data Type | Constraints | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | Primary Key, NOT NULL | `gen_random_uuid()` | Unique job identifier. |
| `source_service` | `text` | Nullable | `NULL` | Department identifier, ingestion pipeline ID, or recruiter ID (historically `recruiter_id`). |
| `job_role_title` | `text` | NOT NULL | — | Official title (e.g., "Senior Frontend Engineer"). |
| `job_description` | `text` | NOT NULL | — | Full job description text, requirements, and benefits. |
| `company_name` | `text` | NOT NULL | — | Legal or trading name of the hiring entity. |
| `location` | `text` | NOT NULL | — | City and State/Region (e.g., "San Francisco, CA"). |
| `country_id` | `uuid` | Foreign Key (`countries.id`) | `NULL` | Relational reference to geographic country. |
| `employment_type` | `text` | NOT NULL | — | Enum: `'full_time'`, `'part_time'`, `'contract'`, `'freelance'`, `'internship'`. |
| `work_model` | `text` | NOT NULL | — | Enum: `'remote'`, `'on_site'`, `'hybrid'`. |
| `salary_min` | `integer` | Nullable | `NULL` | Minimum salary bound in units of currency. |
| `salary_max` | `integer` | Nullable | `NULL` | Maximum salary bound in units of currency. |
| `currency` | `text` | Nullable | `'USD'` | ISO currency code (`'USD'`, `'GBP'`, `'INR'`). |
| `status` | `text` | NOT NULL | `'draft'` | Enum: `'draft'`, `'published'`, `'closed'`, `'archived'`. |
| `is_external` | `boolean` | NOT NULL | `true` | When `true`, apply button routes to `external_apply_url`. |
| `external_apply_url` | `text` | Nullable | `'https://google.com'` | Target URL for external job application submissions. |
| `requirements` | `jsonb` | NOT NULL | `'[]'::jsonb` | JSON array of prerequisite bullet points. |
| `job_source` | `text` | Nullable | `NULL` | Aggregator name (e.g., `'LinkedIn'`, `'Greenhouse'`). |
| `experience_required` | `integer` | Nullable | `NULL` | Minimum integer years of experience required. |
| `visaSponsorship` | `boolean` | NOT NULL | `false` | Whether the employer sponsors work permits/visas. |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Record creation timestamp. |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | Last modification timestamp. |
| `published_at` | `timestamptz` | Nullable | `NULL` | Timestamp when status transitioned to `'published'`. |

---

#### 2. `countries` Table (`lib/db/schema/countries.ts`)
Stores canonical jurisdictions used by the header country selector and location-filtered searches.

| Column | Data Type | Constraints | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | Primary Key, NOT NULL | `gen_random_uuid()` | Unique country ID. |
| `name` | `text` | NOT NULL, UNIQUE | — | Full name (e.g., `'United States'`, `'United Kingdom'`, `'India'`). |
| `code` | `text` | NOT NULL, UNIQUE | — | 2-letter ISO code (e.g., `'US'`, `'UK'`, `'IN'`). |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Insertion timestamp. |

---

#### 3. `skills` & `job_skills` Tables (`lib/db/schema/jobs.ts`)
Implements the many-to-many taxonomy between job listings and technical competencies.

**`skills` Table:**
- `id`: `uuid` PK default `gen_random_uuid()`.
- `name`: `text` UNIQUE NOT NULL (e.g., `'React'`, `'TypeScript'`, `'PostgreSQL'`).
- `category`: `text` NOT NULL, default `'other'`. Enum: `'programming_language'`, `'framework'`, `'library'`, `'database'`, `'cloud'`, `'devops'`, `'tool'`, `'soft_skill'`, `'domain'`, `'other'`.
- `created_at`: `timestamptz` NOT NULL default `now()`.

**`job_skills` Junction Table:**
- `job_id`: `uuid` NOT NULL references `jobs.id` ON DELETE CASCADE.
- `skill_id`: `uuid` NOT NULL references `skills.id` ON DELETE CASCADE.
- `is_core_skill`: `boolean` NOT NULL default `false` (Differentiates non-negotiable requirements from nice-to-haves).

---

#### 4. `saved_jobs` Table (`lib/db/schema/jobs.ts`)
Tracks bookmarks created by authenticated users.

| Column | Data Type | Constraints | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | Primary Key, NOT NULL | `gen_random_uuid()` | Unique bookmark record ID. |
| `user_id` | `text` | NOT NULL | — | User ID matching `neon_auth.users.id`. |
| `job_id` | `uuid` | NOT NULL, FK `jobs.id` ON DELETE CASCADE | — | Target job listing ID. |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Bookmark creation timestamp. |

**Indexes:**
- `idx_saved_jobs_user_id`: B-Tree index on `user_id` for fast candidate bookmark lookups.
- `idx_unique_user_job_save`: Composite **UNIQUE** index on `(user_id, job_id)` preventing duplicate bookmarks.

---

#### 5. `user_profiles` Table (`lib/db/schema/users.ts`)
Stores extended user profile information linked directly to Neon Auth's identity management.

| Column | Data Type | Constraints | Default | Description |
|---|---|---|---|---|
| `user_id` | `text` | Primary Key, NOT NULL | — | Links directly to `neon_auth.users.id`. |
| `full_name` | `text` | Nullable | `NULL` | Candidate display name. |
| `phone_number` | `text` | Nullable | `NULL` | Candidate phone number. |
| `location` | `text` | Nullable | `NULL` | Candidate primary residence / city. |
| `bio` | `text` | Nullable | `NULL` | Summary biography. |
| `linkedin_url` | `text` | Nullable | `NULL` | Professional LinkedIn profile URL. |
| `github_url` | `text` | Nullable | `NULL` | Open source GitHub profile URL. |
| `portfolio_url` | `text` | Nullable | `NULL` | Personal website or portfolio URL. |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Profile creation timestamp. |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | Profile last updated timestamp. |

**Indexes:**
- `idx_user_profiles_user_id`: B-Tree index on `user_id`.

---

#### 6. `resumes`, `applications`, & `match_results` Tables (`lib/db/schema/applications.ts`)

**`resumes` Table:**
- `id`: `uuid` PK default `gen_random_uuid()`.
- `user_id`: `text` NOT NULL (links to `neon_auth.users.id`).
- `title`: `text` NOT NULL (e.g., `'Fullstack Engineer Resume 2026'`).
- `is_primary`: `boolean` NOT NULL default `false`.
- `content`: `text` nullable (raw Markdown or unstructured text).
- `parsed_data`: `jsonb` default `'{}'::jsonb` (structured resume AST with personalInfo, experience, skills, education).
- `file_url`: `text` nullable (S3 / Blob CDN link to compiled PDF).
- `created_at` / `updated_at`: `timestamptz` default `now()`.

**`applications` Table:**
- `id`: `uuid` PK default `gen_random_uuid()`.
- `user_id`: `text` NOT NULL.
- `job_id`: `uuid` NOT NULL references `jobs.id` ON DELETE CASCADE.
- `resume_id`: `uuid` nullable references `resumes.id` ON DELETE SET NULL.
- `status`: `text` NOT NULL default `'applied'`. Enum: `'applied'`, `'screening'`, `'assessment'`, `'interview'`, `'offer'`, `'hired'`, `'rejected'`, `'withdrawn'`.
- `notes`: `text` nullable (user notes regarding salary expectations, recruiter calls, etc.).
- `match_score`: `real` nullable (percentage match 0.0 to 100.0).
- `applied_at` / `updated_at`: `timestamptz` default `now()`.

**`match_results` Table:**
- `id`: `uuid` PK default `gen_random_uuid()`.
- `application_id`: `uuid` NOT NULL references `applications.id` ON DELETE CASCADE.
- `overall_score`: `real` NOT NULL (composite fit score).
- `skill_score`, `experience_score`, `education_score`: `real` nullable sub-scores.
- `explanation`: `jsonb` NOT NULL default `'{}'::jsonb`.
- `missing_skills`: `jsonb` NOT NULL default `'[]'::jsonb` (skills found in JD but absent in resume).
- `matched_skills`: `jsonb` NOT NULL default `'[]'::jsonb` (overlapping competencies).
- `computed_at`: `timestamptz` NOT NULL default `now()`.

---

## 4. Application Architecture & File Topology

```
my-app/
├── app/
│   ├── (auth)/                          # Route group with standalone minimal layout
│   │   ├── auth/page.tsx                # Unified auth entry (OTP carousel)
│   │   ├── login/page.tsx               # Login page wrapper
│   │   ├── signup/page.tsx              # Signup page wrapper
│   │   └── layout.tsx                   # Auth chrome layout
│   ├── (main)/                          # Route group with primary navigation & footer
│   │   ├── page.tsx                     # Job Board (Search, Filters, Grid & Split-View)
│   │   ├── saved-jobs/page.tsx          # Saved Jobs portal with filtered search
│   │   ├── job-hunt/                    # Job Hunt subsystem
│   │   │   ├── page.tsx                 # Curated Jobs with "Jobs" vs "Requested" sub-tabs
│   │   │   ├── applications/page.tsx    # Application tracker & stage progression
│   │   │   ├── manage/page.tsx          # Preference configuration & resume manager
│   │   │   └── layout.tsx               # Job Hunt sub-layout with left sidebar
│   │   └── layout.tsx                   # Main layout (Header, Footer, ApplyModal)
│   ├── api/
│   │   ├── auth/[...path]/route.ts      # Neon Auth catch-all endpoint handler
│   │   ├── jobs/
│   │   │   ├── route.ts                 # GET: Full dynamic filtering & paginated query
│   │   │   ├── [id]/save/route.ts       # POST/DELETE: Save & unsave job bookmarks
│   │   │   └── saved/
│   │   │       ├── route.ts             # GET: Filtered saved jobs for authenticated user
│   │   │       └── ids/route.ts         # GET: Lightweight array of saved job IDs
│   │   ├── locations/route.ts           # GET: Country list with live job counters
│   │   └── resume/payload/route.ts      # GET/POST: Local Typst resume payload file exchange
│   ├── layout.tsx                       # Root layout (Fonts, Providers, Toaster)
│   └── globals.css                      # Tailwind v4 theme variables & Neo-Minimalist tokens
├── components/
│   ├── Header.tsx                       # Navigation bar, sliding pill tabs, theme & auth
│   ├── SearchFilterBar.tsx              # Debounced search input, quick filters, modal trigger
│   ├── FiltersModal.tsx                 # Comprehensive modal with seniority, salary, work mode
│   ├── JobGrid.tsx                      # Dynamic grid rendering cards in standard or split-view
│   ├── JobCard.tsx                      # Interactive job card with bookmark & apply triggers
│   ├── JobDescriptionPanel.tsx          # Desktop sticky side panel & mobile drawer for JDs
│   ├── Pagination.tsx                   # Compact or standard dual pagination bar
│   ├── LocationDropdown.tsx             # Region selector with SVG country flags
│   ├── SavedJobsHydrator.tsx            # Background sync of saved IDs into Zustand
│   ├── LocationHydrator.tsx             # Cookie-backed location synchronization
│   └── auth/AuthContainer.tsx           # Email + 6-digit OTP verification carousel
├── lib/
│   ├── db.ts                            # Postgres Pool & Drizzle ORM client initialization
│   ├── db/schema/                       # Drizzle schema modules (jobs, users, applications, countries)
│   ├── db/job-filters.ts                # Abstract SQL WHERE clause builder for jobs
│   ├── auth/server.ts                   # createNeonAuth server instance
│   ├── auth/client.ts                   # createAuthClient client instance
│   ├── constants/filters.ts             # Filter options (DOMAINS, JOB_TYPES, SENIORITY, etc.)
│   ├── resume-parser.ts                 # Markdown AST parser and serializer
│   └── resumeApi.ts                     # Local payload fetch/save & PDF helpers
├── store/
│   ├── useJobStore.ts                   # Zustand store (Filters, JD Panel, Bookmarks)
│   └── useResumeStore.ts                # Zustand store (Markdown AST, Typst templates)
└── data/
    ├── jobs.ts                          # Static fallback & sample jobs dataset
    ├── resume-templates.ts              # Typst template metadata and themes
    └── sample-resume.ts                 # Reference Markdown resume string
```

---

## 5. Core Architectural Workflows

### 5.1. Job Search & Dynamic Filtering Flow

```mermaid
sequenceDiagram
    autonumber
    actor User as Candidate
    participant Store as Zustand (useJobStore)
    participant RQ as TanStack Query
    participant API as /api/jobs
    participant FilterEngine as buildJobFilterConditions
    participant DB as Neon PostgreSQL (Drizzle)

    User->>Store: Types keyword or clicks filter pill
    Store->>Store: Update filter state (resets page to 1)
    Store->>RQ: Query Key invalidated with debounced term (400ms)
    RQ->>API: GET /api/jobs?keyword=...&location=...&page=1&limit=12
    API->>FilterEngine: Parse URLSearchParams
    FilterEngine-->>API: Return SQL[] conditions (status = 'published', ilike, gte)
    API->>DB: COUNT(*) FROM jobs LEFT JOIN countries WHERE ...
    API->>DB: SELECT jobs.*, countries.name FROM jobs ... ORDER BY created_at DESC LIMIT 12 OFFSET 0
    DB-->>API: Total count + 12 job records
    API->>API: Map database records to canonical Job interface
    API-->>RQ: JobsResponse { jobs, total, page, totalPages, hasNextPage }
    RQ-->>User: Re-render JobGrid with smooth transition
```

#### SQL Filter Building Mechanics (`lib/db/job-filters.ts`)
The filtering engine translates frontend URL parameters into composable Drizzle SQL expressions:
1. **Status Gate:** Always enqueues `eq(jobs.status, 'published')` to prevent leaking drafts or archived roles.
2. **Keyword Search:** Uses `or(ilike(jobs.jobRoleTitle, '%${keyword}%'), ilike(jobs.companyName, '%${keyword}%'))`.
3. **Geographic Filtering:** Joins `countries` and checks `ilike(countries.name, '%${location}%')`.
4. **Seniority & Category Matching:** Evaluates `ilike` substrings across title and description.
5. **Salary Floor:** Evaluates `gte(jobs.salaryMin, minSalary)`.
6. **Time Horizon:** Calculates UTC cutoff from `postedTime` (`1h`, `12h`, `24h`, `7d`) and enforces `gte(jobs.createdAt, thresholdDate)`.

---

### 5.2. Bookmark / Saved Job Synchronization Flow

```mermaid
sequenceDiagram
    autonumber
    actor User as Candidate
    participant Store as Zustand (useJobStore)
    participant API as /api/jobs/[id]/save
    participant DB as Neon PostgreSQL (saved_jobs)

    User->>Store: Clicks bookmark button on JobCard
    Store->>Store: Optimistic toggle in savedJobIds[]
    Store->>API: POST /api/jobs/:id/save (or DELETE)
    API->>API: auth.getSession() -> Verify JWT
    alt Authorized
        API->>DB: INSERT INTO saved_jobs (user_id, job_id)
        DB-->>API: Success
        API-->>Store: 200 OK { isSaved: true }
    else Unauthorized
        API-->>Store: 401 Unauthorized
        Store->>Store: Rollback savedJobIds[] to previous state
        Store-->>User: Prompt Sign In Modal / Toast notification
    end
```

---

### 5.3. Split-View vs. Grid Layout Mechanics

The platform features a responsive **split-view** when inspecting job descriptions:
- **Default State:** A balanced 3-column card grid (`JobGrid`).
- **Inspection State:** Clicking any job card triggers `openJd(job)`, altering the page layout without a full-page route reload:
  * **Desktop (`lg:` breakpoint and above):** The grid collapses into a compact left-hand single-column list (`w-[440px]`) with dedicated compact pagination, while the right-hand container expands into a sticky `JobDescriptionPanel` anchored at `top-[5.25rem]`.
  * **Mobile / Tablet:** An accessible modal drawer animates from the bottom with a dimmed backdrop overlay (`z-50`).
  * **Intelligent Auto-Scroll:** When the side panel opens, a 50ms layout calculation aligns the top of the selected card with the top of the sticky side panel, smoothly scrolling past redundant search bars.

---

### 5.4. Typst Resume Processing Pipeline

Strawberry Jobs includes a complete WYSIWYG resume creation and compilation subsystem:
1. **Markdown AST Contract (`lib/resume-parser.ts`):** Parses raw Markdown into an in-memory object model (`PersonalInfo`, `SkillCategory[]`, `ExperienceItem[]`, `ProjectItem[]`, `EducationItem[]`) adhering to strict markdown delimiters (`# Name`, `**Role**`, `### Role | Company | Location | Dates`).
2. **Serialization:** Re-serializes the data model back to compliant Markdown whenever edited in the form-based manager.
3. **Payload Exchange (`/api/resume/payload`):** Writes the active Markdown, chosen Typst theme (ID 1–8), and template configuration to `data/resume-compile-payload.json`.
4. **Typst Microservice Interop:** External compiler daemons poll or receive this JSON payload to generate pixel-perfect vector PDFs matching the web preview.

---

## 6. Authentication & Session Architecture

Authentication is powered by **Neon Auth** with an passwordless Email OTP flow:
- **Client Initialization:** `createAuthClient()` from `@neondatabase/auth/next`.
- **Server Verification:** `createNeonAuth()` configured with `NEON_AUTH_BASE_URL` and `NEON_AUTH_COOKIE_SECRET`.
- **Catch-All Handler:** `app/api/auth/[...path]/route.ts` proxies incoming verification tokens and sessions directly to Neon's auth endpoints.
- **Client Session Hook:** Components access user identity via `authClient.useSession()`.
- **Hydration:**
  * `SavedJobsHydrator` watches the active session. When a user authenticates, it fetches `/api/jobs/saved/ids` and populates `useJobStore.savedJobIds` in one non-blocking pass.
  * `LocationHydrator` reads the `user-location` cookie on client mount and ensures the candidate's country preference persists across refreshes.

---

## 7. State Management Philosophy

Strawberry Jobs enforces a strict separation between **Server Cache** and **Client UI State**:

| Layer | Tool | Responsibilities |
|---|---|---|
| **Server State** | **TanStack React Query v5** | API response caching, automatic background re-validation, query de-duplication, paginated `keepPreviousData` retention during page transitions. |
| **Client UI State** | **Zustand v5 (`useJobStore`)** | Active search query, modal open/close states, active job description selection, optimistic bookmark array, filter pill toggles. |
| **Resume State** | **Zustand v5 (`useResumeStore`)** | Active Typst template ID, theme ID, raw resume Markdown, local storage synchronization, compilation status. |
| **Session State** | **Neon Auth SDK** | Encrypted JWT cookies, user ID, email verification state. |
| **Persistent Preferences** | **Browser Cookies & LocalStorage** | `user-location` cookie (365-day expiry), `strawberry_resume_markdown`, `strawberry_resume_template_id`. |

---

## 8. Developer Runbook & Operations

### 8.1. Environment Variables (`.env.local`)
```env
# Neon Serverless Postgres Connection Strings
DATABASE_URL="postgresql://user:password@ep-sample-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require"
DIRECT_URL="postgresql://user:password@ep-sample.us-east-2.aws.neon.tech/neondb?sslmode=require"

# Neon Auth Configuration
NEON_AUTH_BASE_URL="https://auth.neon.tech/api/v1/..."
NEON_AUTH_COOKIE_SECRET="your-high-entropy-cookie-secret-key-at-least-32-chars"
```

### 8.2. Database Scripts & Commands
All database maintenance scripts run via `tsx` from the project root:

```bash
# Seed initial taxonomy (countries, core skills, and sample jobs)
npx tsx scripts/seed.ts

# Bulk-seed 50 realistic international jobs across US, UK, and India
npx tsx scripts/seed-50-jobs.ts

# Completely wipe and truncate all tables (resets DB to clean slate)
npx tsx scripts/clear.ts

# Generate new Drizzle migrations after schema changes in lib/db/schema/*
npx drizzle-kit generate

# Push Drizzle schema directly to Neon database
npx drizzle-kit push
```

### 8.3. Core Invariants to Maintain
1. **Next.js 16 Dynamic Parameters:** In Next.js 16 App Router, route params are Promises. Always write `const resolvedParams = await params;` before reading `id`.
2. **Database Column Casing:** The PostgreSQL database utilizes snake_case (`job_role_title`, `source_service`), while Drizzle schema fields use camelCase (`jobRoleTitle`, `sourceService`). Never mix these in raw queries.
3. **Connection Pooling:** Always export database queries through `@/lib/db`, which attaches the pool lifecycle to Vercel Fluid Compute.
4. **Tailwind v4 Token Usage:** Do not inject raw arbitrary colors. Use brand tokens (`bg-brand-lime`, `bg-brand-dark`, `border-border-color`, `text-text-primary`).
