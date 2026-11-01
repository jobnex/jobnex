# Combined UI handoff: resume uploads, parsing and autofill

Updated October 31, 2026 (America/New_York). This document consolidates the earlier upload/autofill handoff and the follow-up parser fixes. It is the single handoff for both releases.

**Status:** Backend deployed and verified on GCP. Frontend patch published in PR #15; deployment to the Vercel project serving `www.jobnex.co` is still pending. The UI team owns preview acceptance, frontend production deployment and the final browser check.

**Rollout hold — integration gaps found in the subsequent audit:** The checked upload patch activates a new file key without creating the confirmed import required by the checked generation-admission path. The production admission function also requires validator version `single-column-v1`, while the newer versioned parser reports `single-column-v2`. Separately, the checked resume-details save path can rebuild Markdown without coursework, GPA or locations. The public frontend and worker routing have not been verified. Resolve these compatibility and preservation issues and validate end-to-end using a test account before deploying this patch. Preserve ownership, source-hash and validation checks; do not bypass them to make admission pass.

Shareable resources:

- [Read this handoff on GitHub](https://github.com/jobnex/jobnex/blob/fix/resume-validated-activation/docs/ui/combined-resume-handoff-2026-10-31.md)
- [Download the complete handoff ZIP](https://github.com/jobnex/jobnex/raw/refs/heads/fix/resume-validated-activation/docs/ui/combined-ui-resume-handoff-2026-10-31.zip)
- [Review the implementation in PR #15](https://github.com/jobnex/jobnex/pull/15)

## Release to deploy

- Repository: https://github.com/jobnex/jobnex
- Draft PR: https://github.com/jobnex/jobnex/pull/15
- Branch: `fix/resume-validated-activation`
- Fix commits: `8332d46f202397373813ff2d58c69a943e653a64` and `9e4b3328f5f5fd6c9aa5169114baa3cb5d22b3b1`
- Patch base: `f9a3b8163af57ff780696754850425985c09807f`
- Target: the Vercel project serving `www.jobnex.co`. Its project identity and actual deployed source commit still need confirmation by the UI owner.

Deploy only the five changed files in this PR. Do not replace the entire frontend with an older Cloud Run checkout. The ZIP contains a Git patch, exact changed-file snapshots under `files/`, a runnable failure check, and SHA-256 hashes. It contains no credentials, environment files or customer resumes.

## Problem and resulting behavior

The previous flow committed the upload and deleted older cloud files before parsing finished. It then parsed again after activation, allowing a failed second parse to leave inconsistent base data. Empty inferred values also left fields from the previous resume on screen.

The patch:

1. Validates the staged upload before activation.
2. Re-reads the uploaded bytes and checks their SHA-256 against the parser response.
3. Copies those bytes to a new server-only R2 key so reusable browser PUT URLs cannot alter the active file.
4. Saves content, parsed data, file metadata and active-profile references in one DB transaction under the existing user advisory lock. It refuses activation while resume generation is queued or running.
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
| `scripts/test-resume-upload.cjs` | Isolated failure-path checks |

## Backend dependency: already deployed

Both backend releases are already included in the active revisions below. No additional backend deployment is required to apply this UI patch.

Earlier fixes included:

- Preserve employer-adjacent locations in role-first headers and candidate names beside role titles.
- Recover Word list markers and positioned project headings so accomplishments stay with their own role or project.
- Parse parenthesized and square-bracketed date ranges, including technician roles, and separate `degree @ institution` records.
- Return useful errors for missing employers or work history that cannot be separated reliably.
- Repair the observed line-wrap splits in automated, transformation and remediation while preserving source evidence.
- Replace stale resume-derived preferences when autofill is enabled while preserving explicit job settings and respecting autofill being disabled.

Follow-up audit fixes included:

- Recover bracketed dates and role/location metadata when PDF spacing collapses.
- Resolve repeated Skills text by section, preserving project headings containing technology lists or pipe separators.
- Accept concise graduate resumes with a recognized name, education and skills; unstructured short documents still fail validation.
- Preserve unmarked PDF sentence boundaries and separate Word paragraphs, including Word paragraphs without terminal punctuation.
- Separate explicit city/state locations from employers ending in Corp, Inc, LLC or Ltd rather than polluting employer names and inferred cities.

Use the existing **ordinary/legacy profile service** URL and service secret configured for the current frontend. The ordinary service is `https://job-hunt-profile-znsph25yja-ue.a.run.app`, active revision `job-hunt-profile-00074-pul`. The `quality-compat` tag points to the same legacy contract. Do not switch this frontend to `layout-v1` or `certified-v1`: those preview routes have different response contracts.

The signed server-to-server request to `/profile/resume-from-r2` includes `objectKey`, `fileName`, `downloadUrl` and `validateOnly: true`. Its response must include:

```text
valid: true
resume_details: object
preferences: object
markdown: nonempty string
fileSha256: 64-character SHA-256 hex string
```

The backend preflight does not write customer DB records. The frontend fails safely if this extended response is unavailable. Keep the existing secret in server-only environment variables; never expose it through `NEXT_PUBLIC_*`.

No new DB migration or npm dependency is required by this patch. Existing Vercel production DB, R2, authentication and profile-service settings are required. No tokens belong in the handoff or browser.

## Apply and verify

Prefer reviewing PR #15 against the Vercel-connected branch. If the actual deployed UI differs from this patch base, port the five-file diff into that branch and preserve its unrelated UI features. Do not blindly replace files from `files/`.

Alternatively, from the intended frontend checkout:

```powershell
git apply --check resume-upload.patch
git apply resume-upload.patch
npm ci
node scripts/test-resume-upload.cjs
npx tsc --noEmit
npm run build
```

The build requires a configured DB URL even for route-module initialization. Local verification used a non-production loopback placeholder; it did not verify production DB connectivity. Use Vercel's existing project configuration for preview and production deployments.

Verification already completed: TypeScript and production build passed; upload checks passed for parser rejection, service failure, wrong-owner paths, changed bytes and simulated DB failure. The follow-up backend release passed 71 local tests, 65 installed tests per image without skips, 83 staged HTTP checks and 83 live HTTP checks. The HTTP checks comprise 40 cases on each versioned route plus three health checks; ordinary legacy coverage is health plus installed tests, rather than a user-record-writing production upload. Both generator source-parser checks and the canonical-document contract passed. These do not replace browser verification of the Vercel rollout.

## Vercel preview acceptance

Use a test account with a known active resume. Preserve the user's current settings and use authorized test files.

- Upload a supported PDF and DOCX. Confirm filename, content, dates, employers, locations, education and bullet boundaries agree with the source after reload.
- Upload an unreadable or incomplete file. Confirm the old active resume and preferences remain usable, the UI restores its old filename, and the error explains the problem.
- Upload two different resumes with autofill enabled. Confirm absent inferred values do not carry over. Repeat with autofill disabled and confirm the user's screen fields remain unchanged.
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

Only after preview acceptance, deploy to the Vercel production project and repeat a small authorized upload/reload check on `www.jobnex.co`. Record the deployment URL, source commit and test results.

The UI team's completion note should include: Vercel project and production deployment URL; deployed source commit; preview and production upload/reload results; any remaining issues; and the previous Vercel deployment available for rollback. Backend availability alone does not establish frontend completion.

## Storage and rollback

The patch intentionally stops immediate pruning of previous R2 objects. That keeps failed uploads recoverable and avoids deleting another concurrent upload. Failed DB activation may leave an orphan server-only copy. Ownership-aware cleanup is required to bound retained storage; do not add an unguarded prefix deletion loop.

Rollback the frontend through Vercel's prior production deployment or revert these commits in the connected branch. Do not delete active immutable objects during rollback. The backend remains compatible with the old frontend.

Backend reference: GCP project `job-scout-508222`, region `us-east1`, service `job-hunt-profile`.

| Route | Active revision | Backend rollback revision |
| --- | --- | --- |
| Ordinary / quality-compat | `job-hunt-profile-00074-pul` | `job-hunt-profile-00067-vex` |
| layout-v1 | `job-hunt-profile-00075-fox` | `job-hunt-profile-00068-vaq` |
| certified-v1 | `job-hunt-profile-00076-sid` | `job-hunt-profile-00069-ruy` |

Ordinary traffic was verified at 100% on the listed legacy revision. Backend rollback, if needed, means restoring each affected route tag and ordinary traffic to its previous revision; it is separate from the UI rollback. This release requires no stored-record rollback.

Existing stored resumes and previously polluted preferences are not automatically repaired by this code release. Review/reparse affected records separately with current-state checks. Scanned PDFs, ambiguous multiple columns and Word text boxes remain outside verified support; no claim of perfect parsing for every resume is made.

Employer/location splitting is conservative. PDF sentence recovery cannot infer every author's intended bullet grouping. Follow-up ownership-aware R2 retention cleanup and repairs to already stored affected records are separate from this UI deployment.
