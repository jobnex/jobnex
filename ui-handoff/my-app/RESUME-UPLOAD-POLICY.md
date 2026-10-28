# Strict PDF resume uploads — October 21 release

The latest release documentation is [backend deployment and cutover](../../docs/releases/resume-layout-2026-10-21.md), [UI files to integrate](../../docs/ui/resume-layout-2026-10-21.md), and [endpoint contracts](../../docs/ui/resume-layout-endpoints-2026-10-21.md). These documents supersede earlier local-only deployment notes.

## Final upload behavior

The original compact filename card, Preview, delete and Autofill layout is retained. Select/drop a PDF, upload to a private temporary key, validate on the backend, and automatically activate only accepted results. There is no separate review screen or validation button. Rejection/failure preserves the current resume.

Accept ordinary selectable-text single-column PDFs and the four app templates. Allow multiple pages, bullets, ordinary headings and right-aligned dates. Reject independent columns, sidebars, scattered/overlapping text, scans, encryption/corruption, unreliable extraction and non-PDF files. Limit remains 10 MiB. Filenames, fonts and template metadata do not establish approval.

Validation is bound to authenticated user and exact bytes. Activation verifies source ownership, baseline key/content hash, candidate revision/expiry, validator version and reread file hash. Verified bytes are copied to a fresh server-only permanent key before the database transaction publishes the replacement. Direct signing or an old upload URL cannot activate/overwrite the active source.

Deleting a resume clears its active database record/reference/details; saved draft preferences cannot resurrect its filename. Historical generated outputs remain. Exact-key cleanup after a 24-hour grace period checks active ownership and fresh imports before deletion. `scripts/cleanup-resume-imports.cjs` defaults to dry-run; scheduling is part of the coordinated cutover.

## Production backend endpoints

- `JOB_HUNT_SERVICE_URL=https://layout-v1---job-hunt-profile-znsph25yja-ue.a.run.app`
- `JOB_HUNT_WEB_URL=https://layout-v1---job-hunt-web-znsph25yja-ue.a.run.app`

These are deployed production backend endpoints. The existing Vercel production UI has not been deployed by this release; the UI team must use the new source and URLs. Existing untagged backend traffic remains on legacy revisions until cutover. The prepare migration installs staging/proof storage and the request source reference; the strict migration enables global source enforcement only after all upload clients are upgraded.

Use the existing private database, R2, HMAC and Neon Auth configuration. Never deploy the developer `.env.local` or point Vercel at `127.0.0.1:8081`. The temporary Python process was development-only; local UI verification now uses the deployed backend.

## Verification

The named complex layouts are rejected; the standard Mahiswar layout, four gallery PDFs and four newly compiled template PDFs pass layout validation. Template placeholders such as `20XX` remain literal during extraction and must be replaced with real details before activation. No dates are invented.

Checks cover parsing/section fidelity, contacts, roles, dates, bullets, additional/project sections, negative formats, ownership/hash/revision/concurrency, transaction rollback, deletion with/without the migration, saved-draft resurrection, server/worker admission, generator/editor/PDF export regressions, browser flow, TypeScript, lint and production build.

The complete fixture suite uses the privately supplied PDFs and isolated test runtimes from the development workspace; those private files/runtimes are not shipped. Normal UI compilation uses the supplied package lock. No test spends model credits. See the release verification record for actual deployed image digests and authentication probes.
