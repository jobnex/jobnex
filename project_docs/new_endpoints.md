# Jobnex résumé tailoring endpoints

Updated: 2026-10-05. This document describes the Jobnex + Neon Auth + original neondb workflow only. It does not describe the separate Rust staging API. Documentation only; no endpoint, authentication, database or deployment changes were made to create this file.

## Base URL and authentication

Public origin: https://job-hunt-web-znsph25yja-ue.a.run.app

Candidate screen: `/job-hunt/tailor-resume?jobId={jobId}`

Every request should use the candidate's verified Neon Auth session. The Next.js handlers resolve identity server-side through `getCurrentUser()`. Do not supply another user's ID, use an admin Rust Bearer token, or expose JWT/service secrets to the browser. Résumé and job IDs must come from original neondb, not ai_job_portal_staging.

The examples below assume the frontend is on this same origin and its session is already established. A separately hosted frontend needs an explicitly supported authentication/session integration; changing the base URL or adding `credentials: "include"` alone does not solve cross-origin cookie and CORS requirements.

## Endpoint index

| Step | Method | Path | Purpose |
| --- | --- | --- | --- |
| 1 | GET | `/api/resume/tailor/jobs/{jobId}` | Load the authoritative published job |
| 2 | POST | `/api/resume/tailor/upload` | Upload and extract candidate PDF/DOCX |
| 3 | PATCH | `/api/resume/tailor/resumes/{resumeId}` | Save candidate-reviewed source Markdown |
| 4 | GET | `/api/resume/tailor/resumes/{resumeId}/preview?jobId={jobId}` | Show deterministic keyword matches/gaps |
| 5 | POST | `/api/resume/tailor/requests` | Reserve credit and queue generation |
| 6 | GET | `/api/resume/tailor/requests/{requestId}` | Poll owner-only request/credit status |
| 7 | GET | `/api/resume/tailor/generated/{requestId}` | Download accepted completed Markdown |
| 8 | GET | `/api/resume/tailor/generated/{requestId}?format=json` | Load the same generated Markdown for review |
| Optional | POST | `/api/resume/tailor/generated/{requestId}/pdf` | Export reviewed Markdown through the private PDF bridge |
| Optional | GET | `/api/resume/tailor/generated/{requestId}/pdf?previewId={previewId}` | Download an exact PDF preview |

UUID placeholders are identifiers, not filenames, object keys or authentication tokens. Save the IDs returned by each step; do not interchange source resumeId, requestId and PDF previewId.

## 1. Load the selected job

```http
GET /api/resume/tailor/jobs/{jobId}
```

The backend reads `jobs` in neondb and requires a published job. It resolves title, company, description and requirements. Use the returned `job` object; do not send a browser-authored JD as the authoritative generation input.

## 2. Upload and parse the résumé

```http
POST /api/resume/tailor/upload
Content-Type: multipart/form-data; boundary=<browser-generated>
```

Form field: `file`. Supported filename extensions: PDF and DOCX. Maximum upload size: 10 MB. The backend forwards extraction through its server-authenticated service; the browser does not need the extraction secret.

```js
const form = new FormData();
form.set("file", selectedFile);
const response = await fetch("/api/resume/tailor/upload", {
  method: "POST",
  credentials: "same-origin",
  body: form,
});
const result = await response.json();
if (!response.ok) throw new Error(result.error || "Upload failed");
const resumeId = result.resume.id;
const extractedMarkdown = result.resume.markdown;
```

Do not manually set multipart Content-Type in this example: the browser supplies the boundary. The response's `resume` includes `id`, `markdown`, `details`, and `fileName`.

**Important:** Upload creates or updates the account's primary `user_pref_resumes` draft. It can replace existing source content. Use a separate synthetic account for demonstrations rather than a real candidate's account.

## 3. Review and save the source

```http
PATCH /api/resume/tailor/resumes/{resumeId}
Content-Type: application/json
```

