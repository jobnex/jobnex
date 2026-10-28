# Resume requests in My Applications

## Behavior

After the server accepts a Generate Tailored Resume request, that job appears in My Applications immediately, even while generation is queued or running. The existing request transaction is the durable intake record. No second insert or credit charge is required. A rejected request creates no application row. If the backend returns an existing active request for another job, only the actual persisted request's job appears.

My Applications now reads real owned requests instead of demo `jobsData`. Existing requests, including TensorWave and AWS drafts, appear automatically. The latest request for each job produces one row; repeat generation does not duplicate the job. Failed generations remain visible with their status. This list has no latest-20 restriction.

Generation does not submit an application to an employer. The Applied, Interview, and Offer controls explicitly save the user's chosen stage. Apply Now opens the employer link separately. No stage is selected until the user marks one or an existing application stage is present.

View Resume and Download load the saved resume for that particular owned job, rather than the generic resume editor state. Review drafts display a review warning. Pending requests disable the resume menu until the run reaches a terminal status.

## Files and deployment

- `app/actions/resume-applications.ts`: authenticated list and stage update server actions.
- `app/(main)/job-hunt/applications/page.tsx`: real request list, status refresh, search, per-job preview/download, saved stage controls.
- `lib/job-utils.ts`: shares the existing local frontend's external URL normalization with the repository checkout.
- `scripts/test-resume-applications.cjs`: dependency-free checks using the installed TypeScript compiler, actual action/page modules, and deterministic doubles.

The changes are synchronized to the running local frontend and the GitHub repository. A separately deployed UI must integrate these files and deploy them together. Existing generation endpoint paths and worker contracts are unchanged. Cloud Run web deployment includes these UI/server-action changes; the worker does not need a new revision.

## Database contract

`resume_generation_requests.user_id` filters ownership. `job_id` joins `jobs.id`; latest `created_at` and `id` select one request per job. The UI displays request `status` and `created_at`. Jobs supply role title, company, description, location, employment type, salary, and external apply URL. The request ID remains associated with the row.

`applications.user_id` and `job_id` join the same owner/job to recover stage. An explicit stage selection upserts `applications.status` and `updated_at` using the existing unique `(user_id,job_id)` index. Inserts require an owned generation request. Existing notes, resume ID, and match score are preserved on updates. No schema migration, destructive cleanup, request backfill, or wallet modification is needed.

The existing owned `getExistingTailoredResume(jobId)` action retrieves valid `resume_generations.resume_markdown` with the established request/status/credit checks, then falls back to the UI mirror when appropriate. Needs-review drafts retain their review warning.

## Refresh and verification

The page listens for the existing `resume-requests-changed` event dispatched after successful acceptance, and for browser focus. It also polls every four seconds while any request is queued/running, otherwise every 30 seconds. It has no 60/90-second cutoff. Errors retain existing rows and retry. Account changes hide another account's cached rows and preview immediately; each server action authenticates again.

Run `node scripts/test-resume-applications.cjs` and `npx tsc --noEmit`. The focused checks cover action ownership, request-derived rows, deduplication query, guarded stage upsert, invalid input, 120 seconds of pending polling, transient read errors, remount restoration, matching review draft, and account isolation. Live browser verification uses existing drafts and does not create a paid generation or mark a real employer application submitted merely for testing.
