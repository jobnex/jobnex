# Production setup

This package needs Python 3.12+, an OpenRouter API key for configured Gemini/GPT models, and
PostgreSQL for the shared 30-day job-description analysis cache.

## Deploy these files

Deploy `src/`, `pyproject.toml`, `requirements.txt`, `.env.example`, `START_HERE.md`, `README.md`, and this file.
Do not include `.venv/`, `data/`, `output/`, `.env`, API keys, user resumes, or job descriptions.

## Install

Windows:

```powershell
python -m venv .venv
& .\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
pip install -e ".[dev]"
```

Linux:

```bash
python3.12 -m venv .venv
. .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
pip install -e ".[dev]"
```

## Environment variables

| Variable | Required | Value |
|---|---:|---|
| `OPENROUTER_API_KEY` | Yes | OpenRouter key with credit and Gemini/GPT model access. |
| `OPENROUTER_BASE_URL` | Yes | `https://openrouter.ai/api/v1`. |
| `DATABASE_URL` | Production | TLS PostgreSQL URI. |
| `JD_CACHE_HMAC_SECRET` | Production | Stable random value with 32+ characters, shared by every worker. |
| `RESUME_ENABLE_LANGSMITH` | Optional | `1` enables tracing; otherwise `0`. |
| `LANGSMITH_API_KEY` | When tracing | LangSmith API key. |
| `LANGSMITH_PROJECT` | When tracing | Project name, for example `low-risk-resume-production`. |
| `RESUME_LANGSMITH_ALLOW_CONTENT` | When tracing | `1` uploads content; `0` hides prompts and outputs. |

LangSmith records one parent `resume.tailoring_run` trace per CLI run, with a
child LLM trace for every model stage. Each child reports model, tokens,
latency, and direct dollar cost; LangSmith aggregates that cost at the parent
run and project levels. The CLI result also includes `cost_usd` and
`cost_by_stage_usd`.

Configure it in the environment that launches the CLI:

```powershell
$env:RESUME_ENABLE_LANGSMITH = "1"
$env:RESUME_LANGSMITH_ALLOW_CONTENT = "0"  # Use 1 only when resume/JD content may be uploaded.
$env:LANGSMITH_API_KEY = "your-langsmith-key"
$env:LANGSMITH_PROJECT = "low-risk-resume-production"
```

Create the HMAC secret once, then store it in your deployment secret manager:

```powershell
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

## Neon PostgreSQL setup

Use a dedicated Neon development branch and a least-privilege role for the
shared job-description cache. Configure its pooled, TLS connection string:

```powershell
$env:DATABASE_URL = "<pooled Neon URL for the resume-agent cache role>"
$env:JD_CACHE_HMAC_SECRET = "your-shared-random-secret"
```

The first run automatically creates `jd_analysis_cache` and its expiry index. It stores the
normalized-JD analysis, cache key, and timestamps only. It does not store resumes, drafts,
candidate identity, or final output. Entries expire after 30 days.

## Production run

Omit `--memory-cache` so PostgreSQL cache is used:

```powershell
low-risk-resume `
  --resume "C:\secure-input\resume.md" `
  --jd "C:\secure-input\job-description.txt" `
  --project-library "C:\secure-input\master_resume_projects.md" `
  --tenant-id "candidate-or-tenant-id" `
  --summary yes `
  --out "C:\secure-output\tailored-resume.md"
```

The CLI emits model stages to standard error and final JSON to standard output. Exit code `0`
means completed, `2` means `needs_review`, and `1` means failed. Send `needs_review` results to
human review before publishing.

## Data storage

The default `data/checkpoints.sqlite` persists after terminal closure but is local and unsuitable
for multiple workers. Use a shared LangGraph PostgreSQL checkpointer before deploying a multi-worker
service. Protect checkpoints, output Markdown, and audit JSON with the same tenant isolation,
access control, and retention policy as resumes; they can contain candidate data.

## Verify deployment

```powershell
python -m unittest discover -s tests -q
ruff check src tests
```

Run one controlled resume/JD request, then repeat with the same JD and verify `cache_hit: true`.
