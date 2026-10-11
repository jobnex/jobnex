# UI team handoff: app reliability and resume release

Release work started October 10 and finalized October 11, 2026 (America/New_York). Audience: UI developers and production maintainers.
This supplements and supersedes the deployment/integration status in the earlier resume UI handoffs. Earlier documents remain historical records.

**October 11 localhost readiness update:** Customer PDF export is currently blocked by an API integration mismatch. Local base/export routes are proxy adapters to the earlier GCP web API; free base creation targets a missing upstream route. See [the detailed localhost review](customer-readiness-local-2026-10-11.md). Use the production-web server implementations and configure the UI team's server runtime, rather than treating the local proxy files as a standalone backend. Backend/compiler test success alone does not clear customer release.

## Deployment ownership and current status

User clarified on October 11: deploy only backend services to GCP. The UI team owns frontend integration and production UI deployment. This document and source bundle are the frontend deliverables; do not treat the web build records as authorization to deploy a UI.

Backend releases are ready at 100% traffic:
- Profile/extraction: job-hunt-profile-app-fixes-v2-1010.
- A4 PDF compiler: resume-pdf-compiler-app-fixes-1010.
- Resume worker remains at its existing job-hunt-resume-worker-live-qa-final-1010 revision; its Gemini model and LangSmith settings are unchanged.

Four synthetic compiler exports and R2 uploads produced complete two-page A4 PDFs. Four templates also passed local desktop/mobile preview checks. No paid generation, live resume replacement/deletion, or profile save was performed.

The production UI is restored to its prior job-hunt-web-curated-fresh-1010 revision at 100% traffic, following explicit user recovery approval. The three public restoration checks (home, auth and public jobs API) return 200. This task's app-fixes-qa web tag is removed. The three temporary Secret Accessor bindings added for job-hunt-web-runtime@job-scout-508222.iam.gserviceaccount.com were removed after confirming that the prior UI does not reference those secrets. Their removal was verified individually. Backend deployments and permissions were not changed by the restoration.

An earlier web rollout was reversed after the user clarified ownership. Its 11 staged and 11 live HTTP checks are retained only as historical verification of the candidate frontend source. Signed-in production save/export was not tested; these checks belong to the UI team's staging acceptance. Current production UI does not include this task's new frontend/server-route fixes. No new UI deployment or production Google sign-in is being pursued by this backend release.

Dormant web revisions/builds may remain in GCP history after restoration. A future UI deployment must use the UI team's reviewed configuration, rather than inheriting the newest dormant service template without checking its environment/secret bindings.

## Where to collect the code

Repository: https://github.com/jobnex/jobnex
Frontend backup branch: docs/resume-ui-handoff-20261010; PR https://github.com/jobnex/jobnex/pull/13.
Backend branch: fix/resume-background-credits; PR https://github.com/jobnex/jobnex/pull/12.

