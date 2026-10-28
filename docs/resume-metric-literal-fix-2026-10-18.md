# Resume generation metric annotation fix — October 18, 2026

The failed NTT DATA request reached the model and repair stages, but length fitting reintroduced an invalid metric annotation. The bullet and its cited source both contained `20+`; the model returned annotation values `20` and later `20 persona`. The normalizer retained the invalid annotation and added a second, correct annotation. Deterministic validation then reported annotation/provenance errors and blocked publication. The failed request's credit was released.

`resume-agent-inspect/src/low_risk_agent/policy.py` now corrects stale annotation text only when its cited metric fact contains an exact numeric literal present in the unchanged bullet, and that fact is contained in a cited body fact for the same role/project. It neither changes the resume claim nor adds unsupported numbers. Other invalid metrics still fail validation.

`resume-agent-inspect/tests/test_policy.py` reproduces both malformed annotation values and verifies that an unsupported `99+` claim remains rejected. The regression failed before the fix and passes afterward. All 220 agent tests pass locally with a workspace-owned temporary directory; the 16 policy tests also pass inside the patched production image.

The backend-only deployment is `job-hunt-resume-worker-metric-literal-1018`, serving 100% of worker traffic. Its image digest is `sha256:641ee86df9c902183fb1cdef22a1741aa0ee903139e6560224ce44ba7e318c91`. Environment and secret bindings, command/arguments, service account, resources, concurrency and timeout match the prior revision. No frontend deployment, endpoint, credential, schema or permission change is required. LangSmith tracing configuration is preserved.

Length remains a separate quality check. A factually safe draft that misses its word target can require review; this change does not waive factual checks or guarantee every model output will pass.

## Approved live verification

One user-approved NTT DATA generation ran after deployment. Request `bff9d845-f329-492e-95cd-02b90ff57224` saved an 872-word draft (7,643 Markdown characters). The publication predicate returned true. Its only remaining failed checks are experience bullet count: both roles have eight bullets against the 1–6 target. It therefore finishes as `needs_review`, with one credit consumed, rather than a failed or missing draft. All metric provenance/annotation and word-count checks pass. The localhost Applications page shows Review Draft, and opening it displays both A4 pages with contact details, both company names, technical skills and projects. No second paid test was run.
