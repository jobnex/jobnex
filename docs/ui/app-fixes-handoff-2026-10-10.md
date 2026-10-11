# UI team handoff: app reliability and resume release

Release work started October 10 and finalized October 11, 2026 (America/New_York). Audience: UI developers and production maintainers.
This supplements and supersedes the deployment/integration status in the earlier resume UI handoffs. Earlier documents remain historical records.

## Current deployment status

The core security/UI web revision job-hunt-web-app-fixes-core-1011 is ready and receives 100% traffic. Eleven staged and eleven live HTTP checks passed: public pages return 200, and private APIs reject unauthenticated requests with 401. The profile revision job-hunt-profile-app-fixes-v2-1010 and A4 compiler revision resume-pdf-compiler-app-fixes-1010 also receive 100% traffic.

Production storage and direct PDF operations are not fully enabled. The web runtime job-hunt-web-runtime@job-scout-508222.iam.gserviceaccount.com cannot read three existing compiler/R2 secrets. Automatic approval review rejected granting persistent access without explicit approval identifying the recipient, role, resources, and secret-level scope. No IAM grant was applied. The core release removes failed new secret references and uses existing permissions; unavailable export operations return a controlled error instead of fabricating a PDF or charging for base formatting. Upload/download/object cleanup paths need the scoped access before full production acceptance.

The compiler itself was verified with four real synthetic exports and R2 uploads, each producing two A4 pages, and the local UI with existing credentials passes all four template previews. The remaining release gate is production web storage/PDF configuration and its authenticated acceptance; code, tests, documentation and GitHub backups are complete.

## Where to collect the code

Repository: https://github.com/jobnex/jobnex
Frontend backup branch: docs/resume-ui-handoff-20261010; PR https://github.com/jobnex/jobnex/pull/13.
Backend branch: fix/resume-background-credits; PR https://github.com/jobnex/jobnex/pull/12.

