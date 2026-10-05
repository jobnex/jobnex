# Direct Next.js to Database Implementation Plan & Security Architecture

> **Target Framework:** Next.js App Router (Serverless / Node.js Runtime)  
> **Database:** Neon Serverless PostgreSQL (`public.jobs` catalog of 132,000+ indexed requisitions)  
> **Architecture Pattern:** Pure Direct Next.js to Database (Zero Microservices / Zero External Cloud Compute)  
> **Target Performance SLA:** Sub-800ms cold query, Sub-150ms warm query  

---

## Table of Contents
1. [Architecture Overview: Direct Next.js to Database](#1-architecture-overview-direct-nextjs-to-database)
2. [Serverless Database Connection Management](#2-serverless-database-connection-management)
   - [Neon Connection Pooler Setup (`-pooler`)](#21-neon-connection-pooler-setup--pooler)
   - [Vercel Functions Pool Attachment](#22-vercel-functions-pool-attachment)
   - [Pool Sizing, Idle Timeouts & Query Statement Ceiling](#23-pool-sizing-idle-timeouts--query-statement-ceiling)
3. [OWASP API Top 10 Security Hardening](#3-owasp-api-top-10-security-hardening)
   - [OWASP API1:2023 - Session-Locked IDOR Prevention](#31-owasp-api12023---session-locked-idor-prevention)
   - [OWASP API3:2023 - Object Property Level Authorization & Input Whitelisting](#32-owasp-api32023---object-property-level-authorization--input-whitelisting)
   - [OWASP API4:2023 - Unrestricted Resource Consumption & Clamping](#33-owasp-api42023---unrestricted-resource-consumption--clamping)
   - [OWASP API7:2023 - Server-Side Injection & Regex Neutralization](#34-owasp-api72023---server-side-injection--regex-neutralization)
   - [OWASP API8:2023 - Automated Threats & Rate Limiting](#35-owasp-api82023---automated-threats--rate-limiting)
   - [OWASP API10:2023 - Production Error Masking](#36-owasp-api102023---production-error-masking)
4. [Database Schema, Indexes & Query Optimizations](#4-database-schema-indexes--query-optimizations)
   - [PostgreSQL Extensions (`uuid-ossp`, `pg_trgm`)](#41-postgresql-extensions)
   - [Production Index Specifications](#42-production-index-specifications)
   - [Multi-Tier Hybrid Matching SQL Query](#43-multi-tier-hybrid-matching-sql-query)
5. [Direct Next.js App Router Code Implementation](#5-direct-nextjs-app-router-code-implementation)
   - [Database Connection Pool: `lib/db.ts`](#51-database-connection-pool-libdbts)
   - [Core Matching Engine: `lib/db/job-preference-matching.ts`](#52-core-matching-engine-libdbjob-preference-matchingts)
   - [Secure API Route Handler: `app/api/jobs/matched/route.ts`](#53-secure-api-route-handler-appapijobsmatchedroutets)
6. [High-Performance Keyset Pagination & Caching](#6-high-performance-keyset-pagination--caching)
   - [Deterministic Keyset Cursor Pagination](#61-deterministic-keyset-cursor-pagination)
   - [In-Memory Country UUID Cache](#62-in-memory-country-uuid-cache)
   - [Optional Next.js `unstable_cache` with Tag Revalidation](#63-optional-nextjs-unstable_cache-with-tag-revalidation)
7. [Step-by-Step Deployment & Verification Guide](#7-step-by-step-deployment--verification-guide)

---

## 1. Architecture Overview: Direct Next.js to Database

In this architecture, your Next.js application connects **directly to Neon PostgreSQL** through its built-in PgBouncer pooler. There are no intermediate microservices, no separate Docker containers, and no external cloud services (such as GCP Cloud Run) to maintain or pay for.

```
┌────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND UI                               │
│  - /job-hunt ("Curated For You" Tab)                                   │
│  - Dashboard Recommendations Widget                                    │
│  - Infinite Scroll / Keyset Cursor Paging                              │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
                     fetch('/api/jobs/matched')
                     (With session authentication)
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                  NEXT.JS SERVERLESS ROUTE HANDLER                      │
│  File: app/api/jobs/matched/route.ts                                   │
│  - Verifies candidate session via getCurrentUser() (OWASP API1 IDOR)   │
│  - Whitelists and sanitizes search parameters (OWASP API3)             │
│  - Clamps pagination limit to [1, 50] (OWASP API4)                     │
│  - Calls matchUserJobs() directly                                      │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                      DIRECT DATABASE EXECUTION                         │
│  File: lib/db/job-preference-matching.ts                               │
│  - Managed Connection Pool via lib/db.ts                               │
│  - In-process country cache (avoids redundant queries)                 │
│  - Executes 100% Parameterized Multi-Tier Query ($1..$6)               │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                 NEON SERVERLESS POSTGRESQL (132k JOBS)                 │
│  - PgBouncer Pooled Host (-pooler domain)                              │
│  - GIN Trigram Index (idx_jobs_job_role_title_trgm)                    │
│  - Composite B-Tree Index (idx_jobs_published_at_id_partial)           │
│  - Sub-150ms execution latency                                         │
└────────────────────────────────────────────────────────────────────────┘
```

### Benefits of Pure Direct Next.js to DB:
1. **Zero Infrastructure Cost:** Eliminates monthly cloud compute, container egress, and build minutes.
2. **Lowest Possible Network Latency:** Eliminates the extra network hop between Next.js and Cloud Run (saving 60ms-120ms per request).
3. **Single Codebase & Unified CI/CD:** Everything lives in your Next.js repository; a standard `git push` deploys everything.
4. **Sub-150ms Warm Query Latency:** Indexed PostgreSQL queries execute in under 150ms directly through Neon's connection pooler.

---

## 2. Serverless Database Connection Management

### 2.1 Neon Connection Pooler Setup (`-pooler`)

In a serverless environment (Vercel, AWS Lambda), multiple instances scale up during traffic spikes. If instances connect to PostgreSQL's direct compute port without pooling, they can quickly exhaust `max_connections`.

**Solution:** Always use Neon's **PgBouncer Pooled Connection String** in `DATABASE_URL`:
- Pooled Domain: contains `-pooler` in the hostname (e.g. `ep-xxx-pooler.us-east-1.aws.neon.tech`).
- Port: `5432` (or `6543`).

```env
# .env.local / Vercel Environment Variables
DATABASE_URL="postgresql://neondb_owner:PASSWORD@ep-delicate-water-a41q484m-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require"
DIRECT_URL="postgresql://neondb_owner:PASSWORD@ep-delicate-water-a41q484m.us-east-1.aws.neon.tech/neondb?sslmode=require"
```

### 2.2 Vercel Functions Pool Attachment

Use `@vercel/functions`'s `attachDatabasePool` in `lib/db.ts`. This registers the `pg.Pool` with Vercel's runtime to ensure connection sockets are suspended and thawed safely across Lambda lifecycles without leaking file descriptors:

```typescript
import { attachDatabasePool } from "@vercel/functions";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000,
});

try {
  attachDatabasePool(pool);
} catch {
  // Gracefully ignored outside Vercel
}
```

### 2.3 Pool Sizing, Idle Timeouts & Query Statement Ceiling

- **`max: 10`**: Sized per lambda instance to optimize query throughput while staying well below PgBouncer limits.
- **`idleTimeoutMillis: 30000`**: Releases idle sockets back to the pool after 30 seconds of inactivity.
- **`connectionTimeoutMillis: 15000`**: Accommodates cold starts if a serverless Neon compute node is resuming from idle sleep.
- **`statement_timeout = 5000`**: Prevents hung queries from causing Vercel 504 Gateway Timeouts.

---

## 3. OWASP API Top 10 Security Hardening

### 3.1 OWASP API1:2023 - Session-Locked IDOR Prevention
An attacker cannot pass `?userId=another-candidate-uuid` to inspect someone else's preferences.
- If the candidate is logged in, their user ID is extracted from `getCurrentUser()` and **strictly overrides** any client-supplied `userId`.
- Unauthenticated requests can only supply explicit ephemeral filter criteria (e.g. `domains: ["React"]`); they can never query another user's stored database preferences.

### 3.2 OWASP API3:2023 - Object Property Level Authorization & Input Whitelisting
All incoming preference payloads are sanitized against an explicit whitelist:
`country`, `seniority`, `domains`, `skills`, `cities`, `jobTypes`, `mode`.
Any extraneous or unexpected properties (such as `isAdmin`, prototype keys, or unindexed operators) are stripped before execution.

### 3.3 OWASP API4:2023 - Unrestricted Resource Consumption & Clamping
- **Pagination Limit:** Strictly clamped to `Math.min(Math.max(1, limit), 50)` (default: 24).
- **String Filtering:** Capped at 100 characters per string; country capped at 60 characters.
- **Array Sizes:** Capped at 25 elements per filter.
- **Cursor String:** Base64 cursor length strictly capped at 512 bytes with regex UUID verification.
- **Request Body:** JSON payload size capped at 100kb.

### 3.4 OWASP API7:2023 - Server-Side Injection & Regex Neutralization
- **100% Parameterized Prepared Statements:** All dynamic inputs are passed as parameters `$1` through `$6`. No SQL string concatenation.
- **In-SQL POSIX Regex Escaping:** All tag inputs are sanitized inside the CTE using:
  ```sql
  regexp_replace(clean_tag, '([\\^$.|?*+()[\]{}])', '\\\\1', 'g')
  ```
  This eliminates ReDoS (Regular Expression Denial of Service) risks.

### 3.5 OWASP API8:2023 - Automated Threats & Rate Limiting
Optional sliding-window rate limiting using Upstash Redis (`@upstash/ratelimit`) can be added to limit requests to 60 queries/minute per user or IP address.

### 3.6 OWASP API10:2023 - Production Error Masking
All raw PostgreSQL error details and stack traces are caught server-side and logged internally. The client receives a clean generic JSON error:
```json
{ "error": "Failed to fetch matched jobs" }
```

---

## 4. Database Schema, Indexes & Query Optimizations

### 4.1 PostgreSQL Extensions
```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

### 4.2 Production Index Specifications
```sql
-- Keyset pagination index for published jobs (deterministic order)
CREATE INDEX IF NOT EXISTS idx_jobs_published_at_id_partial 
ON public.jobs (published_at DESC, id DESC) 
WHERE status = 'published';

-- Country-partitioned pagination index
CREATE INDEX IF NOT EXISTS idx_jobs_published_country_pagination 
ON public.jobs (country_id, published_at DESC, id DESC) 
WHERE status = 'published';

-- Employment type filter index
CREATE INDEX IF NOT EXISTS idx_jobs_published_emp_type 
ON public.jobs (employment_type, published_at DESC, id DESC) 
WHERE status = 'published';

-- GIN Trigram index for fuzzy role matching
CREATE INDEX IF NOT EXISTS idx_jobs_job_role_title_trgm 
ON public.jobs USING gin (job_role_title gin_trgm_ops)
WHERE status = 'published';
```

---

## 5. Direct Next.js App Router Code Implementation

All code files are provided in the `direct-nextjs/` folder of this package:

### 5.1 Database Connection Pool: `lib/db.ts`
Maintains the singleton `pg.Pool` and Drizzle instance with Vercel pool lifecycle attachment.

### 5.2 Core Matching Engine: `lib/db/job-preference-matching.ts`
Executes the multi-tier matching query, generates deterministic base64url keyset cursors, and maintains the in-process country UUID cache.

### 5.3 Secure API Route Handler: `app/api/jobs/matched/route.ts`
Provides both `GET` and `POST` endpoints matching the existing UI contract with IDOR session locking, limit clamping, input sanitization, and error masking.

---

## 6. High-Performance Keyset Pagination & Caching

### 6.1 Deterministic Keyset Cursor Pagination
Unlike traditional `OFFSET` pagination (which degrades exponentially as page depth increases), keyset cursor pagination uses tuple comparison:
```sql
(j.published_at, j.id) < ($3::timestamptz, $4::uuid)
```
The database seeks directly to the index position in O(log N) time, ensuring page 100 loads just as fast as page 1 (<150ms).

### 6.2 In-Memory Country UUID Cache
`lib/db/job-preference-matching.ts` caches country name and ISO code lookups in an in-memory `Map<string, string>`. Subsequent queries resolve country IDs instantly without executing redundant `SELECT * FROM countries` queries.

---

## 7. Step-by-Step Deployment & Verification Guide

1. **Copy Files to Your Next.js App:**
   - Copy `direct-nextjs/lib/db.ts` to your app's `lib/db.ts`
   - Copy `direct-nextjs/lib/db/job-preference-matching.ts` to `lib/db/job-preference-matching.ts`
   - Copy `direct-nextjs/lib/job-utils.ts` to `lib/job-utils.ts`
   - Copy `direct-nextjs/types/job.ts` to `types/job.ts`
   - Copy `direct-nextjs/app/api/jobs/matched/route.ts` to `app/api/jobs/matched/route.ts`

2. **Apply Database Indexes:**
   - Run `sql/schema_and_indexes.sql` in your database console or via:
     ```bash
     psql "$DATABASE_URL" -f sql/schema_and_indexes.sql
     ```

3. **Verify Environment Variables:**
   Ensure `DATABASE_URL` points to your Neon pooled host (`-pooler`).

4. **Verify Direct Query Execution:**
   ```bash
   node test-scripts/test_direct_query.mjs
   ```

5. **Verify API Route Handler:**
   ```bash
   node test-scripts/test_matching_endpoint.mjs
   ```

---

*Direct Next.js to Database Implementation Plan Complete.*
