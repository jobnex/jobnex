# Resume reasoning-token release — 2026-10-10

The observed fit_length call exhausted 16000 completion tokens, of which 13707
were reasoning. The latest attempt failed and its credit was released. Hiding
reasoning output with exclude true never disabled reasoning or its token usage.

Gemini craft, fit_length and repair now use low reasoning. The model catalogue
lists high/medium/low as supported effort levels, so minimal/none are not used.
Gemini completion retries have a separate 32000 ceiling; other models retain
16000. There are still at most three completion attempts and the existing worker
time limit. The resume word/page target is unchanged. Rejected-attempt usage is
aggregated on final token/schema failure as well as success.

When length fitting fails with a model-output or provider-request exception,
the pipeline retains the previous schema-valid draft, reruns deterministic lint,
adds length.fit_unavailable to the compliance ledger, and routes to needs_review.
It never uses partial JSON and never marks the retained draft completed.
Initial writing failures still fail without inventing output. This retention is
specific to the length-fit repair path; it is not a promise of recovery from
every possible pipeline or infrastructure failure.

A retained review draft follows the existing billable needs_review policy.
An attempt with no usable draft follows the existing credit release/refund policy.
Historical failed requests are unchanged; no private paid retry was submitted.

Validation: 104 Python regressions passed, including each fitting failure class,
initial-draft failure, larger bounded Gemini retries and cumulative failed usage.
Synthetic completed/review settlement, duplicate delivery, refunds and fencing
checks passed. A public long synthetic six-role draft was returned unchanged in
the full ResumeDraft schema. Its LangSmith trace
01a12764-069b-7411-b967-99e31ac7fbc7 reports low reasoning, 3407 total tokens and
USD 0.00663525; inputs/outputs remain hidden. Public job-analysis smoke
01a12762-ced0-77b1-a2d5-36f867d6412a also passed. No private resume/JD was used.

Code collection:
docs/ui/source-snapshots/2026-10-10-token-budget (reviewable .txt copies) or
resume-token-budget-code-2026-10-10.zip (five original source filenames).
Integrate llm.py, pipeline.py and models.py together into resume-agent-inspect;
tests are included. This documentation PR does not apply files to runtime.
Existing frontend supports saved needs_review drafts, so no new UI release is
required for this change. The earlier reliability UI remains deployed.

Production verified ready at 100 percent traffic:
job-hunt-resume-worker-token-budget-1010.
Cloud Build b4aa79a7-ecfa-4b5d-8216-57b8aebd5998 succeeded.
Image sha256:fbb31f8f33c3176dbcb1e6306c7113ee3f356bc09e7098c870f16bf17008dc48.
verify-token-deploy.py confirmed the worker image/traffic and hidden LangSmith
configuration. Web remains job-hunt-web-reliability-1010 at 100 percent.
Model behaviour source:
https://openrouter.ai/docs/guides/best-practices/reasoning-tokens
