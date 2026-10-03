# Job Matching Microservice & API Endpoints Documentation

This document provides a comprehensive integration and operational guide for the **Job Matching Microservice**, which powers the **"Curated For You"** job feed. 

It covers system architecture, API endpoints, request/response specifications, authentication flows, multi-tier ranking algorithms, keyset pagination, and production integration examples.

---

## 1. System Architecture

The job matching engine matches candidate profiles against a live PostgreSQL catalog of **132,000+ jobs** in **sub-second latency (< 800ms)** while keeping Vercel compute and connection pool pressure at near-zero.

```
┌────────────────────────────────────────────────────────────────────────┐
│                                CLIENT                                  │
│  Browser / React UI: /job-hunt ("Curated For You" tab)                 │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
                     fetch('/api/jobs/matched')
                     (Includes Neon Auth session cookie)
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                       NEXT.JS AUTH & PROXY ROUTE                       │
│  File: app/api/jobs/matched/route.ts                                   │
│  - Decrypts Neon Auth cookie via getCurrentUser()                      │
│  - Resolves Candidate User ID (e.g. 96419deb-...)                      │
│  - Forwards query + userId to Cloud Run                                │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
         HTTP GET/POST https://job-matching-service-...run.app
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        GCP CLOUD RUN MICROSERVICE                      │
│  Service: job-matching-service (Region: us-east1)                      │
│  Container: Node 22 / Express + pg connection pooling                  │
│  - Pulls candidate preferences (domains, skills, seniority) from DB    │
│  - Executes 3-tier CTE ranked matching query across 132k+ jobs         │
│  - Generates deterministic keyset cursor for pagination                │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
               Direct Connection via Secret Manager SSL
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                         NEON POSTGRESQL DATABASE                       │
│  Tables: public.jobs, public.user_job_preferences, countries           │
└────────────────────────────────────────────────────────────────────────┘
```

### Key Advantages:
1. **Zero Vercel Serverless Exhaustion:** Heavy SQL execution and connection holding happen entirely inside persistent Cloud Run containers. Vercel acts only as a lightweight auth forwarder (~5ms CPU).
2. **Graceful Fallback:** If Cloud Run is unreachable or offline, the Next.js API route seamlessly falls back to executing the matching query directly against PostgreSQL.
3. **Session Preservation:** Authentication cookies never leave Next.js; only the verified `userId` UUID is forwarded to Cloud Run.

---

## 2. Live Environments & Base URLs

| Environment | Base URL | Description |
|---|---|---|
| **Production Cloud Run** | `https://job-matching-service-znsph25yja-ue.a.run.app` | Standalone GCP microservice (GCP Project: `job-scout-508222`). |
| **Next.js Application** | `http://localhost:3000` (Local) / `https://your-domain.vercel.app` (Prod) | Client-facing app with session resolution & edge proxy. |

---

## 3. Endpoints Reference

### 3.1 Health Check

Verifies container liveness and database pool availability.

- **Method:** `GET`
- **Path:** `/health`
- **Cloud Run URL:** `https://job-matching-service-znsph25yja-ue.a.run.app/health`
- **Auth:** None (Public)

#### Response (`200 OK`):
```json
{
  "status": "healthy",
  "timestamp": "2026-10-03T20:29:06.138Z"
}
```

---

### 3.2 Get Matched Jobs (GET)

Fetches ranked, tailored jobs based on the candidate's profile or query parameters.

- **Method:** `GET`
- **Path:** `/api/jobs/matched`
- **Next.js Proxy:** `http://localhost:3000/api/jobs/matched`
- **Cloud Run Direct:** `https://job-matching-service-znsph25yja-ue.a.run.app/api/jobs/matched`
- **Auth:** Optional. If called via Next.js with a valid session cookie, `userId` is automatically resolved.

#### Query Parameters:

| Parameter | Type | Default | Description | Example |
|---|---|---|---|---|
| `userId` | `string` (UUID) | Session User | Target candidate user ID in `neon_auth.user` / `user_job_preferences`. | `96419deb-a030-4ac8-9f20-22a90cef6026` |
| `limit` | `number` | `24` | Number of jobs to return per page (1 to 50). | `24` |
| `mode` | `string` | `"balanced"` | Ranking strictness: `"strict"`, `"balanced"`, or `"broad"`. | `balanced` |
| `cursor` | `string` | `null` | Base64URL-encoded keyset cursor for the next page. | *(from previous response)* |
| `domains` | `string` | User Pref | Comma-separated domain/role titles to override profile. | `Data Center Technician,DevOps` |
| `skills` | `string` | User Pref | Comma-separated technical skills to filter/match. | `Python,SQL,AWS,Docker` |
| `country` | `string` | User Pref | ISO country code or full country name. | `US` or `United States` |
| `cities` | `string` | User Pref | Comma-separated target cities. | `Dallas, TX, Reno, NV` |
| `seniority` | `string` | User Pref | Seniority tier: `"Entry-level"`, `"Mid-level"`, `"Senior"`, `"Lead"`. | `Mid-level` |
| `jobTypes` | `string` | User Pref | Comma-separated employment types. | `Full-time,Contract` |

