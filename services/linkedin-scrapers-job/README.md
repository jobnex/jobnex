# LinkedIn scraper Cloud Run Job

Runtime source recovered from Cloud Build `5e7ab689-b034-4f38-a241-8f1fd9d2ddf4`. Its output digest matches the inspected `linkedin-scrapers-job` image: `sha256:c3bac34d89bc27546b56f216749282ec78e3041011e0188bccee88a634de8594`.

`cloudrun_entrypoint.py` maps Cloud Run task indexes to ten role scrapers. They fetch jobs, filter and normalize results, and insert/update Neon records. The existing scheduler runs at `0 */2 * * *` in `Etc/UTC`.

Build from this folder: `docker build -t linkedin-scrapers-job .`. The image runs `python cloudrun_entrypoint.py`. Configure `DATABASE_URL` or `TRAIL_DEV_DB_URL` privately through a secret binding; `SCRAPE_HOURS` controls lookback. Cloud Run supplies `CLOUD_RUN_TASK_INDEX`. Running the job performs external scraping and database writes.

An embedded database credential in the recovered source was removed. Missing configuration now fails explicitly. The original credential must be rotated separately; the live job and its secrets were not changed during this import.

`cloud-run-job.reference.json` and `scheduler.reference.json` record inspected deployment settings. Literal environment values are replaced with placeholders, except numeric scrape settings. Review configuration and bind secrets before deploying. No deployment or scheduler changes were performed.

Browser profiles, session data, personal resumes, job exports, compiled Rust binaries, and unrelated tracker code from the original archive were excluded. No pre-existing unit tests were present in the recovered runtime subset. `python tests/test_config.py` runs the added isolated database configuration checks without contacting Neon or scraping sites.
