# Combined UI handoff: resume uploads, parsing and autofill

Updated November 1, 2026 (America/New_York). This document consolidates the earlier upload/autofill handoff and the follow-up parser fixes. It is the single handoff for both releases.

**Status:** Backend deployed and verified on GCP. Frontend patch published in PR #15; deployment to the Vercel project serving `www.jobnex.co` is still pending. The UI team owns preview acceptance, frontend production deployment and the final browser check.

**Integration fixes completed November 1, 2026:** Validated PDF activation now creates its confirmed import in the same transaction as the active resume/profile. Production admission accepts v1 and proof-matched v2 imports with ownership and content-hash checks. The save path preserves coursework, GPA and locations. These frontend corrections are in PR #15 and still require the UI team's preview and Vercel rollout.

**Preview/export corrections:** Wrapped summaries remain paragraphs, role locations remain metadata, and skill continuations avoid duplicate commas. Fallback project sections render in ResumeSheet and the legacy PDF compiler. All four compiler themes passed installed checks for project text, metrics, locations and clickable email. The compiler correction is live; the public frontend remains unverified until the UI deployment.

**Approved format scope:** PDF uploads can establish the confirmed source required for generation. DOCX upload and preview remain available, but users must export DOCX to PDF and upload that PDF before generation. No DOCX confirmed import is created.

Shareable resources:

