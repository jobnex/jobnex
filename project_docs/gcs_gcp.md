# GCS + GCP staging deployment

This document describes the deployable staging path for the Tailor Resume service. It uses a private Google Cloud Storage bucket for uploaded source files, Neon Postgres for application state and generated Markdown, and Cloud Run for the Rust API and background worker.

## What is stored where

| Data | System | Why |
| --- | --- | --- |
| Uploaded PDF/DOCX résumé | Private GCS object | Keeps binary files out of Postgres and lets Cloud Run workers read the original safely. |
| Parsed résumé profile, job snapshot, request status, credits and token usage | Neon Postgres | Transactional source of truth for the candidate journey and billing audit. |
| Generated tailored résumé | `generated_resumes.markdown_content` in Neon | Markdown is the product artifact. It is queryable, immutable per generated version, and protected by row-level ownership checks. |
| SHA-256 of generated Markdown | `generated_resumes.markdown_sha256` | Allows the API/client test to verify that the delivered Markdown matches the persisted artifact. |

Generated PDFs are deliberately not emitted or persisted. `render_pdf` remains an internal local helper only; the Tailor Resume portal returns Markdown.

## Request lifecycle

1. The browser sends a job UUID and uploads a PDF or DOCX.
2. The API authenticates the candidate, writes the source file to the private bucket, and records its storage key in `resume_versions`.
3. The preview endpoint extracts profile data and compares deterministic skills before a credit is spent.
4. `POST /resume-requests` reads the authoritative job record from Neon, snapshots its description, and reserves one credit.
5. The Cloud Run worker claims one request using `FOR UPDATE SKIP LOCKED`, retrieves the private source object through its service identity, and starts the résumé agent.
6. Each agent usage event reserves/reports its token allowance before the next stage proceeds.
7. On success, the worker writes Markdown and its SHA-256 to `generated_resumes`, marks the request successful, and consumes the held credit in the same transaction.
8. On parse, agent, timeout, or storage failure, the request is terminally failed and the credit reservation is released. Usage already reported by a provider stays auditable.
9. The authenticated client polls `GET /resume-requests/{id}` and downloads the returned Markdown locally. It never receives a public bucket URL.

## Database changes

Migration `backend/migrations/20261003010000_store_generated_resume_markdown.sql` adds two nullable columns to `generated_resumes`:

- `markdown_content TEXT`: the generated Markdown body.
- `markdown_sha256 TEXT`: lowercase SHA-256 validation digest, constrained to 64 hexadecimal characters when populated.

The staging database is `ai_job_portal_staging`, separate from the legacy `neondb` database. Its migration ledger has the canonical application migrations plus this Markdown migration. Runtime roles have only the privileges required by the API and worker; migrations use the separate migrator role.

Use a direct Neon connection for migrations and a pooled connection for running Cloud Run. Do not place a connection string in source control, this document, or a browser environment variable.

## GCP resources

Project: `job-scout-508222`

Region: `us-east1`

Artifact Registry repository: `job-hunt`

Staging bucket: `gs://job-scout-508222-ai-job-portal-staging`

Cloud Run service: `ai-job-portal-staging`
Runtime service account: `ai-job-portal-staging-runtime@job-scout-508222.iam.gserviceaccount.com`

The bucket has uniform bucket-level access and public-access prevention. The runtime account has object-user access to this bucket, which is sufficient to create, read, and delete its private objects. No object ACLs, public objects, or signed public download links are used.

The Cloud Run service receives these Secret Manager references, not literal secret values:

| Environment variable | Secret |
| --- | --- |
| `DATABASE_URL` | `ai-job-portal-staging-app-rw-database-url` |
| `DATABASE_URL_UNPOOLED` | `ai-job-portal-staging-app-migrator-database-url` |
| `WORKER_DATABASE_URL` | `ai-job-portal-staging-app-worker-database-url` |
| `RESUME_AGENT_CACHE_DATABASE_URL` | `ai-job-portal-staging-resume-agent-cache-database-url` |
| `JWT_SECRET` | `ai-job-portal-staging-jwt-secret` |

The runtime account is granted `Secret Manager Secret Accessor` only on those secret resources. The service uses `STORAGE_GCS_BUCKET=job-scout-508222-ai-job-portal-staging`; it refuses to start on Cloud Run when that setting is absent, preventing accidental ephemeral-disk storage.

