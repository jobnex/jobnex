# Low-risk resume agent

Markdown output targets 525-650 visible words, including headings, contact details, skills and
education. Hidden link destinations and standalone Markdown punctuation are excluded. The writer
allocates space dynamically, prioritizing relevant experience. Each project uses 2 bullets
(objective/approach combined, then outcomes) or 3 (objective, approach, outcomes).
Python verifies the rendered word count and the existing writer can correct length within the
shared two-repair limit. If the target still cannot be met, output is marked `needs_review`;
content is never silently truncated. CLI JSON and the audit include `word_count`.
Output remains Markdown; fitting a single A4 page still depends on the downstream template.

For a new-computer install and exact run commands, start with [START_HERE.md](START_HERE.md).
For production deployment, database configuration, required secrets, output handling, and verification,
read [PRODUCTION_SETUP.md](PRODUCTION_SETUP.md). Runtime dependencies are pinned in `requirements.txt`.

Choose whether to include a professional summary with `--summary yes` or `--summary no`.
When omitted, interactive runs ask yes/no; automated runs require the flag.
The Python API uses `RunRequest(include_summary=True)` or `False` (default: `True`).
Base skill category names and order are preserved. Categories omitted during tailoring
retain their original skills. Skills are deduplicated across categories, including common
equivalent names such as Databricks/Azure Databricks. No additional API key is required.

## Project library selection

Supply `--project-library` to replace the resume's projects with relevant projects from a
Markdown catalog. Omitting it preserves the existing resume-project workflow.

```powershell
low-risk-resume --resume .\resume.md --jd .\job-description3.txt --tenant-id desir --out .\output\tailored-resume.md --memory-cache --project-library "C:\Users\desir\.gemini\antigravity\scratch\master_resume_projects.md"
```

Catalog format: optional `## Role category`, then `### Project title` (an optional number is
accepted), followed by `-` evidence bullets. Repeated normalized titles are deduplicated:
the first version's facts are kept and role tags are combined. Variants with different titles
remain separate; consolidate aliases in the catalog if they represent the same project.

The local shortlist keeps up to six candidates using requested tools, technical phrases,
role tags, weighted JD requirements, and complementary coverage. The existing mapping call
selects two projects by default, or three when the third adds an uncovered must/preferred
requirement. One project is allowed when only one adds useful coverage. These local scores
are ranking heuristics, not measured ATS percentages.

Only selected project facts reach drafting, with two or three bullets per project. Exact
JD-requested tools found in those projects may enter Skills. Employment and education remain
separate from catalog projects. Each fact records its source document and original offsets.

Invalid, duplicate, or redundant mapper selections use a bounded local fallback with distinct
lexical coverage (at most two projects; zero if no lexical evidence matches). The audit labels
this `local_fallback` so it can be distinguished from model selection. The audit's
`project_selection` field includes the library hash, unique/duplicate counts, six candidates,
scores, matched terms/tools, selected IDs, and selection reasons. Candidates not selected are
the shortlist alternatives. LangSmith's existing `resume.map_adjacency` trace contains the
candidate input and proposed selections; the audit records the final selection after validation.

No new dependency or extra LLM call is required. JD caching remains JD-only. The catalog is
read and selection is recomputed each run, including when JD analysis hits the cache. No API
key or database setting changes are needed for this option.

Grounded LangGraph pipeline that treats resumes and job descriptions as untrusted data. Generated claims carry source fact IDs; deterministic lint and an independent semantic review gate output before rendering.

## Setup

Dependencies are installed in this folder's `.venv`:

```powershell
& .\.venv\Scripts\Activate.ps1
$env:OPENROUTER_API_KEY = "..."
```

To trace the inputs and outputs of every LLM stage in LangSmith:

```powershell
$env:RESUME_ENABLE_LANGSMITH = "1"
$env:RESUME_LANGSMITH_ALLOW_CONTENT = "1"
$env:LANGSMITH_API_KEY = "lsv2..."
$env:LANGSMITH_PROJECT = "resume-builder-local_agents"
```

`RESUME_LANGSMITH_ALLOW_CONTENT=1` uploads resume/JD prompts and model outputs to LangSmith.
Set it to `0` to retain trace metadata, latency, token counts, cost, errors, and
stage names while hiding resume/JD content.

Each invocation appears as one `resume.tailoring_run` chain with LLM child runs
(`resume.analyze_jd`, `resume.map_adjacency`, `resume.craft`, review, and repair
when used). The CLI prints `cost_usd` and `cost_by_stage_usd`; LangSmith shows
the same token/cost breakdown per stage and as a total for the parent run.

LangSmith can manage trace search/filtering by tenant and model, latency and
error diagnosis, prompt/output inspection (only when content is allowed),
run-level feedback and annotations, datasets/evaluations, alerts, and project
dashboards. It does not manage the resume cache, PostgreSQL database, or model
provider billing.

For shared 30-day JD analysis caching, also set:

```powershell
$env:DATABASE_URL = "postgresql://..."
$env:JD_CACHE_HMAC_SECRET = "at-least-32-random-characters"
```

Without `DATABASE_URL`, runs still work with a process-local cache. Candidate facts, strategies, and drafts are never placed in the shared cache.

## Run

```powershell
low-risk-resume `
  --resume .\resume.md `
  --jd .\job-description.txt `
  --tenant-id candidate-123 `
  --out .\output\tailored-resume.md
```

Every metric must already exist in the source resume; synthetic metrics are disabled.

Exit codes: `0` completed, `2` needs review, `1` failed. A JSON audit sidecar is written beside the Markdown output with source facts, claim-to-fact provenance, metric origins, the compliance ledger, and token/cost usage.

## Safety contract

- Employers, dates, contact details, and coursework are preserved. Role/project titles and bullets
  are rewritten for JD relevance without inventing experience.
- Every generated factual bullet references source facts.
- Skills must be verbatim source-backed items.
- Each project has 2 bullets (combined objective/design, outcome) or 3 (objective, design, outcome).
- Each experience role needs 2–3 source-backed numeric metrics.
- `Architected`, `Led`, and equivalent verbs require matching ownership evidence.
- Initial draft receives at most two targeted repairs. Repeated or non-improving violations end as `needs_review`.
- Only JD analysis is reusable across users. Cache keys are HMAC-SHA256 over normalized JD plus pinned model and version identifiers.

Run checks:

```powershell
python -m unittest discover -s tests -v
ruff check .
```

The primary path uses `google/gemini-3.8-flash` for JD analysis, selection, writing,
and review. Requests run synchronously. LangSmith root traces identify the configured
writer/analyzer/review models; LLM traces report model, tokens, and provider cost
(with Gemini pricing estimates used when provider cost is absent).
All use one OpenRouter OpenAI-compatible endpoint without an SDK.
Tests use a bounded fake and make no network calls.

## trail_dev result storage

See [TRAIL_DEV_STORAGE.md](TRAIL_DEV_STORAGE.md) for optional final Markdown/audit persistence, per-user/job version history, and explicit submitted-version selection. Existing local output and factuality checks are preserved.
