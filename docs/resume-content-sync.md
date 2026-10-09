# Base resume storage contract

The selected base resume must have Markdown in `user_pref_resumes.content`, structured extracted JSON in `parsed_data`, editable/extracted profile data in `user_job_preferences.resume_details`, and an owned `active_resume_id` pointing to the same resume.

Profile extraction now writes Markdown and JSON together. Builder edits merge editable sections into existing extraction data, regenerate Markdown while retaining non-builder Markdown sections, and commit profile/base-resume changes in one transaction. Replacing an uploaded source invalidates the old extracted text. Draft/studio saves synchronize Markdown with the compiler payload and parsed JSON. Generation accepts only the owned active resume and normalizes legacy JSON content at the read boundary.

The current local modal caller is included at `app/actions/tailored-resume.ts`; it reads the owned active pointer instead of choosing an arbitrary first resume. Existing GCP queue/outbox and completed-generation/PDF routes were reconciled from exact deployed Cloud Build input 85cedbc5-f7a8-493e-b9ba-ecc64ae4339e before modifying web behavior. The worker source reconciliation preserves the already deployed implementation; no worker redeploy is required for this fix.

Checks: `node node_modules/tsx/dist/cli.mjs scripts/check-resume-content.ts`; `python -m unittest service.test_main service.test_resume_content` from `services/job-hunt-profile` with a test-only service secret; `node node_modules/typescript/bin/tsc --noEmit`; scoped ESLint and production Cloud Build. Existing `no-explicit-any` errors in preferences/storage are baseline issues, not introduced by this fix. No maintenance/seed scripts or paid generation are part of validation.

Production repair uses only each owned existing source or structured record, fences the original file key and profile timestamp under row locks, preserves manual builder edits, and commits profile/base-resume selection together. No DB schema migration is needed. Deployment evidence and rollback revisions are recorded separately for the release.
