# UI and backend handoff: background resume generation and draft billing

Prepared 2026-10-10 UTC (2026-10-09 in America/New_York).

This follow-up changes the generation lifecycle and settlement policy. It supersedes the earlier handoff's description of the popup and review outcomes. The earlier base-resume synchronization fix remains in place.

## Behavior and billing policy

The Generate button submits a durable request. The popup closes only after the API accepts that request and returns its ID. Submission errors keep the popup open. Generation then continues in Cloud Tasks and the private Cloud Run worker. Closing the popup, navigating, or closing the browser does not cancel the worker.

The main layout mounts `BackgroundResumeTasks`. It restores the signed-in user's latest 20 requests from the database, puts active requests first, and shows job, company, request status, credit status, and a View draft button. It polls every four seconds while a request is active and every 30 seconds otherwise. Requests do not have a 60- or 90-second frontend generation deadline. Transient read failures retain the last known state and retry. The worker's existing ten-minute agent timeout and fifteen-minute lease remain separate server limits.

The owner approved this policy: **charge saved usable drafts, including `needs_review`, and make them accessible with a review warning.**

| Outcome | Request status | Credit state | Result access |
| --- | --- | --- | --- |
| Accepted, awaiting worker | `queued` | `held` | No output yet; one credit reserved |
| Worker executing | `running` | `held` | No output yet; one credit reserved |
| Verified saved approved draft | `completed` | `consumed` | Markdown, preview, and reviewed PDF export |
| Verified saved draft requiring review | `needs_review` | `consumed` | Same access with an explicit warning |
| Failed or interrupted run without verified output | `failed` or `needs_review` | `released` | Refund; no usable output button |
| Historical refunded review draft | `needs_review` | `released` | Accessible with warning; refund remains unchanged |

“Verified saved” means the worker finds the owned generation for the same request, user, job, and base resume; nonblank Markdown exactly matches the saved audit; generation and audit statuses agree; usage is present; source and job hashes match the audit and request snapshots. Source verification applies Python's universal newline handling, so Windows CRLF/CR input is verified against the same text the agent read. This verifies output persistence and provenance. It does not waive review checks or turn a review draft into an approved resume.

One credit is subtracted atomically when a request is created. Completion changes its existing pending debit to completed and marks the held credit consumed. It does **not** subtract another credit. Failure releases the hold, adds one credit back, marks the debit refunded, and inserts one refund transaction. Settlement updates require the same lease token and `running`/`held` state. Repeated task delivery and stale workers cannot settle the same hold twice. A crash after saving a verified output recovers that output instead of invoking AI again. Usage rows use deterministic IDs with `ON CONFLICT DO NOTHING`.

Previously refunded requests are not reopened or debited retroactively. The TensorWave request `e4419957-2141-4b08-9524-b50d4e242eaf` remains `needs_review`/`released`, with its 2,569-character Markdown available for review. Its original failed check was `experience.roles`; the draft should be checked against the source work history before use.

## Files to integrate

Repository: `jobnex/jobnex`, branch `fix/resume-background-credits`.

| File | Purpose |
| --- | --- |
| `services/resume-tailor/worker.ts` | Consume a verified saved review draft; refund unverified/no-output runs; preserve retry and lease fences |
| `lib/resume-tailoring.ts` | Shared owned-result loader accepts approved and review drafts, including historical refunded review drafts |
| `app/api/resume/tailor/generated/[requestId]/route.ts` | Existing Markdown/JSON endpoint serves available review output; raw Markdown has `X-Resume-Review-Required` |
| `app/api/resume/tailor/generated/[requestId]/pdf/route.ts` | Existing PDF endpoints accept an owned available draft; export still requires reviewed Markdown and a valid template |
| `app/actions/tailored-resume.ts` | Explicit review status, owned DB-backed request list, authoritative existing draft lookup, and truthful UI mirror status |
| `components/BackgroundResumeTasks.tsx` | Durable background status panel and per-request draft access |
| `components/TailorResumeModal.tsx` | Close after acceptance; remove modal-bound polling; retain submission errors and saved-draft preview |
| `components/ResumeModal.tsx` | Optional `reviewWarning` displayed inside the preview |
| `app/(main)/layout.tsx` | Mount tracking outside page and popup lifetimes |
| `store/useJobStore.ts` | Minimal tailoring popup state for the committed frontend |
| `app/(main)/job-hunt/tailor-resume/page.tsx` | Dedicated generation page loads review output, displays actual credit state, and retries transient status reads |
| `scripts/test-resume-settlement.ts` | Worker settlement checks with no database connection or AI call |
| `scripts/test-resume-background.cjs` | Actual client module checks with deterministic hooks and action doubles |

The current local frontend at `archive-review-20261008/app-source/my-app` has matching modal, action, layout, tracker, and preview-warning changes. It already had the modal store fields. Its separate application-list demo rows are unchanged; the new Resume generations panel reads actual database requests and gives access to the real TensorWave output.

The committed frontend additionally retains and fixes its existing dedicated Resume Lab page. That page is not present in the separate local frontend checkout. Do not overwrite unrelated local pages or copy its entire store when integrating. Mount the shared tracker once in the persistent main layout.

