# Verified release: background resume tracking and draft credit settlement

Verified 2026-10-10 UTC. Source and frontend integration: [PR #12](https://github.com/jobnex/jobnex/pull/12), branch `fix/resume-background-credits`.

The popup closes when a durable request is accepted. The persistent layout restores owned requests after navigation/reload and keeps tracking long runs. A verified usable saved draft costs one credit, including `needs_review`; the review warning remains visible. Missing or unverified output is refunded. Historical refunds remain unchanged.

## Live GCP revisions

Project: `job-scout-508222`. Region: `us-east1`.

| Service | Live revision | Traffic | Built source commit | Cloud Build ID |
| --- | --- | --- | --- | --- |
| `job-hunt-resume-worker` | `job-hunt-resume-worker-00020-wed` | 100% | `d8d35d7f33c7e8639020f9b2469910a6a0103064` | `f3819adc-a352-462b-8fb6-12460496f6ac` |
| `job-hunt-web` | `job-hunt-web-00027-duw` | 100% | `144ac020136449564863c1a84f06ff6eda86d66e` | `950f7f58-fb6b-43f7-acf7-e52a85c0a2bf` |

Immutable deployed images:

- job-hunt-resume-worker: `us-east1-docker.pkg.dev/job-scout-508222/job-hunt/job-hunt-resume-worker@sha256:90ca5cbbf1c61853c77d2134585983397277115d056bf914e0dde5204d755808`.
- job-hunt-web: `us-east1-docker.pkg.dev/job-scout-508222/job-hunt/job-hunt-web@sha256:87d4b83141434886a17b1ac33ce9f273188e60b501f3143a4504b1768eab265f`.

Both final builds succeeded. New images were staged with zero production traffic, their readiness and immutable digests were verified, and tagged health/authentication checks passed before promotion. The existing `neondb-trial` tag points to `job-hunt-web-00027-duw`. Temporary validation tags were removed. Runtime container settings, environment/secret bindings, and service accounts were compared before/after image updates and preserved. The worker remains private: authenticated health returns 200 with generation enabled; an anonymous request returns 403. The web returns 200 on its root and 401 for anonymous generated-output access.

The profile service, queue, database schema, and service origins were not changed by this release. No additional client debit is introduced.

## Verification

- TypeScript passed in the Git checkout and running local frontend. Scoped ESLint passed with zero errors. The full-repository lint baseline contains unrelated existing failures and was not represented as passing.
- `npx tsx scripts/test-resume-settlement.ts` exercises the actual worker with DB/AI doubles: approved and review settlement; duplicate delivery; empty, missing, mismatched source/job/audit output; one refund; saved-output crash recovery; stale lease fencing; and Windows CRLF/CR source handling.
- `node scripts/test-resume-background.cjs` exercises the actual modal, tracker, and action modules: close only after acceptance; keep submission errors open; 120 seconds of simulated active polling; outages and retries; remount restoration; account mismatch exclusion; all five request outcomes; and the existing `draft`/`ready` mirror constraint.
- Browser verification restored TensorWave status after reload and navigation, opened its real saved Markdown through the live GCP generated endpoint, and showed the review warning in the preview. The local UI mirror saved the same content as `draft`.
- A live terminal-task replay returned HTTP 200 from `job-hunt-resume-worker-00020-wed`. It verified worker DB connectivity and idempotency using the already-settled TensorWave request; it did not rerun AI. Reconciliation afterward still found one refund, zero AI usage rows for that historical request, and the unchanged wallet balance.

No new paid AI generation was performed. Positive settlement and long-duration behavior were tested with deterministic doubles; live verification covered health, owned output retrieval, actual UI mirror persistence, and terminal-task replay.

## Historical TensorWave reconciliation

Request `e4419957-2141-4b08-9524-b50d4e242eaf`, Data Center Technician at TensorWave:

| Signal | Verified value |
| --- | --- |
| Request status | `needs_review` |
| Generation status | `needs_review` |
| Credit state | `released` |
| Refund records | 1 |
| Wallet balance | 3 |
| Generated Markdown | 2,569 characters |
| UI mirror status | `draft` |
| Mirror content | 2,569 characters; exactly matches the generation |
| Historical AI usage rows | 0; no replay added another call |

This request predates the new settlement policy. Its refund is preserved. The saved draft still needs work-history review; it was not silently approved. New verified review drafts settle as `needs_review`/`consumed` and record usage.

## Frontend handoff and evidence

See [the complete UI handoff](../ui-team-resume-background-credits.md) for file locations, status handling, endpoints, database fields, and integration requirements. The current local frontend is updated. A separately hosted UI must integrate the changed modal/action/layout/tracker/preview components. PR #12 publishes the source; it does not automatically update a separate frontend deployment or merge into `main`.

Local evidence is retained under `C:/Users/desir/Projects/techjobs/resume-background-fix/`: `deployment.json`, `validation.json`, final build metadata, `live-neon-evidence.json`, `live-worker-check.json`, `background-tracker.png`, `tensorwave-review-warning.png`, and `live-gcp-review-preview.png`. Screenshots containing the candidate's resume were kept local and were not committed to GitHub.

## Rollback

The previous production revisions are retained. To restore the prior complete release, route to `job-hunt-web-00017-glg` and `job-hunt-resume-worker-00018-4rn`:

```powershell
gcloud run services update-traffic job-hunt-web --to-revisions=job-hunt-web-00017-glg=100 --update-tags=neondb-trial=job-hunt-web-00017-glg --region=us-east1 --project=job-scout-508222
gcloud run services update-traffic job-hunt-resume-worker --to-revisions=job-hunt-resume-worker-00018-4rn=100 --region=us-east1 --project=job-scout-508222
```

Traffic rollback does not reverse settled credits or delete saved outputs. The old worker restores its former review-refund policy for future work, and the old web hides review output; coordinate the frontend rollback if reverting the entire behavior. No database rollback or schema migration is required.
