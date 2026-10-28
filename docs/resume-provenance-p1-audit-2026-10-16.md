# Resume employer attribution: P1 audit and repair

Verified October 16, 2026. Scope: the reported missing second employer, source extraction and fallback, deterministic rendering, factual validation, review-result publication, worker recovery, persistence and credit settlement. This is a focused resume-flow audit, not certification that the entire application has no P1 issues.

## Result

Four confirmed P1 defects were repaired. The backend worker is deployed and Ready at 100% traffic on `job-hunt-resume-worker-provenance-1016`; a separate database guard migration restores working-copy Save/PDF persistence without permitting original-data overwrites. No frontend deployment, frontend traffic change, new IAM grant, model change, or paid regeneration was performed in this repair.

The base resume contained the second employer. Its source hash matched the source used for the reported generation. The missing employer and incorrect responsibility attribution originated in backend source grouping before template rendering. Styling could hide the repeated Markdown marker but could not reconstruct trustworthy employment history.

## Confirmed findings

| ID | Defect and impact | Root cause | Repair |
| --- | --- | --- | --- |
| P1-01 | Second employer omitted; responsibilities could be assigned to the wrong employer. This materially changes employment claims. | Extraction discarded explicit heading levels and treated unbulleted responsibility paragraphs as structural metadata. Two jobs merged. Fallback created another role but retained facts attached to the older role, and repeated structural spans could resolve to the first occurrence. | Preserve heading level and verbatim offsets; recognize responsibility paragraphs; respect explicit role boundaries; derive fallback ownership from canonical source-position anchors; reject ambiguous or cross-boundary structural facts and conflicting employers before writing. |
| P1-02 | A rendered resume could retain both employers globally while swapping them between jobs. | Protected-value validation searched the whole document, rather than validating each employer/date against its own role header. | Validate role-header count and each role's own employer/date. Keep the existing global contact/entity checks. |
| P1-03 | Factually invalid drafts were available as `needs_review` and could consume a credit; retry recovery could settle an unsafe persisted result. | Review terminal output retained Markdown even with factual errors. Worker recovery trusted status and source hashes without requiring a usable compliance ledger. | Factual errors produce terminal `failed` with empty usable Markdown and retained diagnostic audit/usage. Only explicitly allowed presentation errors remain reviewable. Worker requires a nonempty valid ledger and refuses unsafe completion/recovery; unsuccessful output releases the held credit. |
| P1-04 | Save and PDF export could roll back for a generated draft with an active base resume. | The UI server correctly wrote edits to the separate `audit_json.manual_edit` field, but the database rejected all updates on those generation rows. Its deleted-base exception was also too broad. | Permit only a bounded, well-formed manual-edit object while every original column and original audit field remains identical. Allow base deletion to clear only its foreign key. Reject other changes even when the base is already null. |

The first three are separate failure barriers in the same attribution incident. Historical unsafe drafts were a consequence of P1-03. P1-04 was discovered while respecting the immutable-history guard during that cleanup.

## How the defects were identified

1. Compared the visible preview with the original saved generation Markdown. The repeated role marker and missing second employer existed in stored generated text, before UI rendering.
2. Read the generation audit and exact source used for that request. Verified the current base source hash matched the generation's source hash, and checked employer and responsibility spans against the original text. The second employer was present in the base.
3. Replayed deterministic extraction offline. Explicit role headings plus paragraph-style responsibilities collapsed into one source role. Inspected each fact's `role_or_project_id` rather than relying on the apparent rendered job order.
4. Traced `merge_fallback_facts()` and `_group_value()` through source grouping and rendering. Fallback introduced a second header without consistently rebinding retained metadata and responsibilities. The renderer then correctly found no employer attached to that role ID.
5. Converted that structure into synthetic Alpha Labs/Beta Systems regression fixtures. Six regression cases failed before the fix; existing cross-company evidence and review-output controls supplied additional checks. The final focused file contains nine passing tests, including a conflicting-employer guard.
6. Deliberately swapped employers in otherwise valid rendered output. The original whole-document presence check could not distinguish the swap. The new per-role protection rejects it.
7. Fed factual failures into the review terminal path and worker recovery mocks. This reproduced usable output and billing despite failed factual checks. Verified the patched paths reject it, retain diagnostic evidence and refund once.
8. Audited the account's historical review results read-only. After explicit owner approval, quarantined only the eight unedited factually failed drafts and refunded seven consumed credits. Verified immutable originals stayed unchanged and a second cleanup pass made zero changes.
9. Built from the exact running image, verified the installed preimage hashes, tested the patched image, deployed the new worker at zero traffic, then activated it and checked readiness, immutable image digest and unchanged frontend traffic.
10. Inspected the actual PostgreSQL trigger after it blocked a historical-generation update. Traced both Save and export callers, which update only `manual_edit`. Reproduced their rejection on a synthetic temporary row using the installed trigger function. Tested the replacement against permitted edits and hostile original-data mutations, applied the function migration, and repeated the checks against the deployed definition without changing any customer row.

