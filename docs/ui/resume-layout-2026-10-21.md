# UI team: latest resume upload and generation integration

The latest branch patch also includes the [autofill follow-up](resume-autofill-followup-2026-10-21.md), which prevents old drafts from hiding newly uploaded skills/domains/experience. If the initial patch is already integrated, adopt that follow-up's two changed runtime files. The initial release ZIP predates this follow-up.

Use branch `release/resume-layout-20261021`. The latest supplied UI is **`ui-handoff/my-app/`**, based on the user's `my-app(4)` archive. Do not replace it with the older application at repository root; root remains the GCP backend service source.

## What to pick

Preferred: integrate the complete `ui-handoff/my-app` source into the team's current UI, preserving unrelated work and private environment bindings. `UI-FILES.sha256.json` lists every delivered file and hash. The UI ZIP contains this same source, documentation, exact pickup manifest and patch. The source snapshot is authoritative; do not mix copies from older ZIPs or investigation folders.

For a selective integration, start with `ui-handoff/UI-PICK-FILES.json`. Apply `ui-handoff/latest-ui.patch` only against the original supplied `my-app(4)` source. On an independently changed UI, adapt the files below and review conflicts; never force an incompatible patch.

| Area | Files relative to the UI root | Required behavior |
| --- | --- | --- |
| Compact upload UI | `components/ResumeImportPanel.tsx`, `app/(main)/job-hunt/manage/page.tsx` | Existing filename/Preview/delete/Autofill layout; drag/drop or click upload; automatic validation and activation; concise rejection |
| Browser upload signing | `lib/hooks/useR2Storage.ts`, `app/actions/storage.ts` | PDF-only, 10 MiB, owned temporary prefix; no direct activation; safe preview/delete |
| Validation/activation server route | `app/api/job-hunt/profile/route.ts`, `lib/resume-imports.ts`, `lib/profile-service.ts` | Session authentication; signed backend validation; ownership/file hash/revision/baseline checks; atomic activation; friendly missing-schema response |
| Admission and safe preferences | `lib/resume-admission.ts`, `lib/resume-upload-policy.ts`, `app/actions/preferences.ts`, `app/actions/tailored-resume.ts` | Reject unvalidated generation, server-controlled active source, no filename resurrection from draft preferences, new backend URL |
| Resume fidelity | `lib/resume-parser.ts`, `lib/resume-validation.ts`, `lib/resume-review.ts`, `components/ResumeSheet.tsx`, `components/ResumeModal.tsx` | Preserve roles/dates/sections/project text, existing editor/review/export guards |
| Export/application fixes | `app/actions/resume.ts`, `app/actions/resume-applications.ts`, `app/api/resume/export/route.ts`, `app/(main)/job-hunt/applications/page.tsx`, `store/useResumeStore.ts` | Retain the preceding generated-resume/editor/export fixes included in this handoff |
| Configuration | `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `.gitignore`, `.env.example` | Separate local dev/build outputs, allow loopback dev resources, exclude scratch artifacts, keep credentials private |
| Schema/operations | `drizzle/strict-resume-imports.sql`, `scripts/cleanup-resume-imports.cjs` | Full admission trigger only at coordinated UI cutover; hourly 24-hour cleanup after dry-run |

Do not copy local-only startup scripts or a developer `.env.local` into Vercel. The local Python validator on port 8081 was for development only. Production uses the versioned GCP profile service described in [endpoints](resume-layout-endpoints-2026-10-21.md).

## Interface contract

The only routine browser action is select/drop a PDF. The client uploads privately to a staged key, calls the UI server's preview operation, and automatically confirms the accepted result. A rejected upload shows the format message and preserves the previous resume. There is no separate validation button, template-navigation button, extracted-Markdown editor or accuracy checkbox in the compact card. The existing four-template section and Autofill toggle remain.

Click the current filename to replace it. Preview opens the original owned PDF. Delete removes the active base/reference/details; a refresh must show the empty upload area. Current resume metadata always comes from the authoritative active record, after any saved draft-preference merge.

The server must enforce validation even if a client sends a direct request. A PDF extension, template name or extracted text alone is insufficient. Authentication, key ownership, file byte hash, expiry, source content hash and draft revision checks are mandatory and must not be removed during UI adaptation.

## Environment and deployment

Set `JOB_HUNT_SERVICE_URL=https://layout-v1---job-hunt-profile-znsph25yja-ue.a.run.app` and `JOB_HUNT_WEB_URL=https://layout-v1---job-hunt-web-znsph25yja-ue.a.run.app` on the Next.js server. Existing explicit environment overrides take precedence over the delivered defaults; update old overrides. Preserve all private database, R2 and Neon Auth bindings. No new credentials are included in this handoff.

Follow the coordinated sequence in [the release document](../releases/resume-layout-2026-10-21.md). Backend URLs are deployed for this UI version; the existing Vercel production UI is not updated by GCP deployment. Global rejection of legacy source versions is intentionally deferred until the new upload UI is live. The prepare migration has already installed the proof function/column; the strict migration enables its final generation trigger.

## Required UI acceptance checks

1. Upload a conventional single-column PDF; verify successful filename, original preview and extracted details persisted on reload.
2. Try Shivangi/Ria-style columns, Word, scan, encryption/corruption and over-10-MiB files. Show the appropriate error and retain the accepted active source.
3. Verify all four app-template PDFs, ordinary right-aligned dates and multipage single-column PDFs remain accepted.
4. Delete an active source and reload; it must not reappear from `manualEdits` or cached extraction. Do not delete historical generated outputs.
5. Test interrupted and concurrent uploads; stale/hash-changed candidates cannot activate. Confirmed source admission must precede credit reservation, and saved worker requests must retain their import proof.
6. Verify existing generator/editor/PDF export fixes, task tracking and owned historical downloads. Use existing session auth; never put server credentials in browser fetches.

No check suite can guarantee that every future PDF will parse correctly. Keep conservative rejection and the regression fixtures when editing the validator.