The exact UI source commit is [3ba7471c4129bade2d78df534eb9a3bdde5c25e3](https://github.com/jobnex/jobnex/tree/3ba7471c4129bade2d78df534eb9a3bdde5c25e3/docs/ui/releases/app-fixes-20261010). The backend source commit is [8a8a3f441b4eb0df269dda842b8eb6ec630bf45a](https://github.com/jobnex/jobnex/commit/8a8a3f441b4eb0df269dda842b8eb6ec630bf45a).

The new bundle is docs/ui/releases/app-fixes-20261010/. Use production-web/ as the source of the GCP frontend, local-app/ for the separate localhost UI, and source-manifest.json for original relative paths and SHA-256 checksums. The ZIP preserves those paths for collection outside Git. These are complete allowlisted source snapshots, not files renamed .txt. Secrets, environment files, private resumes, personal screenshots, dependencies and generated build output are excluded.

Clone and collect:

    git clone --branch docs/resume-ui-handoff-20261010 https://github.com/jobnex/jobnex.git
    cd jobnex
    git log -1 --oneline
    # Collect docs/ui/releases/app-fixes-20261010/production-web/
    # For profile/compiler services, use the backend branch named above.

The backup branch contains integration materials, not a replacement application at repository root. An independently hosted UI must integrate and deploy the files below; a GCP deployment does not update a separate frontend repository automatically. Preserve unrelated UI designs and server contracts.

Local working sources:
- GCP web: resume-quality-review/heading-web-build/
- Local port-3000 UI: archive-review-20261008/app-source/my-app/
- Profile, PDF compiler and worker source: resume-backend-release/

Release revisions, image digests, build IDs and verified traffic are recorded in release-evidence.json beside this handoff. Use the exact pushed commit and release manifest when collecting code; old ZIPs and old .txt snapshots do not contain this release.

The verified build configurations are also collected beside this handoff: production-cloudbuild.json, profile-cloudbuild.json and compiler-cloudbuild.json. Run the web configuration from the collected production-web source directory; run each service configuration from the corresponding backend service directory. These files record the successful image-build steps. Runtime secret bindings and traffic promotion remain separate deployment steps described below; a successful image build alone does not enable production storage/PDF access.

## User-visible changes and integration files

| Area | Behavior after this release | Integrate together |
| --- | --- | --- |
| Contact/header and company formatting | Supplied phone, email, LinkedIn, GitHub, portfolio and additional contacts survive; title has its own row; duplicate contacts and literal Markdown emphasis are removed; long values wrap | lib/resume-contacts.ts, lib/resume-parser.ts, components/ResumeSheet.tsx, profile service contacts/extractor |
| Resume page length | Complete multipage A4 preview, numbered pages, fit-to-width zoom on small screens; page-count and review notice reserve their own space | components/A4ResumePages.tsx, ResumeSheet.tsx, ResumeModal.tsx |
| PDF download | Export compiles a real PDF, then displays Download PDF; template/working edits invalidate an old link; compile failure retains the previous saved PDF | ResumeModal.tsx, app/api/resume/export/route.ts, app/api/resume/base/route.ts, lib/job-resumes.ts, lib/storage/r2.ts |
| Base creation | Create Resume is free factual formatting of supplied fields. No demo person, invented claims, fake employment or credit deduction. Optional social/portfolio URL inputs. Blank or incomplete entries are omitted | lib/base-resume.ts, Manage page, base API route |
| Replacement/delete | Upload must pass actual text extraction before replacing the current file. Active runs block replacement/removal. Transaction detaches only the selected base, preserves historical rows and deletes only the detached object after commit | app/actions/storage.ts, lib/profile-service.ts, lib/resume-tailoring.ts, Manage page, profile service preflight |
| Durable edits | Save stores user edits and chosen template separately from original model output; reopening current draft reads the override; exporting edited content persists the same override only after successful PDF compilation | app/actions/tailored-resume.ts, lib/resume-tailoring.ts, lib/job-resumes.ts, Applications, BackgroundResumeTasks, TailorResumeModal |
| Stale editors/history | Current editor includes the opened generation ID. If a newer draft exists, save/export rejects the old editor. Earlier attempts are explicitly view-only and cannot overwrite the current draft; legacy generation PDF endpoints also enforce the exact current generation | ResumeModal expectedGenerationId/readOnly props, all callers, save action and export API |
| Applications | Session hydration/loading, failure and loaded-empty states are exclusive; no false empty list during initial load. Resume menu distinguishes View Resume and Download Markdown | Applications page and tailored actions |
| Requested jobs/counts | Current request history and legacy resume records are both read; completed/review drafts remain visible; failed/cancelled runs permit retry; counts describe eligible matched jobs and owned requested history | lib/db/job-matching.ts, types/job.ts, JobGrid.tsx, PremiumJobCard.tsx, Curated page, useMatchedJobsQuery.ts |
| Freshness and matching | Last 24 hours and newest first stay default. Loading a new page labels the previous cards until new data arrives. Cards explain selected-role/skill keyword evidence and gaps without claiming a perfect match | Curated page, PremiumJobCard, matching query and query invalidation |
| Credits | Actual available balance replaces the invented /200 maximum. Account changes clear previous cached balance; late responses cannot update another user's balance | app/actions/credits.ts, store/useCreditStore.ts, Header, JobHuntSidebar |
| Profile | Fill empty fields from my resume is an explicit review action in edit mode; existing profile fields are not overwritten. User reviews and saves | ProfileForm.tsx and profile page |
| Navigation/history | Mobile bottom navigation, safe-area spacing, functional resume-status and settings navigation; latest finished attempt per job is grouped, all active runs remain visible, older attempts expandable | Header, JobHuntSidebar, BackgroundResumeTasks, main layout |
| Public destinations | Footer and auth disclosure links lead to real privacy/usage/guideline/support pages. Support page honestly says contact address is unconfigured | Footer, AuthContainer and /privacy, /terms, /guidelines, /contact |
| Country/text clarity | Equivalent country suffixes appear once; unknown location is labelled unknown. Product text removes internal compiler-contract jargon and fabricated fallback match scores | lib/job-utils.ts, TailorResumeModal |

Templates: MIT CAPD Classical (theme 2), Modern Ivy LaTeX (3), Minimalist Executive (5), Tech Specialist (6). Existing aliases remain supported. All four share parsing/contact preservation. Compiler ui-resume.typ now uses A4 instead of Letter.

## Backend and UI contracts

All ownership comes from the authenticated session. Never accept userId from a query/body as authority. Production /api/jobs/matched keeps its legacy nextCursor, nextKeyset, hasMore response; the separate curated page API keeps page/count metadata. Do not substitute one endpoint's response shape for the other.

ResumeModal callers for current applications:
- exportJobId: owned application job ID.
- expectedGenerationId: ID returned with the opened saved resume, including legacy IDs where applicable.
- onSave(markdown, templateId): await updateTailoredResumeMarkdown(jobId, markdown, templateId, expectedGenerationId). Surface rejection; do not mark a local-only save successful.
- readOnly: true for earlier historical attempts. No save/export mutation or template editing.
- reviewWarning: retained for needs_review drafts.

GET/read operations no longer synchronize or overwrite saved edits as a side effect. Manual overrides live in resume_generations.audit_json.manual_edit; original resume_markdown and original audit are preserved. Original audit scores are not proof that a subsequent user edit passed model review.

POST /api/resume/export accepts {jobId, markdown, templateId, expectedGenerationId?}. New UI supplies the guard. Session and application ownership remain required. A stale generation returns 409; malformed input 400; unavailable compiler 503. It returns a short-lived download URL on success. Do not cache the signed URL as permanent storage.

POST /api/resume/base accepts {markdown, templateId}; it formats an authenticated temporary PDF without AI or credits, returns application/pdf bytes and cleans the temporary compiler object. Manage uploads those real PDF bytes through the ordinary owned upload flow, commits metadata, saves details and leaves preference confirmation explicit.

Profile /profile/resume-from-r2 accepts validateOnly:true with the same existing body-bound HMAC signature. It verifies extractable text and returns {valid:true} without reading/writing the user's profile. Final extraction still verifies the committed active object key and rejects stale replacements. Profile resume edits and base PATCH also share the lock, require an active primary stored base, and reject active generation; preference-only edits remain allowed. Deleted historical base rows cannot be reactivated by a delayed profile save.

Replacement/delete/admission share the per-user advisory lock. Admission rechecks the selected base and its exact source text before credit hold. A stale preview must refresh; it cannot charge and generate from a prior source.

## Production configuration

Keep all secret values server-only. Preserve existing Neon session, profile HMAC, task queue, worker and PDF-backend configuration.

New/existing bindings needed for the direct compiler and storage paths:
- RESUME_COMPILER_URL: existing resume-pdf-compiler Cloud Run URL.
- RESUME_COMPILER_SECRET: existing resume-pdf-compiler-secret Secret Manager reference.
- R2_ENDPOINT and R2_BUCKET_NAME (R2_BUCKET alias accepted).
- R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY: existing resume-pdf-backend R2 secret references.
- JOB_HUNT_SERVICE_URL and JOB_HUNT_SERVICE_SECRET: existing profile service and HMAC secret.

The compiler bearer-secret contract is /api/v1/ui-export with structured parsed resume, theme, templateId and a server-generated R2 PUT URL. The newer Rust resume-pdf-backend has a different preview/export protocol; its URL cannot replace the compiler URL without adapting that caller. Existing production service bindings are retained.

The shadcn 4.18.0 stylesheet is kept verbatim in app/shadcn-tailwind.css with its MIT license; app/globals.css imports that local file. This preserves the existing component styles without shipping the unused shadcn CLI and dependency tree. Docker npm ci uses --legacy-peer-deps to reproduce the tested lock with the existing beta Neon auth SDK; authentication still requires the real session.

No model switch or paid generation occurs in this release. Synchronous Gemini writer/analyzer/reviewer and LangSmith resume-builder-gcp tracing stay as deployed. Inputs/outputs remain hidden. Formatting, storage and browser fixes do not create artificial LangSmith generation traces.

## Verification and UI acceptance

Re-run:
1. TypeScript and ESLint on the integrated app; do not disable rules to silence regressions.
2. The portable docs/ui/tests/check-root-release.cjs accepts local and production app roots as positional arguments and checks session/keyset/limits/admission without DB or AI. Install the snapshot dependencies with npm ci --legacy-peer-deps before running. scripts/check-resume-release.tsx: sparse/full factual forms, contacts, education/company, skills/projects and four-template rendering.
3. scripts/check-ui-release.tsx: real navigation, credit/history presentation.
4. Auth/privacy negative controls and keyset preservation; requested/current/failed run history, newest/24h filtering, country deduplication and pagination.
5. Desktop and 390 × 844 mobile preview in all four templates; controls remain reachable; second page retains projects; close/cancel does not save working changes.
6. Real compiler exports, PDF text/contact/project retention and A4 media boxes. Browser preview is not evidence that exported bytes are valid.
7. Save/reopen/export success plus stale-generation rejection. Failed compiler/upload/extraction must preserve prior file/draft.
8. Profile fill in edit mode followed by Cancel; no automatic profile mutation. Upload readable PDF/DOCX; reject malformed/image-only files.
9. Public footer/auth links and mobile content below fixed bars.
10. Check wallet/base/request totals before and after tests; provider tests require separate explicit authorization.

The release evidence records tests actually run. This is targeted functional/regression verification, not a claim that every possible app path, external job link, concurrency schedule or resume layout has been exhaustively proved.

## Practical limits and follow-ups

No OCR for image-only resumes. PDF spacing is recovered only when layout/plain extractions contain identical non-whitespace glyphs; ambiguous reordered columns are preserved rather than invented. Existing historical generated text is not rewritten; old joined words need explicit correction or a newly extracted source.

A single pathological header/bullet taller than an A4 content region can still overflow the browser's atomic-block paginator. Ordinary entries/bullets continue across pages and exported PDF text paginates, but pixel-identical page breaks between browser and Typst are not guaranteed.

The support contact address remains unconfigured; an owner must supply it. Public disclosure pages are factual app notices, not a newly approved legal agreement. Role explanations are keyword evidence, not a validated hiring probability or guaranteed JD match.

Next.js and eslint-config-next are pinned to 16.3.8, and the unused shadcn CLI dependency is removed. Compatible transitive updates are included. The security patch addresses the [Next.js image issue](https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4) and [Next.js request issue](https://github.com/vercel/next.js/security/advisories/GHSA-cjq9-62q9-8jv4). Dependency patch/audit results and remaining build-tool warnings are recorded in release evidence. The [selector-parser advisory](https://github.com/postcss/postcss-selector-parser/security/advisories/GHSA-rj75-hqrm-r3gf) distinguishes attacker-controlled request parsing from trusted build-time CSS use. Do not run a forced major-version dependency migration as part of UI integration without testing authentication and export again.

## Rollback

Use the prior revision names in release-evidence.json to move Cloud Run traffic back for web/profile/compiler independently. No destructive schema migration or regeneration of user resumes is required for this release. Keep direct-compiler/R2 config bindings if reverting only presentation changes; otherwise verify old export contract.

Do not roll back the worker or remove current request/audit records to revert a UI. Preserve the four credited units and existing original/edited resume history.
