# Resume backend fixes: what changed and why

Verified October 16, 2026. This document consolidates the seven confirmed P1 failure paths repaired in the two resume-backend releases. It covers implementation, purpose, verification, deployment and the UI hosting handoff. It does not certify unrelated application features or guarantee that every future model response succeeds.

## Secrets, endpoints and configuration

**No secret key was rotated or replaced by these P1 fixes. No existing service URL or API path was renamed.** Read-only checks against the pre-release and active backend revisions confirmed identical environment values and secret references, including referenced secret versions, and identical primary service/tag URLs. No credential value is included in this document or the published source bundles.

| Item | Status |
| --- | --- |
| Worker and PDF backend primary URLs | Unchanged. |
| Existing PDF backend `neondb-trial` URL | Unchanged; its target revision was moved to the fixed backend image. |
| Backend environment values and secret references | Unchanged compared with pre-release revisions. Existing credentials were reused. |
| Secret Manager keys/versions and IAM | No key rotation, replacement, new secret version or permission grant performed for these fixes. |
| Service identities and startup arguments | Unchanged. |
| Model/provider and LangSmith configuration | Existing synchronous model, tracing project and privacy settings retained. No provider migration in these fixes. |
| Frontend URL, traffic and tags | Unchanged; production frontend deployment belongs to the UI team. |
| PDF compiler, profile and job-matching deployments | Unchanged by these P1 patches. |
| Backend images/revisions | Updated intentionally to deploy the fixes. |
| Database | Manual-edit guard repaired; two publication functions added. These migrations do not replace credentials or API endpoints. |

Worker routes remain `GET /health`, `POST /internal/process`, and `POST /internal/recover`. The Rust PDF backend retains its existing `/api/v1/jobs/{jobId}/generated`, `/resume`, `/preview`, `/export`, `/pdf`, and `/pdf/{previewId}` routes and authentication. Known unsafe Rust PDF content now returns an error instead of being served; that behavior change is the fix. The separate compiler's `/api/v1/ui-export` route is unchanged.

Comparing secret references proves the deployment retained its configured references; this report does not claim to monitor unrelated external credential rotations after verification.

## Fix 1 — Keep each employer and its responsibilities together

**Problem:** The source resume contained the second employer, but generated Markdown omitted that employer and mixed work between jobs. Explicit role headings and unbulleted responsibility paragraphs were grouped incorrectly. Fallback extraction could retain facts under an older role or choose the first occurrence of a repeated title.

**Change:** Preserve heading levels and exact source offsets; recognize responsibility paragraphs; respect role/project boundaries; rebind fallback facts using source-position anchors; reject ambiguous structural spans, cross-boundary facts and conflicting employers. Strip repeated heading markers only for display.

**Why:** A missing company or responsibility assigned to another employer changes the candidate's employment claims. A template cannot safely reconstruct lost factual ownership.

**Files:** `resume-agent-inspect/src/low_risk_agent/source.py`, `prompts.py`, `render.py`, and `pipeline.py`.

**Verification:** Nine focused role-identity tests cover repeated titles, paragraphs, wrapped bullets, fallback and conflicting employers. Private exact-source replay retains two correctly bound employers, eight responsibility facts per employer and three projects, with verbatim evidence offsets. This replay did not call the model or rewrite the base resume.

## Fix 2 — Validate employers and dates inside their own role

**Problem:** Whole-document protection could pass when both employer names existed somewhere, even if they were swapped between jobs.

**Change:** Add `render.role_entities` checks for the emitted role-header count and each role's own employer/date, alongside the original global protected-value checks.

**Why:** Retaining a name somewhere in the document does not establish correct attribution to a job.

**Files:** `resume-agent-inspect/src/low_risk_agent/policy.py` and role-identity regressions.

**Verification:** A valid rendered control passes; deliberately swapped employers fail.

## Fix 3 — Block factual failures before publication and billing

**Problem:** A `needs_review` result could retain usable Markdown despite factual errors. Worker recovery could accept and charge that persisted result without checking a usable compliance ledger.

