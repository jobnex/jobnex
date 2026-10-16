# Direct Next.js to Database: Job Matching Engine

This package contains the **pure Direct Next.js to Database** implementation of the Job Matching Engine. It connects Next.js directly to Neon Serverless PostgreSQL without requiring any external microservices, Docker containers, or Cloud Run infrastructure.

---

## Package Directory Structure

```
job-matching-resources/
├── README.md                                          # This guide
│
├── docs/
│   └── DIRECT_NEXTJS_TO_DB_IMPLEMENTATION_PLAN.md   # Architectural & Implementation Guide
│
├── sql/
│   ├── matching_query.sql                           # Production parameterized ($1..$6) multi-tier matching SQL
│   └── schema_and_indexes.sql                       # PostgreSQL DDL for extensions & performance indexes
│
├── direct-nextjs/                                   # Clean Next.js App Router drop-in files
│   ├── app/
│   │   └── api/
│   │       └── jobs/
│   │           └── matched/
│   │               └── route.ts                      # Direct GET & POST route with OWASP IDOR & clamping
│   ├── lib/
│   │   ├── db.ts                                     # Pooled pg connection with @vercel/functions
│   │   ├── job-utils.ts                              # Salary & job type formatting utilities
│   │   └── db/
│   │       └── job-preference-matching.ts            # Core matching engine, cursor encoder & country cache
│   └── types/
│       └── job.ts                                    # Canonical TypeScript interfaces
│
└── test-scripts/
    ├── test_direct_query.mjs                        # Direct PostgreSQL query verification script
    └── test_matching_endpoint.mjs                   # API route verification test (GET & POST)
```

---

## 3-Step Setup

### Step 1: Copy Direct Next.js Files
Copy the contents of `direct-nextjs/` into your Next.js project:
- `direct-nextjs/app/api/jobs/matched/route.ts` -> `app/api/jobs/matched/route.ts`
- `direct-nextjs/lib/db.ts` -> `lib/db.ts`
- `direct-nextjs/lib/db/job-preference-matching.ts` -> `lib/db/job-preference-matching.ts`
- `direct-nextjs/lib/job-utils.ts` -> `lib/job-utils.ts`
- `direct-nextjs/types/job.ts` -> `types/job.ts`

### Step 2: Ensure PostgreSQL Indexes
Run `sql/schema_and_indexes.sql` against your Neon database to ensure all required indexes (`idx_jobs_published_at_id_partial`, `idx_jobs_job_role_title_trgm`, etc.) are active.

### Step 3: Configure Database URL
Ensure `DATABASE_URL` in `.env.local` uses the **pooled** connection string (`-pooler` in the hostname):
```env
DATABASE_URL="postgresql://neondb_owner:PASSWORD@ep-xxx-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require"
```

---

## Key Features & Security
- **Zero Cloud Microservices:** Pure direct connection from Next.js serverless route to PostgreSQL.
- **OWASP API1 (IDOR Prevention):** Locks candidate lookups strictly to `getCurrentUser()` session.
- **OWASP API4 (Resource Clamping):** Clamps pagination limits to `[1, 50]`; caps payload sizes to 100kb.
- **OWASP API7 (Injection Neutralization):** 100% Parameterized queries (`$1`..`$6`) with regex metacharacter escaping.
- **Keyset Cursor Pagination:** Sub-150ms infinite scroll with deterministic `(published_at, id)` tuple paging.
