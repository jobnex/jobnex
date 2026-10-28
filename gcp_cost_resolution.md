# GCP cost resolution — execution record

## Goal and immutable contracts

Implement on `jobnex/jobnex`, branch `codex/on-demand-tailoring`. Remove only the separate Rust `ai-job-portal-staging` Cloud Run service after dependency and accounting checks. Keep all public Jobnex routes, payloads, authentication, statuses and Markdown delivery unchanged. Keep Neon `neondb`, secrets, existing databases, images, shared identities and unrelated scheduled jobs.

## Baseline — 2026-10-06

In the preceding 24 hours Rust staging recorded 86,362.09 billable instance seconds, and the private Jobnex worker recorded 86,335.65. Both had minimum instances 1 and CPU throttling disabled. Public web recorded about 36 seconds. This proves idle-runtime exposure, not a verified $18 billing breakdown. Both workers poll every two seconds. Existing scraper/visa/experience schedules are outside this change.

## Step 1 — source and dependency inspection

Verified the checkout remote is `https://github.com/jobnex/jobnex.git`, initially clean. Created `codex/on-demand-tailoring` from the existing integration branch. No literal Rust staging URL references were found in checked Jobnex source or listed Cloud Run service environment values. Secret-backed dependencies and accounting still require live verification before deletion.

## Step 2 — durable dispatch implementation

Added `migrations/20261006_resume_dispatch.sql`: additive `resume_dispatch_outbox`, one row per generation request, recording bounded dispatch attempts, next attempt, successful dispatch and sanitized error codes. Its foreign key prevents orphan dispatches. Existing queued requests are backfilled. No résumé text or credentials are stored here. The reservation transaction inserts the outbox row; public request handling attempts dispatch only after commit and preserves its original response even on dispatch failure.

Cloud Tasks carries only a request UUID to the private worker, using OIDC. Ten dispatch attempts are allowed; exhausted rows require an operator and must alert. Task delivery remains at-least-once; database claims and guarded settlement provide idempotence. New private handlers do not change public Jobnex endpoints.

## Remaining release gates

- Isolated migration and failure tests; contract/build checks.
- Safe configuration/rollback inventory and staging accounting/dependency checks.
- Provision queue, least-privilege identities and recovery schedule.
- Deploy worker, pause/drain old polling, switch web dispatch, reopen intake.
- Budgeted live trial and private-auth/ownership checks.
- Delete Rust staging only when safe.
- Observe scale-to-zero and subsequent 24-hour billing/runtime comparison.

No deployment, migration, deletion or live AI test is claimed complete until evidence is added below.

## Step 3 — isolated verification and original database migration

Created temporary Neon branch `on-demand-tailoring-20261006`, ID `br-winter-mode-ayrrnkzi`, from original production branch `br-plain-morning-ayf71kf3`; expires 2026-10-13. Its database fixtures are synthetic and never use production wallets. The repeatable check is `node scripts/cost-audit.cjs test`; it refuses any other branch. Applied the migration twice successfully and tested completion, duplicate task delivery, one refund only, expired-lease review without paid retry, committed request surviving dispatch failure, and active lease exclusion. TypeScript `tsc --noEmit` passed; targeted ESLint passed (worker paths require `--no-ignore`).

Applied the tested additive outbox migration through a direct connection to original `neondb` on `br-plain-morning-ayf71kf3`. No production connection URL, candidate row, job record, existing generation or wallet was changed by the migration.

## Step 4 — staging drain and dependency evidence

Read both databases using Secret Manager credentials in memory. Jobnex had six failed/released requests, one completed/consumed, and zero queued/running. Rust `ai_job_portal_staging` had zero resume requests, reservations and refund records. Checked eleven secret-backed references across the other deployed Cloud Run services: zero Rust staging references. Existing Scheduler targets point to unrelated Cloud Run jobs, not Rust staging. Disabled Rust generation intake; revision `ai-job-portal-staging-00018-s55` now has generation false. Deletion is not yet recorded.

### Sanitized rollback manifest: Rust staging before intake pause

Project `job-scout-508222`; region `us-east1`; revision `ai-job-portal-staging-00017-fp5`, 100% traffic; image `us-east1-docker.pkg.dev/job-scout-508222/job-hunt/ai-job-portal-staging@sha256:b996e3df8c67b15bf770d844eaf7be084871db558a272c7ea5f901de2b28482a`; identity `ai-job-portal-staging-runtime@job-scout-508222.iam.gserviceaccount.com`. CPU 1, memory 2Gi, timeout 600s, concurrency 4, revision min/max 1/1, instance-based CPU, public invoker. Nonsecret environment: APP_ENV=production; BILLING_MODE=disabled; RESUME_AI_MODE=simulated; RESUME_GENERATION_ENABLED=true; RESUME_WORKER_CONCURRENCY=1.

