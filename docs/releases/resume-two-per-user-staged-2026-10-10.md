# Two resumes per user — staged release record

> Superseded staging record: production rollout completed. Current state and final worker revision are in [live release evidence](resume-two-per-user-live-2026-10-10.md).

**Status: tested and staged at zero traffic; production DB migration and promotion await explicit approval.**

Complete change list and rollback: [handoff](../ui-team-resume-two-per-user.md).

Source commit: `186893282bccc3365f395ed8d5c991faec41c447`. Cloud Build: `5d16d776-cf1b-425e-b243-21a93c2fd684`, successful. Later commits change tests/documentation only.
Staging checked at: `2026-10-10T06:47:00.163915+00:00`.

## job-hunt-web

- Staged revision: `job-hunt-web-00036-giy`; ready, zero production traffic.
- Current production revision preserved: `job-hunt-web-00033-xod`.
- Immutable image: `us-east1-docker.pkg.dev/job-scout-508222/job-hunt/job-hunt-web@sha256:383a9ede883ddd09805149ff65d4be4e1fa2e3d862992044589a75d52c3905e3`.
- Runtime bindings and prior production traffic preserved. Temporary verification tag remains for the approved cutover.

## job-hunt-resume-worker

- Staged revision: `job-hunt-resume-worker-00026-rah`; ready, zero production traffic.
- Current production revision preserved: `job-hunt-resume-worker-00023-hat`.
- Immutable image: `us-east1-docker.pkg.dev/job-scout-508222/job-hunt/job-hunt-resume-worker@sha256:030abf37759435f36da78ee73286f5e9c774e9918b322fad976a304f4d3997e4`.
- Runtime bindings and prior production traffic preserved. Temporary verification tag remains for the approved cutover.

## Verified checks

New web root returned 200 and unauthenticated generated-resume access returned 401. New worker authenticated health returned 200 and reported enabled/tasks mode; unauthenticated access returned 403. Global dispatch ceiling, service/revision maximums of four, and worker concurrency one were verified independently.

Temporary Neon branch `br-lingering-firefly-ayce6n56` contains the tested migration; parent `br-plain-morning-ayf71kf3` remains unchanged. Parent still has the one-active index, no running-slot column and no running request at its last read. Recheck running requests after pausing dispatch immediately before migration.

Admission, four-user isolation, settlement/capacity-deferral, background tracking and application regressions pass. TypeScript, scoped lint and whitespace checks pass. No paid AI generation or production debit was used. The DB synthetic test rolled back all fixtures.

Approval operation: use the prepared Neon migration context to apply the exact reviewed SQL to `trail_dev / production / neondb`, removing only the old one-active index and adding the slot column/check/indexes. Pause dispatch, drain active work, apply the migration, promote worker before web, verify, then resume dispatch. Do not promote or resume early.
