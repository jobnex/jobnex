# Multi-user resume queue concurrency — 2026-10-10

## Cause and implemented configuration

The shared `resume-tailoring` Cloud Tasks queue allowed only one concurrent dispatch across all users. The worker revision independently capped instances at one, with one request per instance. A service-level maximum of three did not override that stricter revision cap.

The queue now allows four concurrent dispatches. Cloud Run service and revision maximums are both four. Per-instance concurrency remains one, with zero minimum instances, one vCPU and 1 GiB per instance. Each Python agent receives its own instance while the managed queue buffers additional requests. No Redis, Celery, separate queue per user, or UI change is needed.

Dispatch rate remains one task per second; this is a launch-rate limit, not a one-task-at-a-time limit. Retry settings remain ten attempts, 30-second minimum backoff, 300-second maximum backoff and 3,600-second retry duration. Provider retries can still extend individual generation times. Four is a global ceiling across users, not four slots per user.

The existing DB/API rule still permits one queued or running request per user. Wallet locking lasts only for the short enqueue transaction, not the generation. Workers claim by request ID with a lease, use unique temporary directories and generation IDs, and verify user/job/base-resume ownership before settling credits. Duplicate task delivery cannot rerun a settled request. The configuration change does not alter those protections.

## Live evidence

- Project: `job-scout-508222`; region: `us-east1`.
- Queue: `projects/job-scout-508222/locations/us-east1/queues/resume-tailoring`, running, `maxConcurrentDispatches=4`.
- Worker: `job-hunt-resume-worker-00023-hat`, receiving 100% traffic.
- Previous worker revision: `job-hunt-resume-worker-00020-wed`.
- Image unchanged: `us-east1-docker.pkg.dev/job-scout-508222/job-hunt/job-hunt-resume-worker@sha256:90ca5cbbf1c61853c77d2134585983397277115d056bf914e0dde5204d755808`.
- Verified at `2026-10-10T06:20:10.755895+00:00`.
- Staged at zero traffic; environment, secrets, image, timeout, resources and service account preserved. Authenticated health returned 200; unauthenticated health returned 403, both before and after promotion. Temporary check tag removed.

`scripts/test-resume-concurrency.ts` executes the real worker with a synthetic DB and agent. Four different users enter agent work before any finishes, receive distinct folders and owned outputs, and settle four separate credits. Repeated delivery does not call the agent again. Existing settlement regressions also pass, including refunds, review drafts, crash recovery and lease fencing. TypeScript and scoped lint pass. These are synthetic concurrency checks plus live configuration/health verification; no paid AI generations or production credit debits were used for testing.

## Apply and future tuning

Use the existing Cloud Tasks API management path rather than introducing a second `queue.yaml` management path. Prepare worker capacity before increasing the queue ceiling:

```powershell
gcloud run services update job-hunt-resume-worker --max=4 --max-instances=4 --concurrency=1 --min=0 --region=us-east1 --project=job-scout-508222
gcloud tasks queues update resume-tailoring --max-concurrent-dispatches=4 --location=us-east1 --project=job-scout-508222
```

For subsequent releases, preserve these service and revision limits; an old deployment command with `--max-instances=1` would reintroduce serialization. Production updates should stage a revision at zero traffic and validate it before promotion, as this release did.

Start with four slots. Increase only after observing queue wait time, generation duration, provider 429 responses, CPU/memory, DB connections and cost. Each worker pool allows up to three Node Postgres connections, so four instances can allocate up to twelve of these connections, plus agent connections and other services. Match the queue ceiling to available worker capacity and verified provider/DB quotas. Zero minimum instances saves idle compute but permits cold starts. One-per-instance isolates Python workloads; higher instance concurrency needs memory and CPU measurements first.

A single shared queue does not guarantee fair per-user ordering. One active request per user limits monopolization. Strict tenant fairness or simultaneous requests for one user would require a separate admission policy and DB/UI changes; neither is required to remove this multi-user bottleneck.

## Rollback

Reduce dispatch first, then restore worker traffic and service maximum. The previous revision already has a one-instance revision cap:

```powershell
gcloud tasks queues update resume-tailoring --max-concurrent-dispatches=1 --location=us-east1 --project=job-scout-508222
gcloud run services update-traffic job-hunt-resume-worker --to-revisions=job-hunt-resume-worker-00020-wed=100 --region=us-east1 --project=job-scout-508222
gcloud run services update job-hunt-resume-worker --max=3 --region=us-east1 --project=job-scout-508222
```

Already dispatched requests may finish after reducing concurrency. No schema or data rollback is needed.

References: [Cloud Tasks queue limits](https://docs.cloud.google.com/tasks/docs/configuring-queues), [Cloud Run instance concurrency](https://docs.cloud.google.com/run/docs/about-concurrency).
