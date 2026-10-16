# Clone on another device: resume services and preference confirmation

Updated October 1, 2026. Backend release: `00bf9cb`; confirmation release: `f96ca5c`.

## 1. What is already done

- R2-backed PDF/DOCX resume extraction and Neon profile persistence.
- Authenticated application creation/listing/status updates.
- Latest resume draft and generated PDF per user/job; no version history.
- Rust/Typst PDF generation using six templates and four themes; direct upload/download through R2.
- Confirmation contract: automated updates set `isConfirmed=false`, preserve `confirmedAt` and the baseline, and initialize a missing baseline from pre-update values.
- Explicit **Confirm Changes** action stores a new baseline and server timestamp. Manage UI shows pending/confirmed state and detects edits. Extracted cities are capped at three.
- Profile and compiler services deployed to Cloud Run; concurrency 4, maximum 3 instances per service. Four concurrent exports were tested, not a maximum-user guarantee.

Important clone limitation: Manage Job Hunt confirmation and profile-loading integration are published. Other local frontend changes are not: application-page wiring, job-card Prepare Resume controls, updated PDF modal/preview, and client store changes. A fresh clone has the backend endpoints, but its existing application/PDF UI does not contain all the new wiring. Use the API examples below or port the remaining frontend integration separately.

## 2. Clone and install

Install Git and Node.js 24 with npm. Node 24 is the runtime used for verification. You do not need Rust, Python, Typst, Docker, gcloud, or RTK merely to run the frontend against existing deployed services.

Commands below use ordinary tools so they work without RTK:

```sh
git clone https://github.com/jobnex/jobnex.git
cd jobnex
git switch main
npm ci
```

The cloned repository root is the app root. Do not look for this machine's `incoming-my-app-4/my-app` path inside the clone.

Create private configuration:

```powershell
# Windows PowerShell
Copy-Item .env.example .env.local
```

```sh
# macOS/Linux
cp .env.example .env.local
```

Fill `.env.local` from the existing project's private configuration or secret manager. GitHub does not contain these values. Do not reuse the development fallback auth secret from source.

```dotenv
DATABASE_URL=<NEON_POOLED_CONNECTION_STRING>
DIRECT_URL=<NEON_DIRECT_CONNECTION_STRING_IF_NEEDED>
NEON_AUTH_BASE_URL=<MATCHING_NEON_AUTH_PROJECT_URL>
NEON_AUTH_COOKIE_SECRET=<PRIVATE_APP_COOKIE_SECRET>
R2_ACCOUNT_ID=<EXISTING_ACCOUNT_ID>
R2_ACCESS_KEY_ID=<PRIVATE_R2_ACCESS_KEY>
R2_SECRET_ACCESS_KEY=<PRIVATE_R2_SECRET>
R2_BUCKET_NAME=<EXISTING_BUCKET_NAME>
R2_JURISDICTION=us
RESUME_COMPILER_URL=https://resume-pdf-compiler-znsph25yja-ue.a.run.app
RESUME_COMPILER_SECRET=<EXISTING_COMPILER_BEARER_SECRET>
JOB_HUNT_SERVICE_URL=https://job-hunt-profile-znsph25yja-ue.a.run.app
JOB_HUNT_SERVICE_SECRET=<EXISTING_PROFILE_HMAC_SECRET>
```

The compiler bearer secret is managed in GCP as `resume-pdf-compiler-secret`; its value must match the running service. Profile HMAC secret must match the deployed profile service. Do not generate replacement service secrets just to configure another device.

Use a DB and auth project that belong together. The deployed profile service writes to its configured database. Pointing Next to a different Neon branch while calling that production service would split reads and writes; a development branch needs a matching profile deployment or local service configured for that branch.

The existing production `user_job_resumes` table is already created. Cloning does not require recreating it. On a completely new database, establish the existing application schema/auth/jobs first, then apply `migrations/latest-job-resumes.sql`. That file is not a full database bootstrap. Confirmation needs no new columns or blanket backfill.

Start:

```sh
npm run dev -- --hostname 127.0.0.1
```

Open `http://127.0.0.1:3000`, sign in, and open `/job-hunt/manage`. The new device requires a fresh login; browser sessions do not come from Git. Restart Next after changing environment variables.

For browser uploads, R2 CORS must allow the actual frontend origin and PUT with Content-Type. Existing configuration was verified for `http://127.0.0.1:3000` and `http://localhost:3000`. Different ports/hosts require matching R2 CORS and auth origin/callback configuration.