**Change:** Factual failures now finish as `failed` with no usable Markdown. Diagnostic audit/usage remain available. Only enumerated presentation problems may produce reviewable output. Worker settlement/recovery requires a valid, nonempty compliance ledger and matching persisted provenance; unsuccessful attempts release the held credit.

**Why:** A review warning must not make unsupported claims exportable or turn an unusable result into a paid success.

**Files:** `resume-agent-inspect/src/low_risk_agent/pipeline.py`, `services/resume-tailor/worker.ts`, and settlement regressions.

**Verification:** Factual failures are blocked/refunded; presentation-only review remains available. Duplicate delivery, interrupted output recovery, source/job mismatch and lease ownership controls pass without duplicate charges or refunds.

## Fix 4 — Restore Save/PDF persistence without changing generated evidence

**Problem:** Save and PDF export wrote the separate `audit_json.manual_edit` working copy, but the database guard rejected that update when the base resume still existed. Its old deleted-base exception was broader than necessary.

**Change:** Permit only the bounded, well-formed manual-edit object while every other column and original audit field remains identical. Base deletion may clear only the foreign-key field; an already-null base cannot make generated content mutable.

**Why:** User edits need durable storage, while generated text, ownership, hashes and original audit evidence must remain protected.

**Files:** `services/resume-tailor/migrations/20261016_resume_manual_edit_guard.sql` and `scripts/test-resume-generation-guard.py`.

**Verification:** Twenty-four pre-deployment checks reproduced the old rejection and tested the replacement. Forty-six post-deployment checks verify allowed edits and rejected original-data mutations against migration and installed definitions. Tests use synthetic temporary records and rollback.

## Fix 5 — Release exhausted queued requests and their held credit

**Problem:** After ten outbox dispatch attempts, recovery only logged exhaustion. A request could stay queued with a credit held and no eligible next dispatch.

**Change:** Atomically fail/release exhausted queued requests and refund once. Expected request state and null-safe lease comparison prevent refunding a concurrently claimed run.

**Why:** A delivery failure must reach a clear terminal state instead of retaining customer credit indefinitely.

**Files:** `services/resume-tailor/worker.ts` and `scripts/test-resume-settlement.ts`.

**Verification:** Synthetic recovery moves the exhausted request to failed/released and restores one credit. Repeated recovery produces no second refund. Existing running/capacity/lease controls remain intact.

## Fix 6 — Separate pending batches from cached synchronous responses

**Problem:** Recovery treated any cached provider-response row as evidence of a pending batch. An expired synchronous attempt could be requeued despite having no verified final output, replaying uncertain paid stages.

**Change:** Resume only an identified, submitted batch with no response and age below 48 hours. Recover a verified final generation without calling AI again. Otherwise fail/release the expired synchronous attempt.

**Why:** Cached intermediate responses are not proof that a provider batch is still running or that replaying a paid pipeline is safe.

**Files:** `services/resume-tailor/worker.ts` and settlement/recovery regressions.

**Verification:** Partial synchronous cache triggers release without invoking the agent; a genuine pending batch retains its hold and requeues; valid final output settles from storage. This does not enable batch mode or change the current synchronous model configuration.

## Fix 7 — Apply factual quarantine to every reviewed publication path

**Problem:** Rust generated-result reads selected by generation status alone. Saved Markdown, old PDF preview IDs and export/save paths could bypass request/audit validation. UI-hosted server adapters had analogous raw-read paths.

**Change:** Add shared `resume_generation_is_publishable` and `resume_saved_markdown_is_publishable` database functions. Require matching owned request/generation, job/base context, settled state, original audit identity/hashes and valid factual checks. Enforce the guards on Rust generated/saved reads, preview, old artifacts, save/export and the supplied Next server adapters. A newer verified generation with identical text overrides older rejected provenance correctly. Preserve owned export before creating an application.

**Why:** An alternate download/cache/API path must not undo the worker's safety decision or make quarantined text available again.