Secret bindings (names only): DATABASE_URL → ai-job-portal-staging-app-rw-database-url; DATABASE_URL_UNPOOLED → ai-job-portal-staging-app-migrator-database-url; WORKER_DATABASE_URL → ai-job-portal-staging-app-worker-database-url; RESUME_AGENT_CACHE_DATABASE_URL → ai-job-portal-staging-resume-agent-cache-database-url; JWT_SECRET → ai-job-portal-staging-jwt-secret. Secrets and image remain available for authorized rollback; initialize with generation false and restore only if needed. This is not an instruction to recreate the deprecated service routinely.

## Step 5 — task infrastructure and image build

Enabled Cloud Tasks. Created `us-east1/resume-tailoring`, dispatch concurrency 1, rate 1/s, maximum 10 delivery attempts over one hour, backoff 30–300s. Created `job-hunt-task-invoker@job-scout-508222.iam.gserviceaccount.com`. Web and worker identities receive queue-scoped enqueuer and actAs on this identity; invoker receives run.invoker on the worker only. No downloaded keys. Build `85cedbc5-f7a8-493e-b9ba-ecc64ae4339e` builds only worker/web using `cloudbuild.on-demand.yaml`; status must be confirmed before deploying.

## Recovery and rollback behavior

No background polling remains in the new worker. Cloud Tasks invokes private `/internal/process` with one UUID; Scheduler invokes private `/internal/recover`. Python is forcibly terminated at 10 minutes, HTTP/task timeouts 12 minutes, lease 15 minutes. Recovery fences expired leases, validates stored Markdown/audit/job context and reconstitutes idempotent usage records before consuming a hold. Without verified output it marks needs_review and releases the hold; it does not repeat AI. Dispatch exhaustion emits `resume_dispatch_exhausted` for operator action.

Rollback: pause public generation intake, pause the task queue and recovery schedule, drain active invocations, then restore previous worker image `repair-20261004` with min/max 1/1 and always CPU. Restore previous web digest `sha256:350274b4349503ed3c98340864b786fb1039108792c482061e0ba6338cd79a58`; reopen only after worker health. Keep outbox migration. Do not run old polling and task workers simultaneously. No data/schema deletion is part of rollback.

## Step 6 — build, task worker rollout and safe smoke tests

Cloud Build `85cedbc5-f7a8-493e-b9ba-ecc64ae4339e` succeeded. Worker digest `sha256:ebb16ab835a5bbad161d7facf119164926d823004aaeac8f5a5e437b18d25a1a`; web digest `sha256:086bba69e7a5fcc2aecdfa7cdd7a1808bb2f8475ad62eb8c04308c4e93b14366`. The expanded isolated test also passed crash-after-persistence recovery and concurrent enqueue reserving exactly one credit and one outbox row. TypeScript and explicit worker ESLint passed.

Paused web generation intake. Deployed worker revision `job-hunt-resume-worker-00018-4rn`, 100% traffic, minimum instances 0 (service and revision), revision max 1, concurrency 1, request-based CPU, timeout 720s. IAM contains only the dedicated task invoker binding, not allUsers. Authenticated health returns mode=tasks. Processing the already completed retained request returns 200 without AI, another charge or changed output. Recovery returns recovered=0, checked=0, exhausted=0. Anonymous worker access returns 403. These are safe infrastructure/idempotence tests, not a fresh paid AI generation.

Created logging metric `jobnex_resume_dispatch_exhausted` and Cloud Monitoring alert `projects/job-scout-508222/alertPolicies/13528285410519513081`. It opens console incidents; no email/chat notification channel is configured. An operator must supply the intended notification destination before relying on external notifications.

### Important recovery/scale-to-zero qualification

The approved five-minute Scheduler call can keep a worker instance resident because it is activity, even with minimum instances 0. Request-based billing removes idle allocation charges; residency is not equivalent to billable runtime. The configuration permits scale-to-zero, but an observed zero instance count cannot be guaranteed with that heartbeat. Asked the user whether to keep the approved handler or move recovery into a short-lived Cloud Run Job; no unapproved recovery architecture change is made. A genuine zero-instance requirement requires resolving this choice, not claiming the heartbeat is idle.

