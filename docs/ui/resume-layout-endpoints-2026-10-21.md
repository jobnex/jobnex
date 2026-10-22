# Resume upload and generation endpoints

## Server-side environment

| Variable | Value / purpose |
| --- | --- |
| `JOB_HUNT_SERVICE_URL` | `https://layout-v1---job-hunt-profile-znsph25yja-ue.a.run.app` |
| `JOB_HUNT_WEB_URL` | `https://layout-v1---job-hunt-web-znsph25yja-ue.a.run.app` |
| `JOB_HUNT_SERVICE_SECRET` | Existing private HMAC secret; server only |
| `DATABASE_URL` / `DIRECT_URL` | Existing private Neon database binding |
| `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET` | Existing authentication bindings; preserve values |
| `R2_ACCOUNT_ID`, `R2_JURISDICTION`, `R2_BUCKET_NAME`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | Existing private storage bindings; preserve values |

Do not expose these secrets through `NEXT_PUBLIC_*`. Do not send HMAC secrets or database/R2 credentials to the browser. `.env.example` contains variable names only. The versioned URLs are production GCP endpoints, not local services. Untagged legacy URLs intentionally retain their existing contract during the UI handoff.

## Browser-facing Next.js route

`POST /api/job-hunt/profile` belongs in the UI's Next.js server. It authenticates using the existing session; the browser does not supply an owner ID.

| Operation | JSON request | Response |
| --- | --- | --- |
| `preview` | `{ "operation":"preview", "objectKey":"resume_imports/<owned-user>/<id>.pdf", "fileName":"resume.pdf" }` | 200: accepted import ID, revision, parsed Markdown/details, original preview URL. 422: rejected layout, reason code/message/detail. |
| `confirm` | `{ "operation":"confirm", "importId":"<uuid>", "revision":1, "markdown":"<validated text>", "autofill":true }` | 200: active filename/object key after checked transaction. The compact UI sends this automatically only after acceptance. |
| `cancel` | `{ "operation":"cancel", "importId":"<uuid>" }` | 200 for an owned unconfirmed import; never removes the active resume. |

Other outcomes: 401 unauthenticated; 413 oversized JSON; 400 invalid/stale ownership/hash/revision or confirmation failure; 503 missing import schema. A 503 is an operator configuration problem, not a verdict that the selected PDF is unsupported.

Upload signing, original-file preview and deletion use existing Next.js Server Actions in `app/actions/storage.ts`, not independently guessed REST URLs. Resume PUT signing always targets the temporary `resume_imports/` prefix. Only the checked confirmation transaction activates the source. `deleteUserResume()` clears the active record/reference/details, with delayed file cleanup.

## Profile validation service

Base: `https://layout-v1---job-hunt-profile-znsph25yja-ue.a.run.app`.

| Method | Path | Contract |
| --- | --- | --- |
| GET | `/health` | `{"status":"ok","resumeLayoutContractVersion":1}` |
| POST | `/profile/resume-from-r2` | JSON `{objectKey,fileName,downloadUrl}`. Requires owned resume prefix and HTTPS R2 download URL. Validation only; never activates or overwrites the base. |
| POST | `/profile/resume` | Multipart `file`. Same PDF validator; validation only. |
| GET | `/profile` | Authenticated saved preferences/resume details. |
| PATCH | `/profile` | Existing authenticated preferences/details editing; active ownership and generation guards remain. |

R2 validation authentication headers: `x-user-id`, `x-timestamp` (Unix seconds), `x-signature`. Signature is HMAC-SHA256 of `userId + ':' + timestamp + ':' + SHA256(exact JSON bytes)`, using `JOB_HUNT_SERVICE_SECRET`. Timestamp tolerance is 60 seconds. GET/PATCH/multipart use the existing `userId + ':' + timestamp` signing convention. Use the included server wrapper rather than duplicating signing in a browser.

Validation returns `accepted`, `reasonCode`, `message`, `detail` when available, and `validatorVersion`. Accepted results additionally include `fileSha256`, `markdown`, `resume_details`, `preferences` and compiler payload. The service can return HTTP 200 with `accepted:false`; the Next.js route maps that to 422. Transport/authentication errors are distinct from format rejection.

Stable validator codes: `ACCEPTED`, `PDF_REQUIRED`, `FILE_TOO_LARGE`, `ENCRYPTED_PDF`, `NO_TEXT`, `UNREADABLE_PDF`, `UNREADABLE_TEXT`, `MULTIPLE_COLUMNS`, `SCATTERED_TEXT`, `OVERLAPPING_TEXT`, `IMAGE_LAYOUT`, `AMBIGUOUS_STRUCTURE`. Import transport failures record `VALIDATION_UNAVAILABLE` in the staging row.

Rejected-layout copy: “This layout isn't supported. Use one of our four templates or upload a standard single-column PDF.” Show the specific backend detail underneath. Preserve the current filename and active resume after rejection.

## Generation backend

Base: `https://layout-v1---job-hunt-web-znsph25yja-ue.a.run.app`. Existing Next.js actions forward the authenticated session server-side.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/resume/tailor/resumes/{resumeId}/preview?jobId={jobId}` | Owned resume/job preview and matching details |
| POST | `/api/resume/tailor/requests` | `{jobId,resumeId,idempotencyKey}`; 202 new queued request, 200 idempotent replay, 402 insufficient credits, 400 validation/input failure, 401 unauthenticated |
| GET | `/api/resume/tailor/requests/{requestId}` | Owned durable request status/draft/error/credit state |
| GET | `/api/resume/tailor/generated/{requestId}` | Owned saved generation |
| GET | `/api/resume/tailor/generated/{requestId}/pdf` | Owned generated PDF retrieval using the existing PDF service |

The backend rechecks the active source and validated import before holding credit. It stores `source_import_id` on the generation request; the new worker verifies that saved source hash before calling a model. Historical generated outputs remain available through existing ownership and publication checks.

## Private worker and PDF services

The worker URL/revision is in the deployment record. `/health`, `POST /internal/process` (`{requestId}`) and `POST /internal/recover` are operational endpoints protected by Cloud Run IAM. Cloud Tasks uses OIDC with the exact worker service URL as audience. Do not invoke these routes directly from the browser.

Existing PDF services remain unchanged: `https://resume-pdf-backend-znsph25yja-ue.a.run.app` and `https://resume-pdf-compiler-znsph25yja-ue.a.run.app`. Continue using the existing authenticated export route/actions in the delivered UI rather than exposing service tokens to the client.
