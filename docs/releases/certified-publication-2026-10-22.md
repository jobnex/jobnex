# Certified resume publication

The new contract uses validated PDF source evidence, `ResumeDocumentV1`, deterministic Typst rendering, finished-PDF checks, and an immutable certification before download. Markdown remains a legacy compatibility output. The compact compiler is not used by the certified path.

## Rollout status

Additive schema is deployed to `trail_dev / production / neondb`. Existing resume records and credit balances are unchanged. Backend revisions are released under `certified-v1`; deployment digests, revisions, health checks and before/after traffic belong in `certified-publication-deployment.json`. **Global strict enforcement remains off until the production UI integration passes.** Legacy generation stays available during that transition.

## Document and evidence contract

`contracts/resume-document-v1.schema.json` is shared with the packaged Python source/profile validators, Rust renderer, and TypeScript application. A document includes stable IDs for identity, roles, education, skill groups, bullets, projects and additional sections. Evidence records contain original extracted PDF text offsets, page numbers, integer millipoint boxes and originating role IDs. PDF hyperlinks use their actual annotation URI and rectangle; they are not guessed from labels. Header contacts exclude body citations.

Source file SHA-256, extracted-text SHA-256, confirmed import UUID and validator version remain distinct. Document hashes use recursively sorted keys, compact UTF-8 JSON and no nonfinite numbers. The new database `source_hash` means the canonical source-document hash; the older generation `source_hash` remains its compatibility-text hash.

Initial generation copies protected facts, validates source-linked JSON and permits at most two model repairs. Certified generation does not pad content or require arbitrary word, bullet or metric counts. Missing factual content and unsupported claims still fail. A short source can remain short.

## Application endpoints

All application endpoints require the existing authenticated Neon session. Vercel forwards that session server-side to the versioned GCP web service; browser input cannot supply a trusted user ID.

| Endpoint | Purpose |
|---|---|
| `GET /api/resume/publication?jobId=UUID&generationId=UUID&templateId=mit-capd` | Load the latest owned canonical document and publication state. Generation ID is optional; historical unvalidated generations return `SOURCE_REVALIDATION_REQUIRED`. |
| `POST /api/resume/publication` with `action: "save"` | Save a new immutable revision, invalidate earlier PDF certifications, and run factual checks without another credit reservation. |
| `POST /api/resume/publication` with `action: "preview"` | Validate/render/certify the current stored revision. Client-supplied document content is not trusted for preview. |
| `GET /api/resume/publication/{artifactId}/pdf?jobId=UUID` | Stream the exact certified PDF inline after ownership, revision, source and hash checks. |
| Same PDF endpoint with `&download=1` | Stream those same bytes as an attachment, repeating currentness checks. No presigned generated-PDF URL is minted. |

Preview request:

```json
{"action":"preview","jobId":"UUID","generationId":"UUID","documentRevision":1,"documentHash":"SHA256","templateId":"mit-capd"}
```

Save request includes `action: "save"`, the same job/generation/expected document revision, `templateId`, and `document` conforming to the schema. A save increments the revision even for a template change. Stale concurrent saves return `STALE_REVISION`; only one wins. Protected corrections require a new validated source PDF. Title edits must be explicitly supported by their own source field; uncertain wording remains blocked.

Responses add `documentRevision`, `documentHash`, `publicationStatus`, `issues`, `artifactId` and `pdfSha256`. Issues have stable `code`, readable `message` and affected `fieldId`. Generation JSON/status endpoints also include publication metadata. Unknown or unavailable validation returns a blocked state, never an inferred approval.

## Private service endpoints

The existing PDF service accepts its existing service bearer credential, Cloud Run IAM identity and verified `X-User-Id` from the authenticated application server:

- `POST /api/v2/jobs/{jobId}/preview` with `{generationId,documentRevision,documentHash,templateId}`.
- `GET /api/v2/jobs/{jobId}/publication?generationId=UUID&documentRevision=1&templateId=mit-capd`.
- `GET /api/v2/jobs/{jobId}/artifacts/{artifactId}/pdf` (optional `?download=1`).

The worker's IAM-only `POST /internal/validate-document` accepts `{versionId: UUID}`. It loads the authoritative immutable row and original audit itself. It never reserves or settles credits. Existing `/internal/process` and `/internal/recover` retain idempotent settlement; `publication_contract` prevents an older worker from claiming certified requests. The compatibility dispatcher routes retries to the matching worker and IAM audience.

## PDF certification

All four identities remain: `mit-capd`, `modern-ivy`, `tech-specialist`, `minimalist-exec`. Body, bullets and skills are at least 10 pt; contact/date text is at least 9 pt. More pages are allowed. Finished-PDF checks cover text, names, dates, links, reading order, role/bullet association, glyph visibility, font sizes, page boundaries, overlaps, empty pages and orphan headings. One deterministic pagination repair is permitted, followed by all checks again. Content is never shrunk, dropped or padded to pass.

`resume_document_versions` stores each revision and trusted audit. `resume_publication_certifications` binds owner, job, generation, source, revision, template/version, renderer/version, policy and final PDF SHA-256. Publication and edit operations use the same transaction advisory lock. Download repeats the guard and byte hash after storage retrieval. Manual review cannot waive a failed or missing required check.

Preview displays those PDF bytes, not an HTML approximation. Edits clear the displayed certificate and show “Preview updating.” The structured editor retains stable IDs and evidence. Validation or renderer retries do not consume another credit; existing usable review-draft charging remains unchanged. Historical outputs are retained and are not silently rewritten or approved.

## UI handoff

Apply `ui-handoff/certified-publication.patch` after the previously supplied quality/autofill patches. It is an incremental patch, not a replacement ZIP. Full updated files are also under `ui-handoff/my-app`. See `ui-handoff/CERTIFIED-PUBLICATION.md` for exact files, environment settings, checks and rollout steps.

## Strict cutover and rollback

1. Deploy the new UI with certified preview/editor/download enabled and the versioned backend URLs. Keep global strict flags off during integration.
2. Upload a supported PDF; verify extracted skills/domains, generation, all templates, source-backed editing, blocked unsupported claims and matching preview/download SHA-256. Check cancellation, stale revisions and outages. Revalidate old sources before their next certified generation.
3. Only after those production UI checks pass, enable `RESUME_CERTIFIED_PUBLICATION_STRICT=true` on the UI application server and PDF backend, and promote the certified web/PDF revisions. Repoint or remove every legacy web/PDF traffic tag so an old application URL cannot remain an unchecked export route. Retire old Vercel deployments with export credentials. Revoke the legacy compact-compiler export credential once its consumers are migrated. Previously minted storage URLs must expire (up to two hours) before claiming a complete strict cutoff. Do not enable the global source-admission trigger before this integration checkpoint.
4. During rollback, first stop new certified requests, retain the compatibility dispatcher and certified worker until existing requests settle, then revert the UI/backend traffic to the recorded before revisions. Do not refund or consume credits manually. Leave additive tables and historical certifications intact.

No strict cutover, legacy credential revocation or Vercel deployment is performed as part of this backend-first release. The UI team must report its integration result before that final activation.
