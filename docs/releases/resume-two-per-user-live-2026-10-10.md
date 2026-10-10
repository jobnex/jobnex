# Two resumes per user and demand-based autoscaling — live release

Production rollout completed on 2026-10-10. Each user has two running resume slots; extra accepted requests remain queued with their own credit holds. Shared compute scales with queued demand from zero minimum instances up to the approved twenty-worker capacity. The previous four-worker limit is removed. Twenty is an instance maximum, not twenty reserved or constantly running workers. Platform availability and provider limits can still delay work.

Full DB/code/queue changes and rollback: [handoff](../ui-team-resume-two-per-user.md).

## Deployment and approval

- User explicitly approved autoscaling from zero to twenty workers with no monthly Cloud Run spending cap. No quota increase to one hundred workers was submitted.
- GCP project `job-scout-508222`, region `us-east1`: effective CPU allocation quota is 20,000 milli-vCPU; worker requests one vCPU and 1 GiB.
- Source commit: `186893282bccc3365f395ed8d5c991faec41c447`; successful Cloud Build `5d16d776-cf1b-425e-b243-21a93c2fd684`. Later commits change test coverage and documentation only.
- Production health/authentication checked at `2026-10-10T07:08:38.556285+00:00`.
- Queue resumed and verified at `2026-10-10T07:10:37.670265+00:00`.

| Service | Live revision | Previous production revision | Traffic |
| --- | --- | --- | --- |
| job-hunt-web | `job-hunt-web-00036-giy` | `job-hunt-web-00033-xod` | 100% |
| job-hunt-resume-worker | `job-hunt-resume-worker-00027-ter` | `job-hunt-resume-worker-00023-hat` | 100% |

Immutable images:

- job-hunt-web: `us-east1-docker.pkg.dev/job-scout-508222/job-hunt/job-hunt-web@sha256:383a9ede883ddd09805149ff65d4be4e1fa2e3d862992044589a75d52c3905e3`
- job-hunt-resume-worker: `us-east1-docker.pkg.dev/job-scout-508222/job-hunt/job-hunt-resume-worker@sha256:030abf37759435f36da78ee73286f5e9c774e9918b322fad976a304f4d3997e4`

Worker service and revision maximums are both twenty, instance concurrency one and minimum zero. Cloud Tasks `resume-tailoring` allows twenty concurrent dispatches and ten launches per second. Retry/backoff settings remain unchanged. Queue management stays API-based; no second queue.yaml, Redis or custom scheduler is introduced.

## Database and cutover evidence

Migration `8fe0954c-e0e9-423a-8127-e43e1ae7c5f4` applied at `2026-10-10T07:05:17.751867+00:00` to Neon `trail_dev` (`broad-base-06154424`), production branch `br-plain-morning-ayf71kf3`, database `neondb`.
Dispatch was paused and zero running requests verified before migration. The slot-aware worker was promoted before the new admission web. Both were verified before dispatch resumed. Old one-active index removed; running-slot column/check, unique two-slot index and active-job lookup installed. Original idempotency index preserved. Thirteen existing request records were retained; no resume, wallet or credit rows were deleted or rewritten. Prepared temporary branch was deleted by the migration tool.

Temporary-branch synthetic SQL tests verify queued backlog, two valid running slots, rejection of a duplicate slot and slot three, third-request deferral using the actual claim predicate, and reuse after release. All fixtures rolled back. Production checks read the installed constraint and indexes and confirm preserved request counts. Automatic review rejected a redundant production fixture mutation before execution; no production synthetic test data was written.

## Code and verification

Admission deduplicates only the same active job or idempotency key for that user, rechecking the key after its short wallet lock. Distinct jobs queue independently with one-credit holds. Worker claims serialize only briefly per user, assign slot one or two under a transaction lock, and leave over-capacity requests queued for retry without AI calls or refunds. Fenced completion/refund clears slots; recovery keeps them occupied until settlement.

The real-worker synthetic test overlaps twelve users, checks owned outputs, separate folders/credits and duplicate delivery without paid calls. Admission, settlement/capacity deferral, background polling and My Applications regressions pass. TypeScript, scoped lint and whitespace checks pass. Staged and live web health/auth checks returned 200/401. Worker authenticated health returned 200 and enabled/tasks mode; unauthenticated access remained 403. Runtime secrets, environment, service account, image selection and resource settings were preserved except the documented scaling change. Temporary verification tags removed; `neondb-trial` follows the new web revision.

No UI layout or endpoint change. Running local UI already calls this backend. A separate backend deployment must integrate the admission/worker migration together. The background tracker retains its existing twenty-recent-request display; this does not cap accepted users or queued jobs.

## Capacity tuning and limits

The queue buffers overflow when per-user slots, twenty available workers, provider rate limits or platform availability prevent immediate execution. Cloud Tasks does not guarantee strict round-robin fairness or FIFO scheduling. Zero minimum saves idle compute but permits cold starts; active compute remains usage-billed. This is not unlimited instantaneous capacity or a hard monthly cost guard. Twenty was explicitly approved as the current maximum; higher limits need further quota/cost authorization.

Neon reported 901 maximum connections and thirteen current connections during inspection. Twenty Node worker pools can allocate at most sixty Node connections, plus short-lived Python connections, other services and platform transients. This inspection is capacity planning evidence, not a full production load test or an AI provider quota guarantee.

References: [Cloud Run scaling limits](https://docs.cloud.google.com/run/docs/configuring/max-instances), [Cloud Run quotas](https://docs.cloud.google.com/run/quotas).
