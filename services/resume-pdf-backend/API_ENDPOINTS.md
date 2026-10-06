# Resume PDF backend: endpoint and integration guide

Verified deployed URL: https://resume-pdf-backend-znsph25yja-ue.a.run.app

Deployment: GCP project job-scout-508222, region us-east1, service resume-pdf-backend. This URL is private: a browser visit without Google IAM authentication is expected to fail. Use both authentication headers described below. Local base URL is http://127.0.0.1:8080. See DEPLOYMENT.md for the release record and verification limits.

This service reads role-specific Markdown from Neon, converts it through Rust and Typst, stores immutable PDF bytes privately in R2, and downloads those exact bytes. It contains no UI, login screen, or AI generation service.

## Authentication and caller responsibilities

Call from your trusted server after verifying the user's login. Every job endpoint requires:

```http
Authorization: Bearer YOUR_BACKEND_SERVICE_TOKEN
X-User-Id: VERIFIED_NEON_AUTH_USER_UUID
Content-Type: application/json
```

Derive X-User-Id from the verified server-side session, not an arbitrary browser header or JSON field. Do not expose the service token to a browser. The API checks that the identity exists in neon_auth.user and has an application for the requested job. Another user's preview ID alone grants no access.

If Cloud Run IAM authentication is enabled, also send a Google identity token with this service URL as its audience:

```http
X-Serverless-Authorization: Bearer GOOGLE_ID_TOKEN
```

Cloud Run validates that header, leaving Authorization for the API's service token. Your caller's service account needs roles/run.invoker on this service. Google documents this dual-header pattern at https://docs.cloud.google.com/run/docs/authenticating/service-to-service. Through the optional external HTTPS load balancer, the deployment uses mandatory API service-token authentication and restricted Cloud Run ingress instead.

## IDs, templates, and storage

- USER_ID: UUID from neon_auth.user.id.
- JOB_ID: UUID from public.jobs.id, with a matching public.applications row owned by that user.
- PREVIEW_ID: UUID returned by POST /preview. Constructed by the backend; never accept a caller-provided R2 key.
- REVISION: opaque SHA-256 state token returned by GET /resume or POST /preview. Send it unchanged when saving/exporting. "absent" means no saved user/job row.

| template_id | theme | Layout |
| --- | --- | --- |
| mit-capd | 2 | Jake's Resume |
| standard-overleaf | 2 | Same theme, alternate application template ID |
| modern-ivy | 3 | Modern Clean |
| contemporary-compact | 3 | Same theme, alternate application template ID |
| minimalist-exec | 5 | Classic Executive |
| tech-specialist | 6 | Minimal Tech |

When supplying new Markdown, omitted template_id defaults to mit-capd. Theme is optional; if present, it must match template_id. To change only the saved resume's template, POST /preview with template_id and no markdown. Theme alone is not a template selection.

Generated Markdown lives in public.resume_generations.resume_markdown. Saved/edited job Markdown lives in public.user_job_resumes.markdown. They are separate records. The current saved PDF key is public.user_job_resumes.r2_object_key. Its private R2 location is resumes/{USER_ID}/{JOB_ID}/previews/{PREVIEW_ID}.pdf, with matching .json metadata. No endpoint writes AI generation history.

## Endpoint summary

BASE denotes the local URL or the verified deployed service URL. The prefix for job operations is BASE/api/v1/jobs/{JOB_ID}.

| Method | Full path | Purpose |
| --- | --- | --- |
| GET | /health | Process health and runtime identification |
| GET | /api/v1/jobs/{JOB_ID}/generated | Latest generated Markdown for this user/job |
| GET | /api/v1/jobs/{JOB_ID}/resume | Current saved Markdown, template, revision, and PDF URL |
| PUT | /api/v1/jobs/{JOB_ID}/resume | Save edited Markdown as a draft |
| POST | /api/v1/jobs/{JOB_ID}/preview | Convert Markdown into an immutable R2 PDF preview |
| POST | /api/v1/jobs/{JOB_ID}/export | Save the selected preview's exact Markdown/template/PDF association |
| GET | /api/v1/jobs/{JOB_ID}/pdf/{PREVIEW_ID} | Download a particular immutable preview PDF |
| GET | /api/v1/jobs/{JOB_ID}/pdf | Download the currently saved ready PDF |

## 1. Health

GET /health has no application-level service-token requirement. Private Cloud Run deployments still require IAM invocation for this request. It returns:

```json
{"status":"online","runtime":"rust","pdf_compiler":"typst","backend_only":true}
```

Startup validates the template and a real database connection. Health does not make a fresh R2 call on every probe and is not proof that all downstream operations succeed.

## 2. Read generated role Markdown