Paid synthetic acceptance requires explicit budget confirmation (asked for maximum US$0.10). No fresh paid AI test has run in this change yet.

## Step 7 — public cutover, recovery and Rust service deletion

Deployed new web image with intake disabled as `job-hunt-web-00015-z84`, then explicitly moved 100% traffic and the existing `neondb-trial` tag to it. Important: this service had pinned revision traffic; a successful deploy alone did not move traffic. The cutover therefore verifies actual traffic, not just latestCreatedRevisionName. Reopened generation intake on `job-hunt-web-00016-g5t` and explicitly moved root/tag traffic to that revision. Public base URL remains `https://job-hunt-web-znsph25yja-ue.a.run.app`.

Cloud Task `acceptance-existing-completed-rest-20261006` invoked the worker with OIDC and returned HTTP 200 (0.306s); queue then became empty. It used the existing completed request `5a80ec07-e241-4f77-b164-42e09fe28cf5` and did not rerun AI. An earlier operator CLI smoke task had malformed JSON due to Windows argument quoting, returned 503 and was explicitly deleted; the REST-created task corrected the test harness. Normal application dispatch uses JSON serialization and base64, not shell quoting.

Created only new Scheduler job `us-east1/resume-tailoring-recovery`, cron every five minutes, UTC, private worker recovery URL, dedicated OIDC invoker, deadline 180s and at most two retries. Existing us-central1 jobs were not changed.

Immediately before deletion, Rust again had zero requests/reservations/refunds, zero reserved wallets, zero pending payments. Deleted **only** `ai-job-portal-staging` in `job-scout-508222/us-east1`. Cloud Run list now contains the six other services, all Ready. Original staging database, secrets, images and identities were preserved. The service can be recovered from the sanitized manifest; its old URL is intentionally no longer an active API.

Live anonymous contract smoke: login returns 200; job, upload, correction, preview, enqueue, polling and Markdown download each return 401. Authenticated worker health/process/recovery return 200; anonymous worker returns 403. This validates route presence and auth boundaries, not full authenticated browser acceptance or fresh generation.

## Completion status and remaining evidence

- [x] Correct repository, branch, migration isolation and original neondb retained.
- [x] Rust staging service safely removed; six other services preserved.
- [x] Permanent two-second polling replaced by private task processing.
- [x] Web and worker use request-based billing and zero configured minimum instances.
- [x] Public paths/payloads/response/status code branches unchanged.
- [x] Mocked settlement, duplicate, refund, lease, persisted-output recovery and concurrent reservation tests pass.
- [x] Real Cloud Task OIDC delivery, empty recovery, anonymous denial and existing-generation idempotence pass.
- [ ] New budgeted live generation and authenticated browser acceptance (awaiting budget authorization).
- [ ] New 24-hour billable-runtime/cost comparison; cannot be measured at deployment time.
- [ ] Notification channel for external dispatch-exhaustion alerts.
- [ ] Guaranteed worker zero-instance observation versus five-minute recovery choice (see qualification above).

No claim of 100% correctness or exact dollar savings. Fresh upload/PDF/cross-user regression tests remain part of authenticated acceptance; existing PDF services were not modified. Review Cloud Monitoring billable_instance_time separately from instance residency. Subsequent comparison must begin after the cutover around 2026-10-06 06:31 UTC and use a complete 24-hour window.

## Step 8 — final deployment verification and GitHub handoff

Verified root traffic: web `job-hunt-web-00016-g5t`, worker `job-hunt-resume-worker-00018-4rn`, 100% each, generation enabled, CPU throttling true, no minimum-instance annotations (default zero). Cloud Scheduler authenticated recovery succeeded at 2026-10-06 06:32:46 UTC, HTTP 200 in 0.306s, with successful Scheduler status. Rust service and former revision now return NOT_FOUND. Removing the service also removes its revision resources; recover using the preserved image and manifest, not an old revision traffic switch.

Committed implementation as `e68df5d` and pushed only to `https://github.com/jobnex/jobnex.git`, branch `codex/on-demand-tailoring`. Draft PR https://github.com/jobnex/jobnex/pull/10 is stacked onto existing integration PR 9 (`codex/neondb-resume-integration`) to avoid mixing the preceding integration changes into this review. Merge/rebase order: integration PR first, then retarget this PR to main. No merge was performed. The original local `ai-job-portal/gcs_gcp.md` gained a retirement notice; that unrelated repository was not pushed.
