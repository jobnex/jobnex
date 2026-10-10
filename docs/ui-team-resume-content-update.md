# UI team handoff: base resume synchronization

Follow-up: [background generation and draft credit settlement](ui-team-resume-background-credits.md) documents the later popup, tracking, review-access, and billing changes. Use that document for the current generation lifecycle.

Prepared: 2026-10-09. Scope: the resume content fixes, frontend integration, deployment status, and remaining integration steps.

## 1. What the team needs to do

Integrate the server actions and helpers from [PR #11](https://github.com/jobnex/jobnex/pull/11). Apply the small profile response wrapper correction separately if the frontend uses `extractResumeProfileFromR2`. Review the local studio save behavior before expecting its edits to persist in the shared database.

The running local UI keeps the same screens, layout, and buttons. Service origins, API paths, HTTP methods, and request field names stay the same. This release changes how the application selects, saves, and reads resume data.

There are three different code locations:

| Location | Purpose | Status |
| --- | --- | --- |
| `C:/Users/desir/Projects/techjobs/resume-backend-release` | Git checkout for `jobnex/jobnex`, including Cloud Run source | Fixes pushed to `fix/resume-content-sync` and PR #11 |
| `C:/Users/desir/Projects/techjobs/archive-review-20261008/app-source/my-app` | The local frontend running on port 3000 | Matching tailoring/profile-save/upload helpers updated; wrapper fallback applied locally |
| GCP project `job-scout-508222`, region `us-east1` | Live profile and web services | Both updated services receive 100% traffic |

The local frontend directory is not the Git checkout. Updating the Git branch does not automatically update a separate frontend checkout or deployment.

## 2. Source versions and publication

- Repository: [jobnex/jobnex](https://github.com/jobnex/jobnex).
- Branch: `fix/resume-content-sync`.
- Review: [PR #11](https://github.com/jobnex/jobnex/pull/11).
- Main behavior commit: `4f97a79` — canonical Markdown, synchronized writes, and owned active selection.
- Parser follow-up and deployed source: [`7d57c461eaa8b25ca51ed85f521b000bf24040ed`](https://github.com/jobnex/jobnex/commit/7d57c461eaa8b25ca51ed85f521b000bf24040ed).
- Release evidence documentation commit: `c706a605f503c6a82ebc9f0d2ce45e9b0654971a`.
- The source fixes were pushed for review. At the handoff, they have not been merged into `main`.

Use the complete branch when integrating into the same repository. Cherry-picking only the parser follow-up misses the main fix. The local wrapper correction described below is not included in PR #11 because the Git checkout has a different wrapper implementation.

## 3. Database contract

| DB field | Required value after a successful extraction or save | Used by |
| --- | --- | --- |
| `user_pref_resumes.content` | Non-empty Markdown for the selected base resume; do not put a JSON string here | Skill-gap preview and tailoring source |
| `user_pref_resumes.parsed_data` | A JSON object containing extracted data, editable fields, and `compiler_payload` | Structured source retention and Markdown fallback |
| `user_job_preferences.resume_details` | Editable profile fields merged into existing extracted data | Manage Job Hunt, resume builder, profile service |
| `user_job_preferences.active_resume_id` | The ID of a base resume belonging to the same `user_id` | Preview and generation selection |
| `resume_details.compiler_payload.markdown` | The current canonical Markdown | Base preview/compiler payload and synchronized source |

For these synchronized write paths, `content` equals `parsed_data.compiler_payload.markdown`, and `parsed_data` matches `resume_details` after the transaction commits. Source metadata and extracted text remain in JSON when editable sections are changed.

An uploaded replacement has a temporary extraction-pending state: when `file_key` changes, old `content` becomes `NULL` and `parsed_data` becomes `{}`. The existing profile details are not immediately erased by that metadata update. Successful extraction must replace/synchronize the source; the older text must not be treated as the replacement file's content.

The current schema has a unique base-resume row per `user_id`. Role-specific generated resumes are separate from that base row. This fix does not add support for multiple independently selectable base resumes per user. Such a feature would require additional schema and selection changes.

No table, column, migration, new secret, or new environment variable was added by this fix.

## 4. Required frontend server changes: exact files

Paths below are relative to the frontend project root. These files run on the Next.js server, even though they are part of the UI project.

| File | Required change | Availability |
| --- | --- | --- |
| `lib/active-resume.ts` | Add `activeResumeId(userId)` with the owned preference/resume join | PR and local app |
| `lib/resume-content.ts` | Add `resumeMarkdown`, `normalizeResume`, and `resumeText` | PR and local app |
| `app/actions/tailored-resume.ts` | Use the owned active ID for preview and generation | PR and local app |
| `app/actions/preferences.ts` | Synchronize profile edits transactionally; invalidate stale text when the upload key changes | PR and local app |
| `app/actions/storage.ts` | Invalidate extracted data when committing a different upload key | PR and local app |
| `lib/profile-service.ts` | Read compiler payload from nested `resume_details` when the top-level field is absent | Local app only; conditional patch below |

### 4.1 Owned active resume selection

The new helper uses this query with the authenticated user's ID:

```sql
SELECT r.id
FROM user_job_preferences p
JOIN user_pref_resumes r
  ON r.id = p.active_resume_id
 AND r.user_id = p.user_id
WHERE p.user_id = $1;
```

In `getTailoringPreview(jobId)` and `initiateTailoringRequest(jobId)`, use:

```ts
import { activeResumeId } from "@/lib/active-resume";

const effectiveResumeId = await activeResumeId(user.id);
```

Generation returns an actionable error if no owned active resume exists. Do not select an arbitrary first resume or trust an unverified preference ID as a fallback. Derive `user.id` from the server's authenticated session.

Keep the existing session cookie forwarding to `job-hunt-web`. Generation still sends:

```json
{
  "jobId": "<published-job-uuid>",
  "resumeId": "<owned-active-base-resume-uuid>",
  "idempotencyKey": "<request-uuid>"
}
```

The current caller creates an idempotency UUID for each initiation. This release does not redesign client retries. If the UI retries the same HTTP submission, preserve that submission's key to obtain the backend's duplicate-request behavior.

### 4.2 Markdown helpers

Copy `lib/resume-content.ts` before integrating its callers. It has no new package dependency.

- `resumeMarkdown(details)` uses existing compiler Markdown, otherwise available source text or structured sections.
- `resumeMarkdown(details, true)` rebuilds editable personal/education/experience sections and retains non-builder Markdown sections.
- `normalizeResume(details, edited)` preserves extraction fields and compiler metadata while updating compiler Markdown.
- `resumeText(content, parsed)` handles plain Markdown, valid legacy JSON content, and an empty-content structured fallback. Malformed JSON content returns no usable text.
- Original extraction remains in JSON. Edited profile sections take precedence in rendered Markdown. Markdown can therefore be shorter than the original source without deleting the original extraction.
- When no manual `experienceHistory` exists, `experience_text` or string experience is kept verbatim rather than discarded by partial structured job parsing.

Do not replace the extracted object with only the three builder fields.

### 4.3 Profile edits in `saveResumeDetails`

Retain the existing authentication, input validation, return type, and page revalidation. Replace the write logic with the transaction from PR #11:

1. Lock the authenticated user's base-resume row.
2. Lock/read that user's preference row.
3. Merge current extraction fields with validated editable fields.
4. Normalize the merged object with `edited = true`.
5. Save merged `resume_details` and the owned `active_resume_id`.
6. Save the same object in `parsed_data` and its Markdown in `content`.
7. Commit together. A failure must roll back the transaction.

The implemented editable fields are `personalDetails`, `educationHistory`, and `experienceHistory`. The current action is a full builder-form save: omitted personal details become `null`, and omitted education/experience arrays become empty arrays. Submit the complete form state. Do not use this action as an arbitrary partial-field PATCH without adapting its input semantics.

When no base-resume row exists, the builder can save profile details, but active selection remains `NULL`. The user must upload/create a base-resume row before tailoring.

### 4.4 Replacement upload invalidation

Apply this in both metadata write paths:

- `app/actions/storage.ts`, `commitResumeUpload`.
- `app/actions/preferences.ts`, existing upload metadata upsert.

The update keeps existing text when the object key is unchanged. It clears old extraction when the object key changes:

```sql
content = CASE
  WHEN file_key IS DISTINCT FROM <new-object-key> THEN NULL
  ELSE content
END,
parsed_data = CASE
  WHEN file_key IS DISTINCT FROM <new-object-key> THEN '{}'::jsonb
  ELSE parsed_data
END;
```

This is explanatory SQL, not a standalone repair command. Use parameterized expressions from the action's existing upsert. Integrate the `sql` import from `drizzle-orm` where required.

### 4.5 Local profile wrapper correction

The local wrapper is `lib/profile-service.ts`, function `extractResumeProfileFromR2`. It performs a signed server request and maps the response into the object the UI receives. It is not a separate service.

In its successful response mapping, change:

```ts
compiler_payload: data.compiler_payload,
```

to:

```ts
compiler_payload: data.compiler_payload ?? data.resume_details?.compiler_payload,
```

Keep these mappings alongside it:

```ts
preferences: data.preferences,
resume_details: data.resume_details,
```

The profile service normally returns a shape like this:

```json
{
  "preferences": {},
  "resume_details": {
    "text": "<full extracted source>",
    "personalDetails": {},
    "educationHistory": [],
    "experienceHistory": [],
    "compiler_payload": {
      "markdown": "# Example Resume\n\n## Skills\nSQL"
    }
  }
}
```

Keep compatibility with a top-level payload through the nullish fallback. Do not require the backend to move its nested field.

The Git checkout's `lib/profile-service.ts` exports a generic `profileService(...)` and returns raw JSON. It does not have this local response-mapping line. Apply the fallback at the equivalent consumer if the team's code uses that generic helper. Do not overwrite the generic helper with the whole local file merely because their filenames match.

## 5. Existing endpoints and authentication

These origins and paths remain unchanged:

| Purpose | Method and path | Origin |
| --- | --- | --- |
| Profile fetch | `GET /profile` | `https://job-hunt-profile-znsph25yja-ue.a.run.app` |
| Profile update | `PATCH /profile` | Profile origin |
| Direct file extraction | `POST /profile/resume` | Profile origin |
| R2 extraction | `POST /profile/resume-from-r2` | Profile origin |
| Tailoring preview | `GET /api/resume/tailor/resumes/{resumeId}/preview?jobId={jobId}` | `https://job-hunt-web-znsph25yja-ue.a.run.app` |
| Tailoring submission | `POST /api/resume/tailor/requests` | Web origin |
| Request status | `GET /api/resume/tailor/requests/{requestId}` | Web origin |
| Generated Markdown/JSON | `GET /api/resume/tailor/generated/{requestId}` with the existing `format=json` option | Web origin |
| Generated PDF | `GET /api/resume/tailor/generated/{requestId}/pdf` | Web origin |
| Base Markdown edit | `PATCH /api/resume/tailor/resumes/{resumeId}` | Web origin |
| Web direct upload | `POST /api/resume/tailor/upload` | Web origin |

The route placeholder names describe existing URL segments. They are not new paths. Preview response shape remains `preview`, `resume`, and `job`.

Existing server environment variables:

- `JOB_HUNT_WEB_URL`: existing web service origin.
- `JOB_HUNT_SERVICE_URL`: existing profile service origin.
- `JOB_HUNT_SERVICE_SECRET`: existing server-side HMAC secret; retain its existing configured value.
- `DATABASE_URL`: existing environment-specific database binding for server actions.
- Existing Neon Auth configuration and R2 configuration remain in place.

For ordinary profile GET/PATCH calls, the service verifies HMAC-SHA256 of `userId:timestamp`. For `/profile/resume-from-r2`, it verifies `userId:timestamp:SHA256(exactBodyBytes)`. Headers remain `x-user-id`, `x-timestamp`, and `x-signature`; accepted timestamp drift is 60 seconds. Keep the exact body serialization used for signing. The local R2 wrapper supplies `objectKey`, `fileName`, and the existing signed `downloadUrl`.

Tailoring routes authenticate the forwarded Neon session. The HMAC secret belongs only in server configuration; the browser should call the application server action rather than receive that secret.

## 6. Backend changes already live

The following are in PR #11 and the deployed web/profile images. The UI team does not need to deploy them a second time simply to adopt frontend callers.

| File | Behavior |
| --- | --- |
| `lib/resume-tailoring.ts` | `loadTailorResume` accepts only the authenticated user's active resume; reads Markdown through `resumeText` |
| `app/api/resume/tailor/requests/route.ts` | Distinguishes unavailable job, missing owned selection, and missing text before enqueueing/reserving a credit |
| `app/api/resume/tailor/upload/route.ts` | Normalizes extraction and saves the base row plus profile/active pointer in a SQL statement using CTEs |
| `app/api/resume/tailor/resumes/[resumeId]/route.ts` | Markdown PATCH verifies ownership, updates compiler payload and parsed JSON, and selects that base row transactionally |
| `app/actions/resume.ts` in the Git checkout | Cloud studio payload save updates compiler payload, base Markdown/JSON, and owned active selection in one transaction |
| `services/job-hunt-profile/service/main.py` | Extraction/profile updates save Markdown plus JSON and owned selection together |
| `services/job-hunt-profile/service/resume_content.py` | Python normalization/Markdown implementation |
| `services/job-hunt-profile/scripts/resume_to_json.py` | Collapses layout whitespace when matching PDF section headings |
| `services/job-hunt-profile/Dockerfile` | Includes the new helper/tests and runs profile/parser tests during image build |

Specific submission errors now include:

```text
This job is no longer available
Select an uploaded resume in Manage Job Hunt first
Resume text is missing. Extract or save your resume details in Manage Job Hunt first
```

Missing source prevents enqueueing. A repaired source and a working preview do not guarantee every later AI/provider request will succeed.

### 6.1 Why the PR also changes page and worker files

GitHub's previous baseline was older than the existing live deployment. The release restored the live queue/outbox/PDF integration before applying the content fix. The source of that reconciliation was deployed Cloud Build `85cedbc5-f7a8-493e-b9ba-ecc64ae4339e`.

Those reconciled files are:

```text
app/(main)/job-hunt/page.tsx
app/(main)/job-hunt/tailor-resume/page.tsx
app/api/resume/tailor/generated/[requestId]/route.ts
app/api/resume/tailor/generated/[requestId]/pdf/route.ts
app/api/resume/tailor/requests/[requestId]/route.ts
lib/resume-pdf-backend.ts
services/resume-tailor/dispatch.ts
services/resume-tailor/worker.ts
```

The request route and `lib/resume-tailoring.ts` also include restored integration alongside the new content logic. PR differences against old `main` are therefore larger than the new fix alone. Review the complete changes against the team's checkout. The running local frontend's layout was not replaced with these page files. The worker source was reconciled, but the worker service was not redeployed for this release.

## 7. Local studio difference: additional adoption decision

The local app's `app/actions/resume.ts` still implements `saveResumePayloadLocallyServer` with a local `data/resume-compile-payload.json` file and an in-memory cache. Its paired reader uses the same local storage. That file was not changed in the running local app by the resume repair.

The Git/cloud implementation with the same action name persists the compiler payload per authenticated user in Neon and synchronizes the base resume. If the team's studio editor must update the same shared base resume, integrate the authenticated DB implementation and its matching read action. Review its types and dependencies rather than copying only the save function.

Do not assume the local filesystem studio save already satisfies the shared DB contract. The verified frontend fixes cover Manage Job Hunt profile saves, upload metadata, active selection, and tailoring preview. A local-only compiler preview and shared per-user DB persistence are separate behaviors.

## 8. Integration procedure

### Same Git repository

1. Review PR #11 against the team's current branch and preserve unrelated changes.
2. Fetch `origin/fix/resume-content-sync` and integrate it through the normal PR review/merge process.
3. Verify both the main fix and parser follow-up are present.
4. If the frontend has `extractResumeProfileFromR2`, apply the one-line nested-payload fallback from section 4.5.
5. Resolve the studio storage decision in section 7 if that UI is used for shared base-resume editing.
6. Run the checks below, deploy the frontend through its existing deployment process, and verify its own environment bindings.

Example inspection commands from the team's existing checkout:

```powershell
rtk git fetch origin fix/resume-content-sync
rtk git diff --stat HEAD..origin/fix/resume-content-sync
rtk git log --oneline HEAD..origin/fix/resume-content-sync
```

These commands inspect the branch; they do not merge or overwrite the team's working files. After review, merge PR #11 using the repository's normal process. This handoff does not claim `main` is already updated.

### Separate frontend repository or archive checkout

1. Add the two helper files, `lib/active-resume.ts` and `lib/resume-content.ts`.
2. Adapt `getTailoringPreview` and `initiateTailoringRequest` in the existing tailoring action to use owned active selection.
3. Integrate the transaction inside `saveResumeDetails`, keeping surrounding validation and response contracts.
4. Integrate upload invalidation in both relevant upsert paths.
5. Apply the wrapper fallback at the actual response consumer.
6. Confirm the database driver supports transactions and row locking, and the deployed schema has the existing fields/indexes.
7. Review the optional studio DB integration separately.
8. Verify using test-account uploads and the signed-in preview. Deploy the updated frontend build.

The fixes require no new dependency. Keep the project's existing import aliases, authentication helpers, and driver conventions. Copying only `activeResumeId` without its server DB setup or only the action without `lib/resume-content.ts` leaves the integration incomplete.

## 9. Checks before releasing the frontend

### Code checks

From the updated repository root:

```powershell
rtk npm ci --ignore-scripts
rtk proxy node node_modules/typescript/bin/tsc --noEmit
rtk proxy node node_modules/tsx/dist/cli.mjs scripts/check-resume-content.ts
rtk npm run lint
```

The recorded release passed TypeScript checks in both the Git checkout and local app. Resume assertions and six Python profile/parser tests passed. Production Cloud Build passed. Scoped lint passed with existing `no-explicit-any` findings excluded in preferences/storage. Full-repository lint still reported existing failures: 100 errors and 1,869 warnings. Do not report the full lint suite as clean.

Python tests live in `services/job-hunt-profile/service/test_main.py` and `service/test_resume_content.py`. The profile Dockerfile runs them with a test-only secret. Do not use production credentials for unit tests.

### Functional checks

| Scenario | Expected outcome |
| --- | --- |
| Valid owned active base resume | Preview uses that exact ID and readable source |
| Another user's resume ID | Backend rejects selection; no generation is enqueued |
| Missing active base row | Action asks for an uploaded base resume |
| Missing extracted text | Submission fails before credit reservation |
| Edit personal/education/experience fields | Markdown and JSON/profile update together; extraction metadata survives |
| Replace uploaded object key | Old content is cleared until extraction succeeds |
| Re-save the same object key | Existing extraction is retained |
| Profile response contains only nested compiler payload | UI wrapper exposes it successfully |
| Invalid legacy JSON content | It is not submitted as factual resume Markdown |
| User signs out | Protected requests fail authentication |
| Studio save intended for shared DB | Verify the DB implementation, not only a local preview |

Use a test account for upload replacement and editor tests, since those actions change that account's base resume. Checking the skill-gap preview does not require clicking the paid Generate button.

### Read-only DB verification

Run this for the relevant authenticated user's ID in the correct database. The placeholder is not an executable user ID:

```sql
SELECT
  p.active_resume_id,
  r.id AS owned_resume_id,
  length(r.content) AS markdown_characters,
  jsonb_typeof(r.parsed_data) AS parsed_data_type,
  length(r.parsed_data ->> 'text') AS extracted_text_characters,
  r.content IS NOT DISTINCT FROM
    (r.parsed_data -> 'compiler_payload' ->> 'markdown') AS markdown_matches_json,
  r.parsed_data IS NOT DISTINCT FROM p.resume_details AS profile_matches_json
FROM user_job_preferences p
LEFT JOIN user_pref_resumes r
  ON r.id = p.active_resume_id
 AND r.user_id = p.user_id
WHERE p.user_id = '<authenticated-user-id>';
```

After successful extraction/save, expect an owned resume ID, non-empty Markdown, JSON object data, and both consistency flags true. Also confirm generation requests and credit state do not change during preview-only checks. Do not run repair, seed, or deletion scripts as routine test steps.

## 10. Live release and existing DB repair

Recorded and subsequently verified traffic:

| Service | Fixed ready revision | Traffic | Retained previous revision |
| --- | --- | --- | --- |
| `job-hunt-profile` | `job-hunt-profile-00005-sd8` | 100% | `job-hunt-profile-00004-r6n` |
| `job-hunt-web` | `job-hunt-web-00017-glg` | 100% | `job-hunt-web-00016-g5t` |

The existing `neondb-trial` web tag points to `job-hunt-web-00017-glg`. Origins did not change. Environment/secret bindings and service accounts were preserved. The new web revision passed zero-production-traffic validation before promotion: page HTTP 200, protected request route HTTP 401, revision Ready. The temporary validation tag was removed.

Three selected active base records with empty or JSON-string content were repaired. Repairs used each record's owned R2 source or existing structured extraction. Original file/profile timestamps and row locks prevented overwriting a concurrent source change. Manual builder fields were retained. Source extraction remains in JSON. The repair was already applied; the UI team should not run it again as a deployment step.

Post-repair checks confirmed matching Markdown/compiler payload, matching parsed/profile JSON, owned active IDs, and rejection of a foreign-owner selection. The signed-in TensorWave preview returned 21% match confidence with the Generate button enabled and the user's balance still 3 credits. Preview validation did not run paid AI generation. The lower match score is the deterministic keyword match, not a connection failure.

Full source release, image digests, build evidence, and rollback revisions are recorded in [resume-content-sync-2026-10-09.md](releases/resume-content-sync-2026-10-09.md). [Cloud Build](https://console.cloud.google.com/cloud-build/builds;region=us-east1/e84b96e1-bd21-4155-b19c-0f91bc3acf86?project=job-scout-508222) built the deployed behavior commit.

## 11. Rollback and ownership of remaining work

For a service rollback, route traffic to the retained previous revision. For web rollback, also restore the `neondb-trial` tag to that previous web revision. Previous images are retained. A service rollback does not undo the DB repair. Do not restore blank/JSON-string content merely to match older code.

| Work item | Current state | Next owner/action |
| --- | --- | --- |
| GCP profile/web deployment and traffic | Complete | No additional deployment needed for the current fix |
| Three affected active DB records | Repaired and verified | Do not repeat the repair automatically |
| GitHub source publication | PR #11 available | Team review and merge into its release branch/main |
| Separate frontend checkout | Must adopt the changes | UI team integrates the listed server actions/helpers |
| Local nested-payload wrapper patch | Applied locally, outside PR | UI team applies the conditional fallback in its wrapper/consumer |
| Shared studio persistence in the local UI | Local save still uses filesystem/cache | UI team adopts the cloud DB action if shared persistence is required |
| Paid generation end-to-end check | Not run for validation | Optional controlled test using a test account and an agreed credit |
| Full-repository lint failures | Existing failures remain | Separate cleanup; preserve the reported validation limits |

The frontend handoff is complete when the team's deployed build uses owned active selection, keeps profile/base data synchronized, handles the nested compiler payload, and passes the relevant checks above.