GET /api/v1/jobs/{JOB_ID}/generated needs no body. It returns the latest version whose status is completed, completed_with_estimates, or needs_review:

```json
{"generation":{"generation_id":"GENERATION_UUID","version":2,"markdown":"# Candidate\n\n## Summary\n- Relevant experience."}}
```

No eligible generation returns {"generation":null}. needs_review content remains explicitly reviewable; this conversion service does not validate AI claims or approve it. Pass generation.markdown into POST /preview. This endpoint does not save/export it automatically.

## 3. Read the saved job resume

GET /api/v1/jobs/{JOB_ID}/resume returns:

```json
{"resume":{"markdown":"# Candidate","template_id":"modern-ivy","theme":3,"status":"ready","r2_object_key":"resumes/USER_UUID/JOB_UUID/previews/PREVIEW_UUID.pdf"},"revision":"OPAQUE_REVISION","pdf_url":"/api/v1/jobs/JOB_UUID/pdf/PREVIEW_UUID"}
```

A missing saved row returns {"resume":null,"revision":"absent","pdf_url":null}. Drafts have no current PDF association. Older PDFs created by another compiler may have different key shapes; the API only constructs preview URLs for keys in its own UUID-based format. Keep legacy downloads through their existing server-side R2 signer until migrated.

## 4. Save a draft

PUT /api/v1/jobs/{JOB_ID}/resume:

```json
{"markdown":"# Candidate\n\n## Skills\n- Rust","template_id":"modern-ivy","theme":3,"expected_revision":"OPAQUE_REVISION_FROM_GET"}
```

Success returns {"success":true,"revision":"NEW_REVISION"}. For the first save, expected_revision is "absent". The API marks the row draft and clears its PDF association, because an old PDF must not be mistaken for new Markdown. Existing immutable preview objects are retained and are not overwritten. Recompile before exporting edited content.

## 5. Generate a preview PDF

POST /api/v1/jobs/{JOB_ID}/preview accepts unsaved/edited Markdown:

```json
{"markdown":"# Candidate\n\n## Skills\n- Rust","template_id":"modern-ivy","theme":3}
```

Or use the saved Markdown/template:

```json
{}
```

Or use saved Markdown with another template:

```json
{"template_id":"tech-specialist"}
```

Without supplied Markdown and without a saved row, the API returns 404. Generated history is fetched through /generated and passed explicitly; it is not silently substituted for saved edits.

Response fields:

| Field | Meaning |
| --- | --- |
| success | true after compile and both R2 uploads succeed |
| preview_id | Immutable preview identifier |
| pdf_url | Relative authenticated PDF download route |
| pdf_base64 | PDF bytes encoded as Base64 for an existing viewer integration |
| pdf_sha256 | SHA-256 of the exact PDF bytes |
| markdown_sha256 | SHA-256 of the Markdown used for compilation |
| template_id / theme | Resolved template and theme |
| revision | Saved document state observed before compilation |
| source_map | Markdown block IDs, types, UTF-16 start/end offsets, raw Markdown, and PDF positions |
| json_data.blocks | Same parsed block metadata |
| warnings | Fallback/rendering notes |
| typst_code | Generated source for authorized diagnostics |
| stdout / stderr | Compiler outputs; treat as diagnostic data |

source_map.positions.start/end contain page and x/y/width values in points. Consumers scale these into display coordinates. A block may span pages. For editing, replace the block's UTF-16 range in the client-held Markdown, then call /preview again. This backend does not render HTML editing controls.

Preview does not change the Neon saved row. It uploads the PDF and private metadata to shared R2 so another instance can serve/download/export it. New edits or template changes produce a new preview ID. Ignore a stale response if a newer request has already been sent.

## 6. Export exactly the selected preview

POST /api/v1/jobs/{JOB_ID}/export:

```json
{"preview_id":"PREVIEW_UUID_FROM_PREVIEW","expected_revision":"REVISION_FROM_PREVIEW"}
```

Do not include new Markdown or a new template in this request. Export loads the selected preview's metadata, checks the PDF hash, and saves its exact Markdown/template/PDF key into Neon. It does not compile again. Success returns success, preview_id, pdf_sha256, revision, and pdf_url. The saved row becomes ready and records file_size/exported_at.

Replaying an already committed identical export succeeds without overwriting anything. If another edit/export changed the row, a stale request returns 409. Reload and reconcile rather than changing expected_revision blindly. Separate user/job pairs have separate transaction locks; only competing writes to the same pair serialize.

## 7. Download locally

GET /api/v1/jobs/{JOB_ID}/pdf/{PREVIEW_ID} downloads that exact preview. GET /api/v1/jobs/{JOB_ID}/pdf downloads the saved ready PDF. The latter returns 404 for a draft, a missing row, or an unsupported legacy key format.

