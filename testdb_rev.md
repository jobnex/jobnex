# Neon résumé integration and retained live trial

## Scope and storage decision

Public Jobnex must continue using the original `neondb` database in the documented `trail_dev` project (`broad-base-06154424`). Live identity queries on 2026-10-05 returned branch `br-plain-morning-ayf71kf3` for both `neondb` and `ai_job_portal_staging`. The latter is a **separate database on the same branch**, not a branch, replica, or synchronization target. No dblink/postgres_fdw extensions, foreign servers/tables, or logical subscriptions were configured. There is no cross-database integration in this release.

| Artifact | Public Jobnex location | Purpose |
| --- | --- | --- |
| Reviewed source résumé | `public.user_pref_resumes.content` | Candidate-owned current extracted draft. Upload replaces the primary draft; use a separate demo identity for testing. |
| Generation input and JD | `public.resume_generation_requests.source_text/job_description` | Immutable queued input and authoritative job snapshot, independent of later job edits. |
| Generated Markdown | `public.resume_generations.resume_markdown` | Exact versioned AI output, linked to request, user and job. Download as .md; no filesystem is the permanent source of truth. |
| Edited/exported Markdown | `public.user_job_resumes.markdown` | Current saved document for that user/job. Does not overwrite AI generation history. |
| Optional PDF | Private R2 `joberry-assets`, key in `user_job_resumes.r2_object_key` | Explicit optional export, not the primary AI artifact or an extra generation credit. |

Public web, worker, and PDF backend use Secret Manager `job-hunt-profile-database-url:1`. Rust `ai-job-portal-staging` uses its separate staging secrets and schema (`generated_resumes.markdown_content`). Switching only the Rust connection URL would not reconcile identity, wallet, queue, or output schemas.

## Step record: why, how, and usefulness

### 1. Diagnose the apparent database/location mismatch

**Why:** Earlier SQL/documentation mixed public Jobnex with Rust staging.
**How:** Read Cloud Run service settings, resolve database secrets in process memory without printing values, then run read-only identity, schema, and bridge-catalog queries.
**Result:** Public services already share `neondb`; no database move is necessary. The inspected public database had 148,040 jobs, six generation requests, zero retained generated/saved résumé rows; staging had 23 jobs and zero generated rows. These are point-in-time counts, not permanent guarantees.
**Usefulness:** Avoids destructive schema replacement, wrong-database SQL, and an unnecessary synchronization system.

### 2. Preserve existing work and correct repository scope

**Why:** The original ai-job-portal checkout contains unrelated changes; current Jobnex main differs from the deployed image.
**How:** Use `C:/Users/91767/jobnex-neondb-integration`, branch `codex/neondb-resume-integration`, based on deployed `b942ac0`. Carry forward worker-entrypoint, usage UUID/status, and completed-download repairs from `c63ce9b` (local cherry-pick `fc706a0`).
**Result:** Git remote is `https://github.com/jobnex/jobnex.git`; no push to the unrelated repository.
**Usefulness:** Bounds the release to intended changes and leaves the dirty developer checkout intact.

### 3. Make source review and generation ordering reliable

**Why:** Saving a draft on blur could race generation; overlapping polling and lost request IDs made recovery confusing.
**How:** Save and refresh match explicitly; await the save before reserving credit. Reuse the idempotency key after transport errors. Persist request ID in the page URL. Use non-overlapping 2.5-second polls with cancellation; verify the returned job ID matches the selected job.
**Result:** The UI has upload/drop, review, deterministic keyword gaps, explicit one-credit generation, terminal status, and immutable Markdown download.
**Usefulness:** The request snapshots the actual reviewed source; reloading recovers the existing request rather than creating an accidental second charge.

### 4. Connect optional PDF export without faking applications

**Why:** The deployed PDF backend required an application row; a candidate can tailor before applying. Existing web PDF code uses an older compiler contract.
**How:** Reuse the private Rust/Typst service. Require an existing Neon Auth identity plus an owned application OR an owned completed, consumed-credit successful generation. Add an authenticated server-only bridge with Cloud Run IAM token in `X-Serverless-Authorization`, application token in `Authorization`, and verified session UUID in `X-User-Id`.
**Result:** New POST/GET `/api/resume/tailor/generated/{requestId}/pdf` checks completed-generation ownership, previews reviewed Markdown, exports the exact preview ID/revision, and proxies private PDF bytes. The backend saves Markdown and R2 key into `user_job_resumes`. Stale conflicts remain 409; admission limits preserve 429/Retry-After.
**Usefulness:** No invented application status, no browser service secret, no AI-history overwrite, and no second generation charge. Markdown-only download remains available independently.

### 5. Verify before deploying

**Why:** A successful typecheck does not prove private authentication, database permissions, billing, or end-to-end behavior.
**How:** Read installed Next.js route-handler guidance. Run `node node_modules/typescript/bin/tsc --noEmit --incremental false`, targeted ESLint, `git diff --check`, and `node node_modules/tsx/dist/cli.mjs scripts/check-resume-pdf-bridge.ts`. The production Dockerfile runs Rust release tests during build.
**Results so far:** TypeScript, targeted ESLint, diff check and bridge regression check passed. The bridge check mocks cloud fetches and tests distinct tokens, verified identity, exact-preview export, 409 propagation and HTTPS configuration. It does NOT prove live database ownership checks.
**Usefulness:** Detects contract regressions cheaply; live checks below are separate completion gates.

