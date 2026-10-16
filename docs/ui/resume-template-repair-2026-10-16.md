# Resume preview and PDF integration fixes — October 16, 2026

The reported draft stored a role as `### ### AI Engineer`. The shared parser removed only the first heading marker, leaving `### AI Engineer` visible in every template. This release fixes that parsing defect, section headings stranded at page boundaries, education details relabeled during visual edits, and the incompatible local PDF proxy routes.

These changes are applied to the localhost app. No GCP frontend deployment, GCP permission change, model change, paid generation, customer database write, or active resume replacement was performed. The UI team owns production integration and deployment.

## Source code to collect

Use the files under `docs/ui/releases/resume-template-20261016/local-app/` on this documentation branch. Original paths are retained. `manifest.json` lists SHA-256 checksums. Apply this overlay after the [October 10 source bundle](app-fixes-handoff-2026-10-10.md); do not replace unrelated application code.

| Path beneath the app root | Change |
| --- | --- |
| `lib/resume-parser.ts` | Normalize repeated heading markers in heading fields only. Support level 3–6 entry headings. Preserve ordinary hashes, companies, bullets, section order, contacts, skills, and projects. Do not invent a company when none is supplied. Preserve education detail labels during serialization. |
| `components/A4ResumePages.tsx` | Keep a section heading and consecutive entry headings together with their first content block when they fit on a page. |
| `lib/job-resumes.ts` | Integrate the reviewed server implementation for compiler/R2 application exports, application ownership, transactional generation fencing, manual edit persistence, and failure cleanup. |
| `app/api/resume/export/route.ts` | Replace the old UI-server proxy with the authenticated direct server implementation. Accept the generation guard and use the updated parser through `lib/job-resumes.ts`. |
| `app/api/resume/base/route.ts` | Replace the old proxy with the reviewed temporary PDF formatting route. Formatting does not upload a new active base, change profile data, invoke AI, or spend credits. |
| `scripts/check-resume-release.tsx` | Reproduce malformed role/project/education headings, retain data through edit round-trips, and test consecutive heading pagination in all four templates. |
| `scripts/check-pdf-routes.mjs` | Check authentication, input validation, template validation, ownership, real compiler/R2 interoperability, and stale-generation rejection. The live mode uses synthetic data and a mocked database. |

The source originally integrated for the direct PDF routes was the reviewed `production-web` implementation from the prior handoff. The October 10 `local-app` base/export files are obsolete proxy adapters; do not copy them back over this overlay. No new package dependency is required.

Local working source: `C:\Users\desir\Projects\techjobs\archive-review-20261008\app-source\my-app`. This machine path is for collection only; production must use the UI team's repository and hosting environment.

## Runtime integration

Run these routes on the authenticated server, with the existing Neon session and database configuration. Do not place compiler credentials or R2 credentials in client components or public environment variables.

Required server configuration:

- `RESUME_COMPILER_URL=https://resume-pdf-compiler-znsph25yja-ue.a.run.app`
- `RESUME_COMPILER_SECRET`: provision the existing `resume-pdf-compiler-secret` securely on the UI hosting platform.
- Existing `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and `R2_BUCKET_NAME` (or `R2_BUCKET`).
- `R2_ENDPOINT`, or the existing `R2_ACCOUNT_ID` and correct `R2_JURISDICTION` fallback.
- Existing `DATABASE_URL` and authentication configuration.

The localhost compiler URL and bearer configuration were provisioned privately in the local server environment. No credential values are included in this handoff or source bundle. No additional GCP Secret Manager grants were made.

The compiler contract remains `POST /api/v1/ui-export`, with bearer authentication and `{resume, theme, templateId, uploadUrl}`. `resume` is the structured output of the updated parser, not raw Markdown. The Rust/Typst compiler renders the selected A4 template and uploads to the server-generated signed R2 PUT URL.

The application contracts remain:

- `POST /api/resume/export`: `{jobId, markdown, templateId, expectedGenerationId?}`; the current UI supplies the generation ID. Returns a short-lived `downloadUrl`. Rejects stale drafts with 409 and preserves the prior saved PDF on pre-commit failure.
- `POST /api/resume/base`: `{markdown, templateId}`; returns PDF bytes and cleans its temporary object. Committing a new active base is a separate, explicit Manage workflow.

All current ResumeModal callers must retain `exportJobId`, `expectedGenerationId`, durable `onSave`, and read-only historical drafts from the prior handoff. Do not work around stale-generation validation by dropping the generation ID from requests.

## Verification performed

1. The malformed heading regression failed before the parser change and passed afterward.
2. The real reported draft passed parse/serialize/parse equivalence for contacts, summary, skills, experience, projects, education, and section order. It contains two role entries, twelve experience bullets, three projects, eight skill categories, and twenty-seven total list bullets including summary/projects.
3. All four templates passed live browser checks on desktop and at 390 × 844: two A4 preview pages, all twenty-seven bullets and five sections present, no literal heading markers, no measured page overflow, no stranded ending heading, and no toolbar buttons outside the viewport.
4. A temporary visual edit normalized the role heading. Cancel restored the exact original Markdown. Save was not invoked.
5. Four PDFs compiled locally using the checked-in compiler Typst template and bundled fonts. Every supplied contact, role, company, skill, project, education value, and bullet in the reported draft survived text extraction. All pages measured A4; all eight rendered pages were visually reviewed. Browser and PDF line wrapping/page breaks can differ.
6. The real GCP compiler and R2 passed synthetic temporary base PDF and application PDF tests for all four templates. Downloaded bytes were valid PDFs. Application database access was mocked; only this test's own temporary object namespaces were used and cleaned. Stale-generation rejection returned 409 without a simulated save. These tests prove compiler/storage and route interoperability, not a live customer database save.
7. Authentication, malformed input, unsupported template, and application ownership negative controls passed. TypeScript, changed-file ESLint, the resume release suite, and historical/stale-PDF/deleted-base/active-generation mutation regressions passed.

The first live verification failure came from different Error constructors in separate test VM contexts; sharing the native Error constructor corrected the harness. No application change was made to weaken stale-generation handling.

Run from the integrated app root:

```text
node node_modules/typescript/bin/tsc --noEmit --incremental false
node node_modules/eslint/bin/eslint.js --no-ignore lib/resume-parser.ts lib/job-resumes.ts components/A4ResumePages.tsx app/api/resume/export/route.ts app/api/resume/base/route.ts scripts/check-resume-release.tsx scripts/check-pdf-routes.mjs
node node_modules/tsx/dist/cli.mjs scripts/check-resume-release.tsx
node scripts/check-pdf-routes.mjs
```

The release suite's older route regressions require the existing generated-PDF/base-edit routes from the full October 10 `production-web` bundle. The localhost checkout uses the sibling reviewed candidate for those checks; do not mistake those older boundary checks for a real local customer save.

For a deliberate compiler/storage check, securely populate the required server environment and run `node scripts/check-pdf-routes.mjs --live`. This invokes the compiler and writes disposable synthetic PDFs to R2, with a mocked database. No model/provider credit is used. It cleans only its own generated keys; do not substitute customer IDs or object keys.

## Remaining release checks and limits

The previous localhost PDF proxy incompatibility is replaced in this code and the direct route pipeline passes synthetic live tests. The October 11 readiness report describes the earlier state. Production remains dependent on the UI team applying these routes, parser, libraries, and private server configuration together.

Before a customer release, the UI team must verify authenticated export/download in staging using a disposable owned application, durable edit/save/reopen, stale-generation rejection, base formatting followed by the normal upload/replace flow, and historical read-only views. A live customer database save, customer base replacement/deletion, new paid generation, and production frontend deployment were not performed in this task. This is not full-app release approval.

The second AI Engineer role in the reported saved Markdown has no employer or dates. Formatting cannot recover facts absent from the saved draft. No employer or dates were copied from another role. The draft still requires the user's factual review. Its supplied section order and joined source words are preserved.

An individual atomic block taller than an A4 content area can still exceed the browser paginator's capacity. The reported long draft and test fixtures fit and paginate correctly; arbitrary pathological inputs are not proven. Unsupported section schemas and every possible source layout are outside this focused repair.

Screenshots, real resume text, generated customer test PDFs, local environment files, and credentials remain outside the GitHub handoff. The source bundle and verification scripts contain no customer identity or credential values.