## Source locations

Repository: `jobnex/jobnex`, branch `fix/resume-background-credits`.

| File | Relevant behavior |
| --- | --- |
| `resume-agent-inspect/src/low_risk_agent/source.py` | `ParsedLine`, `_parsed_lines`, extraction/group boundaries, `merge_fallback_facts`, `validate_source_groups`. |
| `resume-agent-inspect/src/low_risk_agent/prompts.py` | Require separate employers and unique verbatim context for repeated fallback headings. |
| `resume-agent-inspect/src/low_risk_agent/render.py` | Normalize repeated ATX heading markers for display; retain original evidence. |
| `resume-agent-inspect/src/low_risk_agent/policy.py` | `rendered_protection_checks`, including `render.role_entities`. |
| `resume-agent-inspect/src/low_risk_agent/pipeline.py` | Validate extracted groups; fail factual review output without publishing Markdown. |
| `services/resume-tailor/worker.ts` | Validate compliance ledger before settlement or recovery; release failed requests. |
| `resume-agent-inspect/tests/test_role_identity_regressions.py` | Nine synthetic attribution, paragraph, fallback, protection and terminal-output regressions. |
| `scripts/test-resume-settlement.ts` | Unsafe recovery, charging/refund, duplicate, lease and interrupted-run controls. |
| `services/resume-tailor/migrations/20261016_resume_manual_edit_guard.sql` | Strict working-copy exception; immutable generated text, audit evidence, ownership and other columns; narrowly scoped foreign-key clearing. |
| `scripts/test-resume-generation-guard.py` | Real PostgreSQL trigger checks on synthetic TEMP rows/functions, always rolled back. |

The Git Python backup was behind the source already deployed in the running worker. This release synchronizes that backup with the verified runtime baseline before applying the fix. Consequently the Git diff also includes previously deployed CLI, model, LLM and reliability changes. The image overlay for this incident changes only the five Python implementation files listed above and `worker.ts`; it does not switch providers or enable batch mode.

## Verification

| Check | Result |
| --- | --- |
| Full offline Python suite | 219 tests passed, plus 82 subtests. No provider calls. |
| Focused role identity regressions | Nine passed; includes deliberately swapped employers and conflicting groups. |
| Exact private source replay | Two distinct roles, correct employers, eight responsibility facts per role, three projects; evidence spans remain verbatim. This is a parser/render replay, not a new LLM-generated resume. |
| Worker settlement and recovery mocks | Passed safe review/completed billing, unsafe audit rejection/refund, duplicate delivery, crash recovery, lease fencing and queued capacity deferral. |
| Admission checks | Passed distinct holds, deduplication, retry and no-credit denial without AI. |
| TypeScript and Python compilation | Passed worker/settlement TypeScript check and Python compilation. |
| PostgreSQL Save/export guard | 24 pre-deployment checks reproduced the old rejection and verified the replacement; 46 post-deployment checks verified both migration and installed definitions. Checks cover accepted edits, rejected original-data mutations, malformed working copies and deleted-base behavior; all use synthetic TEMP records and rollback. |
| Container build checks | Verified original installed file hashes, compiled patches, passed role binding/swap/output-safety checks and worker settlement mocks inside the shipping image. |
| Historical cleanup | Eight requests failed/released; seven refunds; balance 3 to 10. Second apply: zero quarantines, zero refunds. All eight original generation statuses/text/audits unchanged; seven unsafe duplicate Markdown caches cleared; one clean completed result preserved. |
| Localhost browser | Balance 10; reported request shows generation failed and credit refunded. Selecting its View Resume did not open an unsafe preview. |

