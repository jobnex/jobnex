# Follow-up: new resume skills and domains were hidden by old draft preferences

This follow-up is included in the latest patch and UI source on branch `release/resume-layout-20261021`, after the initial backend-release commit. Use the current branch patch, not the initial release ZIP, for this correction. Production Vercel deployment remains assigned to the UI team.

## Cause

The resume parser returned new details and the import transaction wrote inferred matching preferences. However, `getUserJobPreferences()` restores unconfirmed `manualEdits` over those fields when loading the form. The upload transaction had preserved those older draft fields, so the form displayed the old skills, empty domains and old experience despite the correct extraction.

The upload server also replaced canonical backend skill names with naive comma-split resume prose, producing fragments inside parenthesized technology lists. Inferred title labels retained Markdown markers and could omit experience role titles. Finally, toggling Autofill back on depended on an obsolete session-storage extraction cache that the new upload flow clears.

## Fix

- `lib/resume-imports.ts`: when Autofill is on, merge the new inferred fields into both the saved preferences and their draft overlay in the same activation transaction. Preserve unrelated draft fields such as salary/job types. When Autofill is off, retain existing matching selections.
- Use the backend's canonical skill array. Build clean, deduplicated domain labels from inferred domains, the resume headline and parsed experience roles; normalize `Senior-level` to the UI's `Senior` value.
- Persist normalized inferred preferences with the active resume details, including when Autofill is off, so enabling it later has the current source available.
- `app/(main)/job-hunt/manage/page.tsx`: hydrate the Autofill cache from the active saved resume, not stale session storage. Empty inferred lists clear stale selections rather than silently retaining the previous resume's lists.

These are UI application/server-layer changes. They do not require a new GCP validator image or a database migration. Existing endpoint URLs and layout rejection rules remain unchanged.

## Integrate

Apply the latest cumulative `ui-handoff/latest-ui.patch` against the original supplied `my-app(4)` source, resolving conflicts if the UI has changed. If the initial patch was already applied, adopt the two updated files above and the regression updates in `scripts/check-import-database.cjs` and `scripts/check-autofill-regressions.cjs` from the current branch.

The PostgreSQL regression exercises activation with stale top-level and draft values, checks canonical skills/clean labels and normalized seniority, preserves unrelated preferences, verifies transaction rollback, and confirms Autofill-off preservation. Browser verification reuploads the supplied supported PDF and checks the updated form and saved preferences. No private fixture content or account information is published here.