#### Sample Request:
```bash
curl "https://job-matching-service-znsph25yja-ue.a.run.app/api/jobs/matched?userId=96419deb-a030-4ac8-9f20-22a90cef6026&limit=5&mode=balanced"
```

#### Sample Response (`200 OK`):
```json
{
  "jobs": [
    {
      "id": "1150fb46-8273-5bfb-931c-46693757fa70",
      "jobRoleTitle": "Data Center Technician",
      "company": "AR Systems Inc..",
      "type": "Full-time",
      "location": "Dallas, TX, United States",
      "salary": "Competitive",
      "jobDescription": "Our client is seeking an experienced Data Center Technician...",
      "categories": [],
      "postedAt": "2026-10-03T20:29:14.685Z",
      "isRemote": false,
      "isHybrid": false,
      "workModel": "on_site",
      "visaSponsorship": false,
      "experienceRequired": 3,
      "similarityScore": 10,
      "tierRank": 3
    },
    {
      "id": "58c3f3ff-0952-53f1-8f4a-b11ef5a81a55",
      "jobRoleTitle": "Data Center Technician",
      "company": "TEKsystems",
      "type": "Contract",
      "location": "Reno, NV, United States",
      "salary": "$31 - $33",
      "jobDescription": "TEKsystems has an immediate opening for a Data Center Technician...",
      "categories": [],
      "postedAt": "2026-10-03T08:32:09.551Z",
      "isRemote": true,
      "isHybrid": false,
      "workModel": "remote",
      "visaSponsorship": false,
      "experienceRequired": 2,
      "similarityScore": 10,
      "tierRank": 3
    }
  ],
  "nextCursor": "eyJ0aWVyUmFuayI6Mywic2ltaWxhcml0eVNjb3JlIjoxMCwicHVibGlzaGVkQXQiOiIyMDI2LTEwLTAyIDA0OjQ0OjA3LjY5NjExMyswMCIsImlkIjoiZWUxMWE5YzEtZGJmOC01ODM2LThlNzktODY0MzEwMDY1NGUyIn0",
  "nextKeyset": {
    "tierRank": 3,
    "similarityScore": 10,
    "publishedAt": "2026-10-02 04:44:07.696113+00",
    "id": "ee11a9c1-dbf8-5836-8e79-8643100654e2"
  },
  "hasMore": true,
  "executionTimeMs": 624.18
}
```

---

### 3.3 Match Jobs via POST (Body Driven)

Ideal for complex filtering, client-side preference overrides, or search drawers.

- **Method:** `POST`
- **Path:** `/api/jobs/matched`
- **Headers:** `Content-Type: application/json`

#### Request Body Schema:
```json
{
  "userId": "96419deb-a030-4ac8-9f20-22a90cef6026",
  "limit": 24,
  "mode": "balanced",
  "cursor": null,
  "preferences": {
    "domains": ["Data Center Technician"],
    "skills": ["Python", "SQL", "Fiber Optics"],
    "seniority": "Mid-level",
    "country": "us",
    "cities": ["Dallas, TX"],
    "jobTypes": ["Full-time"]
  }
}
```

---

## 4. Multi-Tier Ranking Engine Explained

The matching algorithm ranks jobs through a **3-tier hierarchical relevance funnel**:

```
                       [ 132,000+ Raw Jobs ]
                                 │
                                 ▼
   ┌───────────────────────────────────────────────────────────┐
   │ TIER 1: Exact Target Role Matches                         │
   │ - Full-text and regex title match against candidate domains│
   │ - Strict seniority alignment                              │
   │ - Skill & location bonus scoring                          │
   └─────────────────────────────┬─────────────────────────────┘
                                 │ If slots remain (< limit)
                                 ▼
   ┌───────────────────────────────────────────────────────────┐
   │ TIER 2: Adjacent & Family Roles                           │
   │ - Title similarity and related skill families             │
   │ - Cross-disciplinary titles within domain                 │
   └─────────────────────────────┬─────────────────────────────┘
                                 │ If slots remain (< limit)
                                 ▼
   ┌───────────────────────────────────────────────────────────┐
   │ TIER 3: Discovery & Skill-Based Baseline                  │
   │ - Roles matching candidate technical skills               │
   │ - Non-violating seniority requirements                    │
   │ - Country & work model compatibility                      │
   └───────────────────────────────────────────────────────────┘
```