Runnable checks from the repository root:

```text
python -m pytest resume-agent-inspect/tests -q
node node_modules/tsx/dist/cli.mjs scripts/test-resume-settlement.ts
node scripts/test-resume-admission.cjs
node node_modules/typescript/bin/tsc --noEmit --target ES2022 --module esnext --moduleResolution bundler --esModuleInterop --skipLibCheck services/resume-tailor/worker.ts scripts/test-resume-settlement.ts
python -m compileall -q resume-agent-inspect/src
python scripts/test-resume-generation-guard.py --deployed
```

Install the existing package/test requirements and set `PYTHONPATH` to `resume-agent-inspect/src` and `resume-agent-inspect/tests` before the Python suite. Use a writable temporary directory. The PostgreSQL guard check additionally needs a private server-side `DATABASE_URL`; it creates only disposable TEMP objects, does not modify public functions or customer records, and rolls back. Other tests use mocks, not real generation. Windows sandbox restrictions initially blocked temporary-file/path tests; rerunning with the approved local test environment passed. Ruff was unavailable and was not reported as a passing check.

## Deployment and rollback

- Project/region: `job-scout-508222`, `us-east1`.
- Service: `job-hunt-resume-worker`.
- New revision: `job-hunt-resume-worker-provenance-1016`, Ready, 100% traffic.
- New image digest: `sha256:4b255d8ae85f625f930c989d2a7e5ce06abf480b5c132e6364bc4a1b16c93442`.
- Cloud Build: `d6d67bea-ef3f-4a9b-ada2-360e63e7c461`, SUCCESS.
- Verified original image: `sha256:fc1865a405a3a48891da52baf8aa2a67e72b32248992d2cc2314678b56c568f8`.
- Previous worker revision: `job-hunt-resume-worker-live-qa-final-1010`.
- Frontend remains `job-hunt-web-curated-fresh-1010` at 100%, with existing tags unchanged. Profile and PDF compiler services are unchanged.
- Existing synchronous Gemini configuration and LangSmith project/privacy settings remain unchanged. No new paid-provider run or new provider trace is claimed.
- Authenticated worker `GET /health`: HTTP 200, generation enabled, task mode. Environment variables, secret references and startup arguments match the previous revision; checked source bytes match the shipping image overlay.
- Database: `20261016_resume_manual_edit_guard.sql` applied separately; no customer rows updated by this migration. Existing function permissions and trigger attachment are retained. The function definition was rechecked after deployment.

If an operational rollback is necessary, route only the worker service back to the previous revision. That also reintroduces these defects, so pause generation or supply another safe worker before resuming customer requests. Do not reverse the approved quarantine/refunds automatically. Do not change frontend traffic.

## Historical cleanup and operational limits

The database correctly rejects overwriting original generations. The first attempted cleanup transaction rolled back completely. The applied cleanup respected that guard: original generation records, source references, audits and PDF objects remain intact. Request status is now `failed`, credit state is `released`, and error code is `unsafe_resume_output`. Only matching unsafe legacy Markdown mirrors were cleared after a private restoration snapshot was saved. Refunds and request changes committed in one transaction and are idempotent. The subsequent P1-04 guard repair permits only future separately labelled working-copy edits; it does not rewrite any of these historical originals.

Previously downloaded or already-open copies cannot be withdrawn from a user's computer. Refresh an open preview after quarantine. This repair is scoped to the approved account; no bulk cross-account historical rewrite was performed. Existing stored PDF objects are preserved and are not a source of replacement Markdown.

The private source replay demonstrates the repaired deterministic boundary. It does not promise every model response will succeed. Unsupported or ambiguous claims now fail safely instead of being exported or charged. Image-only resumes remain unsupported. No fresh paid end-to-end generation was run in this repair.

UI integration and production UI verification remain with the UI team. See `docs/ui/resume-provenance-p1-handoff-2026-10-16.md` on `docs/resume-ui-handoff-20261010` for contracts, source collection and acceptance checks. The earlier four-template UI/PDF checks concern presentation preservation; they did not prove factual attribution and must not be used as that proof.
