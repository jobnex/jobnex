# Rust resume PDF backend

## Current Jobnex integration (2026-10-05)

Revision `resume-pdf-backend-00003-rir` is deployed; public web revision `job-hunt-web-00013-teh` now has an authenticated bridge at `/api/resume/tailor/generated/{requestId}/pdf`. Both use original `neondb`. In addition to an owned application, an owned successful generation joined to its completed, consumed-credit request now grants user/job eligibility. This permits optional export before applying without inserting a fictional application. The exact generated-request bridge remains stricter than general saved-resume access: it always requires the owning completed generation. See root `testdb_rev.md` for build digests, checks, rollback and pending live acceptance evidence. PDF export is optional; generated Markdown remains the primary artifact.

Backend-only cloud adaptation of the fixed Rust Resume Studio renderer. The running Windows app is preserved. This directory contains no UI and no AI agents. The reviewed service is deployed privately in GCP; see API_ENDPOINTS.md for usage and DEPLOYMENT.md for the release record. No production application or resume records were created by the deployment.

## Architecture

The deployed entry point uses Cloud Run's managed HTTPS routing, load distribution and autoscaling with private IAM invocation. Each instance runs one Rust API and a local Typst compiler. Neon holds user/job Markdown and the current PDF object key. Private Cloudflare R2 holds immutable PDF previews and their metadata. Every instance reads the same objects, so downloads survive restarts and do not need sticky sessions or Redis.

Redis is a cache/store, Celery is a Python task queue, and Nginx is a reverse proxy. None is required here. Terraform supplies an optional custom-domain external HTTPS Application Load Balancer with a serverless NEG. That optional infrastructure has not been applied; it requires a domain and additional cost. The current private run.app endpoint uses Cloud Run directly.

Defaults are provisional, not benchmark claims: 2 CPU, 2 GiB RAM, 8 simultaneous requests per instance, 2 simultaneous compiler processes, 4 maximum instances, and 0 minimum instances. Compiler admission returns HTTP 429 with Retry-After instead of creating an unbounded compilation queue. Database pools have 4 connections per instance, giving 16 configured connections across four instances of one revision. Rollouts and multiple revisions can temporarily increase this total. Requests use bounded bodies, database timeouts, R2 HTTP timeouts, and a 45-second combined compile/query deadline. Tune after representative load tests. Cold starts may delay the first request; set minimum instances to 1 if necessary.

## Identity and trust boundary

This is a service-to-service API for your existing authenticated job backend. It does not implement browser login. The caller must verify its user's session, then send:

```http
Authorization: Bearer <BACKEND_SERVICE_TOKEN>
X-User-Id: <verified Neon Auth user UUID>
```

Never expose BACKEND_SERVICE_TOKEN to a browser. Never forward a user-supplied X-User-Id without replacing it with the verified session identity. The service token is checked in constant time. The API confirms an existing neon_auth.user identity and either an owned public.applications row or an owned successful generation joined to its completed, consumed-credit request for every user/job operation. All database reads and writes are scoped by both identifiers. R2 keys are constructed from parsed UUIDs, not accepted from request bodies.

The Terraform load balancer terminates HTTPS. Cloud Run ingress is internal-and-load-balancing, blocking direct public run.app traffic. Cloud Run invocation IAM grants allUsers because this external load balancer does not mint an invocation ID token. Application-level service authentication remains required for every API route except /health. If your organization forbids allUsers bindings, use private Cloud Run IAM invocation from the trusted backend instead and remove the external load balancer resources, or design an IAP-aware integration. Do not make identity headers trusted merely because a request passed through a load balancer.

## Existing Neon mapping

Target verified schema: trail_dev project broad-base-06154424, production branch br-plain-morning-ayf71kf3, database neondb. The deployed service uses the existing job-hunt-profile-database-url secret, pinned to version 1. The service does not run CREATE TABLE, ALTER TABLE, or migrations.

