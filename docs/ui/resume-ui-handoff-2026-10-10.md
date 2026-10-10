# Resume UI handoff — 10 October 2026

Audience: UI team and production UI maintainers.
Scope: changes made during the resume upload, generation, preview, editing and export work in this conversation.
Deployment status below reflects the last verified GCP revisions on 10 October 2026.

## Deployment summary

| Area | Local app | Production UI / service | Required handoff |
| --- | --- | --- | --- |
| Complete resume contact header | Implemented | Deployed | Keep additional contact fields when integrating UI changes. |
| Title separated from contacts | Implemented | Deployed | Keep the shared parser across every template. |
| Duplicate LinkedIn / false website removal | Implemented | Deployed | Preserve canonical contact deduplication and email overlap checks. |
| Company and role Markdown cleanup | Implemented | Deployed | Render formatted text without literal emphasis markers. |
| Contact and job-heading wrapping | Implemented | Deployed | Visually verify long text in all four templates. |
| Plain-text education degree and graduation date | Implemented | Deployed | Preserve both through visual editing and serialization. |
| Multiple A4 pages in preview and print/PDF | Implemented | Not included in the current production web deployment | Integrate and release the local pagination changes. |
| Safe base-resume delete/replacement action | Implemented locally | Not included in the current production web deployment | Integrate the action and verify the complete delete/upload flow. |

The latest production web release carries the contact and heading fixes. It was built from the prior deployed source, with only the shared sheet, parser and contact helper changed. It does not contain the separate local pagination or deletion work.

## Implemented user-visible changes

### 1. Complete, adaptable contact header

The preview preserves supplied phone numbers, email addresses, LinkedIn, GitHub, portfolio/website links, location and additional header details. Additional emails and phone numbers survive parsing and serialization.

Upload extraction supports unlabeled/international phone numbers, PDF hyperlink targets, Word hyperlink relationships and contacts in Word headers, footers and text boxes. Image-only documents remain unsupported; no OCR was added.

Partial edits preserve omitted contact fields. Explicitly deleted contacts are not restored from raw extracted text. These are data-preservation changes; no new contact editing controls were added.

### 2. Clean title and contact presentation

A title such as **Backend Developer | AI Infrastructure | Python | AWS** now appears as the title, rather than being split into extra contacts. Repeated title segments are excluded from the contact line.

Equivalent LinkedIn URLs with and without protocol are displayed once. The extractor no longer mistakes the dotted username in an email such as `first.last@example.com` for a website.

The active base header was repaired from stored source information. Its resume body was preserved. Historical generated Markdown and request snapshots were not rewritten.

### 3. Company, role and project formatting

Paired inline Markdown emphasis is converted to display text in the structured preview. A company stored as `**Example Company**` displays as **Example Company**, without literal asterisks.

The shared parsing change also applies to role/project headings, summary bullets and skill text. Visual editing serializes the underlying words back into the resume format.

### 4. Header and entry wrapping

Contact values and long URLs can wrap within the resume width. The executive template uses bounded, wrapping columns for profile/contact details.

Role/company and project/date rows can wrap when their content exceeds the available width. Date metadata remains associated with its entry.

This was verified through source review and rendered-text checks. Pixel-level visual alignment still needs browser QA.

### 5. Education preservation

Plain-text education rows are supported alongside structured Markdown rows. The school name, degree and graduation date are retained separately when the source supplies an aligned school/date row followed by a degree line.

The previously hidden degree line is now displayed. The graduation date is separated from the institution name. Education survives the parse → edit → serialize → parse round trip.

### 6. A4 pagination — local, awaiting production integration

The local preview renders multiple physical A4 pages at **210 × 297 mm**. Longer content continues onto the next page rather than being clipped to a one-page preview.

The preview reports the page count and shows page numbering. The previous one-page overflow warning is replaced locally by an informational message such as:
“2 A4 pages · All content included in preview and PDF export.”

Printing uses the same A4 page structure, removes app controls from print output and applies page breaks. Zoom affects the preview scale, not the export paper size.

Integration files:
- `components/A4ResumePages.tsx`
- `components/ResumeSheet.tsx`
- `components/ResumeModal.tsx`

Integrate these together: the sheet supplies content, the page component measures/splits it, and the modal supplies page-count state and print styling. Preserve the production contact/heading fixes during integration.

### 7. Base-resume deletion/replacement — local, awaiting production integration

