# Backend operations follow-up: October 21, 2026

The owner requested keeping generation working until the UI team deploys. Global strict admission, default profile/web traffic changes and recovery retargeting therefore remain deferred. This is not a completed global cutover.

## Completed

The private Cloud Run job `resume-import-cleanup` is deployed in project `job-scout-508222`, region `us-east1`. The enabled Cloud Scheduler job of the same name runs hourly at minute 17 (`17 * * * *`, UTC).

Scheduler invokes the Cloud Run Jobs API using OAuth as the existing `job-hunt-task-invoker` account. Its new `roles/run.invoker` binding is scoped to this job only. Cleanup runs as the existing `job-hunt-web-runtime` account, reusing existing database and R2 secret bindings. No new Secret Manager grants were made.

Dry-run execution `resume-import-cleanup-pw89d` succeeded with zero candidates and zero deletions. Scheduler-triggered execution `resume-import-cleanup-xqkl4` also completed successfully. See `cleanup-deployment.json` for the image digest and deployment record.

Cleanup safety checks cover active files, saved preference/draft references, fresh validations, expired files and dry-run behavior. Cleanup scans only temporary imports. Permanent files require explicit retirement records; arbitrary legacy permanent uploads are not scanned. No historical generated PDFs are targeted.

The image reuses the released worker image and dependencies. Build from the repository root with `services/resume-import-cleanup/Dockerfile`; implementation is `scripts/cleanup-resume-imports.cjs`. The image defaults to dry-run. The deployed job uses command `node` and arguments `/app/cleanup.cjs,--apply`.

## Preserved until UI deployment

The new `layout-v1` endpoints and strict worker remain available. Default profile/web traffic and `resume-tailoring-recovery` remain on legacy targets. The staging table and proof function exist; the global `resume_source_admission` trigger remains disabled.

Do not send legacy generation to the strict worker before validated uploads are available. Recovery uses a shared outbox; changing its target before completing admission cutover can fail legacy work or use the wrong worker contract.

## Final cutover

1. Deploy the latest UI, including the Autofill follow-up, using the documented `layout-v1` endpoints. Verify accepted/rejected uploads, replacement, deletion and matching preferences.
2. Pause legacy admissions, settle existing work, and route all generation producers through the new contract.
3. Apply `migrations/20261021_strict_resume_imports.sql` and verify invalid sources cannot reserve credits.
4. Retarget recovery to the strict worker with its exact URL as the OIDC audience. Ensure legacy workers cannot consume new work.
5. Verify authenticated generation and PDF export with an approved test account and credit budget. Record the Vercel deployment, trigger and routing state. Health probes alone do not prove paid generation.

Cleanup is already scheduled. Do not create a duplicate during UI integration. For rollback of cleanup alone, pause its scheduler; preserve proof/history and active resumes. Do not roll back generation routing as part of cleanup rollback.