## 3. App endpoints

All endpoints below require the app's signed-in session. JSON bodies do not include user ID; the server derives it. Unknown/cross-user applications are rejected.

| Method | Endpoint | Body / purpose |
| --- | --- | --- |
| GET | `/api/jobs?limit=24` | Existing job discovery; response includes `jobs` |
| GET | `/api/job-hunt/applications` | Current user's applications; `{jobs:[...]}` |
| POST | `/api/job-hunt/applications` | `{jobId}`; create an app record for a published job |
| PATCH | `/api/job-hunt/applications` | `{jobId,status}`; status `applied`, `interview`, `offer`, or `withdrawn` |
| POST | `/api/job-hunt/profile` | `{objectKey,fileName}`; extract from already uploaded/committed active R2 file |
| GET | `/api/resume/job?jobId=UUID` | Read latest draft/ready resume or user's base Markdown |
| POST | `/api/resume/job` | `{jobId,markdown,templateId}`; save draft; returns `{success:true}` |
| POST | `/api/resume/export` | Same body; compile/store latest PDF; returns `{downloadUrl,cleanupPending}` |

Creating an app record does not submit to an employer, perform AI tailoring, or charge credits. A job must be published for creation, and in your application list before resume read/save/export.

### End-to-end browser API example

Run from a signed-in app page's browser console or adapt into a client component. Replace the UUID with a published job ID from job discovery. This creates an application/draft/PDF for your account.

```js
async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

const jobId = "REPLACE_WITH_PUBLISHED_JOB_UUID";
await api("/api/job-hunt/applications", {
  method: "POST", body: JSON.stringify({ jobId }),
});
const resume = await api(`/api/resume/job?jobId=${encodeURIComponent(jobId)}`);
const markdown = resume.markdown; // Supply actual Markdown if empty.
const templateId = "modern-ivy";
await api("/api/resume/job", {
  method: "POST", body: JSON.stringify({ jobId, markdown, templateId }),
});
const pdf = await api("/api/resume/export", {
  method: "POST", body: JSON.stringify({ jobId, markdown, templateId }),
});
const link = document.createElement("a");
link.href = pdf.downloadUrl;
link.click();
if (pdf.cleanupPending) console.warn("Previous PDF cleanup failed");
```

Export returns JSON, not PDF bytes. Download URLs expire after 15 minutes. Retrieve the ready job resume again for a fresh URL. Saving a new draft marks it `draft` and does not offer the retained old PDF as its current download.

Markdown limit: 200,000 characters; export JSON body limit: 256,000 bytes. Template IDs:

| Template ID | Theme |
| --- | --- |
| `mit-capd` | 2 |
| `modern-ivy` | 3 |
| `tech-specialist` | 6 |
| `minimalist-exec` | 5 |
| `contemporary-compact` | 3 |
| `standard-overleaf` | 2 |

Public export requests specify only template ID; theme is derived server-side.

## 4. Upload and confirmation usage

Upload is a sequence of Next server actions plus HTTP extraction. These actions are imported in client components; they are not stable `/api/storage/...` REST endpoints.

1. `getPresignedUploadUrl({fileName,fileType,category:"resume"})` from `app/actions/storage.ts`.
2. PUT file bytes to the returned `uploadUrl`, with the same Content-Type. Upload signing lasts 5 minutes.
3. `commitResumeUpload({objectKey,fileName,fileSize})`; verify `success` before continuing.
4. POST `{objectKey,fileName}` to `/api/job-hunt/profile`.
5. Response contains `preferences` and `resume_details`, including `personalDetails`, `educationHistory`, `experienceHistory`, and `compiler_payload`.
6. Review extracted preferences on Manage Job Hunt and click **Confirm Changes**.

Supported extraction: PDF/DOCX, at most 10 MB. Education/date parsing is heuristic and editable; scanned PDFs have no OCR.

Confirmation actions from `app/actions/preferences.ts`:

```tsx
import { saveUserJobPreferences, confirmUserJobPreferences } from "@/app/actions/preferences";

// Save pending preferences; preserve old confirmation baseline/time.
await saveUserJobPreferences(currentPreferences);

// Call from an explicit user Confirm Changes handler.
// In a real form, pass the complete current preference payload.
const result = await confirmUserJobPreferences(currentPreferences);
if (!result.success) throw new Error(result.error);
```

