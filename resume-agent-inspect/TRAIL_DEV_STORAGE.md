# trail_dev resume result storage

Target: Neon project trail_dev (broad-base-06154424), database neondb.
Production branch: br-plain-morning-ayf71kf3.
Review branch retained for inspection: resume-history-review (br-aged-frost-ay2skadj).

## What is stored

public.resume_generations holds each generation's UUID, owner user ID (text), job UUID,
optional base resume UUID, per-user/job version, pipeline status, exact Markdown, exact
pipeline audit JSON, source/JD hashes, and timestamp. Token usage, estimated cost,
factual evidence and project selection remain inside the original audit, without conversion
to invented ATS scores. needs_review and failed remain those statuses.
Rows cannot be overwritten. A new request uses a new UUID; an exact persistence retry
uses the original UUID and audit and returns the original version. Conflicting reuse is rejected.

public.resume_generation_submissions links an existing application to the exact generation
selected for submission. A new generation does not change application status, resume_id,
or the selected submission. Selection validates owner/job and blocks needs_review/failed.
This is an additive link table; existing application code continues to operate.

## CLI

Use the isolated environment in this extracted project; install entry points once:

    .venv\Scripts\python.exe -m pip install -e .

Set RESUME_RESULTS_DATABASE_URL to a server-side PostgreSQL connection for trail_dev.
If absent, DATABASE_URL is the fallback. Result storage and JD caching are separate:
--memory-cache disables only the JD cache, and can be used while storing final results.
The program does not automatically load .env.

Use existing flags and add --job-id:

    low-risk-resume --resume resume.md --jd job.txt --tenant-id USER_ID --summary no --out output\resume.md --memory-cache --job-id JOB_UUID

Optionally add --base-resume-id BASE_RESUME_UUID when it belongs to that user.
The JD file must match the selected database job description after normalization.
If the job changes during generation, the DB save is rejected and local output remains.

No --job-id means the original local-only behavior. --out is still required.
Successful DB saves add database_saved, generation_id, and generation_version to CLI JSON.
DB write failures return exit code 1, database_saved:false, and retain local Markdown/audit.
A storage failure must not be interpreted as successful database persistence.

Retry storage without another LLM call:

    low-risk-resume-save --audit output\resume.audit.json --user-id USER_ID --job-id JOB_UUID --generation-id ORIGINAL_GENERATION_UUID

Include the original --base-resume-id if one was used.
This command validates the saved audit and persists it without regenerating content.
An exact retry after a successful save returns the existing version.

## Portal adapter and backend API

The portal still emits usage events requiring acknowledgement and the existing PDF/disclosure
result. It now also returns resume_markdown and audit_json. Simulated output is explicitly labelled.

A trusted backend may send persist_results:true along with generation_id, user_id, job_id,
and optional base_resume_id to save real outputs directly through the adapter.
Simulated output cannot use this persistence mode. DB failure produces the existing failed
message; the caller must retain its existing credit/failure handling.
The caller should supply stable generation IDs and use the storage-only retry on uncertain saves.

The actual Rust/frontend portal repository is not available in this workspace, so its IPC line
limits, new-field handling, authenticated routes and UI are not independently verified here.
The adapter's extra fields are additive; a caller with strict unknown-field rejection needs
its parser updated before using this adapter.

Use ResumeStore from the server, with user_id derived from the authenticated session:

    store.history(user_id=user_id, job_id=job_id)
    store.select_for_application(user_id=user_id, application_id=application_id, generation_id=generation_id)

Do not expose the CLI's tenant-id as a browser-controlled authorization mechanism.
Only the owner DB role has access to the new tables after migration; grant a dedicated backend
role SELECT/INSERT as needed and SELECT/INSERT/UPDATE on the submission table.
Do not expose a privileged DATABASE_URL in the browser. Existing profile/auth tables are reused;
no duplicate user registry was created.

## Verification and rollout

migrations/trail_dev_resume_history.sql is the additive migration for this setup.
migrations/generated_resume_markdown.sql targets the other ai job portal schema and is not
the trail_dev migration.

tests/test_storage.py verifies ownership, exact Markdown/audit, stable retry behavior,
job changes, storage failure with local-file retention, normal CLI behavior, PDF payload,
simulated-output rejection, and the persistence-only retry.
tests/neon_storage_checks.sql verifies DB version assignment, duplicate-ID inserts,
immutable history, base ownership, role isolation, review rejection, audit consistency,
and stable submission selection. Fixtures are rolled back using a nested transaction.
No real resumes or applications are used as write fixtures.

Factuality pipeline, source parser, prompts, policy checks, project logic and renderer remain
byte-for-byte identical to the original ZIP. No new model call is added.
The new tables are additive. No existing application, saved resume, or profile row is migrated.
