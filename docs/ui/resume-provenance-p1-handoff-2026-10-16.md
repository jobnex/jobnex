# Resume provenance P1 repair: UI team handoff

Complete explanation of all seven fixes, why each was necessary, source files, verification, and unchanged secrets/endpoints: [consolidated backend fix documentation](https://github.com/jobnex/jobnex/blob/0edc4a095d9cec327f72a5e71206390dc97e55ad/docs/resume-backend-fixes-consolidated-2026-10-16.md). Existing service/tag URLs and environment/secret references were rechecked against pre-release revisions on October 16. No credentials are included in the document.

> Latest backend follow-up: three additional dispatch/recovery/publication failure paths were repaired. The worker is now `job-hunt-resume-worker-backend-p1-1016`; the Rust PDF backend is `resume-pdf-backend-backend-p1-1016`, both Ready at 100%. Collect the [server-only publication overlay](releases/resume-backend-20261016/README.md) after the earlier template overlay. This includes authenticated server code hosted with the UI; its production deployment remains with the UI team. No new client component was changed. Revision/source statements below describe the earlier four-fix release unless updated by this note.

Latest backend source: commit [`23ecf3845730e26d767d0041114ec66c773fc0e8`](https://github.com/jobnex/jobnex/commit/23ecf3845730e26d767d0041114ec66c773fc0e8). Read the [backend follow-up report](https://github.com/jobnex/jobnex/blob/23ecf3845730e26d767d0041114ec66c773fc0e8/docs/resume-backend-p1-followup-2026-10-16.md) for reproduction steps, migration, release evidence and limitations. The publication SQL is already installed. Live backend checks passed clean-result access, unsafe-result denial and wrong-owner/token rejection. Localhost opens the clean draft and retains balance 10. No additional credit refund or paid generation was performed.

October 16, 2026. Read this together with [the template/PDF overlay](resume-template-repair-2026-10-16.md) and [the application integration handoff](app-fixes-handoff-2026-10-10.md).

## What changed

The missing second employer came from backend source grouping. The uploaded source contained the employer, but role headings and unbulleted responsibility paragraphs were merged incorrectly. Fallback could attach facts to the wrong job. Global employer-presence checks missed swaps between jobs. Factually failed output was still publishable and billable as `needs_review`.

Those three backend defects are repaired. A fourth P1 was found during database verification: the immutable-history trigger rejected the `manual_edit` writes used by Save and PDF export. A strict database migration now permits only that separate working-copy object and preserves every original column/audit field. It also prevents the deleted-base exception from allowing unrelated changes.

The backend worker is live on `job-hunt-resume-worker-provenance-1016` at 100% traffic, and the database guard migration is applied. No frontend was deployed for this repair. No UI source file changed during this backend repair; the earlier seven-file template/PDF overlay remains required for the production UI.

## Where to collect code

Repository: [jobnex/jobnex](https://github.com/jobnex/jobnex).

- Backend source: branch `fix/resume-background-credits`, commit [`ee041ca10113ae5c2ae48ca7d6b26d79b10c419a`](https://github.com/jobnex/jobnex/commit/ee041ca10113ae5c2ae48ca7d6b26d79b10c419a). Read the [detailed audit and identification steps](https://github.com/jobnex/jobnex/blob/ee041ca10113ae5c2ae48ca7d6b26d79b10c419a/docs/resume-provenance-p1-audit-2026-10-16.md).
- New backend files to review: `resume-agent-inspect/src/low_risk_agent/{source,prompts,render,policy,pipeline}.py`, `services/resume-tailor/worker.ts`, `resume-agent-inspect/tests/test_role_identity_regressions.py`, and `scripts/test-resume-settlement.ts`.
- Database fix: `services/resume-tailor/migrations/20261016_resume_manual_edit_guard.sql` and `scripts/test-resume-generation-guard.py`. Already applied on the checked backend database. Apply it to another environment before testing Save/export there; do not disable the trigger or overwrite generated history.
- UI source bundle: branch `docs/resume-ui-handoff-20261010`, previous source-overlay commit `277e916edf65122fa0682b2560b802721e1ada45`, directory `docs/ui/releases/resume-template-20261016/local-app/`. Its manifest maps exact paths and hashes. Apply after the October 10 source bundle; see the template handoff for collection details.
- Do not copy Python backend code into browser components. The new worker is already deployed. The frontend needs the correct status/availability contracts and earlier shared parser/PDF changes.

The backend Git backup also synchronizes reliability code already present in the running image. The deployment overlay was restricted to five Python files and the worker. No provider/model migration is requested from the UI team.

## UI contracts to retain

| State | UI behavior |
| --- | --- |
| `queued` / `running` | Show pending/progress state from the request. Do not show Ready based on a generation row alone. |
| `completed` with consumed credit and usable saved generation | Show Ready and allow the normal current-generation preview/export. |
| `needs_review` with usable saved generation | Show review warning. Only presentation issues may be published in new output; do not treat this as automatic factual approval. |
| `failed`, `credit_state=released`, `error_code=unsafe_resume_output` | Show blocked/failed and credit refunded. Do not open or download the unsafe generated draft. Offer an explicit retry action; never regenerate automatically. |

The immutable generation table may still contain a historical `needs_review` record when its request is now failed. Join to the owned request and use the existing availability predicate. Never query `resume_generations.status` alone to expose a draft. Preserve ownership, current-generation guards, original audits, and read-only historical behavior.

The localhost app already shows failed/refunded requests and the corrected balance. Its current generic message is “Generation failed before a usable resume could be saved. Credit refunded.” Recommended copy for `unsafe_resume_output`: “We could not verify this draft against your source resume. Your credit was refunded. Please retry.” This text refinement is a UI-team improvement, not a backend release blocker.

The Resume menu currently still offers View Resume on failed cards, although the server refuses unavailable output. Hide or disable preview/download when `has_draft` is false, and show the failure explanation directly. Do not remove access to an independently valid older draft if the contract explicitly allows that history. This is a UI clarity improvement; the unsafe reported draft did not reopen in the browser check.

Do not derive the credit refund locally, increment the displayed balance optimistically a second time, or retry a paid request on refresh. Refresh the authoritative wallet and request records.

## Historical repair completed

With explicit account-owner approval, eight unedited factually failed drafts were quarantined and seven consumed credits refunded. Balance changed from 3 to 10. One draft had already been refunded, so it received no second refund. A second cleanup pass changed zero records and zero credits. Original immutable generation text, audits, source references and PDF objects remain preserved; seven matching unsafe duplicate Markdown caches were cleared. One clean completed result was preserved.

This cleanup was scoped to the approved account. The backend now prevents new unsafe output from settling as usable. Do not run a UI migration that overwrites historical generation records or repeat these refunds.

## Acceptance checks before the UI team releases

1. Integrate the prior seven-file overlay and retain authenticated direct PDF routes, current-generation IDs, stale-save rejection and durable saves.
2. Refresh applications and verify failed/refunded status and server wallet balance. The quarantined draft must not preview or download through a legacy fallback. Do not bypass this by reading immutable generation rows directly.
3. Verify a clean completed draft still opens. Presentation-only `needs_review` must remain distinguishable from factual failure.
   Test Save, reopen and export on a synthetic permitted draft: the working copy persists, while `resume_markdown`, source/job hashes, original audit evidence and ownership stay unchanged. Keep server authentication and current-generation fencing; the database guard is not a replacement for those checks.
4. Use synthetic paragraph-style resumes with repeated role titles and different employers/dates. Confirm two separate headers and correct responsibility ownership in all four templates, visual edit round-trips and PDF text extraction. Never invent missing company data in the UI.
5. Verify no literal heading markers, missing contacts/projects/skills, A4 clipping, stranded headings or mobile toolbar overflow. Preserve the earlier template regression checks.
6. Retry only through an explicit user action; verify one credit hold and no duplicate charges on double-click/reload. A real provider generation consumes credits/tokens and requires the owner's authorization for that test.
7. Record the UI repository commit, hosting deployment URL and results. This backend report does not certify the separately hosted production UI.

## Verification and limits

Backend verification passed 219 offline tests plus 82 subtests, including nine role identity tests; worker admission/settlement/recovery checks; TypeScript compilation; exact-source offline replay; shipping-image smoke checks; and 46 post-deployment PostgreSQL guard checks on disposable synthetic TEMP records. The exact source replay retains two employers, eight responsibility facts per employer and three projects. The live worker's authenticated health request returned HTTP 200 with generation enabled; environment/secret references and frontend traffic match the pre-release configuration.

Localhost showed 10 available credits, failed/refunded status for the reported request, and no unsafe preview after selecting View Resume. No new paid generation was performed. Earlier four-template browser/PDF checks proved presentation preservation, not factual correctness of the historical generated draft.

Frontend GCP traffic remains on `job-hunt-web-curated-fresh-1010`. UI integration and deployment belong to the UI team. Compiler secrets must remain server-side; use the existing PDF handoff and never add credentials to this document or client bundles.