**Files:** `services/resume-tailor/migrations/20261016_resume_publication_guard.sql`; `services/resume-pdf-backend/src/{main,store}.rs`; `lib/{resume-tailoring,job-resumes}.ts`; `app/actions/tailored-resume.ts`; PostgreSQL and Rust API regressions.

**Verification:** Thirty PostgreSQL publication checks cover unsafe/malformed ledgers, ownership/context mismatches, presentation review, failed/pending requests and newer identical text. All four Rust PDF templates pass API/storage/quarantine smoke checks. Live clean-result access returns 200, wrong owner 404 and wrong service token 401; quarantined output is unavailable. The old live quarantined-job request returned 404, so no old HTTP exposure is claimed; the bypass was established from its deployed query and read-policy controls.

## Historical cleanup performed separately with approval

The owner explicitly approved quarantining eight unedited factually failed drafts and refunding seven consumed credits. One draft was already refunded, so it received no additional refund. Balance changed from 3 to 10. A second cleanup pass changed nothing.

Original generation text, statuses, audits, source references and PDF objects remain preserved. Quarantine changed request availability and cleared seven matching unsafe duplicate Markdown caches. This follow-up performed no additional historical rewrite or customer refund. Previously downloaded or already-open copies cannot be withdrawn from a user's computer.

## Verification and release status

- 219 Python tests and 82 subtests passed.
- Seven Rust unit tests passed.
- Thirty publication and 46 deployed manual-edit guard checks passed using temporary synthetic PostgreSQL records.
- Worker recovery/settlement, admission, background/application checks and full TypeScript checks passed.
- Four-template Rust API tests cover ownership, revisions, restart/shared storage, exact bytes, corruption and unsafe preview/artifact/export blocking. The final shipping image passes these checks.
- Read-only live configuration checks confirm unchanged service/tag URLs, environment values and secret references. Backend identities and startup arguments remain unchanged.

| Service | Active revision | Traffic |
| --- | --- | --- |
| Resume worker | `job-hunt-resume-worker-backend-p1-1016` | 100%, Ready |
| Rust PDF backend | `resume-pdf-backend-backend-p1-1016` | 100%, Ready; existing backend alias updated |
| Frontend | `job-hunt-web-curated-fresh-1010` | Unchanged 100% and original tags |

Both backend health checks return 200. No fresh paid LLM generation was run for these repairs. The prior Rust runtime lacks Arial/Times New Roman; its existing fonts/template are retained, and container checks explicitly account for only those known font warnings. Exact browser/PDF font parity remains a layout improvement.

## GitHub source and UI handoff

All relevant source, migrations, regression tests, reports and server-adapter handoff files are pushed to the existing GitHub branches. Environment files, keys, private customer snapshots and local diagnostic artifacts are intentionally excluded.

- Repository: `jobnex/jobnex`.
- Backend branch: `fix/resume-background-credits`. Initial four-fix source commit: `ee041ca10113ae5c2ae48ca7d6b26d79b10c419a`. Complete seven-fix source commit: `23ecf3845730e26d767d0041114ec66c773fc0e8`.
- Handoff branch: `docs/resume-ui-handoff-20261010`. Server-adapter bundle and detailed handoff commit: `22ad285bed263cb8682d730734bb40cca4bd9d63`.
- Handoff: `docs/ui/resume-provenance-p1-handoff-2026-10-16.md`; current server-only overlay: `docs/ui/releases/resume-backend-20261016/`, including hashes and collection origins.

Standalone GCP backend services and the database migrations are deployed. **The UI team must deploy the updated authenticated server adapters on its hosting environment**, together with its earlier UI integration. Those adapters are backend code hosted with Next; this task did not deploy the frontend. Use the current overlay to retain later manual-edit/current-generation guards rather than replacing newer UI application code with an older backup.

Detailed evidence and rollback guidance: [initial four-fix audit](resume-provenance-p1-audit-2026-10-16.md) and [backend follow-up](resume-backend-p1-followup-2026-10-16.md).
