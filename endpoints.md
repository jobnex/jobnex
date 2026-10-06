# Tailor Resume endpoint contract

## Architecture

The public Next.js application owns browser authentication and request routing.
The job record, candidate facts, generation request, generated Markdown, audit,
provider usage, and credit ledger are stored in Neon. The private resume worker
performs the AI work after a request is queued.

The public Cloud Run service is `job-hunt-web`; the private worker is
`job-hunt-resume-worker`. This document describes the routes that the Jobnex
application must expose when the Tailor Resume integration is complete.

The on-demand cost correction preserves every public route and response contract below.
Cloud Tasks invokes private worker `POST /internal/process` with `{requestId}`;
an authenticated five-minute recovery schedule invokes `POST /internal/recover`.
Neither internal route is called by browsers. See `gcp_cost_resolution.md` for rollout evidence.

## Browser flow

```text
Tailor Resume button
  -> GET  /api/resume/tailor/jobs/{jobId}
  -> POST /api/resume/tailor/upload
  -> GET  /api/resume/tailor/resumes/{resumeId}/preview?jobId={jobId}
  -> POST /api/resume/tailor/requests
  -> GET  /api/resume/tailor/requests/{requestId}
  -> GET  /api/resume/tailor/generated/{requestId}
```

The browser supplies only a job UUID. The server reads the published job from
Neon and snapshots it with the generation request. It never trusts a job
description supplied by the browser.

## Candidate routes

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/resume/tailor/jobs/{jobId}` | Verify that the signed-in candidate can use the published job and return safe job context. |
| POST | `/api/resume/tailor/upload` | Accept a PDF/DOCX, validate size/type, extract source Markdown, and retain only the structured Markdown plus metadata in Neon. |
| PATCH | `/api/resume/tailor/resumes/{resumeId}` | Save candidate corrections to the extracted Markdown before a request is queued. |
| GET | `/api/resume/tailor/resumes/{resumeId}/preview?jobId={jobId}` | Return extracted profile, deterministic matched skills, missing job skills, and reviewable evidence before charging. |
| POST | `/api/resume/tailor/requests` | Create an idempotent tailoring request, snapshot job/resume facts, and reserve one credit. |
| GET | `/api/resume/tailor/requests/{requestId}` | Poll queued, running, succeeded, review-required, or failed state. |
| GET | `/api/resume/tailor/generated/{requestId}` | Download the completed tailored resume as `text/markdown` and an `.md` file. |

All routes require the existing Jobnex session. Each route must verify that the
requested job, resume, request, and generated output belong to that user.

## Request contracts

### Start tailoring

`POST /api/resume/tailor/requests`

```json
{
  "jobId": "job UUID",
  "resumeId": "uploaded resume UUID",
  "idempotencyKey": "browser-generated UUID"
}
```

The request reserves one credit. A duplicate idempotency key returns the same
request instead of reserving another credit.

### Status result

`GET /api/resume/tailor/requests/{requestId}`

```json
{
  "id": "request UUID",
  "request": {
    "id": "request UUID",
    "status": "queued | running | completed | needs_review | failed",
    "credit_state": "held | consumed | released",
    "ready": true
  }
}
```

## Credit rules

1. Preview is free.
2. Starting a request reserves one credit atomically.
3. The worker consumes the credit only after Markdown, audit data, and output
   hash are persisted successfully.
4. Validation, provider, worker, or storage failures release the reservation.
5. Repeating an idempotency key returns the existing request, preventing a second hold.

## Existing related Jobnex routes

| Method | Path | Current use |
| --- | --- | --- |
| GET / POST | `/api/resume/job` | Read/save a job-specific resume draft. |
| POST | `/api/resume/export` | Existing PDF/R2 export path; not used for Markdown Tailor Resume delivery. |
| POST | `/profile/resume` | Profile-service resume extraction endpoint. |

The Tailor Resume routes above are intentionally separate from PDF export. They
use the existing Neon generation/credit tables and the private worker, while
the final tailored artifact remains Markdown in Neon.

## Non-browser endpoints

The worker is private. It receives no unauthenticated browser traffic. It claims
queued requests from Neon, invokes the AI pipeline using the candidate facts and
job snapshot, writes generated Markdown and audit/usage records, then settles
the credit reservation.

Credentials, database connection strings, OpenRouter keys, Cloud Run service
tokens, and provider webhooks are never included in browser requests or this
document.
