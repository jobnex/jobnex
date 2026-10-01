# Start here

This is a Markdown-only resume-tailoring CLI. It reads a UTF-8 `.md`/`.txt`
resume and job description, optionally selects relevant projects from a project
library, then writes a tailored Markdown resume and an audit JSON file.

It uses Gemini Flash for JD analysis/review and GPT for mapping/writing through
OpenRouter. It preserves employer names, dates, contact details, coursework,
and source-backed factual claims. It targets 525-650 visible words for a
one-page A4 downstream template, but does not create a PDF.

## 1. Install on a new Windows computer

Install Python 3.12 or newer, unzip this folder, then open PowerShell in the
unzipped folder.

```powershell
python -m venv .venv
& .\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
pip install -e .
```

If PowerShell blocks activation, run this once in that PowerShell window, then
activate again:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
```

For the included offline tests and Ruff check, replace the final install command
with `pip install -e ".[dev]"`.

## 2. Set keys and optional tracing

Never place real keys in source files or commit them. `.env.example` is a list
of variable names only; this CLI reads environment variables set in the process
that launches it.

```powershell
$env:OPENROUTER_API_KEY = "your-openrouter-key"

# Optional: LangSmith traces, inputs/outputs, and cost per run/stage.
$env:RESUME_ENABLE_LANGSMITH = "1"
$env:RESUME_LANGSMITH_ALLOW_CONTENT = "1"
$env:LANGSMITH_API_KEY = "your-langsmith-key"
$env:LANGSMITH_PROJECT = "low-risk-resume-production"
```

Set `RESUME_LANGSMITH_ALLOW_CONTENT` to `0` when LangSmith must not receive the
resume/JD text. It still receives stage names, latency, errors, token counts,
and cost.

## 3. Run locally

Put your own UTF-8 `resume.md`, `job-description.txt`, and optional
`master_resume_projects.md` anywhere accessible. `--memory-cache` needs no
database and is the easiest local setup.

```powershell
low-risk-resume `
  --resume "C:\input\resume.md" `
  --jd "C:\input\job-description.txt" `
  --project-library "C:\input\master_resume_projects.md" `
  --tenant-id "candidate-123" `
  --summary yes `
  --out "C:\output\tailored-resume.md" `
  --memory-cache
```

Use `--summary no` to omit the professional summary. Omit `--project-library`
to retain the projects already in the base resume.

The result includes `status`, `word_count`, `cost_usd`, and
`cost_by_stage_usd`. The output folder receives:

- `tailored-resume.md` — the tailored resume.
- `tailored-resume.audit.json` — source provenance, checks, project selection,
  model token usage, and cost.

Exit code `0` is completed, `2` is `needs_review`, and `1` is failed.

## 4. Production database

For a shared 30-day JD-analysis cache, configure PostgreSQL and set
`DATABASE_URL` plus a stable 32+ character `JD_CACHE_HMAC_SECRET`. Then omit
`--memory-cache`. Full PostgreSQL, deployment, and verification instructions
are in [PRODUCTION_SETUP.md](PRODUCTION_SETUP.md).

## Included files

- `src/` — application source.
- `tests/` — offline test suite; no API calls.
- `requirements.txt` — pinned runtime dependencies.
- `README.md` — detailed features, data handling, project selection, and
  safety rules.
- `PRODUCTION_SETUP.md` — database and deployment instructions.
- `.env.example` — environment-variable reference with no real secrets.

The ZIP intentionally excludes virtual environments, API keys, databases,
cached checkpoints, resumes, job descriptions, and generated output.
