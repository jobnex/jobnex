# Jobnex database storage review

Inspected September 30, 2026, approximately 10:28 PM America/New_York. Target: Neon project `trail_dev` (`broad-base-06154424`), branch `production` (`br-plain-morning-ayf71kf3`), database `neondb`. This is a production branch despite the project's name. Review used read-only catalog and aggregate queries plus the imported App 4 and backend source. No private row contents, passwords, or tokens are included. Counts are snapshots of a changing database.

## What belongs in Neon

| Workflow | Existing storage | What to retain |
|---|---|---|
| Identity | Managed `neon_auth` schema | Authenticated identity and provider-managed sessions. Leave provider-managed tables under Neon Auth control. |
| Profile and preferences | `user_profiles`, `user_job_preferences` | User profile, job filters, factual education/experience, selected template and active resume reference. JSONB is already available for structured details; another profile database is unnecessary. |
| Jobs | `jobs`, `countries`, `skills`, `job_skills` | Normalized job content, source, application URL, location, disclosed salary, lifecycle status, requirements, and extracted skills. |
| Visa assessment | Sponsorship columns on `jobs`, `visa_processing_queue` | Four-state classification, supporting evidence, JD hash, assessment source/time, queue retries and leases. Unknown should remain distinct from unavailable. |
| Uploaded resumes | `user_pref_resumes`, `resumes` | Owner, object key, original filename/size, extracted text and parsed facts. Define which table supplies tailoring and which supplies matching. |
| Generated resumes | `resume_generation_requests`, `resume_generations`, `resume_generation_submissions` | Durable queue state, source/JD snapshots, idempotency, immutable generated Markdown, audit, hashes, version, and application-selected version. |
| Saved jobs and applications | `saved_jobs`, `applications` | Per-user saved jobs, application progress, notes, submitted resume/version, and relevant dates. |
| Credits and usage | `wallets`, `credit_transactions`, `resume_ai_calls` | Balance, durable debit/refund ledger, generation reference, provider/model/stage, tokens, cost and outcome. |
| Matching | `matching.requirements`, `matching.results`, `matching.events`, `public.user_job_matches`, `public.match_results` | Versioned requirements/results, scores, source hashes and work state. Establish which consumer owns each table before consolidating anything. |
| Classification/reference data | `preference_tags`, `preference_tag_relationships`, `role_grouping.rules`, `role_grouping.title_cache` | Existing recommendations, role-family rules and reviewable classification cache. |

## Observed state and priority work

1. **Move compiler drafts into authenticated durable storage.** App 4's `app/actions/resume.ts` reads and writes a single `data/resume-compile-payload.json`, without a user-scoped database lookup. Both preference rows currently lack `resume_details.compiler_payload`. A small initial solution is a user-owned draft inside the existing `resume_details` JSONB, merged without erasing factual details. Immutable generated versions remain in `resume_generations`. If multiple drafts/templates become a product requirement, use a separate versioned draft table then.

2. **Reconnect the existing generation workflow rather than creating more output tables.** `resume_generation_requests` contains five requests: all failed and released their credit holds. Errors are three `provider_outcome_unknown`, one `daily_token_allowance_exhausted`, and one `provider_http_402`. `resume_generations` has zero rows; `resume_ai_calls` has seven. These are observed historical outcomes, not proof of the current provider configuration. The App 4 archive lacks the queue/worker integration already discussed. Empty result storage does not mean the tables are absent.

3. **Clarify the two uploaded/base resume paths.** `user_pref_resumes` has one object-backed row with no extracted content. `resumes` has one text-bearing row. One preference record has an active resume. The active uploaded file needs extraction status and usable factual text for tailoring; the existence of an R2 file alone does not supply that text. Track MIME type, content checksum, extraction status/error, and extraction version/time if implementing the upload-to-text workflow. Do not copy unrelated users' facts between these tables.

4. **Improve job provenance and lifecycle.** The observed snapshot contains 99,289 jobs, all published, with no blank descriptions or missing country IDs. There are 72 missing/blank/Google-placeholder application URLs, and 79 repeated URL groups containing 143 extra rows. Review duplicates before merging: repeated URLs can represent reposts or different sources. Add a stable source-job identity and a reviewed uniqueness policy, source posting time, first/last seen timestamps, and a source content hash. Use last-seen and upstream evidence to distinguish active jobs from closed/expired jobs. Existing `created_at` and `updated_at` alone do not express those distinctions. Do not infer missing salaries: 47,513 rows have neither salary bound.

