# Resume upload policy: backend release and UI cutover

Release date: October 21, 2026. Repository branch: `release/resume-layout-20261021`.

## Delivered behavior

The new UI retains the compact upload card: filename, Preview, delete, and the existing Autofill toggle. Empty cards accept click or drag-and-drop. Backend validation runs automatically; accepted PDFs activate through an ownership/hash/revision checked transaction. Rejection or failure leaves the current resume unchanged. No separate review screen is shown, following the final product decision.

Allowed: ordinary single-column text PDFs and all four app templates, including multiple pages, ordinary headings/bullets, and right-aligned dates. Rejected: independent columns, sidebars, scattered/overlapping text, scans/image-only pages, encrypted/corrupt/unreadable files and non-PDF uploads. Maximum: 10 MiB. Names, fonts and PDF metadata are not an allowlist.

The validator rejects the supplied Shivangi and Ria layouts and accepts the supplied Mahiswar layout. Both the original gallery PDFs and newly exported PDFs from MIT CAPD Classical, Modern Ivy LaTeX, Tech Specialist and Minimalist Executive pass the fixture suite. Classification is conservative; arbitrary PDFs cannot be guaranteed parsable.

## Deployment scope

The owner requested backend deployment and a UI-team handoff, with Vercel deployment left to the UI team. Therefore the new backend is served at versioned Cloud Run URLs. Existing untagged production profile/web traffic and the existing generation worker remain on their current revisions. The Vercel site has not been deployed by this release.

- New validation profile base: `https://layout-v1---job-hunt-profile-znsph25yja-ue.a.run.app`.
- New strict-admission web base: `https://layout-v1---job-hunt-web-znsph25yja-ue.a.run.app`.
- New private worker: see `deployment.json` beside this document for its exact URL and revision.
- Project: `job-scout-508222`; region: `us-east1`.
- With explicit owner approval, the existing `job-hunt-web-runtime` service account was granted `roles/secretmanager.secretAccessor` on exactly three already-configured secrets: `resume-pdf-compiler-secret`, `resume-pdf-backend-r2-access-key`, and `resume-pdf-backend-r2-secret-key`. No secret values were published or changed.
- The shared database now has the upload staging table, admission proof function, and `source_import_id` request column. The prepare migration deliberately does not install the global generation trigger.
- New web requests write their validated import ID explicitly, so the new worker verifies the saved snapshot before any model call. The legacy web and worker retain their existing behavior until cutover.

This is a backend-first staged rollout, not global enforcement on the existing Vercel UI. Do not claim that legacy clients are blocked until the final cutover below is complete.

## Database and storage behavior

`resume_imports` separates temporary candidates from the active base. Validation is bound to authenticated user, source key, file SHA-256 and validator version `single-column-v1`. Confirmation checks expiry, revision, baseline file key and content digest, and blocks replacement during queued/running generation. It rereads bytes, verifies their hash, and copies them to a fresh server-only permanent key before atomically publishing the active resume and parsed details.

Rejected files cannot activate. A failed/uncertain commit never synchronously deletes the possible active object. Confirmed proof/history rows remain available. Replacement/delete use the same per-user advisory lock as admission. Historical generated resume rows remain available.

Deletion works before and after the staging migration. Saved draft preferences no longer restore a deleted filename or override the active source. Other manually edited matching preferences are retained. Physical R2 cleanup is delayed until the 24-hour grace period and must verify active ownership before exact-key deletion.

## UI-team deployment sequence

1. Integrate the complete `ui-handoff/my-app` source or the documented exact file set. The root application in this repository is the backend service source, not the latest supplied UI.
2. Configure the server-only environment using the endpoint document. Never copy the developer `.env.local`; do not use `127.0.0.1:8081` in Vercel.
3. Deploy a Vercel preview and verify: standard PDF uploads, Ria/Shivangi layout rejection, current-source preservation, PDF Preview, delete/reload, and generation status tracking. Use a dedicated test account when available. Accepted test uploads affect the shared database and R2.
4. Switch the production Vercel deployment to this UI. Set `JOB_HUNT_SERVICE_URL` and `JOB_HUNT_WEB_URL` to the versioned URLs above. Keep existing authentication secrets, database and R2 bindings.
5. After confirming all upload clients use the new flow, pause legacy generation admissions and let old in-flight jobs settle. Apply `migrations/20261021_strict_resume_imports.sql` to enable global source enforcement. Existing stored resumes must be reuploaded/validated before their next generation; historical outputs stay readable. Do not apply this strict trigger while the old UI is the only upload client.
6. Route all generation producers through the new strict backend and worker; update the recovery scheduler to the new worker. Keep Cloud Tasks OIDC audience equal to the new worker service URL. The old worker must no longer consume newly admitted work after final enforcement.
7. Schedule hourly `node scripts/cleanup-resume-imports.cjs --apply` using the established private DATABASE_URL/R2 bindings. Dry-run first. The script defaults to dry-run and deletes no prefixes. This release includes the job code; the UI team/operator must confirm the scheduler binding during cutover.
8. Run the acceptance checks and record the Vercel deployment URL, commit and final trigger/worker/scheduler activation in the deployment record.

## Rollback

Before the UI cutover, legacy service traffic is unchanged; stop using the versioned endpoints to roll back the staged integration. Preserve the additive tables, source hashes and historical outputs.

After final enforcement, pause generation admissions before reverting UI/backend versions. Do not send unvalidated legacy requests to a strict worker. Roll Vercel back to its recorded prior deployment and restore recorded Cloud Run traffic only as a coordinated operator action. Do not drop proof/history tables or delete candidate data as a rollback step.

## Verification

Release checks cover geometry/format fixtures, parsing fidelity, user ownership, staged hash/revision/expiry checks, stale/concurrent source rejection, transaction rollback, safe deletion, saved-draft resurrection, server/worker admission before credits/model calls, frontend browser behavior, generator regressions, TypeScript, lint and production UI build. Runtime checks exercise signed production validation, unauthenticated denial and production database proof checks without model spending.

Exact image digests, build IDs, revisions, traffic snapshots, GitHub commit and test evidence are recorded in `deployment.json` and `verification.json` beside this document after verification. No credentials or candidate content belong in these files.

See [UI integration](../ui/resume-layout-2026-10-21.md) and [endpoint contract](../ui/resume-layout-endpoints-2026-10-21.md).
