"""Persist an existing audit without regenerating a resume or calling an LLM."""

import argparse
import json
from pathlib import Path

from .models import PipelineResult
from .storage import ResumeStore, results_database_url


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--audit", type=Path, required=True)
    parser.add_argument("--user-id", required=True)
    parser.add_argument("--job-id", required=True)
    parser.add_argument("--base-resume-id")
    parser.add_argument(
        "--generation-id", required=True, help="UUID printed by the original generation attempt"
    )
    args = parser.parse_args(argv)
    try:
        result = PipelineResult.model_validate_json(args.audit.read_text(encoding="utf-8"))
        saved = ResumeStore(results_database_url()).save(
            generation_id=args.generation_id,
            user_id=args.user_id,
            job_id=args.job_id,
            base_resume_id=args.base_resume_id,
            result=result,
        )
        print(
            json.dumps(
                {
                    "database_saved": True,
                    "generation_id": saved["id"],
                    "generation_version": saved["version"],
                }
            )
        )
        return 0
    except Exception as error:
        print(json.dumps({"database_saved": False, "database_error": error.__class__.__name__}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
