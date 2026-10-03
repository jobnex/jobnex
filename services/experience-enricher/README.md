# Experience enrichment

This Rust Cloud Run job classifies experience for every job description, writes `public.jobs.experience_details`, and fills `experience_required` when an unconditional whole-year minimum is stated. It uses no LLM or external inference API.

Version 6 also recognizes “Have”, “You'll have”, “You’ll have”, and “You will have” requirements and education alternatives without a qualification heading. Bachelor’s + 4 years OR Associate’s + 6 years remains two conditional paths, with no invented unconditional minimum. Version 5 fixed preferred-certification scope, Unicode bullets, requirement labels, implied work experience, abbreviations, and long clauses. The parser retains every detected year/month candidate and its classification. `coverage-check.cjs` compares the parser against every published description using read-only keyset pagination; its local report contains aggregate counts only. `--sample` prints bounded evidence for manual review.

The extractor chooses the lower endpoint of a range and the largest independent required minimum. Exact values are stored in months, so six months and 1.5 years retain their meaning; the integer column stays null for fractional years. Preferred requirements and conditional branches remain in the profile instead of being discarded. An explicit zero minimum or generic statement that no experience is required produces zero. Title seniority never invents years. This is English-language rule-based extraction; difficult clauses can remain `needs_review` with their evidence.

`experience_details` is non-null and starts as `{"status":"pending"}` on insertion. Changed descriptions reset it to pending. After processing, statuses are `required`, `required_with_alternatives`, `conditional_education`, `conditional_alternatives`, `preferred_only`, `experience_target`, `experience_ceiling`, `recency_constraint`, `needs_review`, `not_quantified`, or `not_stated`. Profiles include `minimum_months`, `requirements` with exact lower/upper quantities and evidence, `parser_version`, `description_hash`, `effective_years`, and `numeric_source`. `not_stated` and `not_quantified` must not be treated as zero. Conditional candidates must not be flattened into one unconditional minimum. `effective_years` preserves a manual numeric override; `years` and `minimum_months` describe the parser's extraction.

The additive migration creates a processing table and a trigger for new jobs or changed descriptions. Unknown results are recorded once. Each batch locks both queue and job rows with `SKIP LOCKED`, writes values in bulk, and commits atomically. Existing non-null values remain unchanged unless they still equal this worker's previous value. Changed descriptions can clear obsolete worker-owned values. Unpublished jobs remain queued until publication. Other job columns and `updated_at` remain unchanged.

Published jobs are processed by the schedule; unpublished jobs have a pending profile until publication. The first migration uses PostgreSQL's constant non-null default to populate existing rows without rewriting the table. It is safe to rerun on the final schema. Older experimental nullable profile columns require a separate backfill before migration under the worker's 60-second statement limit. Production schema changes should first pass `integration-check.cjs` on an isolated production clone.

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

If Windows Application Control blocks local test executables, `node verify-linux.cjs start` submits the normal Linux image build, which runs `cargo test --locked`. After it succeeds, `node verify-linux.cjs verify` checks build success and binds it to a hash of the current runtime source. Build verification records are local and ignored.

Defaults: 250 jobs per transaction, 20-minute processing budget, 60-second statement timeout, 5-second lock timeout. Batch size is capped at 1,000. A killed task rolls back its current batch; previous batches remain committed and retries resume remaining jobs.

## Deployment

Version 9 handles Bring/Possess/Extensive experience, compact bullets, attached hyphens, MSc/BSc, and spelled-out upper range endpoints through twenty. Detached education paths retain their degree conditions across semicolons and adjacent plus/and/with clauses, including a no-degree alternative. Company history, roadmaps, retention and program durations remain non-experience candidates. Approximate quantities use `experience_target` with `approximate_experience` candidates and retain exact bounds without asserting an unconditional numeric minimum. Malformed adjacent numbers such as `3 5 years` still require source clarification. Regression controls cover bold headings, independent requirements, and requirements that mention product durations.

Version 8 separates option numbers from experience quantities, including `Option 2: 1 years` without a qualification heading. The malformed-range guard still flags `3 5 years` and `Option 2: 3 5 years`. Additional exclusions distinguish corporate “we bring / backed by” history and co-op extension durations from applicant experience.

Version 7 adds activity-only requirements, additional applicant phrases, escaped Markdown and joined headings, PhD/MS and equivalent-education alternatives, substitution allowances, and repeated-unit ranges. It excludes observed company-history, benefit, college-tenure, internship-duration and deadline expressions. Recency windows use `recency_constraint` with `recency` candidates; upper experience limits use `experience_ceiling` with `maximum_experience` candidates (minimum 0 months, maximum stated). Neither becomes an unconditional numeric year requirement. Malformed adjacent numbers stay `needs_review`. `coverage-check.cjs --review` audits the current review cohort without production writes.

Target: `job-scout-508222`, `us-central1`, Cloud Run job `experience-enricher`. Runtime database credentials use Secret Manager; no secret value belongs in source, build arguments, image, or logs. A dedicated scheduler service account receives `roles/run.invoker` only on this job. Runtime service account receives access only to the selected database secret.

`prepare-secret.cjs` creates `experience-enricher-database-url` from the existing `DB-secret`, changing only the hostname to the direct Neon endpoint. The direct connection keeps session timeouts reliable without transaction-pooler routing.

Run once with `--migrate`, then remove that argument. Schedule normal executions at minutes 10 and 40 each hour in UTC. This 30-minute interval avoids the visa job's minutes 0 and 30, and fits the scraper's two-hour cycle. Cloud Scheduler uses an OAuth token for the Cloud Run Jobs API: https://docs.cloud.google.com/run/docs/execute/jobs-on-schedule.

The database account currently needs migration privileges during bootstrap and SELECT/UPDATE on jobs plus queue access for normal operation. A dedicated least-privilege database role can replace the existing secret later. The trigger does not detect untracked changes to externally populated experience values; normal runs preserve such values when they differ from the previous worker value. Exact same-value manual changes cannot be distinguished without a separate ownership column on jobs.
