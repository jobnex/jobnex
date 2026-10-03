# Tailor Resume implementation

## What this change adds

The Jobnex **Tailor Resume** buttons now lead to `/job-hunt/tailor-resume?jobId=<uuid>` instead of immediately deducting a credit. The route works only for an authenticated candidate and reads the selected published job from Neon.

The candidate uploads a PDF or DOCX. The existing private `job-hunt-profile` service extracts factual text and structured details. The browser never sends a job description and the uploaded binary is not saved by this flow: the source Markdown and parsed metadata are saved in the candidate-owned `user_pref_resumes` record in Neon.

The Resume Lab shows the extracted Markdown for correction, then provides deterministic match terms before generation. The Python `resume-agent-inspect` process receives only the corrected source and the database job snapshot. It persists final Markdown plus audit data to `resume_generations`, while the worker records stage tokens, cost, and provider response ids in `resume_ai_calls`; no generated PDF or object storage path is involved.

## Credit lifecycle

1. Creating a request locks the candidate wallet, decrements its available balance, and writes a pending `credit_transactions` hold.
2. The worker claims the queue record with a lease and runs the grounded Python agent.
3. A completed Markdown result marks the hold completed and the request `consumed`.
4. A failed or review-required result restores the wallet and records a refund. It is not billed.

The request id is also the generated resume id. A browser-supplied UUID idempotency key prevents double reservations from retries or double clicks. The existing database rule also allows only one queued or running generation per candidate; a second attempt returns that active request without creating another hold.

## Runtime and deployment

`services/resume-tailor/worker.ts` is the private queue consumer. Its Dockerfile includes the existing Python agent and uses the same pooled Neon `DATABASE_URL` as the web application. It needs `OPENROUTER_API_KEY`, `JD_CACHE_HMAC_SECRET`, and the existing `DATABASE_URL`; credentials must come from Secret Manager, not this repository.

Deploy the Next web image as `job-hunt-web` and the worker image as `job-hunt-resume-worker` only after this branch is reviewed and the worker service configuration is verified. The worker exposes `/health` only for Cloud Run; it must remain private. The public service exposes browser routes listed in [endpoints.md](../endpoints.md).

The repository root `Dockerfile` builds the standalone Next web service. `cloudbuild.resume-worker.yaml` builds the worker from `services/resume-tailor/Dockerfile`; both builds use the root context and are protected from local credentials by `.dockerignore`. In GCP, bind `DATABASE_URL`, `JOB_HUNT_SERVICE_SECRET`, `NEON_AUTH_COOKIE_SECRET`, `OPENROUTER_API_KEY`, and `JD_CACHE_HMAC_SECRET` from Secret Manager. The web service does not receive the OpenRouter or cache secret. Build first, deploy with generation disabled, verify health and authenticated browser routes, then enable the worker and web queue flag together.

## Deliberate boundaries

- Existing PDF/R2 endpoints remain legacy functionality and are not invoked by this feature.
- This change relies on the already-provisioned `resume_generation_requests`, `resume_generations`, `resume_ai_calls`, `wallets`, and `credit_transactions` tables. It does not create a duplicate output table.
- The deterministic preview identifies terms; it does not claim that a missing term should be invented. The agent remains responsible for grounded rewriting.
