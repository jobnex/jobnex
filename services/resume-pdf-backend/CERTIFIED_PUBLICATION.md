# Certified resume publication

The additive v2 API is enabled only with `CERTIFIED_PUBLICATION_ENABLED=true`. It
uses the existing bearer service credential and verified `X-User-Id` identity.
The default is disabled. `RESUME_CERTIFIED_PUBLICATION_STRICT=true` separately
returns HTTP 409 with `code: USE_CERTIFIED_PUBLICATION` from legacy PDF preview,
export and download routes. Its default is false; enable it only after the UI
uses v2. Legacy Markdown save and generation behavior is retained.

All paths begin `/api/v2/jobs/{job}`:

| Method | Suffix | Input or behavior |
| --- | --- | --- |
| POST | `/preview` | `{generationId,documentRevision,documentHash,templateId}` only |
| GET | `/publication` | Query `generationId`, `documentRevision`, `templateId` |
| GET | `/artifacts/{artifact}/pdf` | Inline exact certified PDF bytes |
| GET | `/artifacts/{artifact}/pdf?download=1` | The same bytes as an attachment |

JSON responses contain `documentRevision`, `publicationStatus` (`ready` or
`blocked`), `issues` (`code`, `message`, `fieldId`), `artifactId`, `pdfSha256`,
and `documentHash`. Blocked responses have no downloadable artifact or PDF hash.
Outdated document/generation requests return 409. Other users' artifacts return
404. Unknown body fields, including caller documents and certificates, return
400. No public bucket URL is returned.

`resume_document_versions` is authoritative. The backend reads the latest
generation ordered by `version DESC, created_at DESC, id DESC` and its latest
document revision under owner and job. The stored JSON must conform to the
embedded copy of `contracts/resume-document-v1.schema.json`; tests compare the
copy with the shared schema. Hashes use recursively sorted compact UTF-8 JSON.
`source_hash` is the canonical hash of `audit_json.source_document`.
`source_import_id` must match `document.source.revision`; the document's id and
revision must match the row. Names, contacts, employers, dates and education must
match the source. Personal, role and project titles can change to exact contiguous
text supported by their own original source field, after factual validation.
The admission layer must bind the source to the owner's confirmed import.

`audit_json.status` must be `completed` or `completed_with_estimates`.
The immutable `audit_json.resume_document` factual baseline must also be
schema-valid, use the generation UUID as its id, and match the audited confirmed
source identity. Edits keep that baseline while saving a new document revision.
Required `audit_json.certificationChecks` flags are `schema`, `source`, and
`factual`, all boolean true. `compliance_ledger` is a nonempty array whose items
have a nonempty `code`, boolean `passed`, and `severity` in `error`, `warning`,
or `info`. Failed error checks always block, including checks with a waiver or
`human_review` status. Missing validators or failed PDF checks produce blocked
certifications, never an override.

The compiler consumes canonical JSON fields directly, without Markdown parsing.
It fixes PDF creation metadata to the Unix epoch for reproducible bytes and
retains the four existing templates and 10pt body/skills/bullets and 9pt
contacts/dates. It permits ordinary whitespace and multiple pages. Source-map
positions and final glyph boxes are integer millipoints. `validate_pdf.py`
checks the final bytes using pdfplumber and pypdf for complete field text/order,
Unicode mapping, font size, links, clipping, substantial text overlaps, empty
pages, heading orphans, active/hidden content and labeled source ranges. One
deterministic page-break retry can repair orphan headings; it cannot shrink,
pad, or delete content. Missing checker dependencies block publication.

Install the pinned runtime dependencies `pdfplumber==0.11.9` and
`pypdf==6.10.0`. Set `PDF_CHECKER_PYTHON` to that Python interpreter. The Docker
image supplies an isolated interpreter at `/opt/pdfcheck/bin/python`. Local
tests use the bundled workspace runtime when available; adversarial test PDF
creation also needs the bundled reportlab library.

Ready bytes are staged privately under
`resumes/{user}/{job}/certified/{artifact}.pdf` using `If-None-Match: *`.
Publication inserts into `resume_publication_certifications` only after
rechecking document/source/audit under
`pg_advisory_xact_lock(hashtextextended(user || ':' || job, 0))`. Generation
admission and revision saves must take the same lock. The SQL function
`resume_certification_current(text, uuid, uuid) -> boolean` must verify owner,
job, latest generation/revision/hashes, confirmed source, required audit and ready
status. The backend calls it before commit and on every download. Downloads
verify stored file size and SHA-256, then reread current proof after fetching
the private bytes. No credit settlement or legacy artifact record is changed.

Health exposes `renderer_version=certified-typst-v1`,
`template_version=resume-typst-v1`, `policy_version=certified-resume-v1` and the
additive feature flag. Changing an implementation policy requires a new version
so an old certification cannot silently authorize a changed renderer.

Run `node tests/certified-render.mjs`, `node tests/certified-api.mjs` and
`node tests/certified-build.mjs` through RTK. They exercise actual Typst output
in four styles, multi-page content, malformed PDFs, audit/identity/ownership
failures, concurrent revisions, exact bytes, feature gates and legacy behavior.
The production build never includes the filesystem test adapter. The default
`production-storage` Cargo feature retains the Postgres/R2 dependencies. Local
test builds use `--no-default-features --features local-test`, so the filesystem
adapter does not compile unused production storage dependencies. The local build
gate typechecks the production adapter and runs the executable/unit/legacy tests
with that isolated test feature. The Docker builder also links and tests the
default production build.

An isolated Docker `tester` stage and `cloudbuild-tests.yaml` run the same suites
on Linux. They create no deployment and use no live database or application
secrets. Submit that build only with authorization to upload the source to the
chosen cloud project. `tests/source-digest.mjs` binds a Linux build log to the
exact source, and `tests/verify-cloud-build.mjs` can verify completed build
evidence when a local executable cannot run. The default final image remains
the production runtime stage.