The exact UI source commit is [3ba7471c4129bade2d78df534eb9a3bdde5c25e3](https://github.com/jobnex/jobnex/tree/3ba7471c4129bade2d78df534eb9a3bdde5c25e3/docs/ui/releases/app-fixes-20261010). The backend source commit is [8a8a3f441b4eb0df269dda842b8eb6ec630bf45a](https://github.com/jobnex/jobnex/commit/8a8a3f441b4eb0df269dda842b8eb6ec630bf45a).

The new bundle is docs/ui/releases/app-fixes-20261010/. Use production-web/ as the frontend integration reference (the folder name is historical), local-app/ for the separate localhost UI, and source-manifest.json for original relative paths and SHA-256 checksums. The ZIP preserves those paths for collection outside Git. These are complete allowlisted source snapshots, not files renamed .txt. Secrets, environment files, private resumes, personal screenshots, dependencies and generated build output are excluded.

Clone and collect:

    git clone --branch docs/resume-ui-handoff-20261010 https://github.com/jobnex/jobnex.git
    cd jobnex
    git log -1 --oneline
    # Collect docs/ui/releases/app-fixes-20261010/production-web/
    # For profile/compiler services, use the backend branch named above.

The backup branch contains integration materials, not a replacement application at repository root. An independently hosted UI must integrate and deploy the files below; a GCP deployment does not update a separate frontend repository automatically. Preserve unrelated UI designs and server contracts.

Local working sources:
- Frontend integration reference: resume-quality-review/heading-web-build/
- Local port-3000 UI: archive-review-20261008/app-source/my-app/
- Profile, PDF compiler and worker source: resume-backend-release/

Release revisions, image digests, build IDs and verified traffic are recorded in release-evidence.json beside this handoff. Use the exact pushed commit and release manifest when collecting code; old ZIPs and old .txt snapshots do not contain this release.

The verified build configurations are also collected beside this handoff: production-cloudbuild.json, profile-cloudbuild.json and compiler-cloudbuild.json. Only profile-cloudbuild.json and compiler-cloudbuild.json belong to this backend deployment scope; run them from the corresponding backend service directory. production-cloudbuild.json is a historical web-build record for the UI team, not an instruction to deploy the UI to GCP. These files record the successful image-build steps. Runtime secret bindings and traffic promotion remain separate deployment steps described below; a successful image build alone does not enable production storage/PDF access.

## User-visible changes and integration files

| Area | Behavior after UI-team integration | Integrate together |
| --- | --- | --- |
| API privacy | Matched jobs require an authenticated session; caller-supplied userId cannot select another user's records; limits are bounded and legacy keyset shape is preserved | app/api/jobs/matched/route.ts and matching query helpers; deploy this server change with the UI team's release |
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

## Required work for the UI team

1. Start from your actual production frontend repository. Compare the immutable source snapshot against your UI; apply the changed groups in the table together. Do not replace unrelated designs or blindly copy the entire snapshot over your application.
   Prioritize the authenticated matched-jobs endpoint and durable save/export server contracts. The restored older UI does not include this task's new frontend/server-route fixes; they remain pending the UI team's integration and deployment.
2. Integrate lib/resume-contacts.ts, lib/resume-parser.ts, ResumeSheet.tsx and A4ResumePages.tsx together. Keep optional contacts, skills and projects in all four templates. Retain mobile fit-to-width, long-header wrapping, page numbers and unobstructed toolbars.
3. Wire every ResumeModal caller to the opened generation ID, persisted save action and read-only history behavior. Integrate Applications, BackgroundResumeTasks and TailorResumeModal with durable edits. Surface stale-editor and export errors, and refresh after save; do not report a browser-only change as saved.
4. Integrate the Next.js server routes/actions and their libraries on the UI team's hosting platform. These are the frontend's authenticated server layer, not standalone GCP profile/compiler services. The new base/export endpoints, storage actions, job queries, credit actions and session guards must ship with their corresponding components. Client-only deployment cannot run these contracts.
5. Connect that server layer to the existing GCP backend URLs and server-only secrets described below. Preserve Neon authentication and profile HMAC signing. Have the UI platform owner provision its own authorized runtime access; never embed credentials in browser bundles or reuse the GCP web service account as a browser identity.
6. Integrate current/legacy request history, failed retry and accurate badges; keep last-24-hours/newest defaults, country deduplication and honest role/skill explanations. Preserve each endpoint's pagination response shape.
7. Integrate credit cache isolation, explicit profile fill/review, exclusive loading/error/empty states, mobile navigation and working footer/auth links. Supply the actual public support contact address before enabling support contact actions.
8. Bring package.json, package-lock.json, app/globals.css and app/shadcn-tailwind.css together: Next/eslint-config-next 16.3.8, the retained licensed stylesheet, and the tested lock. Preserve the existing Neon auth SDK compatibility. Do not reintroduce the removed CLI just for CSS.
9. Run the acceptance checklist below against the UI team's staging environment, including authenticated save/reopen/export and invalid upload failures. Confirm existing resumes/history and wallet balance survive. Then the UI team approves and deploys its frontend through its own release process.

This release does not change the Gemini model or add a new LangSmith project. UI errors should expose a useful request/generation identifier without revealing private resume contents or secrets.

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

## UI server configuration for the UI team's deployment

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

Use the prior revision names in release-evidence.json to move Cloud Run traffic back for web/profile/compiler independently. No destructive schema migration or regeneration of user resumes is required for this release. The scope correction is complete: prior web traffic restored and only this task's unused web grants removed after explicit recovery approval. Do not change backend permissions. In subsequent UI-team releases, verify the older export contract before changing configuration.

Do not roll back the worker or remove current request/audit records to revert a UI. Preserve the four credited units and existing original/edited resume history.