```json
{
  "markdown": "# Candidate Name\n\nReviewed source résumé content..."
}
```

Await the successful save before preview refresh or generation. Parsing is a draft: candidates should correct employer names, dates, titles, skills and section boundaries. This endpoint edits the source, not an existing immutable generated résumé.

## 4. Retrieve skill/keyword gaps

```http
GET /api/resume/tailor/resumes/{resumeId}/preview?jobId={jobId}
```

The candidate must own the source résumé. The handler returns `preview`, `resume`, and `job` objects. Current preview fields are:

- `matched`: keyword matches.
- `missing`: job keywords not found in the reviewed source.
- `sourceWordCount`: count of unique filtered source keywords, despite its field name; not a literal total word count.

This is a deterministic keyword comparison, not proof of qualification or an ATS-success prediction. Refresh it after editing the source. Missing keywords are not permission to fabricate skills.

## 5. Queue generation

```http
POST /api/resume/tailor/requests
Content-Type: application/json
```

```json
{
  "jobId": "<published neondb job UUID>",
  "resumeId": "<owned source résumé UUID>",
  "idempotencyKey": "<stable UUID for this submission>"
}
```

All three fields use camelCase and UUID values. Generate an idempotency key once for a deliberate submission; reuse it for transport retries of those same inputs. Do not create a fresh key automatically after a timeout.

Response envelope: `{ "request": ... }`. Store `request.id` immediately for polling/recovery. A new queued request returns 202; a recognized duplicate can return 200 with the existing request. This endpoint snapshots the job description and reviewed source and reserves one résumé credit; generation runs asynchronously in the existing worker.

Do not submit `user_id`, `base_resume_id`, a raw JD, or a Rust-issued token as substitutes for this contract.

## 6. Poll the same request

```http
GET /api/resume/tailor/requests/{requestId}
```

Response envelope: `{ "request": ... }`. Current selected fields include `id`, `job_id`, `status`, `credit_state`, `error_code`, `created_at`, `finished_at`, and `ready`.

Use non-overlapping polls, approximately every 2.5 seconds as in the existing UI. Stop on terminal status and cancel polling when leaving the page. Preserve requestId across reloads. Verify `job_id` matches the screen's selected job. A polling network error does not authorize a second generation.

The retained live trial returned `status=completed` and `credit_state=consumed`. Handle failure/review states explicitly. Do not rely only on `ready`: the download route independently checks owned completed/consumed eligibility.

## 7. Download generated Markdown

```http
GET /api/resume/tailor/generated/{requestId}
```

Successful response is the Markdown text, not a JSON envelope:

```text
Content-Type: text/markdown; charset=utf-8
Content-Disposition: attachment; filename="tailored-resume-{requestId}.md"
Cache-Control: no-store
```

It requires owned successful generation plus a completed request with consumed credit. Missing, foreign or not-yet-eligible output returns 404 rather than exposing another user's existence.

## 8. Retrieve generated Markdown as JSON

```http
GET /api/resume/tailor/generated/{requestId}?format=json
```

Response envelope is `generation`, with `id`, `job_id`, `resume_markdown`, and `version`. This is useful for review/editing or optional PDF export. Treat Markdown as untrusted content when rendering; do not directly inject arbitrary HTML.

## Optional PDF export

Markdown generation/storage does not require this step.

```http
POST /api/resume/tailor/generated/{requestId}/pdf
Content-Type: application/json
```

```json
{
  "markdown": "# Candidate Name\n\nReviewed tailored résumé...",
  "templateId": "mit-capd"
}
```

The bridge verifies generation ownership and calls the private compiler using server-only credentials. Use the returned `downloadUrl` to retrieve the exact preview; retain `previewId` and returned hashes for traceability. Do not call the private Cloud Run compiler directly from the browser or construct its authentication headers.