## Endpoint and action contract

Service origins, API paths, HTTP methods, and POST field names do not change. No new environment variable or schema migration is required.

1. `POST /api/resume/tailor/requests` still takes `jobId`, `resumeId`, and `idempotencyKey`. A successful accepted request returns a durable ID. The UI must not wait for AI completion before closing its submission popup.
2. `GET /api/resume/tailor/requests/{requestId}` remains the source of request status and `credit_state`.
3. `GET /api/resume/tailor/generated/{requestId}?format=json` returns `generation`, including `resume_markdown`, `status`, and `review_reason`. A `needs_review` draft is accessible only through an owned matching terminal request.
4. Raw Markdown download uses the same endpoint without `format=json`. A review draft sets `X-Resume-Review-Required: true`.
5. Existing generated PDF GET/POST routes keep their request contract. PDF export does not charge another generation credit. Review status is still visible in the UI.
6. `listResumeRequests()` is an authenticated Next.js server action. It reads owned metadata only, not resume bodies for other users. Client state rejects responses for a different signed-in user and hides a previous account's cached rows and preview after a session switch.
7. `getResumeRequestStatus()` now includes `needs_review` in its result status. A loaded review draft carries Markdown, credit state, and review reason. Its optional `user_job_resumes` mirror is saved as `needs_review`, not `ready`. An approved output is mirrored as `ready`.
8. The legacy `tailorResumeForJob()` helper now returns acceptance and request ID immediately. There are no current callers in this checkout. Any external caller must use background status rather than expecting Markdown within 30 seconds.

On accepted submission, dispatch `resume-requests-changed` to wake the tracker immediately. Refresh credits from the server. Do not call a client debit action: the request transaction already reserves the credit.

## Database reads and writes

| Table | Fields used by this flow | Purpose |
| --- | --- | --- |
| `user_pref_resumes` | `id`, `user_id`, `content`, `parsed_data` | Owned active source selection; prior content synchronization remains in place |
| `user_job_preferences` | `user_id`, `active_resume_id` | Select the same owned active base resume |
| `jobs` | `id`, `job_role_title`, `company_name`, `job_description` | Display authoritative role/company; capture the job input |
| `resume_generation_requests` | `id`, `user_id`, `job_id`, `base_resume_id`, `source_text`, `job_description`, `status`, `credit_state`, `credit_cost`, `lease_token`, `lease_expires_at`, `error_code`, `created_at`, `finished_at` | Durable execution, ownership, credit settlement, and tracking |
| `resume_generations` | `id`, `user_id`, `job_id`, `base_resume_id`, `resume_markdown`, `status`, `version`, `audit_json`, `source_hash`, `job_hash`, `created_at` | Worker-persisted Markdown and authoritative review status |
| `credit_transactions` | `user_id`, `reference_id`, `amount`, `transaction_type`, `status`, `metadata` | Existing debit becomes completed or refunded; one refund record on release |
| `wallets` | `user_id`, `balance`, `updated_at` | Reserve one credit at acceptance; return it only on release |
| `resume_ai_calls` | `id`, `request_id`, `user_id`, usage/cost/stage fields | Idempotent usage reporting for approved and review output |
| `resume_dispatch_outbox` | `request_id`, `attempts`, dispatch/retry fields | Existing durable Cloud Tasks dispatch is preserved |
| `user_job_resumes` | `user_id`, `job_id`, `markdown`, `status`, `updated_at` | UI mirror when opening generated output; it is not required for the durable output to exist |

`resume_generations.id = resume_generation_requests.id` links the output to the request. Result reads also match user, job, and base resume. The tracker uses an owned join, and the generated endpoint rechecks ownership independently. The wallet and debit transaction belong to the same request's user. No cross-user result lookup or billing is introduced.

## Verification and deployment

Local checks passed: TypeScript in the Git checkout and running frontend; scoped ESLint with zero errors; worker settlement scenarios; actual client acceptance/background scenarios. Tests use doubles and do not spend a generation credit. They cover approved/review success, no-output and mismatched-output refunds, duplicate delivery, saved-output crash recovery, stale lease rejection, Windows newline input, popup acceptance/error handling, 120 seconds of simulated active polling, transient outages, remount restoration, and rejection of a different user's response. The server-action check exercises queued, running, completed, review, and failed responses.

The GCP build uses committed source without `.env` files. The affected services are `job-hunt-web` and `job-hunt-resume-worker`, in `job-scout-508222` / `us-east1`. Profile service, queue limits, database target, service accounts, secrets, and worker IAM must remain unchanged. Stage new immutable images with zero production traffic, verify readiness and tagged health/authentication behavior, then promote verified revisions to 100%. Preserve the existing `neondb-trial` web tag and remove temporary validation tags.

Final live revisions, image digests, build ID, browser evidence, and rollback commands are recorded in the accompanying release document after verification.

The earlier PR #11 was merged before this follow-up. Publish this change as a separate PR. The separate UI team's deployment still needs these frontend changes integrated; updating Cloud Run backend services does not update an independently hosted frontend.
