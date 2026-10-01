# Visa parser Cloud Run Job

Runtime source recovered from Cloud Build `ea33677d-df05-4d09-afbc-3d85d4f6b007`. Its image digest matches the inspected `visa-parser` job: `sha256:6f0b4367a387f1c203ad3f7f58d9cf0fb9a5113e68f508d6305abd56317c8a87`.

The Rust parser detects explicit visa sponsorship statements in job descriptions. `scripts/process-visa.mjs` leases queued Neon jobs, runs the parser, and saves classification and evidence. It preserves human review results. The existing scheduler runs every 30 minutes (`*/30 * * * *`, `Etc/UTC`).

From this folder, build with `docker build -f Dockerfile.visa -t visa-parser .`. The image runs `node scripts/process-visa.mjs`. Set `DATABASE_URL` privately through a secret binding. Running the worker updates job records and processing queue rows.

`package.json` and its lockfile are preserved from the deployed build context; unrelated JD matching/frontend npm scripts are not entry points for this service. The Dockerfile selects the worker entry point explicitly.

The `db/` migrations were copied from the local JD_match source separately from the deployed archive. They define sponsorship fields, the processing queue, and lease tokens. Review database state before applying migrations; none were applied during this import. Historical review snapshots and their apply script are excluded.

`cloud-run-job.reference.json` and `scheduler.reference.json` record inspected runtime and schedule settings. Literal environment values are replaced with placeholders; secret references contain names, not secret contents. Review and bind secrets before using this configuration. No job execution, database writes, deployment, or scheduler changes were performed.

Rust unit tests remain embedded in `visa-parser/src/`. Run `cargo test --locked --manifest-path visa-parser/Cargo.toml` separately before changes are released.