The export path trims outer Markdown whitespace, so its saved hash can differ from the raw generated Markdown hash. It saves reviewed/export content without overwriting immutable AI output. Optional PDF export is not another AI-generation credit.

## Storage map

| Artifact | Permanent location in original neondb |
| --- | --- |
| Primary candidate-reviewed source | `public.user_pref_resumes.content` |
| Queued source/JD snapshots | `public.resume_generation_requests.source_text`, `.job_description` |
| Generated versioned Markdown | `public.resume_generations.resume_markdown` |
| Current edited/export document | `public.user_job_resumes.markdown` |
| Optional private PDF reference | `public.user_job_resumes.r2_object_key` |

Optional PDF bytes live in the existing private R2 storage, not in the generated Markdown column. `user_job_resumes` is a current user/job document and can change later; it is not immutable per-generation history. Local test downloads are not the permanent storage source.

## Error handling

Jobnex routes generally return JSON `{ "error": "message" }` for errors—not Rust's problem-details envelope. Check HTTP status before reading successful result fields.

| Status | Interpretation/action |
| --- | --- |
| 200 / 202 | Success; use the route-specific response format |
| 400 | Invalid UUID, body/file, or a handler-reported processing/input failure; inspect error message |
| 401 | No verified candidate session; sign in through Jobnex |
| 402 | Insufficient credits on request creation |
| 404 | Unavailable/foreign source or job, missing request, or generated output not eligible yet; meaning depends on route |
| 409 | Optional PDF conflict; refresh the reviewed/export state rather than silently serving a stale preview |
| 429 | Where returned by the PDF admission path, honor Retry-After; this does not establish global rate limiting for all routes |
| 503 | Generation disabled or service unavailable; do not assume a charge occurred |

The table is not an exhaustive guarantee that infrastructure can return only these codes. Keep transient transport/server failures distinguishable from terminal generation failures.

## Frontend migration mapping

| Previous Rust call | Jobnex replacement |
| --- | --- |
| `POST /resumes` | `POST /api/resume/tailor/upload` |
| `GET /resumes/{id}/tailoring-preview?job_id=...` | `GET /api/resume/tailor/resumes/{id}/preview?jobId=...` |
| `POST /resume-requests` with snake_case fields | `POST /api/resume/tailor/requests` with camelCase fields |
| `GET /resume-requests/{id}` | `GET /api/resume/tailor/requests/{id}` |
| Rust generated output handling | Jobnex generated Markdown attachment/JSON routes above |
| Admin login at Rust `/auth/login` | Candidate's verified Neon Auth session |

Changing URLs alone is insufficient: change authentication, record provenance, JSON fields and response parsing together. Do not use ai-job-portal-staging as this workflow's base URL. This guide does not itself migrate any frontend callers.

## Tested workflow and limitations

On 2026-10-05, the authenticated live API trial completed job lookup, PDF upload, source review/save, preview, queue, duplicate submission, polling and Markdown download. Independent SQL verified output in neondb, correct owner/job linkage, one consumed credit, four AI-call records and an exact database/download hash match. Optional PDF export and actual cross-user denials also passed.

Full authenticated browser acceptance remains uncompleted, and the synthetic output revealed historical employer/title and section-boundary defects. Successful storage does not prove perfect résumé accuracy. See [testdb_rev.md](testdb_rev.md) for the evidence and [featured_to_add.md](featured_to_add.md) for proposed improvements.

Verified implementation references:

- [Public routes](../jobnex-neondb-integration/app/api/resume/tailor)
- [Ownership, lookup and queue helpers](../jobnex-neondb-integration/lib/resume-tailoring.ts)
- [PDF bridge](../jobnex-neondb-integration/lib/resume-pdf-backend.ts)
- [Live API trial script](../jobnex-neondb-integration/scripts/run-neondb-api-trial.cjs)

No credentials, session cookies, OTPs or connection strings should be added to this document or team-shared examples.
