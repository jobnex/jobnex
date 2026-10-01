# Resume deployment

Project: `job-scout-508222`; region: `us-east1`.

The public `job-hunt-web` service authenticates users, snapshots the selected published job from Neon and factual profile `resume_details`, and queues work. The private `job-hunt-resume-worker` service contains the current `resume-agent-inspect/src` pipeline. Completed Markdown, job/user/version metadata, audit, credits, and provider usage are stored in Neon.

Generation is disabled until the provider credential is supplied. Add the OpenRouter key privately in [GCP Secret Manager](https://console.cloud.google.com/security/secret-manager?project=job-scout-508222), preferably under `job-hunt-openrouter-api-key`. Then run `rtk proxy python gcp-resume/activate.py --version 1` with the actual numeric version (and `--secret` if named differently). Activation grants only the worker access and enables its always allocated CPU and minimum one instance, followed by the web enqueue flag. This creates ongoing Cloud Run instance charges while enabled.

No live AI request is made by deployment or activation. Existing factuality checks and credit settlement remain in place. Successful completed outputs cost one credit; review/failure outcomes release their credit hold. Credits control generation eligibility. Daily token limits and per-generation dollar budget gates have been removed at the user's request. Provider tokens, costs and unknown outcomes remain recorded for observability, with no token quota enforced. Timeouts and bounded retries remain operational safeguards.

## LangSmith

The worker has project `resume-builder-gcp` and the US LangSmith endpoint configured. Its dedicated secret is `job-hunt-langsmith-api-key`. Tracing stays disabled until that secret has an enabled credential version. Run `rtk proxy python gcp-resume/configure-langsmith.py --version 1` with the actual version. Add `--allow-content` only when full resume/JD inputs and model outputs should be uploaded; the default hides both. The command preserves the generation flag, database credentials, and OpenRouter settings. A successful deployment does not validate the LangSmith API key or prove trace delivery. The existing builder traces pipeline and LLM stages; Neon remains the durable per-attempt usage and credit ledger.

Build context is allowlisted. Local environment files, caches, user compiler payload JSON, and development fixtures are excluded. Compiler payload saves use the authenticated user's Neon profile instead of a shared local file. The Rust PDF compiler upgrade remains a later change.

Cloud Run web deployments must set `RESUME_ALLOWED_ORIGINS` to the exact public HTTPS origins in deployment.json. The generation API compares the browser Origin against this explicit allowlist because the container request URL can use an internal HTTP address. Local development falls back to the request URL when this setting is absent. Never use wildcard origins or accept arbitrary forwarded hosts.