Response uses application/pdf, Content-Disposition: attachment; filename="resume.pdf", and Cache-Control: no-store. Bytes are checked against the stored size/hash. Your trusted server can proxy the PDF to its signed-in client, preserving Content-Type and Content-Disposition. Alternatively, its existing private R2 signer can issue a short-lived URL for a verified saved key. Never make the bucket public.

Example curl call from a trusted machine, with secrets supplied through environment variables:

```sh
curl --fail-with-body "$BASE/api/v1/jobs/$JOB_ID/pdf/$PREVIEW_ID" \
  -H "Authorization: Bearer $BACKEND_SERVICE_TOKEN" \
  -H "X-User-Id: $USER_ID" \
  -H "X-Serverless-Authorization: Bearer $GOOGLE_ID_TOKEN" \
  --output resume.pdf
```

For a local test or load-balancer mode without Cloud Run IAM invocation, omit X-Serverless-Authorization. Never hardcode a secret in source code or publish it in an example.

## Recommended server integration sequence

1. Verify user session; obtain its Neon Auth UUID.
2. GET /resume. If no saved Markdown exists, GET /generated and explicitly choose its Markdown.
3. POST /preview with the desired Markdown/template. Keep preview_id, revision, and pdf_sha256 together.
4. Forward preview bytes/source mappings to the existing client. On edits, submit changed Markdown again.
5. POST /export for the currently selected preview and revision.
6. GET its pdf_url and forward the exact bytes as a download.

If the existing application still calls /api/v1/ui-export with parsed resume/uploadUrl, adapt that server-side caller to this sequence. That older payload is not accepted by this backend. No UI change is necessary to call the API, but caller integration must be completed before switching production traffic.

## Errors and retry rules

Every application error returns {"error":"MESSAGE","request_id":"UUID"}. X-Request-Id is also present. Cloud Run IAM/proxy failures can return a platform response before the application runs.

| Status | Meaning | Action |
| --- | --- | --- |
| 400 | Invalid UUID, JSON, unsupported template, theme mismatch, or unknown input field | Correct the request |
| 401 | Missing/wrong service token or missing user identity | Fix server authentication |
| 403 | Cloud Run IAM denied invocation | Grant the caller run.invoker and send a valid Google identity token |
| 404 | No application, no source/saved PDF, foreign or expired/removed preview | Verify user/job/preview IDs |
| 405 | Unsupported method or suffix | Use the documented route |
| 409 | Saved state changed | Reload and reconcile |
| 413 | JSON request exceeds 256000 bytes | Reduce payload |
| 422 | Compilation failed/timed out or PDF limit exceeded | Inspect input/rendering; simplify it |
| 428 | Missing expected_revision | Fetch and supply the current revision |
| 429 | All compiler slots busy | Honor Retry-After; retry with jitter |
| 502 | Stored PDF fails integrity check | Regenerate; investigate storage changes |
| 503 | Storage/database temporarily unavailable | Honor Retry-After and use bounded retries |

The body limit is 256000 bytes and Markdown limit is 200000 UTF-8 bytes. Generated PDF limit is 16000000 bytes. Compiler timeout defaults to 45 seconds. Cloud Run request timeout is 180 seconds in the supplied configuration. Do not retry permanent 4xx failures. A preview retry may create another immutable object; do not retry indefinitely. Export retries use the same preview_id/revision.

## Operations and privacy

Private R2 stores Markdown in the matching preview metadata as well as Neon storing the authoritative saved text. Restrict bucket credentials and retention accordingly. Do not expire all previews indiscriminately: saved exports reference the same PDF and need matching metadata for hash-verified downloads. Retain objects until a safe, reference-aware cleanup policy is implemented. Logs omit Markdown, service credentials and download URLs.

With only four database connections per instance, use a Neon pooled endpoint with transaction-scoped timeouts. During rollouts, multiple revisions may temporarily exceed a single revision's instance cap. Fonts affect layout; provide licensed Arial/Times New Roman or approve the documented Linux fallbacks. Cloud preview and download always use identical bytes even when a fallback font changes Windows pagination.
# Current integration note (2026-10-05)

Public Jobnex now proxies optional PDF export through authenticated POST/GET `/api/resume/tailor/generated/{requestId}/pdf`; the browser never receives compiler tokens. The proxy checks the owning completed, consumed-credit generation and derives job ID from the database. The private backend additionally permits user/job access for an owned successful generation joined to its completed/consumed request, as well as the older application-based path. Historical examples requiring an application are not the only eligibility path now. Storage remains `neondb`; generated Markdown and saved/exported Markdown are separate records. See root `testdb_rev.md` for the current release and incomplete acceptance gates.