Regular saves normalize a full preference document and supply defaults for omitted fields; they are not partial PATCH operations. Pass the complete current form payload to avoid unintended default replacements. Only the dedicated confirmation action sets `isConfirmed=true`, stamps server time, and creates a new baseline. User-supplied confirmation metadata is stripped from ordinary preference input.

`fetchResumePayloadLocallyServer()` and `saveResumePayloadLocallyServer()` from `app/actions/resume.ts` read/write base Markdown in Neon despite their legacy names. They do not export PDF.

## 5. Cloud service endpoints

Browsers should use the app routes. These endpoints are for trusted servers; keep credentials private.

### PDF compiler

Base: `https://resume-pdf-compiler-znsph25yja-ue.a.run.app`.

- `GET /health`: public; returns `{status:"ok",capacity:4}`.
- `POST /api/v1/ui-export`: bearer token required. Body `{resume,theme,templateId,uploadUrl}`. `resume` is the structured output of `parseResumeMarkdown`, not raw Markdown. `uploadUrl` is an HTTPS R2 signed PUT URL. Returns `{uploaded:true,fileSize}`. App routes construct this request.

### Profile extraction

Base: `https://job-hunt-profile-znsph25yja-ue.a.run.app` (also reachable at `https://job-hunt-profile-6707978391.us-east1.run.app`).

- `GET /health`: public `{status:"ok"}`.
- `POST /profile/resume-from-r2`: body `{objectKey,fileName,downloadUrl}`; new extraction flow.
- `GET /profile`: read profile.
- `PATCH /profile`: legacy `{preferences?,resume_details?}` update; remains unconfirmed.
- `POST /profile/resume`: legacy multipart field `file`; does not implement direct-R2 upload.

Authenticated profile requests require `x-user-id`, `x-timestamp` (Unix seconds), `x-signature`; tolerance 60 seconds.

```text
New R2 POST:
signature = HMAC-SHA256(secret, userId + ":" + timestamp + ":" + SHA256(exactBodyBytes))

Legacy GET/PATCH/multipart:
signature = HMAC-SHA256(secret, userId + ":" + timestamp)
```

Hashes/signatures are lowercase hex. `lib/profile-service.ts` signs the new JSON POST and legacy GET. It is not a PATCH/multipart client. All automated cloud preference writes preserve confirmation metadata and clear confirmation.

## 6. Storage, deployment, and troubleshooting

Original files: `user_pref_resumes/{userId}/...`; active-file metadata: `user_pref_resumes`.

Extracted preferences/details/base Markdown: `user_job_preferences`.

Job PDFs: `resumes/{userId}/{jobId}/{uuid}.pdf`; latest metadata: `user_job_resumes`, unique `(user_id,job_id)`. Export verifies upload, commits latest row under an advisory lock, then attempts old-object deletion. `cleanupPending=true` reports failed prior-object deletion; no durable retry queue exists. Original-file commit retains the earlier pruning implementation and does not have all job-export transaction guarantees.

GCP project `job-scout-508222`, region `us-east1`. Profile image `job-hunt-profile:confirmation-20261001`, revision `job-hunt-profile-00003-5rm`. Existing services are already deployed; running another clone does not require redeployment. `scripts/deploy-resume-services.py` changes cloud services and expects RTK, gcloud access, private configuration, prebuilt images, and a local `scratch` directory. Do not run it just to start the frontend.

Quick diagnostics:

- 401: sign in; direct service calls need matching server credentials.
- 404 job resume: use a real UUID and create your application first.
- 502 extraction: verify active committed key, readable PDF/DOCX, HMAC configuration, and matching service/DB environment.
- 503 export: check compiler URL/token/health and capacity, then retry. Retrieve current job state after uncertain failures.
- Upload CORS error: verify exact frontend origin and PUT/Content-Type permissions.
- Button remains unconfirmed: review current values, confirm, and check the action response. Existing records without metadata start unconfirmed.

Verification scripts require more than a normal clone: `verify-confirmation.mjs` needs private isolated Neon settings in `scratch/dev-db.json` plus Python profile dependencies; browser verification also needs a Playwright installation and currently references this machine's bundled Windows path. Storage integration has additional local fixture/runtime requirements. These scripts are not portable one-command clone smoke tests without configuring those dependencies. Health checks and signed-in app behavior are the simplest new-device smoke checks.

See `PREFERENCE_CONFIRMATION.md` for confirmation release details and `resume-pdf-export.md` for the storage architecture.
