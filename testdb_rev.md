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

### 7. Build and deploy the isolated release

**Why:** Verify production Linux builds and preserve a rollback target before sending live traffic.
**How:** Commit `06ffca4908ef4fb29214c2cee02004272caa4550`, upload only the clean release source using `.gcloudignore`, then run:
`gcloud builds submit . --project=job-scout-508222 --region=us-east1 --config=cloudbuild.neondb-integration.yaml --substitutions=_WEB_IMAGE=...:neondb-06ffca4,_PDF_IMAGE=...:neondb-06ffca4 --async`.
Cloud Build's temporary source archive uses its existing build bucket; this is not résumé storage.
**Result:** Build `a1a8cf91-b2fd-409c-af65-8d63814c7a09` succeeded at 2026-10-04 20:54:02 UTC (2026-10-05 in India). The Next.js production build and seven Rust release tests passed.

| Service | New revision | Immutable image digest | Traffic |
| --- | --- | --- | --- |
| job-hunt-web | job-hunt-web-00013-teh | sha256:350274b4349503ed3c98340864b786fb1039108792c482061e0ba6338cd79a58 | 100% |
| resume-pdf-backend | resume-pdf-backend-00003-rir | sha256:d95e3027260990070988b3704900077c89e4103163f470ca2f564d46ac0a05d1 | 100% |

Deployed both initially with `--no-traffic --tag=neondb-trial`. New private PDF health returned 200 with operator IAM; new web page returned 200; anonymous new PDF bridge returned 401. Only then changed each service's traffic to its explicit new revision. Both still reference `job-hunt-profile-database-url:1`. Web received `RESUME_PDF_BACKEND_URL` and the existing service-token secret reference; no new IAM grants, database schema changes, or public PDF invocation were introduced. Worker image/config remains unchanged.

**Usefulness:** The web uses the new private bridge, while rollback remains a revision-traffic operation. Healthy startup and 401 checks do not prove positive user generation/export.

### 8. Prepare a safely isolated browser trial

**Why:** Upload replaces the signed-in user's primary source résumé; never overwrite a real account for a demo.
**How:** Create a one-page synthetic ProjectWise PDF from `tests/fixtures/projectwise-demo.md`, using `scripts/create-demo-resume.py`; render with bundled pypdfium2 and visually inspect. All companies, education and outcomes in this fixture are fake test data. Prepare a separate normal login for `jobnex-neondb-trial-20261005@example.com` (reserved example.com domain). Do not submit a job application.
**Result:** Fixture creation and visual review passed. The PDF skill's artifact-marker script was not available on this Windows host; the documented fallback used the bundled PDF tools. The browser is at the normal email-code login; its Continue control states acceptance of Terms/Privacy. Requested action-time user confirmation before pressing it. No demo account, grant, upload or generation has been created yet.
**Usefulness:** Protects the real account's draft/credits and avoids silently accepting legal terms. Live generation/export gates remain unchecked until this confirmation and test complete.

### 9. Publish the right repository and reproducible checks

**Why:** Earlier work was pushed to the wrong remote, and prior successful test rows were removed.
**How:** Verify `origin=https://github.com/jobnex/jobnex.git` and active GitHub identity Jobnex. Push `codex/neondb-resume-integration` and open draft PR https://github.com/jobnex/jobnex/pull/9. Added fixture/evidence-checker commit `9ba8618`. Attach the PR to this Codex task.
**Result:** Correct Jobnex draft PR is open; it is not merged. `scripts/check-neondb-trial.cjs` validates actual neondb identity and only the labelled demo account. Its acknowledged grant is idempotent; its completion assertions check retained generation, selected job/JD, AI-call audit, one settled credit, downloaded Markdown hash, and optional saved PDF key/content. Its presence is not evidence that those assertions have passed.
**Usefulness:** Reviewable implementation and repeatable evidence without connection strings or credentials in Git.

### Check limitations found during this release

`cargo fmt -- --check` reports pre-existing formatting in `main.rs` and `store.rs`'s storage-verification code, outside the eligibility change. This check did not pass and is not concealed; production Rust tests and compilation did pass. The public connection still uses the existing owner role and some old clients disable certificate verification. Dedicated least-privilege roles and TLS hardening remain security work, not claims made by this release.

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

- [x] Public services still resolve to original neondb; staging remains separate.
- [ ] Authenticated browser upload, review, request, polling and Markdown download pass.
- [ ] Retained output links to the correct demo identity and authoritative job snapshot.
- [ ] Exactly one demo credit consumed; usage audit exists; no expired running lease.
- [ ] Downloaded Markdown hash matches database text.
- [ ] Optional PDF preview/export/download works and saved Markdown/key matches it.
- [ ] Anonymous/cross-user access denied; failed/refunded output denied.
- [x] Correct Jobnex branch/PR, deployment evidence, retrieval SQL and rollback documented.

## Status

Implementation is deployed; authenticated live acceptance is incomplete pending the demo login Terms confirmation. No trial credit has yet been granted or spent and no retained output exists from this new trial. User approved resuming implementation and live testing on 2026-10-05. Do not treat deployment/readiness checks as completed generation evidence.