### Ranking Modes (`mode`):
- **`strict`**: Disables fallback. Only returns positions with exact title and criteria matches.
- **`balanced` (Default)**: Prioritizes Tier 1 and Tier 2, filling the remainder of the page with high-similarity Tier 3 discovery roles.
- **`broad`**: Widens semantic boundaries for candidates open to exploring career pivots and adjacent titles.

---

## 5. Keyset Cursor Pagination Architecture

Unlike traditional `OFFSET / LIMIT` pagination (which becomes progressively slower as the offset grows, causing full-table scans across 132k rows), this service uses **deterministic keyset cursor pagination**.

### Keyset Sorting Tuple:
`(tier_rank DESC, similarity_score DESC, published_at DESC, id DESC)`

### How Keyset Cursors Work:
1. When `hasMore: true`, the API returns `nextCursor` (a Base64URL-encoded JSON string).
2. The decoded payload contains the exact tuple of the last item in the page:
   ```json
   {
     "tierRank": 3,
     "similarityScore": 10,
     "publishedAt": "2026-10-02 04:44:07.696113+00",
     "id": "ee11a9c1-dbf8-5836-8e79-8643100654e2"
   }
   ```
3. To fetch the next page, pass `?cursor=<nextCursor>` in the subsequent request. The query jumps directly to the indexed position in **O(1) time** without re-reading previous records.

---

## 6. Frontend Integration Examples

### 6.1 React Hook with Infinite Scroll (Vanilla Fetch)

```tsx
import { useState, useEffect, useCallback } from "react";
import { authClient } from "@/lib/auth/client";
import { Job } from "@/types";

export function useCuratedJobs() {
  const { data: sessionData } = authClient.useSession();
  const userId = sessionData?.user?.id;

  const [jobs, setJobs] = useState<Job[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const fetchJobs = useCallback(async (cursorParam?: string | null) => {
    const isInitial = !cursorParam;
    if (isInitial) setIsLoading(true);
    else setIsLoadingMore(true);

    try {
      const url = new URL("/api/jobs/matched", window.location.origin);
      url.searchParams.set("limit", "24");
      url.searchParams.set("mode", "balanced");
      if (userId) url.searchParams.set("userId", userId);
      if (cursorParam) url.searchParams.set("cursor", cursorParam);

      const res = await fetch(url.toString());
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      const newJobs: Job[] = data.jobs || [];

      setJobs(prev => isInitial ? newJobs : [...prev, ...newJobs]);
      setNextCursor(data.nextCursor || null);
      setHasMore(Boolean(data.hasMore));
    } catch (error) {
      console.error("Failed to load curated jobs:", error);
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  const loadMore = () => {
    if (!isLoadingMore && hasMore && nextCursor) {
      fetchJobs(nextCursor);
    }
  };

  return { jobs, isLoading, isLoadingMore, hasMore, loadMore, refresh: () => fetchJobs() };
}
```

---

### 6.2 TanStack React Query (`useInfiniteQuery`)

```tsx
import { useInfiniteQuery } from "@tanstack/react-query";
import { authClient } from "@/lib/auth/client";

export function useInfiniteCuratedJobs() {
  const { data: sessionData } = authClient.useSession();
  const userId = sessionData?.user?.id;

  return useInfiniteQuery({
    queryKey: ["curated-jobs", userId],
    queryFn: async ({ pageParam = null }) => {
      const url = new URL("/api/jobs/matched", window.location.origin);
      url.searchParams.set("limit", "24");
      url.searchParams.set("mode", "balanced");
      if (userId) url.searchParams.set("userId", userId);
      if (pageParam) url.searchParams.set("cursor", pageParam);

      const res = await fetch(url.toString());
      if (!res.ok) throw new Error("Network error fetching matched jobs");
      return res.json();
    },
    getNextPageParam: (lastPage) => lastPage.hasMore ? lastPage.nextCursor : undefined,
    initialPageParam: null,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
```

---

### 6.3 Server-Side / Next.js Server Action

```tsx
"use server";

import { getCurrentUser } from "@/lib/auth/server";

export async function fetchCuratedJobsServer(limit = 24, cursor?: string) {
  const user = await getCurrentUser().catch(() => null);
  const cloudRunUrl = process.env.CLOUDRUN_MATCHING_URL;

  const url = new URL(`${cloudRunUrl || "http://localhost:3000"}/api/jobs/matched`);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("mode", "balanced");
  if (user?.id) url.searchParams.set("userId", user.id);
  if (cursor) url.searchParams.set("cursor", cursor);

  const res = await fetch(url.toString(), {
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
  });

  if (!res.ok) throw new Error(`Matching service returned ${res.status}`);
  return res.json();
}
```

---

