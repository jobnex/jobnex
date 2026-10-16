# UI team handoff: all resume fixes and required integration

Prepared: October 10, 2026, America/New_York.

This is the consolidated implementation checklist for the UI team. It covers base resume synchronization, background generation, credit display, review drafts, My Applications, PDF printing, templates, and multi-request behavior. It supersedes older handoff descriptions of demo application rows, one active request per user, four global workers, and pending production migration.

## 1. Send these materials to the UI team

1. This document.
2. The source branch [`fix/resume-background-credits`](https://github.com/jobnex/jobnex/tree/fix/resume-background-credits), reviewed through [PR #12](https://github.com/jobnex/jobnex/pull/12).
3. The verified source snapshot [`cd7364d2f26c2a417f433d86837712ccb0de9063`](https://github.com/jobnex/jobnex/tree/cd7364d2f26c2a417f433d86837712ccb0de9063). This snapshot includes the earlier base resume fixes. Earlier PR #11 was merged before the follow-up work; do not integrate only its parser follow-up.
4. The detailed handoffs linked at the end, especially the conditional local profile wrapper patch.
5. The existing environment variable names and deployment bindings through the team's normal configuration process. Do not put secret values in this document or browser code.

The backend fixes are already deployed. An independently hosted frontend still needs the frontend files and server actions integrated and deployed. Updating GCP does not update a separate UI repository.

Verified local source locations:

- Git source: `C:/Users/desir/Projects/techjobs/resume-backend-release`.
- Separate local UI running on port 3000: `C:/Users/desir/Projects/techjobs/archive-review-20261008/app-source/my-app`.

These are separate checkouts. File names alone do not prove implementations are identical. Preserve the team's unrelated design and application changes.

## 2. Required changes by feature

| Feature | Required UI behavior | Files to integrate or adapt |
| --- | --- | --- |
| Base resume selection | Preview and generation use the authenticated user's owned active resume | `lib/active-resume.ts`, `lib/resume-content.ts`, `app/actions/tailored-resume.ts` |
| Profile edits and uploads | Save editable sections without losing extraction fields; invalidate old text when replacing the uploaded file | `app/actions/preferences.ts`, `app/actions/storage.ts`, the two helpers above |
| Profile response wrapper | Read compiler payload from the top level or nested `resume_details` | Conditional patch in `lib/profile-service.ts` or its equivalent response consumer |
| Generation popup | Close after durable acceptance and receipt of a request ID; keep submission errors visible | `components/TailorResumeModal.tsx`, `store/useJobStore.ts` where fields are missing |
| Background tracking | Restore owned requests after reload, track independently of popup lifetime, open the correct draft | `components/BackgroundResumeTasks.tsx`, `app/(main)/layout.tsx`, `app/actions/tailored-resume.ts` |
| Review drafts and credits | Display actual credit state; allow available review drafts with a warning | `app/actions/tailored-resume.ts`, `components/ResumeModal.tsx`, tracker and application page |
| My Applications | Add the job when its request is accepted; use real owned request history; save stages explicitly | `app/actions/resume-applications.ts`, `app/(main)/job-hunt/applications/page.tsx`, `lib/job-utils.ts` |
| PDF export | Print resume content without application layout, modal controls, scroll limits, or preview zoom | `components/ResumeModal.tsx`, `components/ResumeSheet.tsx` |
| Template selection | Show four distinct templates; resolve older duplicate IDs compatibly | `data/resume-templates.ts`, `store/useResumeStore.ts`, `components/ResumeModal.tsx` |
| Dedicated Resume Lab | Preserve review status and retry transient reads if this page exists in the team's app | `app/(main)/job-hunt/tailor-resume/page.tsx` |
| Two concurrent runs per user | Allow submissions for different jobs while others are active; display every returned request independently | Existing submission action, tracker and My Applications changes; enforcement stays in the backend |

Files under `app/actions` run on the Next.js server. They need server authentication, database access where used, and existing service credentials. They are not browser-only components.

### A. Base resume, uploads, and profile saves

Use `activeResumeId(user.id)` in preview and submission. The helper joins the preference's `active_resume_id` to a resume owned by the same user. Do not choose an arbitrary resume or trust a client-supplied owner ID.

Integrate the full `saveResumeDetails` transaction, including merge and normalization. Preserve extraction fields and compiler metadata while editing `personalDetails`, `educationHistory`, and `experienceHistory`. Submit the complete builder form: this action is not a partial PATCH. Omitted arrays become empty arrays, and omitted personal details become null.

Both upload metadata paths must clear stale extraction when `file_key` changes. A replacement upload sets old `content` to null and `parsed_data` to an empty object until extraction succeeds. Reusing the same object key preserves existing extraction. Never tailor a replacement file using the previous file's text.

Apply this response mapping only where the frontend maps the profile service response:

```ts
compiler_payload: data.compiler_payload ?? data.resume_details?.compiler_payload,
```

Keep `preferences` and `resume_details` in the response mapping. The local helper is named `extractResumeProfileFromR2`. The Git source instead has a generic `profileService(...)` returning raw JSON. Patch the equivalent consumer; do not replace that entire generic helper with the local file.

**Studio persistence requires a separate adoption decision.** The local app's `saveResumePayloadLocallyServer` still saves a filesystem JSON file and uses an in-memory cache. That local save does not synchronize a shared Neon base resume. If studio edits must become tailoring input, integrate the Git implementation of `app/actions/resume.ts` and its matching authenticated read action together. Test user isolation and synchronization. Do not copy only its save function.

### B. Popup and background generation

1. Call `initiateTailoringRequest(jobId)` through the authenticated server action.
2. Disable duplicate clicks while submission is pending.
3. On `success: true` with a valid `requestId`, close the popup.
4. Dispatch `window.dispatchEvent(new Event("resume-requests-changed"))` and refresh credits from the server.
5. Track completion using the persistent background component, not the closed popup.
6. On submission failure, retain the popup and show the returned error.

Mount `BackgroundResumeTasks` once in the persistent main layout. Restore data with `listResumeRequests()` after reload and navigation. Poll every four seconds with active requests, otherwise every 30 seconds. Listen for browser focus and `resume-requests-changed`. Retain the last known state during transient read failures and retry.

Do not cancel a queued or running generation after 60 or 90 seconds. The individual HTTP read/submission timeouts are different from the worker's generation lifecycle. Closing the browser does not cancel durable work.

Keep request IDs associated with their own jobs. A single global `isGenerating` flag must not block other jobs after the submission popup closes. Same active job/key deduplication happens on the backend. The existing action creates a new UUID per initiation; any added retry of the same HTTP submission must preserve that submission's key.

The legacy `tailorResumeForJob()` now returns acceptance and request ID immediately. Any external caller expecting final Markdown from that helper must switch to status/result reads.

### C. Credits and review drafts

Do not debit a generation credit in browser code or call a second debit action. The backend reserves one credit when creating the durable request. Settlement consumes that existing hold or releases it; completion must not subtract another credit.

| Server request state | Credit state | UI behavior |
| --- | --- | --- |
| `queued` | `held` | Show queued, one credit reserved, no draft yet |
| `running` | `held` | Show processing, one credit reserved, no draft yet |
| `completed` | `consumed` | Open saved draft; show charge settled |
| `needs_review`, available draft | `consumed` | Open saved draft with review warning; one credit charged |
| Historical `needs_review`, available refunded draft | `released` | Open with warning; retain historical refund |
| Failed or review outcome without an available draft | `released` | Show refund/no usable draft; do not enable output |

Use the server's `has_draft`, returned Markdown, and credit state. `needs_review` alone does not guarantee a saved usable draft. A temporary error reading output is not proof that generation failed; allow retrying the saved result.

The raw request API uses `completed`. The frontend `getResumeRequestStatus()` adapter maps loaded completed output to `succeeded`. It retains `needs_review` separately. Do not lose this distinction in labels or terminal-state logic. Treat `success: false` from a failed read as a read error unless confirmed by the authoritative request state.

Display `reviewReason` and the review warning in preview. Refresh credit balances on acceptance and terminal transitions. PDF export does not charge another generation credit. Do not retroactively debit previously refunded review drafts.

The optional UI mirror `user_job_resumes` permits `draft` and `ready`, not `needs_review`. Mirror review output as `draft`; keep authoritative review status on the request/generation. Retrieve output from the authoritative owned generation first.

### D. My Applications

Replace demo `jobsData` with `listResumeApplications()`. A successfully accepted resume request makes that job appear immediately, including queued/running requests. Submission rejection creates no new row. The existing durable request is the intake record; no extra credit or application insert is required to display it.

Use one row per job, choosing the latest request by creation time and ID. Keep failed generations visible. Refresh on acceptance events, browser focus, and polling. This list has no latest-20 restriction.

Use the row's owned job/request to open its draft. Pending rows disable output actions until an available result exists. Review output keeps its warning. Do not open a generic editor's unrelated resume.

Generation does not submit to an employer. `updateResumeApplicationStage(jobId, stage)` accepts `applied`, `interview`, or `offer` after explicit user selection. Preserve existing notes, resume ID, and match score. Apply Now opens the employer URL separately.

Clear cached rows and preview on account change. Reject asynchronous results returned for a different signed-in account. Server actions must authenticate every call.

### E. PDF print and template choices

Integrate the body portal and print stylesheet from `ResumeModal`, plus the stable sheet/paper classes in `ResumeSheet`. During printing, hide other body children and remove modal positioning, viewport heights, scroll constraints, and zoom transforms. Remove the modal's print rules when it closes.

Export PDF in this modal still uses browser printing. The backend PDF endpoint is a separate export path. Do not label browser printing as a Typst service invocation.

A resume that fits one US Letter page must print as one page without application UI. Longer content must paginate without clipping. Do not force every resume into one page or crop content to satisfy the page count.

| Visible template | Canonical ID | Backend theme |
| --- | --- | --- |
| MIT CAPD Classical | `mit-capd` | 2 |
| Modern Ivy LaTeX | `modern-ivy` | 3 |
| Tech Specialist | `tech-specialist` | 6 |
| Minimalist Executive | `minimalist-exec` | 5 |

Restore `contemporary-compact` as `modern-ivy` and `standard-overleaf` as `mit-capd`. Save canonical IDs going forward. These removed choices were duplicate layouts; backend alias compatibility remains. No service or historical resume is deleted.

### F. Multiple jobs and users

Allow different jobs to submit independent durable requests. Each user can run two resumes at once; extras stay queued with separate credit holds. Display queued status without presenting capacity deferral as a failure.

The live backend has database-enforced running slots and demand-based worker scaling from zero to twenty workers. Twenty is shared instantaneous capacity, not a limit of twenty registered users or twenty accepted jobs. Overflow queues. Cloud Tasks does not guarantee strict FIFO or round-robin scheduling.

The tracker currently shows the user's latest twenty requests, active requests ordered first within that selection. This display limit does not limit acceptance. My Applications queries job history separately without that limit. If the team later wants complete request history in the tracker, add pagination/filtering as a separate feature; do not claim it already exists.

No UI semaphore or client-maintained running counter can replace backend enforcement. `running_slot` is an internal field; the UI does not assign it or need it to display progress.

## 3. Existing endpoint and authentication contracts

Service origins and paths remain unchanged. Keep the existing environment-specific configuration.

- Web: `JOB_HUNT_WEB_URL`, currently `https://job-hunt-web-znsph25yja-ue.a.run.app`.
- Profile: `JOB_HUNT_SERVICE_URL`, currently `https://job-hunt-profile-znsph25yja-ue.a.run.app`.
- Server only: `JOB_HUNT_SERVICE_SECRET`, `DATABASE_URL`, existing Neon Auth and R2 configuration.

| Purpose | Existing API |
| --- | --- |
| Base source/job preview | `GET /api/resume/tailor/resumes/{resumeId}/preview?jobId={jobId}` |
| Accept generation | `POST /api/resume/tailor/requests` |
| Read durable status | `GET /api/resume/tailor/requests/{requestId}` |
| Read generated JSON | `GET /api/resume/tailor/generated/{requestId}?format=json` |
| Download Markdown | `GET /api/resume/tailor/generated/{requestId}` |
| Backend PDF | Existing GET/POST `/api/resume/tailor/generated/{requestId}/pdf` |
| Edit base Markdown | `PATCH /api/resume/tailor/resumes/{resumeId}` |
| Upload/extract through web | `POST /api/resume/tailor/upload` |
| Profile | Existing `GET/PATCH /profile`, `POST /profile/resume`, `POST /profile/resume-from-r2` |

Submission body:

```json
{
  "jobId": "<published-job-uuid>",
  "resumeId": "<owned-active-base-resume-uuid>",
  "idempotencyKey": "<submission-uuid>"
}
```

The action returns `{ success, requestId?, status?, error? }`. Only treat submission as accepted when a durable request ID is present. Generated JSON contains `generation.resume_markdown`, `generation.status`, and `generation.review_reason`. Raw review Markdown sets `X-Resume-Review-Required: true`.

Tailoring calls forward the authenticated Neon session through server code. Profile calls retain their existing HMAC headers and exact-body signing. The browser must not receive the HMAC secret or invoke the private worker directly. Detailed signing rules remain in the base-content handoff.

Show actionable source errors: unavailable job, missing owned active resume, or missing extracted/saved resume text. Do not hide all three behind “job or resume unavailable.”

## 4. Data locations the UI must use

| Data | Authoritative DB location and relationship |
| --- | --- |
| Base Markdown | `user_pref_resumes.content` |
| Extracted JSON | `user_pref_resumes.parsed_data`, including `compiler_payload.markdown` |
| Editable profile | `user_job_preferences.resume_details`, preserving extraction fields |
| Active source | `user_job_preferences.active_resume_id` references an owned `user_pref_resumes.id` |
| Durable generation tracking | `resume_generation_requests.id`, `user_id`, `job_id`, `status`, `credit_state`, `created_at`, `error_code` |
| Role-specific Markdown | `resume_generations.resume_markdown`; `resume_generations.id = resume_generation_requests.id`, with matching user/job/base resume |
| Optional UI mirror | `user_job_resumes.markdown` for the same owner/job; mirror is not the authoritative generation record |
| Displayed job | `jobs`, joined through the owned request's `job_id` |
| Explicit application stage | `applications.status`, keyed by owner/job |
| Credits | `wallets` and request-linked `credit_transactions`; server controls settlement |

Base preview and role-specific preview are different sources. Browser preview renders Markdown using the UI template. Backend PDF export renders the owned generated Markdown through its compiler flow; it is not a PDF blob read from `user_pref_resumes.content`.

Do not overwrite the base resume with a role-specific draft. The existing schema supports one base-resume row per user; it does not provide multiple independent base resume selection. Multiple role-specific generations are supported separately.

## 5. Integration and deployment order

1. Compare the verified source snapshot against the team's current checkout. Preserve unrelated UI changes.
2. Integrate helper/server-action dependencies before importing their components.
3. Integrate popup, persistent tracker, review warnings, and My Applications together.
4. Integrate modal, sheet, template catalog, and resume store together.
5. Apply the profile wrapper fallback only at the corresponding response consumer.
6. If the studio edits shared input, integrate its authenticated save and read actions together.
7. Run the checks below, then deploy the team's UI with existing server configuration.
8. Verify the deployed UI calls the expected existing backend origin and authenticates correctly.

Backend production currently uses web `job-hunt-web-00036-giy` and worker `job-hunt-resume-worker-00027-ter`, each at 100% traffic as recorded in the completed rollout. The two-slot migration is already applied. A frontend-only integration must not rerun that migration or redeploy older worker code. If the team also owns a separate backend, follow the coordinated migration/worker/admission rollout in the two-per-user handoff.

## 6. Acceptance checklist for the UI team

- [ ] Upload and extract a base resume; preview uses the owned active source and nonblank Markdown.
- [ ] Edit profile sections; `content`, parsed compiler Markdown, profile details, and active selection stay synchronized.
- [ ] Replace the upload; old extraction is unavailable until new extraction succeeds.
- [ ] R2 extraction accepts nested compiler payload without discarding the profile response.
- [ ] Accepted submission closes the popup; rejected submission keeps its error visible.
- [ ] Simulated generation lasting over 120 seconds survives navigation and reload without a frontend deadline.
- [ ] Transient status/result errors retain state and recover on retry.
- [ ] Multiple distinct jobs get separate tracking rows; same active job/key does not double-charge.
- [ ] Two requests for one user can run; additional work displays queued. Other users remain isolated.
- [ ] Credits refresh from server state; successful saved review output is charged once and opens with a warning.
- [ ] Failed/no-output work displays released credits; historical refunded drafts are not debited again.
- [ ] My Applications immediately includes accepted jobs, uses one row per job, and opens the matching draft.
- [ ] Generating a resume does not automatically mark the employer application Applied.
- [ ] Account switching hides previous account rows and previews immediately.
- [ ] Exactly four template choices appear; both legacy IDs restore to their canonical equivalents.
- [ ] A known one-page resume exports as one page at normal and 200% preview zoom, without application controls.
- [ ] A long resume exports all content across pages, including its final text marker.
- [ ] If studio persistence is adopted, editing in studio updates the same owned base source used by tailoring.

Focused automated checks from the source project, after integrating the matching scripts and existing dependencies:

```powershell
rtk proxy node scripts/test-resume-background.cjs
rtk proxy node scripts/test-resume-applications.cjs
rtk proxy node scripts/test-resume-print.cjs
rtk proxy npx tsc --noEmit
```

These regression scripts use deterministic doubles. They do not require paid generation runs. Backend admission/settlement/concurrency and temporary-branch migration checks already passed during the release. Test the team's own deployed UI separately; this document does not claim that separate deployment has been verified.

## 7. Detailed references

- [Base source, upload invalidation, profile wrapper, and studio caveat](ui-team-resume-content-update.md).
- [Background tracking, review drafts, and credit settlement](ui-team-resume-background-credits.md).
- [My Applications ownership, status, and stage updates](ui-team-resume-applications.md).
- [PDF print isolation and four templates](ui-team-resume-print.md).
- [Two-per-user schema, worker claims, capacity, and rollback](ui-team-resume-two-per-user.md).
- [Completed production rollout evidence](releases/resume-two-per-user-live-2026-10-10.md).

Older documents describe their own release stages. Use this consolidated checklist and the live rollout record for current behavior. No email or team message was sent as part of preparing this handoff.
