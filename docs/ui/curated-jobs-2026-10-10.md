# Curated Jobs freshness and matching — October 10, 2026

Curated Jobs now defaults to matching roles from the last 24 hours, sorted newest first.
Users can explicitly choose the last seven days or any time, and can switch to Best match
within the selected date window. An empty recent list never silently includes older jobs.

## Causes

- Local matching sorted title tier and similarity before publication date, without a date filter.
- Importers update `published_at` on existing job records. Live inspection found records created
  on September 30 with publication dates refreshed on October 10. Publication date alone makes
  old jobs appear recent.
- Any selected skill in a title could qualify an unrelated role even when desired roles were set.
- The production Curated page used sample `jobsData`; its Fetch Jobs button had no handler.
  Production and the local app therefore did not use the same recommendation flow.

## UI behavior

- Date selector: Last 24 hours (default), Last 7 days, Any time.
- Sort selector: Newest first (default), Best match.
- The date label is **Added to Joberry**, not the employer's original posting date.
- Fetch Jobs refreshes live recommendations and returns to page one.
- Results refresh every minute while the page is active, and when the window regains focus.
- Changing date, sort, search, or tab resets pagination and does not flash cached results from
  different criteria. If a rolling window removes the last page, pagination returns to a valid page.
- Empty states explain the selected window and offer an explicit wider window. API failures show
  Retry rather than being presented as “no matching jobs.”
- Requested history retains older generated-resume jobs and does not inherit the recent date filter.
- Production Curated Jobs now calls the live API and includes pagination. Existing shared card
  styling and the legacy `/api/jobs/matched` keyset endpoint remain in place.

## Matching and date semantics

The database filters before count, limit, and offset. It excludes unpublished, unknown-publication-date,
and future-publication-date records. The effective date is `LEAST(published_at, created_at)`, preserving
the earliest stored date when importers refresh publication timestamps. A single UTC cutoff is shared
by count and page queries. This is a conservative first-seen date, not proof of the employer's posting
time; reliable original source timestamps would be needed for an employer-posted-within-24-hours promise.

Desired roles define eligibility when supplied. Skills in unrelated titles no longer bypass those roles.
Canonical AI Engineer/Developer preferences require an engineering/development title, excluding AI sales.
Best match ranks role tier first and bounded skill overlap from both title and description next, with
recency and job ID as deterministic tie-breakers. Newest first orders eligible jobs by effective date
before match signals. Country, city aliases, seniority, and job-type filters continue to apply. Mid-level preferences
also exclude explicitly junior and management titles.
Preference read failures stop the request instead of returning an unpersonalized feed.

The new `/api/jobs/curated` GET/POST endpoint uses the verified session user. Request-supplied user IDs
cannot select another user's preferences or requested history. The local matched endpoint uses the
same updated matching implementation; the existing production keyset endpoint is unchanged.

## Where the UI developer collects code

Collect the production integration from `source-snapshots/2026-10-10-curated-jobs/web/`, or extract
`curated-jobs-code-2026-10-10.zip`. The snapshot manifest records original paths and SHA-256 hashes.
Snapshot TypeScript files have a `.txt` suffix to keep documentation backups out of the app compiler.
The ZIP retains the original filenames. Use the six production source files together:

1. `app/(main)/job-hunt/page.tsx`
2. `app/api/jobs/curated/route.ts`
3. `lib/hooks/useMatchedJobsQuery.ts`
4. `lib/db/job-matching.ts`
5. `lib/job-utils.ts`
6. `components/JobGrid.tsx`

The existing production Pagination component already supports the page props. A UI branch based on
the newer local app can retain its existing mapper, Pagination and card styling; merge the hook, page,
endpoint and matcher changes without replacing unrelated components. The snapshot also includes the
local matched endpoint and the read-only SQL regression script as separate integration references.

GitHub backup: draft [PR #13](https://github.com/jobnex/jobnex/pull/13), branch
`docs/resume-ui-handoff-20261010`. The exact commit and deployment evidence are recorded below after verification.
No message has been sent to the UI team.

## Verification

The PostgreSQL regression script executes the actual Drizzle-generated queries against read-only CTE
fixtures. It covers refreshed old rows, future/null/draft dates, desired roles versus incidental skills,
AI sales exclusion, skill overlap, country, city aliases, seniority, job type, keyword filtering,
newest/best sorting, both pages, out-of-range page identity, and older Requested history.

A read-only run against the user's saved preferences found 31 recent matches, with 24 and 7 jobs on
the first two pages and no overlap. Newest-first dates were descending and within the rolling window;
Best match returned 24 results. Counts are time-dependent. No model tokens or app credits were used.
Final local TypeScript checks, SQL regressions and rendered view checks passed (default controls, loading,
empty/widen action, populated cards and both pagination bars). Production build `68abba2d-6afd-42fd-a8d9-66f1d22b210d` passed. Staged GET/POST rejected request-supplied
user IDs with HTTP 401; the Curated page returned HTTP 200 with the default controls.
Release traffic verification is recorded below.

Browser acceptance: check both selectors, loading, empty, error/retry, narrow layouts, Fetch Jobs,
pagination, preference edits, and Requested history. Automated SQL/type/build evidence does not
constitute pixel-level browser sign-off.

## Production release

- Cloud Run service: `job-hunt-web`, project `job-scout-508222`, region `us-east1`.
- Revision: `job-hunt-web-curated-fresh-1010`.
- Image digest: `sha256:e1f5ce7b20e65d4f2fb4ad9491a39bcfe0ce83cbb2a6d9cb0302cfed5e18db6a`.
- Build: `68abba2d-6afd-42fd-a8d9-66f1d22b210d`, successful.
- The new API/page passed staging verification before traffic promotion. Verified 100% production traffic and the `neondb-trial` preview tag on this revision. The production
Curated page returned HTTP 200 with the new controls. All nine source/archive hashes match the
current original files. Source-backup links follow in the publication record.
- No resume worker/model configuration was changed by this release.

## Immutable GitHub collection

- Source snapshot commit: [`538e4fe8041b8c57e1b290ee683a650bf83eb9d5`](https://github.com/jobnex/jobnex/commit/538e4fe8041b8c57e1b290ee683a650bf83eb9d5).
- [Production code and local verification references](https://github.com/jobnex/jobnex/tree/538e4fe8041b8c57e1b290ee683a650bf83eb9d5/docs/ui/source-snapshots/2026-10-10-curated-jobs).
- [Original-filename ZIP](https://github.com/jobnex/jobnex/blob/538e4fe8041b8c57e1b290ee683a650bf83eb9d5/docs/ui/curated-jobs-code-2026-10-10.zip).
- GitHub is the code backup and integration handoff. The Cloud Run release is verified independently above.
