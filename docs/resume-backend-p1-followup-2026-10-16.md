# Backend resume P1 follow-up — October 16, 2026

This follow-up covers remaining resume backend dispatch, recovery, publication, storage/export and authenticated server-adapter paths. It builds on [the first four fixes](resume-provenance-p1-audit-2026-10-16.md). It is not an application-wide or penetration-test certification.

## Additional confirmed failure paths

| Finding | Reproduction and impact | Fix |
| --- | --- | --- |
| P1-05: exhausted dispatch retains credit | Set a queued request's outbox attempts to ten in the worker mock. Recovery only logged the condition; request remained queued and its credit held with no further eligible dispatch. | Recovery atomically fails/releases exhausted queued requests and refunds once. The expected queued state and null-safe lease comparison prevent refunding a concurrently running request. |
| P1-06: partial synchronous cache treated as a pending batch | Expire a running lease with cached synchronous provider responses and no verified final generation. The old recovery query considered any cache row durable and requeued the pipeline, including uncertain paid-call recovery. | Only a submitted, identified batch with no response and age below 48 hours is resumable. A verified final output still settles without another AI call. An expired synchronous attempt without verified output fails/releases instead of replaying paid stages. |
| P1-07: alternate publication paths bypass factual quarantine | The Rust generated-draft query selected by generation status without checking the owned request or audit. Saved caches and immutable preview IDs were separate paths. The same raw query can still select historical generation text after its request is quarantined. | Shared database read guards require matching request/generation ownership, job/base context, settled status, audit identity/hashes and valid factual checks. Rust generated/saved reads, preview, save, old artifact downloads and export enforce them. Next server adapters use the same guards. Original history/PDF objects are preserved. |

These are related backend failure paths, not three independent app-wide incidents. The earlier four attribution, validation, unsafe-settlement and manual-edit fixes remain in place.

## Publication policy

`services/resume-tailor/migrations/20261016_resume_publication_guard.sql` adds two SECURITY INVOKER functions. They do not grant table access, alter IAM, or rewrite customer data:

- `resume_generation_is_publishable(uuid,text)` validates a generation against its owned request, original audit and the compliance ledger. An absent, malformed or empty ledger fails closed. Only explicitly enumerated presentation failures remain reviewable. A factual failure cannot be exported merely because its generation status says `needs_review`.
- `resume_saved_markdown_is_publishable(text,uuid,text)` rejects a saved/preview copy matching rejected provenance. The newest matching generation is authoritative, so a newer verified generation is not permanently blocked by an older failure with identical text. Explicit new manual text with no matching generated history remains supported; this function does not claim to fact-check arbitrary user edits.

Reviewable codes remain `length.word_count`, `length.fit_unavailable`, `experience.bullet_count`, `projects.bullet_count`, `projects.purpose_order`, `skills.category_count`, `experience.metric_count`, and `projects.metric_count`.

Known unsafe artifact access returns HTTP 409. An unavailable or unowned generated result remains unavailable; no protected text is returned. The Rust service retains export before creating an application when the user owns a publishable generation. That existing deployed authorization behavior was missing from the older Git backup and was preserved after inspecting the original Cloud Build source.

## Code to collect

Backend branch: `fix/resume-background-credits` in `jobnex/jobnex`.

- `services/resume-tailor/worker.ts`: exhausted dispatch settlement and bounded pending-batch recovery.
- `services/resume-tailor/migrations/20261016_resume_publication_guard.sql`: shared publication functions; apply before deploying callers.
- `services/resume-pdf-backend/src/store.rs`: generated/saved read guards and atomic export/save checks.
- `services/resume-pdf-backend/src/main.rs`: preview/artifact checks, including old preview IDs.
- `scripts/test-resume-settlement.ts`, `scripts/test-resume-publication.py`, and `services/resume-pdf-backend/tests/smoke.mjs`: regression controls.
- `lib/resume-tailoring.ts`, `lib/job-resumes.ts`, `app/actions/tailored-resume.ts`: server adapters hosted alongside Next. These are backend code, but their production release belongs to the UI hosting owner under the agreed deployment split.

The localhost server adapters were updated without changing any UI component. The UI handoff includes a current localhost source overlay, preserving its later manual-edit/current-generation guards. Integrate that overlay after the previous October 16 template/PDF overlay. Do not replace newer application code with the older baseline server action merely to collect the small SQL predicate changes.

## Verification