- neon_auth.user.id: UUID identity.
- public.applications: access eligibility through user_id/job_id.
- public.resume_generations: generated Markdown at resume_markdown, scoped by user_id as text and job_id. GET /generated reads the latest completed, completed_with_estimates, or needs_review version.
- public.user_job_resumes: one saved row per user_id/job_id. Contains markdown, template_id, theme, status, file_size, exported_at, and r2_object_key.
- R2 PDF key: resumes/{user_id}/{job_id}/previews/{preview_id}.pdf.
- R2 private metadata key: same prefix and preview_id with .json. Contains the Markdown/template required to export precisely the selected preview.

The generated-history and saved-job tables remain distinct. Export updates the current user_job_resumes row; it does not invent a new AI generation-history entry. Template IDs match the existing job application: mit-capd and standard-overleaf map to theme 2; modern-ivy and contemporary-compact to 3; minimalist-exec to 5; tech-specialist to 6.

## API contract

All job routes start with /api/v1/jobs/{job_uuid}. Responses are JSON except PDF downloads. Input JSON rejects unknown fields. Markdown is limited to 200000 UTF-8 bytes; the entire request is limited to 256000 bytes.

| Method and suffix | Behavior |
| --- | --- |
| GET /resume | Returns saved resume and its revision. A missing row returns resume:null and revision:"absent". |
| GET /generated | Returns latest successful/reviewable generated Markdown for this user/job, or generation:null. |
| PUT /resume | Saves a draft from markdown, template_id, optional matching theme, and expected_revision. Clears the current PDF association. |
| POST /preview | Compiles supplied markdown/template_id, or the saved resume if markdown is omitted. Uploads immutable PDF/metadata to R2 without saving a Neon row. |
| GET /pdf/{preview_uuid} | Checks ownership, retrieves stored bytes, validates SHA-256, and downloads the exact preview PDF. |
| GET /pdf | Downloads the saved ready resume's PDF with the same ownership and integrity checks. Legacy object keys require a new preview/export. |
| POST /export | Accepts preview_id and expected_revision only. Reuses that preview's existing PDF, checks integrity, and atomically saves its Markdown/template/PDF key to Neon. No recompilation. |
| GET /health | Reports process health; does not query R2 or test every dependency on each probe. Startup requires the Neon pool and local template. |

Example preview request from the trusted backend:

```json
{"markdown":"# Candidate\n\n## Skills\n- Rust","template_id":"modern-ivy","theme":3}
```

Preview returns existing renderer fields (pdf_base64, pdf_sha256, markdown_sha256, source_map, warnings, typst_code, stdout, stderr) plus preview_id, pdf_url, template_id, and the saved document revision observed before compilation. Source mappings use UTF-16 offsets for client editing compatibility. This backend does not serve an editor.

To export that exact preview:

```json
{"preview_id":"UUID_FROM_PREVIEW","expected_revision":"REVISION_FROM_PREVIEW"}
```

Save/export use a per-user/job PostgreSQL advisory transaction lock and compare the expected revision inside the lock. Revision incorporates Markdown, template, theme, status, and PDF key. An identical export retry succeeds without overwriting a newer, different saved resume. A stale save returns 409; reload rather than retrying it blindly. A missing expected revision returns 428. Storage failures return 503, denied/missing applications or foreign previews return 404, invalid input returns 400, and failed/timed-out compilation returns 422. Public errors omit credentials and raw storage diagnostics. Structured logs contain only request ID, status, and elapsed time.

Exports are immutable at the object layer. An interrupted upload can leave an orphan object; it never points Neon to an incomplete preview. Do not apply a blanket R2 expiration rule to previews/: committed exports use those same keys. Initially retain objects. Later, implement a scheduled mark-and-sweep job that excludes every key referenced by user_job_resumes and retains its matching .json metadata. Old previews remain downloadable to their owner until explicitly removed.

## Configuration reference

1. GCP project ID, region, Artifact Registry repository, API domain, DNS control, deployment principal, and monthly cost limit.
2. DATABASE_URL for the intended Neon branch/database, with TLS enabled. Prefer the Neon pooled endpoint. Use an application database role with only needed SELECT/INSERT/UPDATE privileges, not an administrator account.
3. R2 account S3 endpoint, private bucket, and bucket-scoped read/write credentials. No public bucket is required.
4. A new random BACKEND_SERVICE_TOKEN of at least 32 characters, shared only with the trusted calling backend.
5. Existing caller's identity/session method and the exact Neon Auth UUID it supplies.
6. Secret Manager names and pinned versions for the four secrets. Terraform takes secret references, not secret values.
7. Licensed Arial and Times New Roman font files if matching Windows page wrapping exactly is required. Otherwise approve Liberation fallback typography. Fonts are excluded from Git by default.
8. Retention requirements and expected simultaneous conversions to tune autoscaling and admission limits.