## Build and deploy

`backend/cloudbuild.staging.yaml` produces the staging image from `backend/Dockerfile`.

Before running a build, use a clean Git worktree or branch. The active developer checkout may contain unrelated local experiments, and a Cloud Build source upload includes local files unless they are excluded. `.gcloudignore` excludes build output, local storage, notes, and unrelated directories to keep the source archive small; it is not a substitute for a clean branch.

Build the committed deployment branch:

```powershell
gcloud builds submit . --project job-scout-508222 --config backend/cloudbuild.staging.yaml --substitutions=COMMIT_SHA=<commit-sha>
```

Deploy the resulting Artifact Registry image with the runtime identity, secrets above, `APP_ENV=production`, `RESUME_AI_MODE=simulated`, `BILLING_MODE=disabled`, `RESUME_GENERATION_ENABLED=true`, `RESUME_WORKER_CONCURRENCY=1`, and `--no-cpu-throttling`. Instance-based CPU is intentional: the durable request worker must be able to process queued work without an incoming HTTP request. `APP_ENV=production` is mandatory on public Cloud Run: without it, the passwordless-login endpoint exposes development OTPs. Simulated payments are intentionally loopback-only, so public staging uses a disposable direct database credit only for the end-to-end lifecycle check.

Keep `--min-instances=1`, `--max-instances=1`, and `--concurrency=1` during staging. Scale only after a measured load test, with matching database connection limits.

## Verification checklist

1. Run `SQLX_OFFLINE=true cargo check --manifest-path backend/Cargo.toml`.
2. Run the GCS storage unit test and the Python portal contract tests.
3. Build the image from a clean worktree.
4. Deploy to the staging Cloud Run service and verify `/health` responds successfully.
5. Seed only a disposable staging candidate, active job, and direct test credit; do not enable simulated payment endpoints on Cloud Run.
6. Upload a PDF/DOCX and create a résumé request through the deployed API.
7. Confirm the input object is private in GCS, the request reaches `succeeded`, one credit is consumed, and `generated_resumes.markdown_content` is non-empty with a matching SHA-256.
8. Verify a second user receives no request, résumé, or Markdown data.
9. Exercise one injected failure and verify the credit is released.

### Staging verification status (2026-10-03)

The clean Cloud Build image was deployed to Cloud Run and `/health` responded successfully. The public service was also checked with `APP_ENV=production`; passwordless-login responses do not expose a development OTP, and simulated billing remains disabled.

The end-to-end verifier reached the authenticated upload endpoint with a disposable staging user, but Cloud Run's GCS request received `404 Not Found` while creating the private source object. The bucket exists, has uniform bucket-level access/public-access prevention, and the configured runtime service account has `roles/storage.objectUser` directly on that bucket. A temporary read-only bucket-metadata grant did not change the result and was removed. Therefore the GCS upload, downstream Markdown generation, and credit-settlement proof are **not yet release-verified**. Do not treat this document's lifecycle description as a completed live test until the service-account/GCS 404 is resolved and checklist items 6-9 pass.

## Operational recovery

- **Bad Cloud Run revision:** route traffic back to the last healthy revision in Cloud Run. The database schema change is additive, so rollback does not require a destructive migration.
- **Queued request stalls:** inspect `resume_requests` status and lease timestamps. The worker expires stale leases and refunds them rather than retrying a potentially billable provider call blindly.
- **Missing GCS access:** verify the Cloud Run service account and the bucket IAM binding; do not make objects public as a workaround.
- **Unexpected output:** compare the delivered Markdown’s SHA-256 with `markdown_sha256`, retain the immutable job snapshot and tailoring summary, and investigate the associated request/usage rows.
- **Database experiment:** create and test on an isolated Neon branch first. Apply the exact migration through a direct connection, then merge/promote only after the checklist passes.

## Guardrails

- Browser job descriptions are never trusted as the tailoring source; the API loads and snapshots the Neon job record.
- The agent is constrained to evidence in the uploaded résumé. It must not invent skills, companies, credentials, or experience.
- The output remains private to the authenticated owner through the API and database row-level policy.
- Credentials, connection strings, access tokens, and provider keys belong only in Secret Manager or ignored local environment files.