- Full offline Python suite: 219 tests and 82 subtests passed; no paid provider calls.
- Rust unit tests: seven passed, including escaping, content/ranges and compiler timeout.
- Rust API smoke: all four actual templates, ownership/authentication, revision conflict, restart/shared storage, exact PDF bytes, corruption control, direct edits, and blocked saved/artifact/preview/export paths passed with synthetic local data.
- Worker settlement/recovery mocks: usable completed/review settlement, unsafe-output refund, duplicate delivery, crash recovery, lease fencing, capacity deferral, exhausted dispatch and synchronous-cache recovery passed.
- Admission and application/background regression scripts passed. Full TypeScript checks passed in the backend checkout and localhost app.
- Thirty real PostgreSQL publication checks use temporary synthetic tables/functions and roll back. Controls cover factual/structural errors, malformed ledgers, owner/job/base mismatch, pending/failed/released requests, safe presentation review and newer identical-text generation.
- The shared guard was checked against the approved account: eight unsafe historical reads rejected and one clean completed result retained. Installing the functions updated no customer row or credit.
- The existing manual-edit database guard passed 46 checks against the deployed definition. One transient PostgreSQL connection closure and a Windows sandbox linker error were resolved by retrying the safe checks in the normal test environment; they are not counted as application defects.

## Deployment evidence

The worker build `a425a177-090a-49d6-b0b4-c9c3f43aa0bc` passed its installed-preimage hash check and actual worker regression suite inside the image. Worker revision `job-hunt-resume-worker-backend-p1-1016` is deployed at 100% with image digest `sha256:9ebb7a743c6dc4324d417067c24c3e65ff56a53080a3e90772944eebd5d9d8de`.

The database publication migration is applied; its installed function bodies and SECURITY INVOKER/STABLE properties match the checked source. Rust backend build `f12c6c6d-18e0-4330-8dee-4520d8521ccd` succeeded after seven release unit tests and the four-template HTTP/storage/quarantine smoke suite inside the image. Revision `resume-pdf-backend-backend-p1-1016` is Ready at 100%, image `sha256:b33d691e60a81cee74033b75441f4ca5a4bec29430ec3f1fe3546c6bfafd57af`. Its existing `neondb-trial` backend alias points to the fixed revision too.

Live authenticated checks: both health endpoints returned HTTP 200; the clean owned generation returned HTTP 200 and its expected generation ID; quarantined output was unavailable; wrong ownership returned 404; an invalid service token returned 401. Backend configuration, secret references, startup arguments and service identities match the previous revisions. Checked worker/Rust source bytes match their build inputs. Wallet remains 10 and there are zero queued/running requests at verification. Original eight generation records and seven earlier refunds remain unchanged.

The frontend remains on `job-hunt-web-curated-fresh-1010` at 100%, with its original tags. The worker's prior revision is `job-hunt-resume-worker-provenance-1016`; the PDF backend's prior revision is `resume-pdf-backend-00003-rir`. A backend rollback must account for the existing backend tag and reintroduces these defects; pause affected operations rather than silently restoring unsafe output. The added database read functions are non-destructive and do not need to be removed for a code rollback.

Frontend traffic remains owned by the UI team. No frontend, profile, matching-service or PDF-compiler deployment is part of this patch. Provider/model, tracing/privacy settings, service identity and secret references are retained. No new paid generation, historical rewrite, application-stage write or additional customer refund was initiated.

## Known limits and UI-hosted server handoff

The prior Rust runtime does not include Arial/Times New Roman. The new backend keeps its previous fonts and template rather than silently changing wrapping. The container smoke test explicitly permits only those known missing-font warnings; compilation failures and other warnings still fail checks. Local tests remain strict when that explicit container setting is absent. Exact browser/PDF font parity remains a layout improvement, not proof of a factual or content-loss P1.

The earlier attempted private GET for the quarantined job returned 404 because that account/job had no authorized application or publishable completed result. Therefore this report does not claim that the live old endpoint returned that private draft. The bypass is established by its deployed query source and synthetic/owned read-policy checks. A positive live check after release confirmed the clean owned generation remains readable.

The UI team must deploy the server-adapter changes along with its UI integration; no permission to deploy the frontend is inferred from this backend task. Existing downloads or already-open browser copies cannot be revoked. A fresh paid LLM generation was not run. The completed checks establish these repaired paths, not the absence of every possible backend defect.

Reproduce the offline checks using the commands in the first audit plus `cargo test --locked` from `services/resume-pdf-backend` and `python scripts/test-resume-publication.py` from the repository root with a privately provisioned `DATABASE_URL`. For the local Rust API smoke, build with `--features local-test` and run `node tests/smoke.mjs` with the existing Typst executable configured. Never run the filesystem test adapter as a production service.
