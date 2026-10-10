# Resume generation reliability — 2026-10-10

The two latest attempts failed before creating Markdown: provider timeout and
invalid structured output. Empty failure records were saved, rather than usable
drafts. Failed request credits were released by the existing settlement logic.

## Worker changes

Gemini requests now use json_schema with strict true and require_parameters true.
Pydantic validation remains authoritative. An invalid schema response gets one
bounded retry with a changed instruction/body hash, avoiding the durable cache
replaying the same invalid response. Truncation retries still respect 16000 tokens
and three total completion attempts. Successful recovered stages include usage
from rejected responses. Provider timeout is 90 seconds per HTTP attempt, with
the existing single transient retry. The whole worker retains its 10 minute limit.
This does not guarantee provider uptime or eliminate all possible failures.

LangSmith LLM metadata includes structured_output_retry_limit and
provider_timeout_seconds. Input/output content remains hidden. Public nested
job-analysis smoke passed, trace 01a12750-b58b-75b3-9f46-c33b2682da45;
634 tokens and USD 0.0015975. No private resume/JD was used for release QA.

## UI changes and code collection

Applications and Resume generations show a safe timeout/invalid-response reason,
credit refund state, and explicit Retry generation button for failed requests.
Retry uses existing authenticated generation intake and its credit reservation.
It is a new generation request, never automatic recreation of a failed job.
View returns the actual failure category when no saved draft exists. Database
read errors are distinguished from missing drafts. Prior valid saved drafts
remain available. Raw provider errors never reach the user interface.

Collect changed code from docs/ui/source-snapshots/2026-10-10-reliability or
resume-reliability-code-2026-10-10.zip in this branch:
https://github.com/jobnex/jobnex/tree/docs/resume-ui-handoff-20261010/docs/ui

The ZIP contains 13 selected source files with original filenames. Reviewable
snapshots use a .txt suffix, with SHA-256 manifest. These are an overlay, not a
complete application. Integrate UI files together into the current UI checkout.
Worker llm.py and models.py belong to resume-agent-inspect/src/low_risk_agent.
Do not replace newer unrelated team changes. Earlier A4/delete release status
remains as described in resume-ui-handoff-2026-10-10.md.

Validation: 100 Python regressions passed, frontend TypeScript passed, synthetic
credit settlement/duplicate-delivery/lease fencing passed, and failure-message
redaction passed. Browser pixel QA remains unavailable in this session.
Production verified: both services ready at 100% traffic.
Worker revision job-hunt-resume-worker-reliability-1010, build
3e03f3a8-6f67-405a-850f-8f67126da021, image
sha256:cfcf163dbb22f4f1c39221954488b601c4f2557dffe195d5afb0615f65eeaf27.
Web revision job-hunt-web-reliability-1010, build
70a615e7-2ac4-4ca0-aa1b-c6e23bc5aec4, image
sha256:f3bf81ffaa88a1423e94fccd8c800afd45c3ce636417db75ad26535708c29d17.
The existing neondb-trial tag routes to this web revision.
Local dev source is updated; refresh Applications to receive it.
Failed historical attempts remain failed and refunded; no automatic paid
regeneration was submitted.