5. **Preserve visa evidence.** 85,038 jobs are classified unknown; positive/conditional classifications have no missing evidence in the checked snapshot. The processing queue had 295 ready rows and zero retry-exhausted rows. A ready queue is not proof of a stalled worker. Retain evidence/hash/source fields already present; App 4's Drizzle model currently exposes only the boolean and should be aligned with the richer live schema.

6. **Resolve matching integration intentionally.** `matching.results` contains 6,652 completed results, while `public.user_job_matches` is empty. `public.match_results` is a different application-linked model. These schemas may serve different consumers; confirm readers and writers before deleting or migrating tables. App 4 does not define all live matching tables. Prefer one documented source of truth for a given score, including scorer version and source hashes.

7. **Populate skill relationships only when a feature consumes them.** Six skills exist but `job_skills` has zero rows and no index or unique key. If implementing skill search/matching through this relation, extract and populate source-backed skills and add a composite unique key on `(job_id, skill_id)`. Do not add duplicate skill stores merely because this relation is empty; preference tags already drive a separate recommendation feature.

8. **Strengthen credit and ownership consistency.** No negative wallet balances or cross-owner active resume references were found. Two profile rows have no matching `neon_auth.user` identity; investigate their origin before cleanup. Wallets have no database nonnegative-balance check. Credit transactions have no unique generation-charge guard, and App 4's `deductCredit` can charge repeated calls using the same reference. Use stable per-request idempotency and the existing hold/settlement workflow, with a reviewed uniqueness policy for final charges/refunds. Do not enforce global reference uniqueness over the existing shared `ui_deduction` value. Consider owner foreign keys only after reviewing existing identities and text/UUID compatibility. Validate ownership at every server data access; most inspected user tables do not currently enable RLS, so database ownership isolation must not be assumed.

## Additional storage justified by existing operations

- A small `ingestion_runs`/`scraper_runs` table would connect Cloud Run execution ID, source, role/task, start/finish, inserted/updated counts, and sanitized error summary. Cloud Logging can keep detailed logs; Neon needs the durable ingestion summary only if the app/admin monitoring uses it.
- File metadata can extend the existing resume rows; a general `files` table is warranted only when multiple asset types need a shared lifecycle. Persist stable R2 object keys, not expiring signed download URLs.
- A template catalog belongs in the database only if templates become editable/admin-managed. The present static template IDs and R2 asset keys can remain in code.
- Payment orders and deduplicated webhook events become necessary when real paid credit purchases are integrated. A credit transaction type alone is not a payment provider ledger. This review did not establish a working payment integration.
- Do not add notifications, team membership, or subscriptions without an actual feature requirement.

## What should stay outside Neon

- R2: uploaded PDFs/DOCX, avatars, template assets, and compiled document binaries. Store ownership and object metadata in Neon. Small generated Markdown and factuality audits fit the existing database tables.
- Secret Manager/private environment: database connection credentials, OpenRouter/LangSmith/R2 keys, cookie signing secrets. Managed Neon Auth credential fields are provider infrastructure, not a place for application API keys.
- Cloud Logging/LangSmith: detailed service logs and model traces, subject to the chosen content/privacy settings. Neon keeps durable business outcomes and usage summaries.
- GitHub: source, reviewed migrations, Dockerfiles and sanitized configuration. No user database dumps or browser sessions.

## Suggested implementation order

1. Align App 4 with the live schema and restore authenticated compiler storage plus the existing queue/history/credit integration.
2. Add resume extraction state and define the active resume's text source.
3. Review placeholder application URLs, duplicate identity and job expiry/provenance.
4. Document the active matching store; add integrity constraints only after checking current rows.
5. Add ingestion summaries or purchase/webhook records when their consuming features are implemented.

Maintain reviewed migrations in GitHub and test changes on a development branch before production rollout. App 4's schema does not model all live visa, generation, and matching fields. Do not use an automatic schema replacement against production as though that model were complete. This report and the read-only inspection queries are stored in GitHub; proposed application and database changes have not been implemented or applied.
