"""Check six candidate career boards per run and save job samples for review."""
import argparse
import asyncio
import json
from datetime import datetime, timezone
from pathlib import Path

from sources import FETCHERS, make_client


async def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("candidates", type=Path)
    parser.add_argument("--output", type=Path, default=Path("sector_checks.json"))
    args = parser.parse_args()
    candidates = json.loads(args.candidates.read_text(encoding="utf-8"))
    if len(candidates) > 6:
        parser.error("Review each batch before proceeding: at most six companies.")
    checks = json.loads(args.output.read_text(encoding="utf-8")) if args.output.exists() else []
    batch = datetime.now(timezone.utc).isoformat()
    async with make_client() as client:
        for source in candidates:
            result = {"source": source, "checked_at": datetime.now(timezone.utc).isoformat(), "batch": batch}
            try:
                if source["ats"] == "greenhouse":
                    board = await client.get(f"https://boards-api.greenhouse.io/v1/boards/{source['slug']}")
                    board.raise_for_status()
                    result["board_name"] = board.json().get("name")
                    result["board_description"] = board.json().get("content")
                    print(f"Board identity: {result['board_name']}", flush=True)
                jobs = await asyncio.wait_for(FETCHERS[source["ats"]](client, source, max_jobs=40, known=set()), timeout=100)
                result.update(count=len(jobs), jobs=[job.to_dict() for job in jobs])
                result["detail_errors"] = [{"job_id": job.job_id, "error": job.extra["detail_error"]} for job in jobs if job.extra.get("detail_error")]
                result["missing_dates"] = sum(not job.posted_at for job in jobs)
                result["missing_countries"] = sum(not job.country for job in jobs)
                print(f"{source['company']}: {len(jobs)} jobs", flush=True)
                for job in jobs[:3]:
                    print(f"  {job.title} | {job.location}", flush=True)
                print(f"  Metadata: {result['missing_dates']} undated; {result['missing_countries']} without explicit country; {len(result['detail_errors'])} detail errors", flush=True)
                if not jobs:
                    result["warning"] = "No jobs returned; do not treat this as a verified active board."
            except Exception as error:
                result["error"] = f"{type(error).__name__}: {error}"
                print(f"{source['company']}: {result['error'][:180]}", flush=True)
            checks.append(result)
            args.output.write_text(json.dumps(checks, indent=2), encoding="utf-8")


if __name__ == "__main__":
    asyncio.run(main())
