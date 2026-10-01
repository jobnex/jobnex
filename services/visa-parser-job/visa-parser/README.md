# Visa sponsorship detection

The Rust CLI reads one JSON job per line from standard input and writes one classification per line. Input fields: `id`, `title`, optional `company`, and `description`. Output includes the same job identity, `sponsorship` (`available`, `unavailable`, `conditional`, or `unknown`), and matched source sentences. Conflicting statements stay `unknown`.

```sh
cargo test --manifest-path visa-parser/Cargo.toml
cargo run --manifest-path visa-parser/Cargo.toml < jobs.jsonl > classified.jsonl
```

To scan the configured `public.jobs` table without changing it:

```sh
node --env-file=.env.local scripts/classify-visa.mjs visa-classifications.jsonl
```

This creates `visa-classifications.jsonl` for every job with evidence and `visa-classifications-available.csv` for roles with explicit positive statements. Both include a hash of the reviewed JD. Review evidence before using the CSV as a sponsorship list. The parser is intentionally conservative: a work authorization requirement, visa mention, or H-1B transfer alone does not prove sponsorship. It cannot infer unstated employer policy or reliably resolve every legal or linguistic edge case.

The reviewed 2026-09-25 production rollout is recorded in `db/003_visa_sponsorship.sql`, `db/004_apply_visa_sponsorship_review.sql`, and `db/visa_sponsorship_review_2026-09-25.json`. The guarded update marked 72 jobs available and 3 conditional. The existing boolean is true only for available jobs.

Apply `db/005_visa_processing.sql` after migration 003. Databases that ran the earlier 005 revision also need `db/006_visa_lease_token.sql`. The trigger queues every inserted job and every changed JD. It also queues existing jobs except unchanged human reviews. Build Rust with `cargo build --release --locked --manifest-path visa-parser/Cargo.toml`, then run `node --env-file=.env.local scripts/process-visa.mjs` to drain the queue once or add `--watch` for continuous processing. Deploy `Dockerfile.visa` as a Cloud Run Job scheduled every 30 minutes (`*/30 * * * *`), or run it continuously with `--watch` on a persistent host. Set `DATABASE_URL` through a secret manager. The queue survives restarts. Monitor queue age and `attempts = 5`; fix the cause and reset those rows to `attempts = 0, due_at = now(), last_error = NULL` when retrying. Requeue parser results after changing parser rules with:

```sh
docker build -f Dockerfile.visa -t jd-match-visa .
docker run --rm --env-file .env.local jd-match-visa
```

For deployment, build and push with `cloudbuild.visa.yaml`, point the scheduled job at that image, inject the production `DATABASE_URL` secret, schedule it with `*/30 * * * *`, and alert if `SELECT count(*), min(due_at) FROM public.visa_processing_queue` shows overdue work or rows at five attempts. The image runs one queue drain and exits, so scheduled executions can overlap safely.

```sql
INSERT INTO public.visa_processing_queue(job_id)
SELECT id FROM public.jobs
WHERE visa_sponsorship_source IS NULL OR visa_sponsorship_source = 'jd_parser'
ON CONFLICT (job_id) DO UPDATE SET due_at = now(), attempts = 0, last_error = NULL;
```

Human reviews (`jd_review` and `employer_declared`) remain authoritative until their JD changes. Automated positive results rely on explicit JD wording and should be audited before use in immigration decisions.