The local delete action detaches the active attachment and clears its active selection while retaining database rows required by generation history.

It blocks deletion when a queued/running generation is using the base resume. Database changes commit before file removal. Storage cleanup targets only the captured attachment keys, preserving unrelated files and concurrent replacement uploads.

Implementation: `app/actions/storage.ts`, `deleteUserResume()`.

This is a behavior fix behind the existing delete icon, not a button redesign. The UI must show action errors and allow a replacement upload after successful deletion. Verify that the active file display refreshes after the action.

## Templates covered

| Template | Theme ID | Header behavior |
| --- | --- | --- |
| MIT CAPD Classical | 2 | Centered name/title with wrapping contact line. |
| Modern Ivy LaTeX | 3 | Centered name/title with wrapping contact line. |
| Minimalist Executive | 5 | Split header with bounded, wrapping profile/contact columns. |
| Tech Specialist | 6 | Left-aligned name/title with wrapping contact line. |

All four consume the same corrected parser. These are the current template choices; this handoff does not describe a new template redesign.

Existing saved aliases remain readable:
- `contemporary-compact` → `modern-ivy`
- `standard-overleaf` → `mit-capd`

## Where the UI developer should collect the code

Workspace root: `C:/Users/desir/Projects/techjobs/`.

Download/share `docs/ui/resume-ui-code-handoff-2026-10-10.zip`. It contains an allowlisted source snapshot, a README with integration instructions and a SHA-256 manifest. It contains no environment files, credentials, private resumes, build output or dependencies.

| ZIP folder | Source location in this workspace | Use |
| --- | --- | --- |
| `production-web/` | `resume-quality-review/heading-web-build/` | Collect the contact/heading fixes matching the deployed production web source. |
| `local-app/` | `archive-review-20261008/app-source/my-app/` | Collect A4 pagination/print and deletion changes awaiting integration, together with the latest contact/heading fixes. |
| `profile-service/` | `resume-backend-release/services/job-hunt-profile/` | Collect supporting upload/contact extraction and preservation changes. |

Merge the selected files into the UI team's current checkout using a diff. The local and production ResumeSheet versions have different page wrappers. Use the production snapshot for the existing deployed UI; integrate the local A4ResumePages, ResumeSheet and ResumeModal together when releasing pagination. Review `app/actions/storage.ts` separately for the deletion release.

The ZIP is a source snapshot, not a standalone runnable app or a Git patch. It should be applied to an existing compatible checkout. Existing dependencies/configuration and unrelated UI code remain the team's responsibility.

