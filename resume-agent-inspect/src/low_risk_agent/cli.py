from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from uuid import UUID, uuid4

from langgraph.checkpoint.sqlite import SqliteSaver

from .cache import MemoryJdAnalysisCache, PostgresJdAnalysisCache
from .llm import configure_langsmith_env
from .models import RunRequest
from .pipeline import ResumeTailoringPipeline
from .render import write_result


def _run_pipeline(pipeline: ResumeTailoringPipeline, request: RunRequest):
    if os.getenv("RESUME_ENABLE_LANGSMITH") != "1":
        return pipeline.run(request)
    from langsmith import traceable

    return traceable(
        name="resume.tailoring_run",
        run_type="chain",
        metadata={
            "tenant_id": request.tenant_id,
            "include_summary": request.include_summary,
            "uses_project_library": bool(request.project_library),
        },
        tags=["resume-tailoring"],
    )(pipeline.run)(request)


def _cost_by_stage(result) -> dict[str, float]:
    totals: dict[str, float] = {}
    for usage in result.usage:
        totals[usage.stage] = round(totals.get(usage.stage, 0.0) + usage.estimated_cost_usd, 10)
    return totals


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Tailor a resume with grounded evidence checks.")
    parser.add_argument("--resume", required=True, type=Path, help="UTF-8 text or Markdown resume")
    parser.add_argument("--jd", required=True, type=Path, help="UTF-8 text job description")
    parser.add_argument(
        "--project-library",
        type=Path,
        help="Markdown project catalog; select 2-3 relevant projects to replace resume projects",
    )
    parser.add_argument("--tenant-id", required=True)
    parser.add_argument("--job-id", help="trail_dev job UUID; enables DB output storage")
    parser.add_argument("--base-resume-id", help="Optional owned user_pref_resumes UUID")
    parser.add_argument("--generation-id", help="Optional UUID for safe persistence retries")
    parser.add_argument("--summary", choices=("yes", "no"), help="Include a professional summary")
    parser.add_argument("--out", required=True, type=Path, help="Output .md path")
    parser.add_argument(
        "--checkpoint-db",
        type=Path,
        default=Path("data/checkpoints.sqlite"),
        help="Per-run LangGraph recovery database",
    )
    parser.add_argument(
        "--memory-cache",
        action="store_true",
        help="Ignore DATABASE_URL and use process-local JD analysis caching",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        if args.summary is None:
            if not sys.stdin.isatty():
                raise ValueError("Specify --summary yes or --summary no for non-interactive runs")
            while args.summary not in {"yes", "no"}:
                args.summary = input("Include professional summary? (yes/no): ").strip().casefold()
        resume_path = args.resume.resolve(strict=True)
        jd_path = args.jd.resolve(strict=True)
        out_path = args.out.resolve()
        audit_path = out_path.with_suffix(".audit.json")
        checkpoint_path = args.checkpoint_db.resolve()
        inputs = {resume_path, jd_path}
        library_path = args.project_library.resolve(strict=True) if args.project_library else None
        if library_path:
            inputs.add(library_path)
        targets = {out_path, audit_path, checkpoint_path}
        if inputs & targets:
            raise ValueError("output, audit, and checkpoint files must not overwrite an input")
        if len(targets) != 3:
            raise ValueError("output, audit, and checkpoint files must be distinct")
        if not os.getenv("OPENROUTER_API_KEY"):
            raise ValueError("OPENROUTER_API_KEY is required")
        resume = resume_path.read_text(encoding="utf-8")
        job_description = jd_path.read_text(encoding="utf-8")
        database_url = "" if args.memory_cache else os.getenv("DATABASE_URL", "")
        secret = os.getenv("JD_CACHE_HMAC_SECRET", "")
        if database_url and len(secret) < 32:
            raise ValueError("JD_CACHE_HMAC_SECRET must contain at least 32 characters")

        store = None
        generation_id = None
        if (args.base_resume_id or args.generation_id) and not args.job_id:
            raise ValueError("--base-resume-id and --generation-id require --job-id")
        if args.job_id:
            from .storage import ResumeStore, results_database_url

            generation_id = str(UUID(args.generation_id)) if args.generation_id else str(uuid4())
            store = ResumeStore(results_database_url())
            store.validate_context(
                args.tenant_id, args.job_id, args.base_resume_id, job_description
            )
        configure_langsmith_env()

        cache = PostgresJdAnalysisCache(database_url) if database_url else MemoryJdAnalysisCache()
        checkpoint_path.parent.mkdir(parents=True, exist_ok=True)
        with SqliteSaver.from_conn_string(str(checkpoint_path)) as checkpointer:
            pipeline = ResumeTailoringPipeline(
                jd_cache=cache,
                cache_secret=secret or None,
                checkpointer=checkpointer,
            )
            result = _run_pipeline(
                pipeline,
                RunRequest(
                    original_resume=resume,
                    job_description=job_description,
                    tenant_id=args.tenant_id,
                    include_summary=args.summary == "yes",
                    allow_synthetic_metrics=False,
                    project_library=library_path.read_text(encoding="utf-8-sig")
                    if library_path
                    else "",
                    project_library_name=str(library_path) if library_path else "",
                ),
            )
        written_audit_path = write_result(out_path, result) if result.resume_markdown else None
        database_result = {}
        persistence_failed = False
        if store:
            try:
                saved = store.save(
                    generation_id=generation_id,
                    user_id=args.tenant_id,
                    job_id=args.job_id,
                    base_resume_id=args.base_resume_id,
                    result=result,
                )
                database_result = {
                    "database_saved": True,
                    "generation_id": saved["id"],
                    "generation_version": saved["version"],
                }
            except Exception as error:
                persistence_failed = True
                database_result = {
                    "database_saved": False,
                    "generation_id": generation_id,
                    "database_error": error.__class__.__name__,
                }
                print(
                    "Database save failed; local output is retained. "
                    "Use low-risk-resume-save with the audit file and this generation_id.",
                    file=sys.stderr,
                )
        print(
            json.dumps(
                {
                    **database_result,
                    "status": result.status,
                    "output": str(out_path) if result.resume_markdown else "",
                    "audit": str(written_audit_path) if written_audit_path else "",
                    "revision_count": result.revision_count,
                    "cache_hit": result.cache_hit,
                    "word_count": result.word_count,
                    "cost_usd": round(sum(item.estimated_cost_usd for item in result.usage), 10),
                    "cost_by_stage_usd": _cost_by_stage(result),
                    "error": result.error,
                },
                sort_keys=True,
            )
        )
        if persistence_failed:
            return 1
        return (
            0
            if result.status in {"completed", "completed_with_estimates"}
            else 2
            if result.status == "needs_review"
            else 1
        )
    except Exception as error:
        print(f"{error.__class__.__name__}: {error}", file=sys.stderr)
        return 1
