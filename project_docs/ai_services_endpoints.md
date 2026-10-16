# Endpoint Guide

## Current service URLs

| Service | URL | Status |
| --- | --- | --- |
| Main Rust API | `https://ai-job-portal-staging-znsph25yja-ue.a.run.app` | Deployed staging backend |
| Public Next.js UI | `https://job-hunt-web-znsph25yja-ue.a.run.app` | Older frontend; current proxy routes are not deployed yet |

The Rust API routes are registered in `backend/src/api/mod.rs`. The browser-facing
Next.js proxy routes live under `my-app/app/api`.

## Authentication

- **Browser:** call the same-origin `/api/...` routes after signing in. They use
  secure HTTP-only session cookies and forward the user access token server-side.
- **Server-to-server:** send `Authorization: Bearer <access-token>` to protected
  Rust API routes.
- **Do not expose:** database URLs, API keys, Stripe webhook endpoints, admin
  endpoints, or test payment endpoints in browser code.

## Job and candidate endpoints

| Method | Path | Use |
| --- | --- | --- |
| GET | `/health` | Health probe; no user data. |
| GET | `/jobs` | List/search jobs stored in Neon. |
| GET | `/jobs/{jobId}` | Load the authoritative job record. |
| POST / DELETE | `/jobs/{jobId}/save` | Save or remove a saved job. |
| POST | `/jobs/{jobId}/interest` | Mark candidate interest. |
| POST | `/jobs/{jobId}/match` | Create match analysis. |
| GET | `/me` | Read current user. |
| GET | `/me/saved` | List saved jobs. |
| GET / PUT | `/me/preferences` | Read/update candidate preferences. |
| GET | `/me/matches` | List candidate match history. |
| GET | `/matches/{matchId}` | Read a match report. |

## Passwordless authentication

| Method | Path | Use |
| --- | --- | --- |
| POST | `/auth/request-code` | Send a login code to an email address. |
| POST | `/auth/verify-code` | Verify code and establish a session/token. |
| POST | `/auth/register` | Register an account. |
| POST | `/auth/login` | Password login, when enabled. |
| POST | `/auth/refresh` | Refresh an access token. |
| POST | `/auth/verify-email` | Confirm email ownership. |
| POST | `/auth/resend-verification` | Send a new verification email. |

## Tailor Resume flow

The browser sends a job UUID, not a job description. The backend loads the job
from Neon and stores a job snapshot with the request.

```text
GET  /jobs/{jobId}
POST /resumes
GET  /resumes/{resumeId}/tailoring-preview?job_id={jobId}
POST /resume-requests
GET  /resume-requests/{requestId}
GET  /resumes/{generatedResumeId}
```

| Step | Endpoint | Result |
| --- | --- | --- |
| 1 | `GET /jobs/{jobId}` | Reads the authoritative Neon job description. |
| 2 | `POST /resumes` | Uploads PDF/DOCX; extracts and retains structured source Markdown in Neon. The original binary is discarded. |
| 3 | `GET /resumes/{resumeId}/tailoring-preview?job_id={jobId}` | Returns detected skills, job requirements, matches, and gaps before a credit is used. |
| 4 | `POST /resume-requests` | Stores the job snapshot, reserves one credit, and starts grounded generation. |
| 5 | `GET /resume-requests/{requestId}` | Polls queued/running/succeeded/failed state. |
| 6 | `GET /resumes/{generatedResumeId}` | Downloads generated `text/markdown` as an `.md` file. |

A credit is consumed only after generated Markdown is successfully stored. A
failed validation, AI call, or storage operation releases the credit reservation.

## Resume endpoints

| Method | Path | Use |
| --- | --- | --- |
| POST / GET | `/resumes` | Upload a candidate resume / list owned resumes. |
| GET / DELETE | `/resumes/{resumeId}` | Download generated Markdown / delete a resume. |
| GET | `/resumes/{resumeId}/tailoring-preview?job_id={jobId}` | Deterministic skill-gap preview. |
| POST | `/resume-requests` | Start tailored Markdown generation. |
| GET | `/resume-requests/{requestId}` | Read request status and generated result. |

## Credits, billing, and applications

| Method | Path | Use |
| --- | --- | --- |
| GET | `/me/credits` | Available, reserved, and settled credit balance. |
| GET | `/me/entitlements` | Feature access for the current plan. |
| GET | `/billing/packages` | Credit packages. |
| POST | `/billing/checkout` | Start payment checkout. |
| GET | `/me/payments` | Payment history. |
| POST | `/billing/refund/{paymentId}` | Refund workflow. |
| POST | `/applications` | Create an application record. |
| GET | `/me/applications` | Candidate application tracker. |
| PATCH | `/applications/{applicationId}/status` | Update candidate-reported application status. |
| GET | `/applications/{applicationId}/timeline` | Application event timeline. |
| GET | `/applications/{applicationId}/transitions` | Allowed next statuses. |

## Restricted endpoints

| Method | Path | Use |
| --- | --- | --- |
| POST | `/billing/webhooks/stripe` | Stripe server webhook only. |
| POST | `/billing/simulate/{id}` | Test-only payment simulation. |
| POST | `/admin/credits/grant` | Grant support/test credits. |
| GET | `/admin/activity` | Administrative activity. |
| POST | `/admin/ingest/greenhouse/{board}` | Import Greenhouse jobs. |
| POST | `/admin/ingest/lever/{company}` | Import Lever jobs. |
| POST | `/admin/ingest/ashby/{company}` | Import Ashby jobs. |
| POST | `/admin/ingest/workday/{slug}` | Import Workday jobs. |
| POST | `/admin/ingest/renormalize/{source}` | Re-process an ingest source. |

## Browser proxy endpoints

The current `my-app` source provides these same-origin routes for browser calls:

```text
/api/jobs
/api/auth/request-code
/api/auth/verify-code
/api/auth/me
/api/auth/logout
/api/applications
/api/applications/{id}
/api/credits
/api/preferences
/api/billing/{packages|history|checkout|simulate/{id}|refund/{id}}
/api/resumes
/api/resumes/{id}
/api/resumes/{id}/tailoring-preview?job_id={jobId}
/api/resume-requests
/api/resume-requests/{id}
/api/resumes/{id}/application-kit
/api/resumes/{id}/interview-prep
```

These routes require `BACKEND_API_URL` in the Next.js server environment. They
are verified locally against the deployed Rust API but are not yet available on
the currently deployed `job-hunt-web` image.