env.example and terraform/terraform.tfvars.example show names without real credentials. The program reads environment variables; it does not automatically load .env files.

## Build and deployment preparation

The Dockerfile builds the production Rust crate without test adapters, bundles Typst 0.15.1, installs TLS roots, includes fallback fonts, and runs as a non-root user. No Python or Node runtime is in the container. Windows executables are not copied into Linux images.

```sh
cargo test --locked
cargo build --release --locked
docker build -t REGION-docker.pkg.dev/PROJECT/REPOSITORY/resume-pdf:RELEASE .
# Later, after review/authorization:
docker push REGION-docker.pkg.dev/PROJECT/REPOSITORY/resume-pdf:RELEASE
cd terraform
terraform init
terraform validate
terraform plan -var-file=YOUR_PRIVATE_CONFIG.tfvars
# Review the plan before terraform apply.
```

Create the Artifact Registry repository and provision secret versions separately before applying infrastructure. Terraform enables APIs, creates the backend service account and its secret access, Cloud Run, serverless NEG, managed certificate, external managed HTTPS load balancer, and reserved IP. Point the API domain's A record to load_balancer_ip. Certificate provisioning requires correct DNS. Private resumes are never cached by Cloud CDN; backend responses use no-store.

The private Cloud Run service has been deployed. Real Neon schema access and an R2 upload/read/delete round trip passed. All four live preview/export/download checks passed in an isolated Neon verification branch, using the production Linux image and real R2. Production has no applications yet, so production verification covers storage, health, IAM, service authentication and ownership denial. Sustained load testing and the existing caller's API adaptation remain separate work. The older job backend's /api/v1/ui-export payload/uploadUrl contract differs from this API: adapt its server-side caller to the documented preview/export contract. No UI changes are required, but the old caller cannot be pointed at this service unchanged.

## Files and checks

- src/main.rs: backend routes, service authentication, UUID ownership paths, revisions, admission limits, immutable previews and export.
- src/store.rs: TLS Neon connection pool, ownership queries, transaction guards, and S3-compatible R2 adapter. Feature local-test adds filesystem adapters only for controlled tests; never enable it in a deployment build.
- src/render.rs and resume.typ: copied from the current fixed renderer; the cloud copy adds bounded compiler execution. All four layouts and spacing fixes are retained.
- Cargo.toml/Cargo.lock: Rust dependencies and locked resolution.
- Dockerfile/.dockerignore: Linux production build and restricted build context.
- terraform/: managed GCP routing and service configuration.
- tests/smoke.mjs: runs test-only adapters with real Typst, two instances and a restart; checks authentication, ownership, conflicts, four themes, exact download identity, and deliberate corruption rejection.
- verify-build.ps1, verify-api.ps1, verify-config.mjs: acceptance commands.
- GATES.md: verification ledger.
- API_ENDPOINTS.md: full request/response, authentication, error, retry and integration guide.
- DEPLOYMENT.md: actual cloud settings, secret references, invocation steps, verification evidence and remaining integration work.
- RELEASE-GATES.md: review, GitHub publication and GCP deployment status.
- verify-release.ps1 and verify-docs.mjs: aggregate release checks and endpoint-guide checks.

The production executable also supports --check-storage. This operator-only command verifies configured schema access and a small R2 round trip, then exits. It creates and deletes only its own random _backend_checks/ object. It is not an HTTP endpoint. Its JSON output can contain an existing user/job identity; keep that output private. R2 cleanup uses the SDK's POST bulk-delete method with one key to avoid the SDK's empty DELETE signing issue.

Windows test scripts expect the existing app's typst.exe. Set TYPST_BIN appropriately on another machine. Node is a development test tool only. Mock storage tests exercise API semantics and cross-instance persistence; they do not prove real Neon/R2 connectivity. No production database records are modified by these tests.
