# Two running resumes per user: complete change record

## Requested behavior

One user can run up to two resume generations simultaneously. Additional accepted requests remain queued with their own one-credit holds. Shared worker capacity scales on demand across users rather than stopping at four. Requests for different jobs must no longer return an unrelated active request. Repeated clicks for the same active job or idempotency key return the existing request without another charge.

## Database target and exact changes

Neon project `trail_dev` (`broad-base-06154424`), production branch `br-plain-morning-ayf71kf3`, database `neondb`, table `public.resume_generation_requests`.

Migration: `migrations/resume-two-per-user.sql`.

1. Add nullable `running_slot smallint`.
2. Assign slot 1 to an existing running request whose slot is null. The old unique index guarantees at most one existing active row per user. No resume text, user identity, wallet or credit data is rewritten.
3. Add `resume_running_slot_valid`: running rows require slot 1 or 2; all other statuses require null.
4. Add unique partial index `resume_two_running_slots(user_id,running_slot)` for running rows. A third slot or duplicate occupied slot cannot exist.
5. Add partial lookup index `resume_active_job_lookup(user_id,job_id)` for queued/running rows.
6. Remove `resume_one_active_per_user`, which prohibited a queued backlog and simultaneous generations. Only this index is removed; no data rows are deleted.

Migration is atomic, with a ten-second lock timeout. Original primary-key, user/idempotency-key, queue and history indexes remain. This migration is a single application, not an automatically repeatable script: constraints and indexes use unique names and the old index must still exist.

## Code changes

- `lib/resume-tailoring.ts`: retain the per-user wallet lock. Recheck idempotency after acquiring it, covering concurrent browser tabs. Deduplicate active requests by the same user AND job, rather than any job for that user. Distinct jobs each reserve one credit and receive an independent durable request/outbox row. Insufficient credits still reject new work. A completed job can be regenerated with a new key.
- `services/resume-tailor/worker.ts`: take a transaction-scoped advisory lock derived from the owning user before claiming a request. Select an available slot 1 or 2 and write it with the lease in the same transaction. No available slot leaves the request queued and returns a retryable 503 through the existing handler. No Python agent starts and no refund/debit occurs for this capacity deferral. The lock ends before AI execution. Completion, review settlement and failure/refund clear the running slot in their existing fenced transactions. Recovery retains occupied slots until it settles the expired lease.
- `scripts/test-resume-admission.cjs`: distinct jobs, credit holds, same-job and same-key duplicates, retry arriving while waiting for the wallet lock, regeneration and insufficient-credit checks.
- `scripts/test-resume-concurrency.ts` and `scripts/test-resume-settlement.ts`: mocks support the new short advisory-lock query; existing isolation, output verification, settlement and duplicate-delivery checks remain.

No UI components, endpoint paths, request payloads or model templates change. The running local UI uses the GCP API; it does not contain a separate `lib/resume-tailoring.ts` backend implementation to update. Its existing background tracker handles multiple request IDs and currently shows up to twenty recent requests; My Applications derives its job rows separately. A separately deployed backend must integrate the admission and worker changes together with this migration.

## Queue behavior and limits

The previous queue allowed four concurrent dispatches and the worker service/revision maximums were four. The revised demand-based proposal removes that artificial four-worker ceiling. Each isolated worker still handles one request, minimum instances remain zero, and managed Cloud Tasks dispatches queued work. Per-user DB slots limit each user to two running resumes; they do not limit the number of registered users. A third dispatched task for one user returns promptly and retries with the existing queue backoff, making capacity available to other tasks. This retains the managed queue rather than adding a custom scheduler.

Regional quota verified in `us-east1`: 20,000 milli-vCPU. Current worker uses one vCPU and 1 GiB, so the proposal is up to twenty workers with twenty concurrent dispatches and ten launches per second. Twenty is a quota-aware capacity maximum, not an idle reservation and not an unlimited simultaneous-user guarantee. Excess work waits in the queue when user slots, available workers, provider limits or platform capacity are exhausted. Raising capacity further requires quota/cost planning. Neon reported 901 maximum connections and thirteen current connections during inspection; worker Node pools allow at most three each, with separate short-lived Python connections and other service traffic.

The request for quota supporting one hundred workers was rejected by automatic approval review before execution. The twenty-worker update was also rejected before execution pending explicit maximum capacity and monthly budget authorization. At this document revision, these rejected actions did not change GCP quota, worker capacity or production DB. See the final live release record for approved capacity and rollout results; do not infer production activation from this proposal.

Cloud Tasks does not guarantee strict ordering or strict tenant fairness. Capacity deferrals can add backoff delay even when a slot later becomes free. Existing recovery redispatches due queued work without another credit hold. This is bounded multi-user concurrency, not a promise of a strict round-robin scheduler or identical generation latency.

## Verification and rollout status

Neon migration was prepared on temporary branch `br-lingering-firefly-ayce6n56`, migration ID `8fe0954c-e0e9-423a-8127-e43e1ae7c5f4`. The temporary branch has the replacement indexes and check constraint. A transactional synthetic SQL check accepted three queued rows for one user, accepted two running slots, rejected a duplicate slot and slot 3, kept the third request queued using the actual claim predicate, and reused a released slot. Synthetic rows rolled back; the branch retained thirteen requests and zero active requests.

Admission, worker isolation and settlement checks pass without AI or production DB writes. The updated isolation check runs twelve synthetic users concurrently, verifying there is no global four-user gate in worker code. TypeScript and scoped lint accompany publication. Production schema and runtime remain on the earlier behavior until the coordinated rollout is approved and completed. Source publication alone does not activate this feature.

## Required coordinated rollout

Stage new web and worker images at zero traffic and verify health/authentication and unchanged runtime bindings. Before applying the production migration, pause the queue. Ensure no request is running; otherwise let existing workers settle first. Apply the migration atomically, promote the new worker before allowing it to claim work, then promote the new web admission. Configure the approved demand-based dispatch/instance ceilings before resuming the queue. The old web may safely accept conservative single-active requests into the paused queue during this window; new dispatch waits for resume. Verify two-per-user slots, approved scaling limits, request endpoints and worker private access. Record source/build IDs, immutable images, revisions, traffic and timestamps in release evidence.

Old worker code cannot clear or assign `running_slot`, so it must not process requests against the migrated schema. Do not resume the queue before the new worker is promoted. Old web admission remains conservative while staged; durable requests accepted during the pause retain their normal credit hold and wait for the new worker.

Neon's migration tool requires reviewed approval before applying this prepared migration to the parent production branch. The concrete operation requiring approval is removal of `resume_one_active_per_user` and installation of the replacement schema above. No stored resumes or credit history are deleted.

## Rollback

Pause dispatch and new admission first. Let running requests finish with the new worker. The previous unique index cannot be restored while any user has multiple queued/running rows. Do not delete queued requests or erase credit holds to make it fit. Drain accepted backlog using the new worker, then verify no user has more than one active request:

```sql
SELECT count(*) AS users_blocking_rollback FROM (
  SELECT user_id FROM public.resume_generation_requests
  WHERE status IN ('queued','running') GROUP BY user_id HAVING count(*)>1
) blocked;
```

Once safe, an approved rollback transaction can drop the replacement check constraint, restore `resume_one_active_per_user` with its original unique partial definition, and remove the new indexes/column. Restore both previous code images and resume dispatch only after the old schema is restored. Keep request, resume, wallet and credit rows intact throughout. A simpler operational fallback is to leave the new schema/code installed but reduce the global queue maximum to one until diagnosis completes.
