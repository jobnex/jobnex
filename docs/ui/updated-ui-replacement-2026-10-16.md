# Updated UI replacement — October 16, 2026

The repository root now contains the current UI supplied as `my-app(4).7z`. Use the root application source for the next frontend deployment. Do not apply the older UI overlay archives over this version.

## Source and scope

- Source archive SHA-256: `787341683e97d3681b1b7f010e1efc8ab7b2e4cc3de82abcc9ee405b7d1da244`.
- GitHub branch: `docs/resume-ui-handoff-20261010` in `jobnex/jobnex`.
- Current UI source: `app/`, `components/`, `data/`, `lib/`, `public/`, `store/`, `types/`, and root package/configuration files.
- The active localhost application was replaced in place. Superseded local source files and its previous Next build cache were removed.
- Obsolete root UI files, old styling scripts, and nine previous UI source bundles under `docs/ui/` were removed from the current branch. Earlier versions remain available in Git history.
- Historical written handoffs remain as records. This document supersedes their instructions to copy UI overlay files. Older examples under `project_docs/` are reference material, not application source.
- Backend service directories and GCP deployments are unchanged. Existing backend API handlers absent from the UI archive are retained in GitHub from the latest backend release, rather than deleted as UI files.
- No secret was rotated and no service endpoint was changed. Existing local private environment configuration was preserved and excluded from Git.

## New UI retained

The update includes the Jobnex branding and icons, responsive header/search controls, mobile navigation and profile view, revised job/application cards, loading placeholders, filtering controls, and the updated resume modal layout.

## Safety integration retained during replacement

The archive predates several verified fixes. Installing it unchanged would restore unsafe historical draft reads and break saves against the deployed immutable generation guard. These fixes are included in the current source:

1. `app/actions/tailored-resume.ts` loads only publishable owned generation results, prefers saved manual edits, and retains safe request-status handling.
2. The manual-edit save uses the deployed `{markdown, templateId, savedAt}` audit contract and a transaction; original generated text and audit data remain preserved.
3. `app/actions/resume-applications.ts` and the background request list filter draft content through the database publication predicate; failed/pending requests do not expose retained raw generation text.
4. Listing applications no longer writes old generation text back into saved resumes. Application-stage changes require an owned request and a valid stage.
5. The corrected resume parser, contact handling, and physical A4 pagination are retained inside the new modal design. Four template mappings remain supported.
6. `components/ResumeModal.tsx` sends the current Markdown and generation identifier to the app server for PDF compilation. It does not reuse an old export link or silently fall back to browser printing when backend export fails.
7. `/api/resume/base` remains available for backend PDF formatting without a job. Generated-job export accepts owned publishable generations before an application is submitted.
8. `lib/job-resumes.ts` retains publication checks, generation fencing, upload verification, and transactional save behavior.
9. Existing base-resume contact/section preservation, upload/delete fixes, wallet behavior, and curated-job matching/history fixes are retained.
10. The candidate-specific local compile payload was removed from the GitHub source. Dependencies, build caches, bundled Git metadata, credentials, and diagnostic artifacts were not imported from the archive.

## Verification

- Updated localhost source: TypeScript passes and the default Next.js production build succeeds.
- GitHub UI source: TypeScript passes with backend and historical documentation excluded from UI compilation.
- `node scripts/test-ui-replacement.cjs` passes against both local and GitHub source. This offline check covers contacts/employers/projects across all four template renders, nested heading cleanup, A4 boundary logic, hidden failed drafts, saved-edit precedence, read-only application listing, and the current-Markdown backend export request.
- The running localhost homepage displays live job results and the new Jobnex controls.
- Opening My Applications without a session redirects to the authentication page, as expected.
- This replacement does not include a new paid resume generation or a signed-in account walkthrough. The current browser has no authenticated session. The checks above are not a claim that every customer flow was retested.

## UI team deployment

1. Use the repository-root UI from this branch/commit. Do not copy older release overlays over it.
2. Install from `package-lock.json`, provide the existing private server environment through your hosting platform, and run the build.
3. Deploy the frontend and its Next server handlers together on the UI team's hosting. No GCP UI deployment was performed.
4. Verify signed-in Manage Job Hunt, Applications, manual editing, all four template previews, and backend PDF exports before customer rollout.
5. The supplied design still contains placeholder footer destinations and legacy wording in the authentication consent text. Confirm the intended legal/contact destinations and wording before publishing to customers.

The old UI remains recoverable from the preceding Git commit and a private local rollback snapshot. No customer resume, wallet, request, or preference rows were changed by the replacement checks.
