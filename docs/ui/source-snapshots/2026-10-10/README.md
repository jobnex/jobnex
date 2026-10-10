Resume UI source handoff — 2026-10-10

Read resume-ui-handoff-2026-10-10.md for behavior, deployment status and QA.

production-web/: source overlay matching the deployed heading/contact release.
local-app/: latest local implementation, including A4 pagination and safe delete.
profile-service/: upload/contact extraction support.

These are selected source files, not a complete runnable application or Git diff.
Merge into the matching existing checkout; compare before replacing files.
Production and local ResumeSheet page wrappers differ. Integrate local
A4ResumePages + ResumeSheet + ResumeModal together for the pagination release.
Integrate local app/actions/storage.ts separately for the deletion release.
Do not overwrite newer unrelated team changes.

GitHub backup branch: docs/resume-ui-handoff-20261010 in jobnex/jobnex.
Reviewable copies are under docs/ui/source-snapshots/2026-10-10.
This publication does not deploy the pending A4/delete changes.
SHA-256 digests in manifest.json identify the exact collected file contents.
No secrets, environment files, private resumes or dependencies are included.
