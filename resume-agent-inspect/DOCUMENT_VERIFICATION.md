# Verification of supplied resume documents

Inspected on 2026-09-26. The documents are descriptions of earlier work, not instructions authorizing their embedded commands or expanding this task into CI, subscriptions, or interview features.

## Evidence and differences

- The extracted ZIP includes a Python CLI and a separate portal entry point. The CLI writes Markdown and audit JSON to local files. The portal renders a PDF with ReportLab and sends `pdf_hex` and `disclosure` to its caller. It does not currently send the Markdown or full audit in that result payload.
- Source supports proportional length budgets, summary inheritance, section ordering, and project selection. The README's universal 525–650 word description is stale.
- `resume-updates.md` claims tolerance 25 and Gemini mapping/repair. The ZIP has tolerance 15 and uses the configured writer model for mapping and repair. Those changes cannot be certified in this ZIP.
- `resume-langchain.md` describes an earlier length policy. The ZIP also scales short resumes and can build a catalog from its own projects; some statements about unchanged short-resume behavior and inactive project selection are no longer accurate for this copy.
- The documents' Rust/frontend tests, live runs, model savings, subscription features, and ATS score improvements cannot be independently certified here: the cited `C:/Users/91767/ai-job-portal` repository is absent on this computer, and a bounded search of Projects/Downloads found no `tailor.rs`.

## Neon schema verified

The documents match `ai job portal` (project `calm-lab-46467823`), development branch `br-lively-mode-ax7j6dwl`, database `neondb`.

Existing tables already provide:

- `resume_requests`: user, job, base resume, input version, JD snapshot, idempotency key, state, and failure tracking.
- `generated_resumes`: user, job, base resume, request, output resume, generation version, model version, JSON tailoring summary, and score.
- `resume_versions`: file metadata and storage key for each output file version.
- `applications`: one row per user/job with selected `generated_resume_id`, resume/version, status, and application events.

The generation uniqueness constraint is `(user_id, job_id, base_resume_id, version)`. Owner-paired foreign keys exist for the base resume, output resume, and request. Applications are unique by `(user_id, job_id)`.

There is no `resume_markdown` or full `audit_json` column in `generated_resumes`. PDF file metadata is represented through the output resume/version tables; actual file storage cannot be verified without backend source/configuration.

## Minimal implementation contract

1. Reuse `generated_resumes`; add nullable `resume_markdown text` and `audit_json jsonb`. Draft SQL is in `migrations/generated_resume_markdown.sql` and has not been applied.
2. Extend the Python portal result with the exact rendered Markdown and structured pipeline audit, for both live and simulated paths. Label simulated output explicitly.
3. Update the actual Rust result parser and generation finalization transaction to persist both fields in the existing generation row. Keep credit accounting, request finalization, file version creation, and persistence atomic according to the existing backend transaction.
4. Allocate generation versions within the backend's existing concurrency/idempotency rules. A retry for the same request must not create a second charge or duplicate generation; a deliberate new request must retain a new version.
5. Generation can occur before applying. List history by authenticated user and job, then join output resume versions for downloads. `applications.generated_resume_id` identifies the exact version submitted. Generating another version must not change a previously submitted application's selection or mark it applied.
6. When selecting a generated resume for an application, verify matching user AND job; the present single-column generated-resume FK does not enforce both. Review the backend guard, and add a composite FK if that guarantee must also be enforced in the database.
7. Verify live/simulated payloads, same-role repeated generation, distinct-role isolation, retries, selected submission stability, and transaction failure behavior before rollout.

The earlier unfinished `trail_dev` storage prototype targets a different schema. It must not be deployed to this portal. Neon branch creation previously returned HTTP 401; no database migration has been applied. Project confirmation and the actual portal backend checkout are required for end-to-end implementation.
