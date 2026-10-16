# Backend publication guard: server adapter overlay

Apply after `resume-template-20261016/local-app/` and the previous application reliability bundles. These files run on the authenticated server; no client component changed in this follow-up.

`server-adapters/` preserves app-relative paths. `manifest.json` records hashes and collection origins. The two localhost files retain its later manual-edit, current-generation and PDF persistence guards. `lib/resume-tailoring.ts` is the backend's shared admission/result helper; integrate it where your generated-resume API imports that helper. Do not add a second admission path to a frontend that already uses its own server adapter.

Before releasing these callers, apply `services/resume-tailor/migrations/20261016_resume_publication_guard.sql` from backend branch `fix/resume-background-credits` to the same database. It is already applied on the checked GCP backend database. The functions add read validation without changing customer rows or granting table access.

Backend source and migration are pinned at commit `23ecf3845730e26d767d0041114ec66c773fc0e8`. Error codes to handle include `dispatch_exhausted` and `interrupted_attempt_no_verified_output`; both failed attempts release their held credit. Preserve authoritative server balances and explicit user retries. Known unsafe Rust PDF artifact/preview/export access now returns 409; show the returned explanation and do not retry through a raw storage URL.

The server changes enforce:

- A usable compliance ledger, matching owned request/generation, settled request and original audit before returning generated text or `has_draft=true`.
- Rejection of a known unsafe saved Markdown mirror, including export/save attempts that would make it available again.
- Existing current-generation fencing, ownership, read-only history and immutable original audit evidence.

No new public environment variable, client credential, provider call or automatic generation is required. Keep the existing secure server compiler/R2 configuration. UI-hosted server deployment belongs to the UI team; the backend agent did not deploy GCP frontend traffic.

Acceptance: authenticate as the owner, verify a clean completed draft opens, a quarantined draft does not, a newer verified identical-text draft remains usable, and credits do not change while loading. Verify stale saves, ownership and real PDF persistence using authorized synthetic data. Never bypass these checks by reading raw generation status or a legacy cache alone.