### 6. Establish access boundaries before rollout

**Why:** Do not make a private compiler public to get a demo working.
**How:** Read the PDF service IAM policy.
**Result:** `job-hunt-web-runtime@job-scout-508222.iam.gserviceaccount.com` already has `roles/run.invoker`; no allUsers grant is needed. Anonymous public queue/download calls return 401; anonymous private PDF health returns 403.
**Usefulness:** Existing authentication boundaries remain intact; runtime credentials stay in Secret Manager.

### 7. Build, deploy, and retain a synthetic trial

**Status:** In progress. Record build IDs, image digests, revision/traffic changes, demo IDs, request/job linkage, provider usage, exact credit settlement, Markdown hashes, PDF integrity, and browser evidence below as they are verified. Never record credentials, cookies, OTPs, provider keys, connection strings, or real candidate résumé contents.

## Live endpoints and sequence

Public origin: https://job-hunt-web-znsph25yja-ue.a.run.app

1. GET `/api/resume/tailor/jobs/{jobId}`: authoritative published job.
2. POST `/api/resume/tailor/upload`: authenticated PDF/DOCX extraction, up to 10 MB.
3. PATCH `/api/resume/tailor/resumes/{resumeId}`: save reviewed Markdown.
4. GET `/api/resume/tailor/resumes/{resumeId}/preview?jobId={jobId}`: deterministic gaps.
5. POST `/api/resume/tailor/requests`: jobId, resumeId, idempotencyKey; reserve one credit and snapshot inputs.
6. GET `/api/resume/tailor/requests/{requestId}`: owner-only polling.
7. GET `/api/resume/tailor/generated/{requestId}`: completed/consumed owner-only Markdown attachment; `?format=json` for review.
8. Optional POST `/api/resume/tailor/generated/{requestId}/pdf`: reviewed markdown/templateId, no additional AI credit.
9. Optional GET returned `.../pdf?previewId={previewId}`: exact immutable preview bytes.

Private compiler: https://resume-pdf-backend-znsph25yja-ue.a.run.app. Browsers do not call it directly. Official IAM audience/header guidance: https://docs.cloud.google.com/run/docs/authenticating/service-to-service.

## SQL retrieval (select neondb in the Neon editor first)

```sql
SELECT current_database(), current_setting('neon.branch_id', true);

SELECT g.id AS resume_id, g.user_id, g.job_id, g.version,
       r.status AS request_status, r.credit_state,
       g.resume_markdown AS generated_markdown,
       r.source_text AS original_reviewed_source,
       r.job_description AS job_description_used,
       j.job_role_title, j.company_name, j.external_apply_url,
       s.markdown AS saved_export_markdown, s.r2_object_key
FROM public.resume_generations g
JOIN public.resume_generation_requests r
  ON r.id=g.id AND r.user_id=g.user_id AND r.job_id=g.job_id
JOIN public.jobs j ON j.id=g.job_id
LEFT JOIN public.user_job_resumes s
  ON s.user_id::text=g.user_id AND s.job_id=g.job_id
WHERE g.id='REPLACE_WITH_VERIFIED_TRIAL_REQUEST_UUID'::uuid;
```

SQL operator credentials can read data beyond the web API; share this query with authorized team members only. `user_job_resumes` is the current saved document, not an immutable per-generation export record. If another generation or edit replaces it, do not assume it still matches an older generation without comparing text/hashes.

## Rollback and limitations

Before release: web `job-hunt-web-00012-rjj`, worker `job-hunt-resume-worker-00017-4qb`, PDF `resume-pdf-backend-00002-gq7`. Record traffic and image digests before updates; roll back web/PDF traffic to these revisions if necessary. No database migration is part of this integration. No existing candidate record, wallet, application, or Rust staging database is to be deleted or overwritten.

Earlier disposable successful worker output was cleaned up (see error_ref.md); this new trial must retain clearly labelled synthetic evidence. One demo passing is not a claim of zero bugs or load-test readiness. Least-privilege public database roles, broader auth-abuse controls, upload malware policy, and preview retention require separate security/operations work; this release does not silently claim to solve them.

## Completion gates

- [ ] Public services still resolve to original neondb; staging remains separate.
- [ ] Authenticated browser upload, review, request, polling and Markdown download pass.
- [ ] Retained output links to the correct demo identity and authoritative job snapshot.
- [ ] Exactly one demo credit consumed; usage audit exists; no expired running lease.
- [ ] Downloaded Markdown hash matches database text.
- [ ] Optional PDF preview/export/download works and saved Markdown/key matches it.
- [ ] Anonymous/cross-user access denied; failed/refunded output denied.
- [ ] Correct Jobnex branch/PR, deployment evidence, retrieval SQL and rollback documented.

## Status

Not complete until the checked live evidence is recorded. All trial account and résumé content is synthetic. User approved resuming implementation and live testing on 2026-10-05.
