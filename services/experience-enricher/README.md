# Experience enrichment

This Rust Cloud Run job extracts explicit required years of experience from job descriptions and updates `public.jobs.experience_required`. It uses no LLM or external inference API.

The extractor chooses the lower endpoint of an explicit range and the largest independent required minimum. Preferred qualifications, company tenure, fractional years, and ambiguous education alternatives remain unknown. An explicit zero minimum or a generic statement that no experience is required produces zero. Title seniority never invents years. This is conservative English-language extraction, not semantic understanding; evidence and parser version are stored for audit.

The additive migration creates a processing table and a trigger for new jobs or changed descriptions. Unknown results are recorded once. Each batch locks both queue and job rows with `SKIP LOCKED`, writes values in bulk, and commits atomically. Existing non-null values remain unchanged unless they still equal this worker's previous value. Changed descriptions can clear obsolete worker-owned values. Unpublished jobs remain queued until publication. Other job columns and `updated_at` remain unchanged.

## Local commands

```powershell
rtk cargo test --locked
rtk cargo clippy --locked --all-targets -- -D warnings
# DATABASE_URL comes from a secret or the environment.
rtk cargo run --locked -- --dry-run
rtk cargo run --locked -- --migrate
rtk cargo run --locked
```

`--dry-run` reads a bounded sample without migrations or writes. `--stdin` accepts JSONL `{ "id": "...", "description": "..." }` for offline extraction. Production TLS verifies the server certificate and hostname. Plaintext is restricted to an explicit localhost-only test option.

Defaults: 250 jobs per transaction, 20-minute processing budget, 60-second statement timeout, 5-second lock timeout. Batch size is capped at 1,000. A killed task rolls back its current batch; previous batches remain committed and retries resume remaining jobs.

## Deployment

Target: `job-scout-508222`, `us-central1`, Cloud Run job `experience-enricher`. Runtime database credentials use Secret Manager; no secret value belongs in source, build arguments, image, or logs. A dedicated scheduler service account receives `roles/run.invoker` only on this job. Runtime service account receives access only to the selected database secret.

`prepare-secret.cjs` creates `experience-enricher-database-url` from the existing `DB-secret`, changing only the hostname to the direct Neon endpoint. The direct connection keeps session timeouts reliable without transaction-pooler routing.

Run once with `--migrate`, then remove that argument. Schedule normal executions at minutes 10 and 40 each hour in UTC. This 30-minute interval avoids the visa job's minutes 0 and 30, and fits the scraper's two-hour cycle. Cloud Scheduler uses an OAuth token for the Cloud Run Jobs API: https://docs.cloud.google.com/run/docs/execute/jobs-on-schedule.

The database account currently needs migration privileges during bootstrap and SELECT/UPDATE on jobs plus queue access for normal operation. A dedicated least-privilege database role can replace the existing secret later. The trigger does not detect untracked changes to externally populated experience values; normal runs preserve such values when they differ from the previous worker value. Exact same-value manual changes cannot be distinguished without a separate ownership column on jobs.
