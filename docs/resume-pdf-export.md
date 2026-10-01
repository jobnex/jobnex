# Resume storage and PDF export

Manage Job Hunt uploads the original PDF/DOCX directly to R2 using an authenticated signed URL. The profile service reads the object, extracts details, and persists the user's profile in Neon. App 4 maps those details into editable fields. Extraction is heuristic: education text is preserved; degree/date fields may need manual correction. Scanned PDFs need OCR outside this service.

Prepare Resume creates an application for the signed-in user and opens My Applications. View Resume loads the latest job draft or starts from that user's base resume. This action does not perform AI tailoring or spend credits.

Export PDF sends {jobId, markdown, templateId} to /api/resume/export. The authenticated route verifies application ownership, uses the preview's Markdown parser, and derives the theme from the selected template. The protected compiler runs Rust/Typst and uploads directly to a short-lived signed R2 PUT URL. Next verifies the stored object before updating Neon. The browser downloads directly from a signed R2 URL.

| Template | Theme |
| --- | --- |
| MIT CAPD Classical | 2 |
| Modern Ivy LaTeX | 3 |
| Tech Specialist | 6 |
| Minimalist Executive | 5 |
| Contemporary Compact | 3 |
| Standard Academic | 2 |

user_job_resumes has one row per (user_id, job_id): Markdown, R2 object key, template, theme, draft/ready status, file size, creation/update/export timestamps. User/job foreign keys and an R2 prefix constraint prevent mismatched references. Application ownership is checked on every read/write. No version history is retained. Saving an edited draft marks it draft; exporting marks it ready.

New exports use unique staged keys under resumes/{userId}/{jobId}/. A database advisory lock serializes final replacement for that pair. After commit, the prior PDF is deleted. Compiler/upload/database failures preserve the previous ready record. If deletion fails, the UI reports cleanup pending; there is no durable cleanup retry queue.

## Deployment and capacity

Sources: services/pdf-compiler and services/job-hunt-profile. scripts/deploy-resume-services.py deploys to Cloud Run project job-scout-508222, us-east1. Environment settings are documented in .env.example. Compiler bearer authentication and profile body signatures protect service endpoints. R2 credentials stay in Next; the compiler receives only a signed upload URL.

Cloud Run distributes traffic and scales instances. Both services use concurrency 4, maximum 3 instances, minimum 0. This targets up to 12 in-flight requests per service; it does not establish a simultaneous-user guarantee. The compiler also limits each instance to four renders. Redis, Celery and Nginx are unnecessary for this synchronous deployment.

The isolated integration test verified four simultaneous exports across two users, replacement/failure recovery, and all six template downloads from real R2. Sequential exports measured approximately 1.1-1.4 seconds including compile/upload/database work, excluding browser download and cold starts. Larger load and cold-start latency need separate measurement before increasing limits.

## Verification

Run from App 4:

    rtk proxy node scripts/verify-storage-integration.mjs --cloud
    rtk proxy node scripts/verify-cloud-storage.mjs
    rtk proxy node scripts/verify-resume-code.mjs
    rtk proxy node scripts/verify-resume-browser.mjs

Storage tests require isolated Neon branch configuration in ignored scratch/dev-db.json. Disposable job/object fixtures are removed afterward. Production user records are not used for fixture writes. Browser tests mount the real modal and App CSS with fixture authentication; live signed-in jobs/profile restoration was checked separately without saving changes.

PDF layout checks cover preserved text, Letter dimensions and bounds for six samples. Long-document pagination was checked in earlier renderer verification. Preview and Typst wrapping can differ; arbitrary input is not guaranteed pixel-identical.
