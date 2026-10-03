# Job Matching Microservice & API Endpoints Integration Guide

> **Production Endpoint:** `https://job-matching-service-znsph25yja-ue.a.run.app`  
> **Next.js Proxy Route:** `/api/jobs/matched`  
> **GCP Region:** `us-east1` | **GCP Project:** `job-scout-508222`  
> **Target Dataset:** Live Neon PostgreSQL (`public.jobs` catalog of 132,000+ indexed positions)

This document is the definitive integration reference for developers connecting to the **Job Matching Microservice**. It explains what each endpoint does, how authentication and authorization are handled, the multi-tier ranking engine, keyset cursor pagination, error handling, security controls, and copy-pasteable client/server code examples for seamless integration into any frontend or backend feature.

---

## Table of Contents
1. [Overview & Core Architecture](#1-overview--core-architecture)
2. [Endpoints Reference](#2-endpoints-reference)
   - [2.1 GET /health](#21-get-health)
   - [2.2 GET /api/jobs/matched](#22-get-apijobsmatched)
   - [2.3 POST /api/jobs/matched](#23-post-apijobsmatched)
3. [Authentication, Authorization & IDOR Protection](#3-authentication-authorization--idor-protection)
4. [Request Parameters & Schema](#4-request-parameters--schema)
5. [Response Payload Schema](#5-response-payload-schema)
6. [Multi-Tier Ranking Algorithm Explained](#6-multi-tier-ranking-algorithm-explained)
7. [Keyset Cursor Pagination (Infinite Scroll)](#7-keyset-cursor-pagination-infinite-scroll)
8. [Feature Integration Blueprints (Code Examples)](#8-feature-integration-blueprints-code-examples)
   - [Pattern A: React Client Component with Infinite Scroll](#pattern-a-react-client-component-with-infinite-scroll)
   - [Pattern B: TanStack React Query (`useInfiniteQuery`)](#pattern-b-tanstack-react-query-useinfinitequery)
   - [Pattern C: Next.js Server Component / Server Action](#pattern-c-nextjs-server-component--server-action)
   - [Pattern D: Automated Email Digest / Cron Job (Node.js / Python)](#pattern-d-automated-email-digest--cron-job-nodejs--python)
   - [Pattern E: cURL & Terminal Testing](#pattern-e-curl--terminal-testing)
9. [Security Features & Industry Best Practices](#9-security-features--industry-best-practices)
10. [Troubleshooting & Common Pitfalls](#10-troubleshooting--common-pitfalls)
11. [GCP Cloud Run Operations & Deployment](#11-gcp-cloud-run-operations--deployment)

---

## 1. Overview & Core Architecture

The Job Matching Service extracts the most relevant opportunities for a candidate from over **132,000 live jobs** with **sub-second response latency (< 800ms)**.

```
┌────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND UI                               │
│  - /job-hunt ("Curated For You" Tab)                                   │
│  - Dashboard Recommendations Widget                                    │
│  - Email Alerts / Push Notifications                                   │
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
│  - Prevents IDOR: Strictly locks userId to authenticated user          │
│  - Sanitizes input filters and clamps limits (1..50)                   │
│  - Injects optional internal service secret                            │
│  - Forwards query to Google Cloud Run                                  │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
           HTTP Request with userId + x-internal-secret
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                      GOOGLE CLOUD RUN MICROSERVICE                     │
│  Service: job-matching-service (Revision: 00004-q9x)                   │
│  Container: Node 20 Alpine (CIS non-root 'node' user)                  │
│  - Verifies optional internal secret                                   │
│  - Reads candidate target domains, skills & seniority from DB          │
│  - Runs 3-tier CTE ranked matching query                               │
│  - Returns mapped UI-ready JSON with deterministic Keyset Cursor       │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
                     Direct Connection via SSL Pool
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        NEON POSTGRESQL DATABASE                        │
│  Tables: public.jobs (132k+ rows), user_job_preferences, countries     │
└────────────────────────────────────────────────────────────────────────┘
```

### Why This Dual-Layer Design?
1. **Zero Vercel Serverless Exhaustion:** Vercel serverless functions have execution limits and connection pool bottlenecks. By proxying the heavy multi-tier SQL matching to Cloud Run, Vercel compute time is ~**5ms**, using **0 database connections on Vercel**.
2. **Graceful Automatic Fallback:** If Cloud Run is ever temporarily unreachable, the Next.js API route automatically falls back to local database execution (`lib/db/job-preference-matching.ts`).
3. **Session Cookie Isolation:** The user's encrypted session cookies remain inside Next.js; only the validated `userId` is passed to Cloud Run.

---

## 2. Endpoints Reference

### 2.1 GET `/health`
Verifies container status and database connectivity. Used by GCP load balancers and uptime checks.

- **Method:** `GET`
- **Path:** `/health`
- **URL:** `https://job-matching-service-znsph25yja-ue.a.run.app/health`
- **Authentication:** None (Public)

#### Response (`200 OK`):
```json
{
  "status": "healthy",
  "timestamp": "2026-10-03T21:26:36.242Z"
}
```

---

### 2.2 GET `/api/jobs/matched`
Primary matching endpoint for browsing and infinite scrolling through curated opportunities.

- **Method:** `GET`
- **Next.js URL:** `http://localhost:3000/api/jobs/matched` *(or production domain)*
- **Cloud Run URL:** `https://job-matching-service-znsph25yja-ue.a.run.app/api/jobs/matched`
- **Authentication:** 
  - **Via Next.js:** Automatically authenticated via browser session cookie (`getCurrentUser()`).
  - **Direct Cloud Run:** Optional `x-internal-secret` or `Authorization: Bearer <key>`.

#### Query Parameters:

| Parameter | Type | Default | Description | Example |
|---|---|---|---|---|
| `userId` | `string` (UUID) | Session User | Target candidate user ID in `neon_auth.user`. | `96419deb-a030-4ac8-9f20-22a90cef6026` |
| `limit` | `number` | `24` | Items per page. Clamped between `1` and `50`. | `24` |
| `mode` | `string` | `"balanced"` | Relevance strictness: `"strict"`, `"balanced"`, `"broad"`. | `balanced` |
| `cursor` | `string` | `null` | Base64URL keyset cursor returned from previous page. | `eyJ0aWVy...` |
| `domains` | `string` | User Pref | Comma-separated domain/role titles to override profile. | `Data Center Technician,DevOps` |
| `skills` | `string` | User Pref | Comma-separated technical skills to filter. | `Python,SQL,AWS,Docker` |
| `country` | `string` | User Pref | ISO country code or full name. | `US` or `United States` |
| `cities` | `string` | User Pref | Comma-separated target cities. | `Dallas, TX, Reno, NV` |
| `seniority` | `string` | User Pref | Seniority tier: `"Entry-level"`, `"Mid-level"`, `"Senior"`, `"Lead"`. | `Mid-level` |
| `jobTypes` | `string` | User Pref | Comma-separated job types. | `Full-time,Contract` |

---

### 2.3 POST `/api/jobs/matched`
Alternative body-driven endpoint ideal for advanced filter drawers, custom preference testing, or server-to-server RPCs.

- **Method:** `POST`
- **Path:** `/api/jobs/matched`
- **Headers:** `Content-Type: application/json`

#### Request Body Example:
```json
{
  "userId": "96419deb-a030-4ac8-9f20-22a90cef6026",
  "limit": 10,
  "mode": "balanced",
  "cursor": null,
  "preferences": {
    "domains": ["Data Center Technician"],
    "skills": ["Fiber Optics", "Python", "AWS"],
    "country": "US",
    "cities": ["Dallas, TX"],
    "seniority": "Mid-level",
    "jobTypes": ["Full-time"]
  }
}
```

---

## 3. Authentication, Authorization & IDOR Protection

### How Candidate Identity is Resolved:
1. **Browser Request:** When the frontend calls `/api/jobs/matched`, the browser automatically transmits the `auth_session` cookie.
2. **Session Verification:** Next.js invokes `getCurrentUser()` via `@neondatabase/auth/next/server`.
3. **Strict IDOR / BOLA Prevention (OWASP API1:2023):**
   - If a candidate is logged in as User `A`, the endpoint **strictly enforces `userId = User_A.id`**.
   - If an attacker sends `?userId=User_B_ID`, the parameter is discarded. A user can never inspect another candidate's private feed.
   - For public / unauthenticated calls, `userId` is `null` (or a validated UUID for explicit testing), triggering general discovery matching.
4. **Service-to-Service Defense-in-Depth:**
   - In production, Next.js can send `x-internal-secret: <token>` to Cloud Run, ensuring direct public requests cannot abuse the Cloud Run container.

---

## 4. Request Parameters & Schema

All input parameters undergo strict validation and sanitization:

| Field | Max Length / Count | Sanitization Rule |
|---|---|---|
| `userId` | 36 characters | Must strictly match UUID regex `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`. Invalid formats are treated as `null`. |
| `limit` | Integer | Clamped to `Math.min(Math.max(1, limit), 50)`. Prevents database memory exhaustion. |
| `cursor` | 512 characters | Base64URL string containing JSON tuple. Discarded if malformed. |
| `domains` | Max 25 items | 100 characters per item. Stripped of control characters. |
| `skills` | Max 25 items | 100 characters per item. |
| `cities` | Max 25 items | 100 characters per item. |
| `country` | 60 characters | Trimmed string. |
| `seniority` | 50 characters | Trimmed string. |

---

## 5. Response Payload Schema

### Response Object (`200 OK`):
```typescript
interface MatchedJobsResponse {
  jobs: Job[];               // Array of mapped job objects
  nextCursor: string | null; // Keyset cursor for the next page (null if no more)
  nextKeyset: {              // Decoded keyset cursor metadata
    tierRank: number;
    similarityScore: number;
    publishedAt: string;
    id: string;
  } | null;
  hasMore: boolean;          // True if another page exists
  executionTimeMs: number;   // Server-side query execution time
}
```

### Job Item Schema:
```typescript
interface Job {
  id: string;                    // UUID primary key in public.jobs
  jobRoleTitle: string;          // Job title (e.g. "Data Center Technician")
  company: string;               // Hiring company name
  type: string;                  // "Full-time", "Contract", "Part-time"
  location: string;              // "City, State, Country"
  salary: string;                // Formatted string (e.g. "$65000 - $83000" or "$31 - $33")
  jobDescription: string;        // Full job description HTML/text
  categories: string[];          // Category tags
  postedAt: string;              // ISO-8601 published date
  isRemote: boolean;             // True if remote work model
  isHybrid: boolean;             // True if hybrid work model
  workModel?: "remote" | "hybrid" | "on_site";
  visaSponsorship?: boolean;     // True if employer sponsors visa
  experienceRequired?: number;   // Required years of experience
  similarityScore: number;       // Matching score (1 to 10)
  tierRank: number;              // Relevance tier (1, 2, or 3)
}
```

---

## 6. Multi-Tier Ranking Algorithm Explained

The matching engine ranks jobs through a 3-tier hierarchical relevance funnel:

```
[ 132,000+ Raw Jobs ]
         │
         ▼
┌────────────────────────────────────────────────────────┐
│ TIER 1: Exact Target Role Matches                      │
│ - Exact full-text and regex title match on user domains│
│ - Strict seniority tier matching                       │
│ - Skill bonus & location affinity scoring              │
└──────────────────────────┬─────────────────────────────┘
                           │ If available count < limit
                           ▼
┌────────────────────────────────────────────────────────┐
│ TIER 2: Adjacent & Family Roles                        │
│ - Cross-disciplinary related titles within domain      │
│ - Semantic title-group expansion                       │
└──────────────────────────┬─────────────────────────────┘
                           │ If available count < limit
                           ▼
┌────────────────────────────────────────────────────────┐
│ TIER 3: Discovery & Skill-Based Baseline               │
│ - Roles matching candidate technical skills            │
│ - Aligned experience requirements & country filters    │
└────────────────────────────────────────────────────────┘
```

### Modes:
- **`strict`**: Disables fallback. Only returns positions with exact title and criteria matches.
- **`balanced` (Default)**: Prioritizes Tier 1 and Tier 2, filling remaining page slots with high-similarity Tier 3 discovery roles.
- **`broad`**: Widens boundaries for candidates exploring adjacent career paths.

---

## 7. Keyset Cursor Pagination (Infinite Scroll)

Traditional `OFFSET / LIMIT` pagination suffers from `O(N)` query degradation as users paginate deeper into 132,000 rows.

This service implements **deterministic Keyset Pagination** using the sorting tuple:
```sql
ORDER BY tm.tier_rank DESC, tm.similarity_score DESC, j.published_at DESC, j.id DESC
```

### Cursor Structure:
When `hasMore: true`, the API returns a Base64URL string:
```
eyJ0aWVyUmFuayI6Mywic2ltaWxhcml0eVNjb3JlIjoxMCwicHVibGlzaGVkQXQiOiIyMDI2LTEwLTAyIDA0OjQ0OjA3LjY5NjExMyswMCIsImlkIjoiZWUxMWE5YzEtZGJmOC01ODM2LThlNzktODY0MzEwMDY1NGUyIn0
```
Decoded:
```json
{
  "tierRank": 3,
  "similarityScore": 10,
  "publishedAt": "2026-10-02 04:44:07.696113+00",
  "id": "ee11a9c1-dbf8-5836-8e79-8643100654e2"
}
```
Passing `?cursor=<nextCursor>` executes an indexed seek directly to the next set of rows in **constant time (O(1))** without re-reading previous items.

---

## 8. Feature Integration Blueprints (Code Examples)

### Pattern A: React Client Component with Infinite Scroll

```tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { authClient } from "@/lib/auth/client";
import { Job } from "@/types";

export function CuratedJobsList() {
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

      setJobs(prev => (isInitial ? newJobs : [...prev, ...newJobs]));
      setNextCursor(data.nextCursor || null);
      setHasMore(Boolean(data.hasMore));
    } catch (err) {
      console.error("Failed to load jobs:", err);
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  return (
    <div>
      {isLoading ? (
        <p>Loading curated opportunities...</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {jobs.map((job) => (
            <div key={job.id} className="p-4 border rounded-lg bg-card">
              <h3 className="font-bold text-lg">{job.jobRoleTitle}</h3>
              <p className="text-sm text-muted-foreground">{job.company} • {job.location}</p>
              <div className="mt-2 flex gap-2">
                <span className="px-2 py-0.5 text-xs bg-emerald-100 text-emerald-800 rounded">
                  Tier {job.tierRank} Match
                </span>
                <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-800 rounded">
                  {job.salary}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {hasMore && (
        <button
          onClick={() => fetchJobs(nextCursor)}
          disabled={isLoadingMore}
          className="mt-6 px-6 py-2 bg-primary text-white rounded-md"
        >
          {isLoadingMore ? "Loading more..." : "Load More Jobs"}
        </button>
      )}
    </div>
  );
}
```

---

### Pattern B: TanStack React Query (`useInfiniteQuery`)

```tsx
import { useInfiniteQuery } from "@tanstack/react-query";
import { authClient } from "@/lib/auth/client";

export function useCuratedJobsQuery() {
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
      if (!res.ok) throw new Error("Failed to fetch matched jobs");
      return res.json();
    },
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextCursor : undefined),
    initialPageParam: null,
    staleTime: 5 * 60 * 1000,
  });
}
```

---

### Pattern C: Next.js Server Component / Server Action

```tsx
"use server";

import { getCurrentUser } from "@/lib/auth/server";

export async function getTopCuratedJobsServer(limit = 5) {
  const user = await getCurrentUser().catch(() => null);
  const cloudRunUrl = process.env.CLOUDRUN_MATCHING_URL;

  const url = new URL(`${cloudRunUrl || "http://localhost:3000"}/api/jobs/matched`);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("mode", "balanced");
  if (user?.id) url.searchParams.set("userId", user.id);

  const res = await fetch(url.toString(), {
    headers: {
      "Content-Type": "application/json",
      ...(process.env.INTERNAL_SERVICE_KEY ? { "x-internal-secret": process.env.INTERNAL_SERVICE_KEY } : {}),
    },
    cache: "no-store",
  });

  if (!res.ok) throw new Error(`Matching service failed with ${res.status}`);
  return res.json();
}
```

---

### Pattern D: Automated Email Digest / Cron Job (Node.js / Python)

#### Node.js Script:
```javascript
import fetch from "node-fetch";

async function sendCandidateDigest(candidateUserId, candidateEmail) {
  const cloudRunUrl = process.env.CLOUDRUN_MATCHING_URL;
  const endpoint = `${cloudRunUrl}/api/jobs/matched?userId=${candidateUserId}&limit=5&mode=strict`;

  const response = await fetch(endpoint, {
    headers: { "x-internal-secret": process.env.INTERNAL_SERVICE_KEY },
  });

  const data = await response.json();
  const topJobs = data.jobs || [];

  if (topJobs.length > 0) {
    console.log(`Dispatching ${topJobs.length} curated jobs to ${candidateEmail}`);
    // Example: await emailService.sendJobsEmail(candidateEmail, topJobs);
  }
}
```

#### Python Script:
```python
import os
import requests

def get_candidate_matches(user_id: str, limit: int = 5):
    url = f"{os.getenv('CLOUDRUN_MATCHING_URL')}/api/jobs/matched"
    headers = {"x-internal-secret": os.getenv("INTERNAL_SERVICE_KEY", "")}
    params = {"userId": user_id, "limit": limit, "mode": "balanced"}
    
    response = requests.get(url, headers=headers, params=params, timeout=10)
    response.raise_for_status()
    return response.json().get("jobs", [])
```

---

### Pattern E: cURL & Terminal Testing

```bash
# 1. Check Service Health
curl https://job-matching-service-znsph25yja-ue.a.run.app/health

# 2. Query Curated Jobs for Candidate (Mahi)
curl "https://job-matching-service-znsph25yja-ue.a.run.app/api/jobs/matched?userId=96419deb-a030-4ac8-9f20-22a90cef6026&limit=5&mode=balanced"

# 3. Test Advanced Filter with POST
curl -X POST "https://job-matching-service-znsph25yja-ue.a.run.app/api/jobs/matched" \
  -H "Content-Type: application/json" \
  -d '{"userId": "96419deb-a030-4ac8-9f20-22a90cef6026", "limit": 3, "preferences": {"seniority": "Mid-level"}}'
```

---

## 9. Security Features & Industry Best Practices

The service strictly follows the **OWASP API Security Top 10 (2023)** and **CIS Docker Container Benchmarks**:

| Security Control | Threat Mitigated | Implementation |
|---|---|---|
| **IDOR / BOLA Prevention** *(OWASP API1:2023)* | User snooping on another candidate's private feed. | Session identity binding in `app/api/jobs/matched/route.ts` strictly overrides incoming `userId` parameters with the authenticated `user.id`. |
| **Service-to-Service Defense-in-Depth** *(OWASP API2:2023)* | Direct external tampering with Cloud Run. | Optional `INTERNAL_SERVICE_KEY` verified via `x-internal-secret` or `Authorization: Bearer`. Health check remains public. |
| **DoS & Resource Exhaustion** *(OWASP API4:2023)* | Callers requesting `limit=1000000` or negative values. | All limits strictly clamped to `[1, 50]`. Filter arrays are capped at 25 items and 100 characters per item. |
| **SQL Injection Immunity** *(OWASP A03:2021)* | Malicious SQL syntax in query parameters or cursors. | 100% Parameterized queries using PostgreSQL native bind parameters (`$1` to `$6`). String interpolation is eliminated. |
| **Security Misconfiguration** *(OWASP API8:2023)* | Server fingerprinting and clickjacking. | `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Strict-Transport-Security`, `X-Powered-By` disabled. |
| **Information Disclosure** *(OWASP API10:2023)* | Leaking database errors or schemas to users. | Internal error messages are masked in production with `{ error: "Failed to match jobs" }`. Details logged securely to Cloud Logging. |
| **Non-Root Container** *(CIS Docker 4.1)* | Container escape vulnerabilities. | Dockerfile runs under unprivileged `USER node` (UID 1000). |
| **Secret Management** *(NIST SP 800-53)* | Leaking database credentials in Git. | Secrets injected via GCP Secret Manager (`job-matching-service-database-url:latest`). No credentials in source control. |

---

## 10. Troubleshooting & Common Pitfalls

### Issue 1: Jobs returning generic roles instead of candidate target roles
- **Cause:** Calling the endpoint with `userId = null` or passing `preferences` containing explicit `null` fields (e.g. `{ domains: null }`). PostgreSQL's JSONB concatenation `preferences || '{"domains": null}'::jsonb` overwrites stored database preferences with `null`.
- **Solution:** Never send `null` keys in the preference overrides payload. The service now automatically strips `null` and `undefined` keys.

### Issue 2: React Hook dependency size warning in browser
- **Cause:** Adding `userId` directly into `useEffect(() => { ... }, [fetchApplications, fetchMatchedJobs, userId])` causes array length to change during Turbopack Fast Refresh.
- **Solution:** Memoize `fetchMatchedJobs` with `useCallback(..., [userId])` and keep `useEffect` dependencies strictly as `[fetchApplications, fetchMatchedJobs]`.

### Issue 3: Hydration mismatch on buttons / skeletons
- **Cause:** Rendering `disabled={isLoading}` during SSR when `isLoading` begins as `true` on the client.
- **Solution:** Guard loading and disabled attributes with client-side mounted state: `const [mounted, setMounted] = useState(false); useEffect(() => setMounted(true), []);`.

---

## 11. GCP Cloud Run Operations & Deployment

### Project Configuration:
- **GCP Project ID:** `job-scout-508222`
- **Region:** `us-east1`
- **Service Name:** `job-matching-service`
- **Secret Manager Secret:** `job-matching-service-database-url`

### Redeploying to GCP:
To build and deploy changes to the microservice:
```bash
cd services/job-matching-service

gcloud run deploy job-matching-service \
  --source . \
  --region us-east1 \
  --project job-scout-508222 \
  --allow-unauthenticated \
  --min-instances 0 \
  --max-instances 10 \
  --memory 512Mi \
  --cpu 1 \
  --set-secrets DATABASE_URL=job-matching-service-database-url:latest
```
