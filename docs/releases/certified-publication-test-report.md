# Certified publication verification

Verification date: 22 October 2026. Backend images and probe results are recorded in `certified-publication-deployment.json`.

## Results

- Python agent: 250 tests pass. Canonical source and generated documents, exact evidence, protected facts, unsupported claims, source-backed titles, skills, missing fields and bounded repairs are covered.
- Profile: 30 tests pass. The regression suite includes all eight PDFs produced by the authoritative Linux renderer: four short and four multi-page exports. Reupload preserves the employer, role, location, dates, 2 or 38 bullets, exact text spans and PDF geometry.
- Real-file checks: all 20 expectations match. The two supplied unsupported multi-column examples reject. The standard single-column example, latest failing source, gallery templates and exported templates accept: 18 accepted, two expected rejections. Private resumes are not included in this repository or the cloud test build.
- Rust/PDF suites pass in Linux Cloud Build `2ad701e5-35b0-4eef-96fc-e82ddeda220d`. The tested source SHA-256 is `84f65647d1f35d539ecdbda2dceae4c1f2f74a24b5e3905ac6280f19a51bb208`. The production image is built in that same successful build. Tests cover all four templates, multi-page rendering, text preservation, minimum fonts, links, clipping, overlap, invisible text, missing glyphs and orphan headings. Twelve rendered pages were also visually inspected.
- API tests exercise ownership, wrong jobs, failed/missing audits, manual-review bypass attempts, exact PDF hashes, stale artifacts, concurrent requests, renderer failure and retries. Integration tests use an isolated Neon branch, not production resume rows.
- Revision tests verify that one concurrent save wins, every edit invalidates the old certificate, valid unchanged content can be checked again, and unsupported achievements remain blocked. Validation retries create no credit transaction. Existing settlement tests retain idempotent charging.
- Routing tests verify that legacy and certified workers claim and recover only their matching request contracts, using the correct Cloud Run audience.
- UI typecheck, ESLint and production build pass. The incremental patch applies to the previously supplied UI baseline; every patched file matches the delivered source snapshot. The snapshot contains 263 files; the incremental patch changes 17 files.
- Production probes pass: five ready revisions, seven health/authentication/invalid-input checks, and four stateless template upload checks with matching file hashes. These checks do not activate a resume or consume credits. The certified recovery schedule executed successfully.

## Defects found during verification

The tests caught a parser error in exported PDFs: stacked role, employer, location and date lines were associated with the wrong employer. The shared parser now handles this layout and rejects genuinely ambiguous role stacks. A second fix preserves the renderer's Community section as an additional section. Existing right-aligned dates and multi-column rejection controls remain covered.

Integration checks also found a database URL query-parameter removal bug and missing invocation permission from the web runtime to the certified worker. URL parsing now uses the standard URL API; the existing web runtime receives `roles/run.invoker` on that worker service only. Separate certified recovery prevents interrupted requests from being claimed by the legacy worker.

## Scope and remaining rollout checkpoint

No live paid model generation or production UI end-to-end run is claimed by this report. Model behavior is checked through deterministic pipeline fixtures and factual validation. The UI team must deploy the supplied patch and complete the documented production UI checks before strict enforcement is enabled.

Legacy generation remains available. The new certified path fails closed, but older production routes remain compatible until the coordinated cutoff. Historical data is retained. Passing these tests reduces known failure paths; it is not a guarantee that future inputs can never reveal another defect.