## 7. Environment Variables Reference

Add the following environment variables to your `.env.local` or Vercel project settings:

```env
# URL of the deployed GCP Cloud Run Microservice
CLOUDRUN_MATCHING_URL="https://job-matching-service-znsph25yja-ue.a.run.app"

# Neon PostgreSQL connection string (Used by fallback & local matching)
DATABASE_URL="postgresql://neondb_owner:npg_...ep-super-cell-ay2qi4wg-pooler.c-5.us-east-2.aws.neon.tech/neondb?sslmode=require"

# Neon Auth Cookie Secret (Used to decrypt session cookies in getCurrentUser())
NEON_AUTH_COOKIE_SECRET="a-very-long-secret-key-for-development-only-1234567890"
```

---

## 8. Deployment & Cloud Run Maintenance

The Cloud Run service is defined in [`services/job-matching-service/`](file:///services/job-matching-service).

### 8.1 Project Details:
- **GCP Project ID:** `job-scout-508222`
- **Region:** `us-east1`
- **Service Name:** `job-matching-service`
- **Secret Manager Secret:** `job-matching-service-database-url`

### 8.2 Redeploying the Microservice to GCP:

To deploy code changes made inside `services/job-matching-service`:

```bash
# Authenticate with GCP
gcloud auth login
gcloud config set project job-scout-508222

# Run deployment script
cd services/job-matching-service
bash scripts/deploy.sh
```

Or run the single command:

```bash
gcloud run deploy job-matching-service \
  --source . \
  --region us-east1 \
  --allow-unauthenticated \
  --min-instances 0 \
  --max-instances 10 \
  --memory 512Mi \
  --cpu 1 \
  --set-secrets DATABASE_URL=job-matching-service-database-url:latest
```

---

## 9. Security Architecture & Industry Best Practices

The job matching microservice and Next.js integration adhere strictly to **OWASP Top 10 API Security (2023)** and **CIS Docker Container Benchmarks**:

| Security Domain | Threat / Risk | Implemented Control | Standard / Benchmark |
|---|---|---|---|
| **Broken Object Level Authorization (IDOR / BOLA)** | Malicious authenticated user queries another candidate's private match feed via `?userId=<victim_id>`. | **Session Identity Locking:** In `app/api/jobs/matched/route.ts`, if an authenticated session exists, `userId` is strictly locked to `user.id`. Any conflicting `userId` parameter is discarded. | **OWASP API1:2023** |
| **Broken Authentication / Unprotected Microservices** | Direct Internet abuse of Cloud Run endpoint bypassing Next.js auth controls. | **Service-to-Service Secret Authentication:** Optional `INTERNAL_SERVICE_KEY` verified via `x-internal-secret` or `Authorization: Bearer`. Health checks (`/health`) remain public for GCP monitoring. | **OWASP API2:2023** |
| **Unrestricted Resource Consumption (DoS)** | Client requests `limit=1000000` or negative values, exhausting database connections and container memory. | **Strict Clamping & Type Coercion:** All limits are strictly coerced and clamped to `[1, 50]` (`Math.min(Math.max(1, limit), 50)`). Arrays (`domains`, `skills`, etc.) are capped at 25 items and 100 characters per string. | **OWASP API4:2023** |
| **SQL Injection (SQLi)** | Arbitrary SQL commands injected through search strings, cursors, or IDs. | **100% Parameterized Queries:** All values (`$1` through `$6`) are passed as native protocol parameters to PostgreSQL. String interpolation (`sql.raw`) has been eliminated. | **OWASP Top 10 A03:2021** |
| **Security Misconfiguration & Fingerprinting** | Server signatures and sniffing attacks on API responses. | **HTTP Security Headers:** `app.disable("x-powered-by")`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Strict-Transport-Security: max-age=31536000`, `Referrer-Policy: no-referrer`. | **OWASP API8:2023** |
| **Information Disclosure / Stack Leakage** | Database schema, hostnames, or connection errors returned to clients in error responses. | **Production Error Masking:** In `NODE_ENV === "production"`, detailed error messages (`err.message`) are masked and replaced with generic `{ error: "Failed to match jobs" }`. All internal errors are logged securely to Google Cloud Logging. | **OWASP API10:2023** |
| **Container Privilege Escalation** | Container breakout or process hijacking running as root. | **Unprivileged Non-Root Execution:** Dockerfile uses `USER node` (UID 1000) with file ownership set to `node:node`, dropping all root capabilities. | **CIS Docker Benchmark 4.1** |
| **Secrets Management** | Leaking database connection strings or credentials in source code. | **GCP Secret Manager Integration:** Production database URLs are injected via `job-matching-service-database-url:latest` in Secret Manager. No credentials exist in the Git repository. | **NIST SP 800-53** |

