# Resume printing and template release — 2026-10-10

## User-visible change

Export PDF now isolates the resume from the surrounding application. Print removes fixed positioning, scroll limits, zoom transforms, and the screen-only paper height. One-page content produces one page; longer content remains complete across additional pages. Four distinct template choices remain visible. Saved alias IDs resolve to the same existing backend themes.

Implementation and frontend integration: [UI handoff](../ui-team-resume-print.md).

## Live deployment

- Project: `job-scout-508222`; region: `us-east1`.
- Service: `job-hunt-web`.
- Revision: `job-hunt-web-00033-xod`, ready, receiving 100% traffic.
- Source commit: `fab6bb9f357669f69a1e777ad5ee1e4cbafb7451`.
- Cloud Build: `a2528486-9209-4f55-895b-7a75eeb6ec45`, successful.
- Immutable image: `us-east1-docker.pkg.dev/job-scout-508222/job-hunt/job-hunt-web@sha256:13b0213d2909188e53e3a0e05606f08e70fd4943da7d1c6625e6130748c3cfb4`.
- Verified live at: `2026-10-10T05:59:23.247173+00:00`.
- Default URL: https://job-hunt-web-znsph25yja-ue.a.run.app.
- Runtime environment, secrets, service account and other container settings preserved. Zero-traffic staging preserved existing traffic before promotion. Temporary check tag removed; existing `neondb-trial` tag follows the new revision.
- Worker, profile, PDF backend and compiler services were not redeployed or deleted. No database migration or resume-content rewrite.

## Evidence

The signed-in local preview shows exactly four template options. Offline Chromium printed copies of its captured real markup and complete styles: each of four templates produced one US Letter page without application content. A 200% zoom fixture produced one page with identical extracted text. A synthetic long resume produced five pages including its final marker. A previous-CSS negative control produced three pages including application content. All four normal PDFs were rendered and visually inspected. These checks did not automate the native print dialog.

Both frontend copies passed TypeScript. Focused template/store/modal checks and existing background-generation/application regressions passed. Scoped lint and Git whitespace checks passed. No paid AI generation or credit changes were performed.

Zero-traffic and post-promotion HTTP checks returned 200 for `/` and 401 for an unauthenticated generated-resume request. Backend health checked at `2026-10-10T05:54:35.046591+00:00`: Rust PDF backend online, Typst compiler healthy, and web `RESUME_PDF_BACKEND_URL` matches the deployed backend URL. Compiler `capacity: 4` describes processing capacity, separate from the four theme mappings.

## Compatibility and rollback

Keep backend acceptance of `contemporary-compact` and `standard-overleaf` for existing clients. New selections canonicalize to `modern-ivy` and `mit-capd`, respectively. Theme IDs are 2, 3, 6 and 5.

Previous revision: `job-hunt-web-00030-muv`. Roll back web traffic with:

```powershell
gcloud run services update-traffic job-hunt-web --to-revisions=job-hunt-web-00030-muv=100 --update-tags=neondb-trial=job-hunt-web-00030-muv --region=us-east1 --project=job-scout-508222
```

Rollback changes the web only; no database reversal is needed. The release documentation commit can follow the deployed source commit without changing the image.