- [Read this handoff on GitHub](https://github.com/jobnex/jobnex/blob/fix/resume-validated-activation/docs/ui/combined-resume-handoff-2026-10-31.md)
- [Download the complete handoff ZIP](https://github.com/jobnex/jobnex/raw/refs/heads/fix/resume-validated-activation/docs/ui/combined-ui-resume-handoff-2026-10-31.zip)
- [Review the implementation in PR #15](https://github.com/jobnex/jobnex/pull/15)

## Patch to review

- Repository: https://github.com/jobnex/jobnex
- Draft PR: https://github.com/jobnex/jobnex/pull/15
- Branch: `fix/resume-validated-activation`
- Latest implementation commit: `9216d37e205ddb8901f3f941bfbd7efbbeee0983` (includes the earlier upload fixes)
- Patch base: `f9a3b8163af57ff780696754850425985c09807f`
- Target: the Vercel project serving `www.jobnex.co`. Its project identity and actual deployed source commit still need confirmation by the UI owner.

The combined patch changes ten implementation/test files. Do not replace the entire frontend with an older Cloud Run checkout. The ZIP contains the current Git patch, exact changed-file snapshots under `files/`, runnable upload/confirmation and content regression checks, and SHA-256 hashes. It contains no credentials, environment files or customer resumes.

## Problem and resulting behavior

The previous flow committed the upload and deleted older cloud files before parsing finished. It then parsed again after activation, allowing a failed second parse to leave inconsistent base data. Empty inferred values also left fields from the previous resume on screen.

The patch:

1. Validates the staged upload before activation.
2. Re-reads the uploaded bytes and checks their SHA-256 against the parser response.
3. Copies those bytes to a new server-only R2 key so reusable browser PUT URLs cannot alter the active file.
4. Saves content, parsed data, file metadata, PDF confirmed-import proof and active-profile references in one DB transaction under the existing user advisory lock. It refuses activation while resume generation is queued or running.
5. Uses the validated extraction in the UI, avoiding a second parse. Rejected uploads restore the previous displayed resume.
6. Replaces inferred cities, skills, domains and other inferred values when autofill is enabled; missing values clear stale fields. Explicit job settings and autofill being disabled are preserved.
7. Returns useful parser errors to the UI.
8. Maps the backend's `Senior-level` value to the UI's `Senior` option so the seniority radio remains selected.

## Changed files

| File | Purpose |
| --- | --- |
| `app/actions/storage.ts` | Validation, immutable copy and transactional activation |
| `app/(main)/job-hunt/manage/page.tsx` | Use committed extraction, clear stale fields, restore display on failure |
| `lib/profile-service.ts` | Validate responses and forward parser error details |
| `app/api/job-hunt/profile/route.ts` | Preserve extraction error messages |
| `app/actions/preferences.ts` | Preserve coursework and locations through schema validation |
| `lib/resume-content.ts` | Preserve education details, GPA, locations and source section order |
| `lib/resume-parser.ts` | Join wrapped summaries/skills and separate role locations |
| `components/ResumeSheet.tsx` | Render fallback project/additional sections |
| `scripts/test-resume-upload.cjs` | Rejections, changed bytes, atomic PDF confirmation and DOCX scope |
| `scripts/test-resume-content.cjs` | Wrapped content and save-preservation regression checks |

## Backend dependency: already deployed

The parser, compiler and admission fixes are deployed. The revisions and rollback targets below were checked against GCP. The frontend still requires preview acceptance and deployment.

Earlier fixes included:

- Preserve employer-adjacent locations in role-first headers and candidate names beside role titles.
- Recover Word list markers and positioned project headings so accomplishments stay with their own role or project.
- Parse parenthesized and square-bracketed date ranges, including technician roles, and separate `degree @ institution` records.
- Return useful errors for missing employers or work history that cannot be separated reliably.
- Repair the observed line-wrap splits in automated, transformation and remediation while preserving source evidence.
- Replace stale resume-derived preferences when autofill is enabled while preserving explicit job settings and respecting autofill being disabled.

Follow-up audit fixes included:

- Preserve a conservative city/state header location, infer explicitly named GCP/BigQuery/dbt/Fivetran skills, and separate project titles from technology lists with per-value source evidence.
- Preserve contiguous wrapped coursework, clean GPA separators, and retain the source's section order when rebuilding Markdown.

- Recover bracketed dates and role/location metadata when PDF spacing collapses.
- Resolve repeated Skills text by section, preserving project headings containing technology lists or pipe separators.
- Accept concise graduate resumes with a recognized name, education and skills; unstructured short documents still fail validation.
- Preserve unmarked PDF sentence boundaries and separate Word paragraphs, including Word paragraphs without terminal punctuation.
- Separate explicit city/state locations from employers ending in Corp, Inc, LLC or Ltd rather than polluting employer names and inferred cities.

Use the existing **ordinary/legacy profile service** URL and service secret configured for the current frontend. The ordinary service is `https://job-hunt-profile-znsph25yja-ue.a.run.app`, active revision `job-hunt-profile-00081-xew`. The `quality-compat` tag points to the same legacy contract. Do not switch this frontend to `layout-v1` or `certified-v1`: those preview routes have different response contracts.

The signed server-to-server request to `/profile/resume-from-r2` includes `objectKey`, `fileName`, `downloadUrl` and `validateOnly: true`, plus `requireCanonical: true` for PDF uploads. Its response must include:

```text
valid: true
resume_details: object
preferences: object
markdown: nonempty string
fileSha256: 64-character SHA-256 hex string
validatorVersion: single-column-v2 (PDF canonical mode)
resume_details.resumeDocument: canonical source with matching version and file hash (PDF)
```

The backend preflight does not write customer DB records. The frontend fails safely if this extended response is unavailable. Keep the existing secret in server-only environment variables; never expose it through `NEXT_PUBLIC_*`.

The admission-function migration `20261101_resume_validator_v2.sql` was applied to production neondb with approval. It changed one function, retained all seven existing confirmed v1 imports and changed no customer resume rows. Do not reapply it from the frontend. No new npm dependency is required. Existing Vercel production DB, R2, authentication and profile-service settings are required. No tokens belong in the handoff or browser.

## Apply and verify

Prefer reviewing PR #15 against the Vercel-connected branch. If the actual deployed UI differs from this patch base, port the combined implementation/test diff into that branch and preserve its unrelated UI features. Do not blindly replace files from `files/`.

Alternatively, from the intended frontend checkout:

```powershell
git apply --check resume-upload.patch
git apply resume-upload.patch
npm ci
node scripts/test-resume-upload.cjs
node scripts/test-resume-content.cjs
npx tsc --noEmit
npm run build
```

The build requires a configured DB URL even for route-module initialization. Local verification used a non-production loopback placeholder; it did not verify production DB connectivity. Use Vercel's existing project configuration for preview and production deployments.

Verification completed for this update: TypeScript and `npm run build -- --webpack` passed (loopback DB placeholder only). The default local Turbopack attempt crashed creating a CSS subprocess; the UI owner must verify the configured Vercel build; upload checks passed for parser rejection, service failure, wrong-owner paths, changed bytes, DB failure, import-insertion rollback and successful PDF confirmation. DOCX upload does not create a confirmed import. Parser tests: 73 local; 67 installed per image, no skips. Staged HTTP verification: 36 synthetic cases on each versioned route plus three health checks, 75 checks total. Ordinary legacy canonical preflight passed a local no-database positive/negative check; its deployed image passed the installed suite. Generator source/parser contracts passed. Compiler: four themes passed both local template checks and installed rebuilt-binary checks. Production revision/digest/configuration and health verification passed. No customer upload or model-provider generation was performed for this release. Frontend browser and Vercel acceptance remain pending.

## Vercel preview acceptance

Use a test account with a known active resume. Preserve the user's current settings and use authorized test files.

- Upload a supported PDF and DOCX. Confirm filename, content, dates, employers, locations, education and bullet boundaries agree with the source after reload.
- Upload an unreadable or incomplete file. Confirm the old active resume and preferences remain usable, the UI restores its old filename, and the error explains the problem.
- Upload two different resumes with autofill enabled. Confirm absent inferred values do not carry over. Repeat with autofill disabled and confirm the user's screen fields remain unchanged.
- Verify PDF activation creates a confirmed v2 import whose object key matches the active resume and whose canonical version/file hash and normalized content hash match. Verify DOCX upload remains usable but generation asks for PDF conversion.
- Verify preview, editor save and all four PDF themes retain fallback projects, metrics, email links, coursework, GPA and locations; wrapped summaries/skills must remain intact.
- Verify a generated resume uses the newly activated base. Do not spend user credits or call the model provider without authorization for that verification.
- Exercise a parser outage and a DB failure in the preview environment. Confirm activation does not partially replace resume/profile records.
- Verify signed PDF preview and subsequent reload use the new immutable key.
- Confirm `Senior-level` returned by autofill selects the `Senior` radio option.

Include these parser regression styles in the successful-upload checks:

| Input style | Expected result |
| --- | --- |
| Bracketed dates with collapsed spacing | Correct employer, role, dates and location |
| Two projects with technology lists or pipe separators | Two separate projects with their own accomplishments |
| Short graduate resume with name, education and skills | Accepted without requiring employment history |
| Separate unmarked PDF sentences / Word paragraphs | Accomplishments retain their boundaries |
| Employer legal suffix followed by city/state | Employer and location remain separate |
| Role-first header, name beside title, Word lists, degree @ institution | Earlier parsing corrections remain intact |

Use synthetic files or a separate test account for routine verification. Customer uploads replace active base resumes and can change autofilled preferences; obtain the account owner's authorization before using a customer account. Never include customer files or credentials in test reports.

After passing preview acceptance, deploy to the Vercel production project and repeat a small authorized upload/reload check on `www.jobnex.co`. Record the deployment URL, source commit and test results.

The UI team's completion note should include: Vercel project and production deployment URL; deployed source commit; preview and production upload/reload results; any remaining issues; and the previous Vercel deployment available for rollback. Backend availability alone does not establish frontend completion.

## Storage and rollback

The patch intentionally stops immediate pruning of previous R2 objects. That keeps failed uploads recoverable and avoids deleting another concurrent upload. Failed DB activation may leave an orphan server-only copy. Ownership-aware cleanup is required to bound retained storage; do not add an unguarded prefix deletion loop.

Rollback the frontend through Vercel's prior production deployment or revert these commits in the connected branch. Do not delete active immutable objects during rollback. The backend remains compatible with the old frontend.

Backend reference: GCP project `job-scout-508222`, region `us-east1`, service `job-hunt-profile`.

| Route | Active revision | Backend rollback revision |
| --- | --- | --- |
| Ordinary / quality-compat | `job-hunt-profile-00081-xew` | `job-hunt-profile-00074-pul` |
| layout-v1 | `job-hunt-profile-00082-var` | `job-hunt-profile-00075-fox` |
| certified-v1 | `job-hunt-profile-00083-tar` | `job-hunt-profile-00076-sid` |

Legacy PDF compiler: `resume-pdf-compiler-00004-wex`, rollback `resume-pdf-compiler-app-fixes-1010`. The new image preserves the deployed Python server and runtime; only the embedded-template Rust binary changed.

Ordinary traffic was verified at 100% on the listed legacy revision. Backend rollback, if needed, means restoring each affected route tag and ordinary traffic to its previous revision; it is separate from the UI rollback. This release requires no stored-record rollback.

Existing stored resumes and previously polluted preferences are not automatically repaired by this code release. Review/reparse affected records separately with current-state checks. Scanned PDFs, ambiguous multiple columns and Word text boxes remain outside verified support; no claim of perfect parsing for every resume is made.

Employer/location splitting is conservative. PDF sentence recovery cannot infer every author's intended bullet grouping. Follow-up ownership-aware R2 retention cleanup and repairs to already stored affected records are separate from this UI deployment.
