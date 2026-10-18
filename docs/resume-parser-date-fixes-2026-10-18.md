# Resume upload parser and date preservation fixes — 18 October 2026

## Problem and root causes

The R2 import path discarded every extracted employment date when it built the editable `experienceHistory`: both `startDate` and `endDate` were assigned empty strings. A later form save therefore removed dates from the Markdown used as generation input. Education was also flattened into one `college` string, leaving degree and date fields blank. The model cannot reliably recover facts that are absent from its input.

PDF extraction had a separate reading-order problem. Parallel columns, section-label gutters, stacked employer/title/date rows, and text with embedded font spacing could mix unrelated content or miss roles. One supplied PDF also triggered a division-by-zero error in the previous pypdf layout extraction.

## Each fix and why it exists

| Fix | Reason | Code to collect |
| --- | --- | --- |
| Read visible PDF word coordinates with pdfplumber | Keep columns and continuation-page role groups together instead of flattening unrelated lines | `services/job-hunt-profile/service/pdf_layout.py`; `scripts/resume_to_json.py` |
| Preserve plain text before attempting legacy pypdf layout extraction | A failed layout pass must not discard text already extracted | `scripts/resume_to_json.py` |
| Parse inline, standalone, stacked, and title-below-date employment headers | Keep each employer, role, and source-provided date together | `service/document_structure.py` |
| Populate editable employment dates from the extracted date string | Prevent form mapping/autosave from blanking job dates | `service/document_structure.py`; `service/main.py` |
| Separate school, degree, dates, grade, and notes | Prevent graduation dates or grade text from being treated as the university/degree name | `service/document_structure.py` |
| Recognize education cards before the first section heading | Some resumes put multiple qualifications in the header area | `scripts/resume_to_json.py` |
| Join institution-name continuations | A wrapped university name must not become a second education entry | `service/document_structure.py` |
| Emit canonical education and employment Markdown | Existing UI and downstream generation must agree about company and date fields | `service/resume_content.py` |
| Deduplicate phone formats and exclude degree abbreviations from bare-domain detection | Avoid duplicate contacts and false links such as degree abbreviations | `service/contacts.py` |
| Pin pdfplumber and include helpers/regressions in the image | Make production use the tested extraction code | `service/requirements.txt`; `Dockerfile`; `service/test_document_structure.py` |

Paths in the last column are relative to `services/job-hunt-profile/` unless fully prefixed.

## Verification

Four user-supplied text PDFs were individually selected through the real file chooser in localhost **Manage Job Hunt**, replacing the active resume each time. Persisted `user_pref_resumes.parsed_data` and `content` were inspected after each extraction, not merely the upload badge. Source PDFs were inspected privately; files and contact data are excluded from this repository.

| Fixture | Employment entries | Education entries | Source date handling |
| --- | ---: | ---: | --- |
| A: two-page, parallel work-history columns | 12 | 3 | Employment dates retained; education dates absent in source remain blank |
| B: section-label gutter and metadata/narrative columns | 6 | 1 | Employment dates and incoming-season date retained; no invented education dates |
| C: sidebar and main work-history column | 4 | 2 | Employment dates and both education ranges retained separately |
| D: single-column resume | 3 | 1 | Single employment date, ranges, and education dates retained |

The final source was rechecked offline after the follow-up grade and title-below-date fixes. The existing localhost TypeScript `parseResumeMarkdown` passed company, employment-date, institution, and education-date assertions for all four normalized outputs and the account owner's original resume. These checks exercise the shared parser contract; they are not a new visual audit of every template.

The original PDF was restored through the UI. Its downloaded bytes were verified against the private backup SHA-256. Original job preferences were restored while retaining corrected parsed details and the newly uploaded object reference. The UI displayed **Changes saved** after confirmation.

Local content/contact/structure regressions: **15 passed**. Final container main/content/structure regressions: **15 passed**. These suites overlap; do not add the two counts together. The original resume regression verifies two titled employment entries with date ranges and a graduation date separate from its institution.

## Backend release

Only the profile backend was deployed. Final revision: `job-hunt-profile-parser-dates-v4-1018`, serving 100% of traffic, including the existing `app-fixes-qa` tag. Image digest: `sha256:23cffbbe55d6f1e203647455a6ee25b9283eeeea4ccb161d125bc5031b733f73`. Cloud Build: `36ba609c-666e-4328-b2d2-185067fa7715`.

The runtime configuration hash matches the pre-release configuration: environment/secret references, command, arguments, resources, service account, concurrency and timeout are unchanged. Existing service URLs and authentication contracts are unchanged. No database schema, IAM grant, secret rotation, model change, PDF compiler change, or frontend production deployment was made for this parser fix.

## UI team handoff

Collect backend code from branch `fix/resume-background-credits`, scoped to `services/job-hunt-profile/`. The UI team does **not** need to copy Python code into the frontend. No frontend file changed in this work. Integrate the existing profile responses using these fields:

- Employment: `experienceHistory[].company`, `role`, `startDate`, `endDate`, `jobDescription`.
- Education: `educationHistory[].college`, `degree`, `field`, `startDate`, `endDate`, `grade`, `maxGrade`, `gradeType`, and optional `details`.
- Preserve date strings as supplied, including year-only, `Present`, and incoming-season dates. A month picker must not silently erase an unrecognized but source-backed value. Do not invent missing dates.
- Keep dates out of `college`. Keep grades out of `degree`. The existing form supports separate grade fields; source wording such as CPI remains in education notes.
- Read the authoritative saved profile after extraction. An uploaded-file badge alone does not prove parsing succeeded. Show extraction failure distinctly from upload success and provide retry.
- Distinguish `failed` from `needs_review`; a reviewable draft must remain accessible. Historical failed/quarantined requests must not be relabeled successful.

Canonical Markdown remains compatible with the current UI parser:

```markdown
## Education
**Example University** —
*Master of Science* | March 2026

## Experience
### AI Engineer
**Example Company** | Sep 2024 – Present
- Source-backed work description.
```

Frontend follow-up recommended: replace misleading “extracting via AI” copy for this deterministic parser; support replacing a resume without a delete-first workflow; and improve gap-analysis keywords, which currently include job-description boilerplate in the NTT test. These are recommendations, not frontend changes delivered here.

## Historical generation failures and limits

The earlier NTT DATA request failed factual checks, including numeric annotations; the already deployed metric-literal repair is documented in `resume-metric-literal-fix-2026-10-18.md`. Its failed credit was released. The subsequent pre-parser-fix request produced a reviewable draft but still had no dates in its source and exceeded the per-role bullet-count target. Historical statuses and factual safeguards remain intact.

Previously saved drafts are not silently rewritten when the base resume is repaired. A new generation must use the corrected source. The final approved live generation result is recorded below after completion.

This is a verified improvement for the supplied documents, not a guarantee for every possible PDF layout. Image-only PDFs remain unsupported. Unusual columns, missing/ambiguous source facts, dense paragraphs, or semantic fields still require review. This work does not certify the entire app as free of P1 or security issues.
