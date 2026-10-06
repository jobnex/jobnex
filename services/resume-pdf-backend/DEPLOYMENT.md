# Rust resume backend deployment record

## Update: 2026-10-05 public Jobnex bridge

The historical October 1 record below is preserved. Current PDF revision is `resume-pdf-backend-00003-rir`, receiving 100% traffic; image digest `sha256:d95e3027260990070988b3704900077c89e4103163f470ca2f564d46ac0a05d1`. Current web revision `job-hunt-web-00013-teh` invokes it privately. Cloud Build `a1a8cf91-b2fd-409c-af65-8d63814c7a09` passed the production builds and seven Rust tests. Existing IAM and database secret are preserved; no schema migration was made. Eligibility now also accepts an owned successful generation with a completed, consumed-credit request. Full authenticated browser generation/export remains pending the demo login confirmation; see root `testdb_rev.md`, not the old isolated PDF test, for that acceptance status.

Release date: October 1, 2026, America/New_York (October 2 UTC).

## Actual deployment

| Item | Value |
| --- | --- |
| API base URL | https://resume-pdf-backend-znsph25yja-ue.a.run.app |
| GCP project / region | job-scout-508222 / us-east1 |
| Cloud Run service | resume-pdf-backend |
| Verified production revision | resume-pdf-backend-00002-gq7 |
| Runtime | Rust backend 0.3.0 and Typst 0.15.1, Linux, non-root |
| Runtime service account | resume-pdf-backend@job-scout-508222.iam.gserviceaccount.com |
| Image | us-east1-docker.pkg.dev/job-scout-508222/job-hunt/resume-pdf-backend@sha256:d998d52ec276505b3fc00397f4b2ac356b6a152ca76b9e196aaeca87ae1cd9db |
| Cloud Build ID | 8bb4fa1a-81f3-4e59-abf3-7c84fb0934c2 |
| Repository location | jobnex/jobnex, services/resume-pdf-backend |
| Release branch | codex/rust-resume-backend |
| Compute | 2 CPUs, 2 GiB, concurrency 8, 0 minimum / 4 maximum instances |
| Compiler admission | 2 processes per instance, 45-second deadline |
| Request timeout | 180 seconds |
| Startup health probe | /health, every 5 seconds, 3-second probe timeout, 12 failures |

The managed run.app URL provides HTTPS routing and traffic distribution across autoscaled instances. No Redis, Celery, Nginx, custom domain, DNS update, or separately billed external load balancer is part of this deployment. The optional Terraform external load balancer definition is prepared but unapplied.

## Secrets and identity

Only Secret Manager references are published. Real values are absent from this repository.

| Environment variable | Secret / pinned version |
| --- | --- |
| DATABASE_URL | job-hunt-profile-database-url / 1 |
| R2_ACCESS_KEY_ID | resume-pdf-backend-r2-access-key / 1 |
| R2_SECRET_ACCESS_KEY | resume-pdf-backend-r2-secret-key / 1 |
| BACKEND_SERVICE_TOKEN | resume-pdf-backend-service-token / 1 |

R2 endpoint and private bucket are supplied as deployment configuration. The runtime service account can read these four secrets. The trusted job-hunt-web-runtime service account has Cloud Run invocation permission and access to the new service-token secret. The deploying account also has invocation permission for operator checks. No allUsers invocation binding is installed on this service.

Cloud Run ingress accepts requests reaching its HTTPS endpoint, but IAM requires an authorized Google identity. Job routes additionally require the service token and verified Neon Auth user UUID. Neither layer replaces the other.

The database credentials reuse the existing app connection. A dedicated minimally privileged database role is recommended before expanding access to other callers. The runtime requires SELECT on neon_auth.user, applications and resume_generations, plus SELECT/INSERT/UPDATE on user_job_resumes. It does not require schema migration permissions.

## Operator health check

From an authenticated gcloud session with run.invoker permission:

```sh
BASE=https://resume-pdf-backend-znsph25yja-ue.a.run.app
GOOGLE_ID_TOKEN=$(gcloud auth print-identity-token)
curl --fail "$BASE/health" \
  -H "X-Serverless-Authorization: Bearer $GOOGLE_ID_TOKEN"
```

Health only needs the Google token at this private entry point. Job endpoints also need the API token:

```sh
BACKEND_SERVICE_TOKEN=$(gcloud secrets versions access 1 \
  --secret=resume-pdf-backend-service-token --project=job-scout-508222)
curl --fail "$BASE/api/v1/jobs/$JOB_ID/resume" \
  -H "X-Serverless-Authorization: Bearer $GOOGLE_ID_TOKEN" \
  -H "Authorization: Bearer $BACKEND_SERVICE_TOKEN" \
  -H "X-User-Id: $VERIFIED_USER_ID"
```

Use a real job application owned by the verified user. A missing application returns 404 even if the user and job individually exist. Keep both tokens out of logs and browser code. These examples use shell variables; PowerShell users should use its equivalent variable syntax.

For a production Cloud Run caller, obtain a Google identity token from the platform metadata service or an official Google authentication library. Its audience must be the API base URL. Send it in X-Serverless-Authorization so Authorization remains available for the backend service token. Read and cache the service token through Secret Manager; refresh it deliberately when rotating versions.

## Verification evidence

- Windows release tests and API tests passed, including restart/shared-storage checks, stale revisions, ownership denial and corrupt-PDF rejection.
- Cloud Build successfully ran all Rust tests and built the production Linux image without the local-test feature.
- Real Neon schema access and R2 upload/read/delete checks passed.
- An isolated copy of production, rust-pdf-backend-verification-20261001 (br-sparkling-resonance-ayl8fma7), held a test application and synthetic Markdown. No production application or saved resume was created.
- The actual Cloud Run Linux service compiled all four templates, uploaded them to real R2, downloaded identical bytes, committed the same PDFs to the isolated database, and accepted identical export retries.
- IAM blocked unauthenticated requests; application authentication rejected a missing service token; ownership checks rejected a nonexistent user/application.
- Final production revision resume-pdf-backend-00002-gq7 passed health, storage, IAM, API-token and ownership-denial checks after switching from the isolated branch to the production secret.

Verified PDF SHA-256 values for the synthetic test:

| Template | SHA-256 |
| --- | --- |
| mit-capd | 9910f93f3ff67204e2c1a1e46d4aef5a08f657fa231bcbf23b2b06718b1edf5f |
| modern-ivy | b91c3388e4c67b429fd582fefd4039d333207c316af925c49bcc17324571b711 |
| minimalist-exec | f38884ccbe5b10875d23583fac8cc29deb318c97bb7fe65e275a773ea9c3ee64 |
| tech-specialist | 139ab583ac9bdbdd5e36cb55cb75ce252d9f9d87e8b2c0a3cffe7dfe738483e0 |

The verification branch remains available for QA and suspends after five idle minutes. Its synthetic exports remain in private R2. It is not the deployed production database. Production currently has no application rows, so a positive production-user export requires creating a genuine application through the existing app.

## Integrating the existing backend

The new service is deployed separately from resume-pdf-compiler, job-hunt-profile and job-hunt-web. Their application code and existing endpoint contracts were not replaced.

To adopt this API, the trusted existing backend must validate the signed-in session, forward its UUID, fetch generated Markdown when needed, call preview, call export with the preview ID and revision, and proxy authenticated PDF bytes to the browser. API_ENDPOINTS.md gives the full sequence and request/response contract. The earlier compiler's uploadUrl payload cannot be sent unchanged to this new API.

## Redeployment and rollback

Build from services/resume-pdf-backend, with a new release tag. Use Cloud Build or Docker to run the Dockerfile; it runs Rust tests before producing the image. Resolve and deploy the immutable image digest with the same private IAM, service account, pinned secrets and resource limits. Do not enable local-test in a production build. Verify health, both authentication layers, storage and the PDF flow after updating.

The first revision was an isolated verification deployment. Do not roll back production traffic to that revision: it uses the verification database. A production rollback should redeploy a previously verified image with the production database secret, or select a known production revision.

The Terraform directory describes an alternative custom-domain load balancer deployment. Do not apply it directly over the manually deployed resources. Import/adopt the existing service and service account, reconcile IAM and ingress, supply the intended domain, and review a plan before switching architectures.

## Operational limits

Autoscaling defaults are caps rather than load-test results. Sustained load testing remains to be done. R2 preview objects have no automatic expiry; committed exports reference the same objects, so blanket deletion would break downloads. Linux uses Liberation fallback fonts; exact Windows font wrapping requires licensed matching font files and a new verified image. Preview and download within this deployment always use the same PDF bytes.