GitHub collection branch: [docs/resume-ui-handoff-20261010](https://github.com/jobnex/jobnex/tree/docs/resume-ui-handoff-20261010).

Reviewable source files: [source-snapshots/2026-10-10](https://github.com/jobnex/jobnex/tree/docs/resume-ui-handoff-20261010/docs/ui/source-snapshots/2026-10-10).
The same three folders (production-web, local-app and profile-service) are unpacked there.
TypeScript/TSX source snapshots use a .txt suffix to avoid being included in the application TypeScript build. Remove that suffix when integrating, or use the ZIP, which retains the original file names.
Use this branch's latest handoff snapshot rather than assuming an earlier PR contains these follow-up fixes.
The ZIP is available in the branch at docs/ui/resume-ui-code-handoff-2026-10-10.zip.
The publication record in docs/ui/GITHUB-PUBLICATION.md identifies the verified commit and draft PR after publication.

## Shared files and integration contract

Local app root:
`archive-review-20261008/app-source/my-app/`

| File | Responsibility |
| --- | --- |
| `lib/resume-parser.ts` | Title/contact separation, inline formatting cleanup, education parsing and edit serialization. |
| `lib/resume-contacts.ts` | Contact extraction, URL deduplication and header preservation. |
| `lib/resume-content.ts` | Normalization and preservation across structured data/Markdown. |
| `components/ResumeSheet.tsx` | All four template layouts and wrapping. |
| `components/ResumeModal.tsx` | Local page-count display, preview modes and A4 print behavior. |
| `components/A4ResumePages.tsx` | Local A4 pagination and page numbering. |
| `app/actions/preferences.ts` | Preserve extra contact fields during partial saves. |
| `lib/db/schema/preferences.ts` | Allow supplied additional personal details. |
| `app/actions/storage.ts` | Local safe delete/replacement behavior. |
| `data/resume-templates.ts` | Current template catalog and saved-alias compatibility. |

Profile service root:
`resume-backend-release/services/job-hunt-profile/`

Relevant files: `scripts/resume_to_json.py`, `service/contacts.py`, `service/resume_content.py` and `service/main.py`.

Keep contact extraction/normalization aligned between frontend and profile service. Avoid restricting contacts to a fixed phone/email-only schema. Titles belong in the title field. Template styling must preserve the complete parsed content.

Refreshing an existing draft applies the preview parsing fixes. A draft generated before its missing source contacts were repaired needs regeneration to obtain those contacts. Downloaded raw Markdown retains historical draft content until it is edited/saved or regenerated.

## Production revisions

| Service | Last verified active revision | Traffic |
| --- | --- | --- |
| Web UI | `job-hunt-web-heading-fix-1010` | 100% |
| Profile extraction | `job-hunt-profile-heading-fix-1010` | 100% |
| Resume worker | `job-hunt-resume-worker-gemini-flash-1010` | 100% |

The `neondb-trial` web preview tag points to the heading-fix web revision.

Web build: `b5aa89ff-b7ee-4ef6-84c3-9b053bc8f971`.
Profile build: `538f0145-8a9e-4a48-9dae-37369d75c45a`.

The worker now uses synchronous `google/gemini-3.8-flash` for writing as well as analysis/review. LangSmith records configured models, tokens and costs in `resume-builder-gcp`, with resume/JD content hidden. This backend change introduces no new UI controls. App request statuses still reflect the background job lifecycle; synchronous model calls do not remove application dispatch or processing time.

## UI-team acceptance checklist

Complete browser QA on all four templates before declaring final visual sign-off:

- Check short and long names, a pipe-separated title, long company names and long URLs.
- Confirm a single LinkedIn entry, no email username displayed as a website and no literal Markdown markers.
- Verify multiple emails/phones, portfolio links, addresses and additional supplied details survive editing.
- Confirm company/role/date rows wrap without overlap or horizontal overflow.
- Confirm degree and graduation date appear and survive editing.
- Check view, visual edit, Markdown mode and exported PDF.
- For the pending A4 release, check one-, two- and three-page resumes at multiple zoom levels; include every bullet exactly once and keep headings associated with following content.
- Check narrow viewports. The supplied screenshot showed the page-count pill near the toolbar and a review warning over the lower page; verify these do not cover controls or obstruct the document. A dedicated overlay-spacing correction has not been implemented.
- For the pending delete release, verify idle deletion, blocked deletion during generation, error display, file-state refresh and replacement upload.

Additional recommended UI work, not implemented:
- Give expired/unavailable uploaded-PDF previews a clear retry/reload state. Distinguish an expired preview URL from a missing attachment; do not label both as a missing base resume.
- Display unsupported image-only resume extraction errors clearly.
- Consider exposing additional contact fields in dedicated editing controls if product design requires them; data preservation is already implemented.

## Verification and limits

Completed: 11 profile/extraction regression tests; synthetic and actual-draft server-rendered checks for all four themes; contact and education round trips; full local TypeScript checks; successful final production Next build; production traffic/revision verification.

Browser visual QA was unavailable under the earlier browser URL restriction. Server-rendered checks establish content preservation and formatting cleanup, not pixel-level alignment.

A4 preview and deletion have local verification from their implementation work, but are not in the current production web release. Perform the integration checks above when releasing them.

This document and source snapshot are the handoff artifacts. GitHub publication backs up the files; it does not release the pending A4 or deletion changes to production. No message has been sent to the UI team.

Supporting engineering reports:
- `resume-quality-review/contact-fix-report.md`
- `resume-quality-review/heading-fix-report.md`
- `resume-quality-review/gemini-migration-report.md`


## Reliability release follow-up

See [resume-reliability-2026-10-10.md](resume-reliability-2026-10-10.md) for the deployed timeout/schema recovery and failure/retry UI. Collect its 13 changed source files from source-snapshots/2026-10-10-reliability or resume-reliability-code-2026-10-10.zip. Earlier immutable collection links still identify the previous heading release.


## Reasoning-budget follow-up

See [resume-token-budget-2026-10-10.md](resume-token-budget-2026-10-10.md) for the subsequent deployed worker fix. Gemini writing uses low reasoning and a 32000 completion ceiling; fitting failures retain prior drafts as needs_review. Collect the five worker/test files from source-snapshots/2026-10-10-token-budget or resume-token-budget-code-2026-10-10.zip.
