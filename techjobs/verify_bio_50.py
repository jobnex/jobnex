"""Verify the 50-company expansion and inspect one live job link per employer."""
import asyncio
import csv
import json
import re
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from companies import all_sources
from sectors import TALENT_POOL, company_sectors, role_tracks
from sources import make_client


async def main():
    baseline = json.loads(Path("bio_50_baseline.json").read_text(encoding="utf-8"))
    registry = all_sources()
    previous = {s["company"] for s in baseline}
    additions = [s for s in registry if s["company"] not in previous]
    assert len(baseline) == 533 and len(registry) == 583 and len(additions) == 50
    assert len({s["company"] for s in registry}) == len(registry)
    assert len({json.dumps({k: v for k, v in s.items() if k != "company"}, sort_keys=True) for s in registry}) == len(registry)
    checks = json.loads(Path("sector_checks.json").read_text(encoding="utf-8"))
    reviewed = []
    async with make_client() as client:
        async def inspect(source):
            check = next(c for c in reversed(checks) if c["source"] == source)
            assert check.get("count") and not check.get("error") and not check.get("detail_errors"), source
            assert company_sectors(source["company"]), source
            jobs = [j for j in check["jobs"] if not TALENT_POOL.search(j["title"]) and not re.search(r"careers@|don't see your role|future consideration", j["title"], re.I)]
            assert jobs, source
            assert all(j["title"] and j["job_id"] and j["url"].startswith("https://") for j in jobs), source
            job = jobs[0]
            response = await client.get(job["url"])
            title = re.search(r"<title[^>]*>(.*?)</title>", response.text, re.S | re.I)
            result = {"source": source, "sectors": company_sectors(source["company"]), "checked_at": check["checked_at"], "postings": check["count"], "board_name": check.get("board_name"), "sample_title": job["title"], "sample_url": job["url"], "sample_http_status": response.status_code, "sample_final_url": str(response.url), "page_title": title.group(1).strip() if title else None}
            print(f"{source['company']}: {check['count']} jobs; sample HTTP {response.status_code}; {result['page_title']}", flush=True)
            return result
        for start in range(0, len(additions), 6):
            batch = await asyncio.gather(*(inspect(s) for s in additions[start:start + 6]))
            reviewed.extend(batch)
            print(f"Reviewed {len(reviewed)}/50", flush=True)
    rows = list(csv.DictReader(Path("jobs_bio_all.csv").open(encoding="utf-8", newline="")))
    roles = list(csv.DictReader(Path("jobs_bio_roles.csv").open(encoding="utf-8", newline="")))
    json_rows = [json.loads(line) for line in Path("jobs_bio_all.jsonl").read_text(encoding="utf-8").splitlines()]
    key = lambda row: (row["ats"], row["company"], row["job_id"])
    assert len({key(row) for row in rows}) == len(rows) == len(json_rows)
    assert [key(row) for row in rows] == [key(row) for row in json_rows]
    assert all(company_sectors(row["company"]) for row in rows)
    assert all(role_tracks(row["title"]) for row in roles)
    assert {key(row) for row in roles} == {key(row) for row in rows if role_tracks(row["title"])}
    state = json.loads(Path(".techjobs_seen.json").read_text(encoding="utf-8"))
    # The state may wrap its IDs in a seen mapping.
    seen = state.get("seen", state)
    assert all(any(k.startswith(f"{s['ats']}:{s['company']}:") for k in seen) for s in additions)
    report = {"verified_at": datetime.now(timezone.utc).isoformat(), "starting_companies": len(baseline), "current_companies": len(registry), "added_companies": len(additions), "platforms": dict(Counter(s["ats"] for s in additions)), "fetched_postings": sum(r["postings"] for r in reviewed), "us_export_rows": len(rows), "scientific_role_rows": len(roles), "reviews": reviewed}
    Path("BIO_EXPANSION_50.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    assert all(r["sample_http_status"] == 200 for r in reviewed), "Inspect sample link failures in BIO_EXPANSION_50.json"
    print(json.dumps({k: v for k, v in report.items() if k != "reviews"}), flush=True)


if __name__ == "__main__":
    asyncio.run(main())
