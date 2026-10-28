# UI handoff: certified resume publication

Use **`certified-publication.patch`** after the previously supplied autofill and resume-quality patches. This is the new incremental update. Do not resend the older ZIP. For a fresh integration from the original supplied UI, use the updated cumulative `latest-ui.patch` instead; do not apply both.

```sh
git apply --check certified-publication.patch
git apply certified-publication.patch
npm ci
node scripts/check-certified-publication.cjs
npm run lint
npm run build
```

If application files changed, resolve conflicts against `ui-handoff/my-app`, which contains the updated source files. The patch changes the resume modal and sheet, canonical document/schema adapter, authenticated publication routes, import confirmation, profile response typing, DB URL handling, old export guards, and the portable contract check/fixture. Existing upload layout remains unchanged.

`UI-FILES.sha256.json` hashes the exact repository file bytes. Text files use Git's LF line endings; normalize CRLF to LF when checking a Windows checkout. Binary files are hashed unchanged.

## Server environment

Keep existing database, R2 and Neon session settings. Configure these on the Next.js server:

```text
JOB_HUNT_SERVICE_URL=https://certified-v1---job-hunt-profile-znsph25yja-ue.a.run.app
JOB_HUNT_WEB_URL=https://certified-v1---job-hunt-web-znsph25yja-ue.a.run.app
RESUME_PUBLICATION_SERVICE_URL=https://certified-v1---job-hunt-web-znsph25yja-ue.a.run.app
RESUME_CERTIFIED_PUBLICATION=true
NEXT_PUBLIC_RESUME_CERTIFIED_PUBLICATION=true
RESUME_CERTIFIED_PUBLICATION_STRICT=false
```

`NEXT_PUBLIC_RESUME_CERTIFIED_PUBLICATION` is a build-time switch; rebuild when changing it. Every other setting above is server-only. Do not expose PDF service credentials or worker credentials to the browser. Vercel forwards the verified session cookie to GCP; GCP obtains IAM identities for its private services.

Keep strict enforcement false until production integration passes and the backend owner performs the coordinated cutoff. The new publication route itself always fails closed, even during this transition. Legacy generation remains available through its existing contract.

## Expected behavior

- Upload validates layout and exact PDF evidence before replacing the active source. Unsupported uploads retain the current source. Confirmed source corrections require another validated PDF.
- Preview shows the certified PDF bytes. HTML is used only for structured editing. The client verifies the returned PDF SHA-256.
- Saving or selecting a template creates a new document revision, clears the displayed PDF and disables download until checks pass again.
- Identity, contacts, employers, dates, education and atomic skills remain protected. Titles and text edits must be backed by their source evidence. Unknown wording remains a saved blocked draft.
- There is no “approve anyway” action in the certified path. A failed or unavailable check cannot be bypassed by manual review.
- Download fetches the authenticated artifact endpoint again; it does not reuse an old link or blindly download a cached preview.
- Historical generations stay visible. Old unvalidated artifacts require source revalidation and a new generation before certified download.
- Validation/preview retries reserve no additional credit. Existing review-draft charging stays unchanged.

## Endpoints and integration checks

Use `/api/resume/publication` for document/status, save and preview. Use `/api/resume/publication/{artifactId}/pdf?jobId=UUID` for inline bytes and append `&download=1` for download. Full request/response schemas, private endpoints and rollback instructions are in `docs/releases/certified-publication-2026-10-22.md`.

Before requesting strict cutoff, verify a fresh supported upload, inferred skills/domains, generation, all four templates, multi-page text, source-backed edits, rejected invented claims, simultaneous tabs, failed validation/renderer requests, and identical preview/download hashes. Confirm old sources prompt revalidation and failed uploads preserve the active source. Report the deployed Vercel URL and test results to the backend owner. The final cutoff must also retire old export URLs/deployments and allow previously signed storage URLs to expire.
