"""Verify the 100-company expansion and inspect one live job link per employer."""
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
    baseline = json.loads(Path("bio_100_baseline.json").read_text(encoding="utf-8"))
    registry = all_sources()
    previous = {s["company"] for s in baseline}
    additions = [s for s in registry if s["company"] not in previous]
    assert len(baseline) == 583 and len(registry) == 683 and len(additions) == 100
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
            if response.status_code != 200 and source['ats'] == 'greenhouse':
                canonical_url = f"https://job-boards.greenhouse.io/{source['slug']}/jobs/{job['job_id']}"
                response = await client.get(canonical_url)
            title = re.search(r"<title[^>]*>(.*?)</title>", response.text, re.S | re.I)
            result = {"source": source, "sectors": company_sectors(source["company"]), "checked_at": check["checked_at"], "postings": check["count"], "board_name": check.get("board_name"), "sample_title": job["title"], "sample_url": job["url"], "sample_http_status": response.status_code, "sample_final_url": str(response.url), "page_title": title.group(1).strip() if title else None}
            if source['company'] == 'Ocular Therapeutix' and response.status_code == 403:
                detail = await client.get(f"https://boards-api.greenhouse.io/v1/boards/{source['slug']}/jobs/{job['job_id']}")
                detail.raise_for_status()
                assert str(detail.json()['id']) == job['job_id'] and detail.json().get('content')
                result['job_detail_http_status'] = detail.status_code
                result['link_limitation'] = 'Employer page blocks automated requests (HTTP 403). Public job detail API works; browser application flow not verified.'
            print(f"{source['company']}: {check['count']} jobs; sample HTTP {response.status_code}; {result['page_title']}", flush=True)
            return result
        for start in range(0, len(additions), 6):
            batch = await asyncio.gather(*(inspect(s) for s in additions[start:start + 6]))
            reviewed.extend(batch)
            print(f"Reviewed {len(reviewed)}/100", flush=True)
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
    prior = json.loads(Path('BIO_EXPANSION_50.json').read_text(encoding='utf-8'))
    assert prior['added_companies'] == 50 and all(r['sample_http_status'] == 200 for r in prior['reviews'])
    for review in prior['reviews']:
        latest = next(c for c in reversed(checks) if c['source'] == review['source'])
        assert latest.get('count') and not latest.get('error') and not latest.get('detail_errors')
    report = {"verified_at": datetime.now(timezone.utc).isoformat(), "starting_companies": len(baseline), "current_companies": len(registry), "added_companies": len(additions), "platforms": dict(Counter(s["ats"] for s in additions)), "fetched_postings": sum(r["postings"] for r in reviewed), "us_export_rows": len(rows), "scientific_role_rows": len(roles), "prior_50_recheck_at": prior['verified_at'], "sample_links_http_200": sum(r['sample_http_status'] == 200 for r in reviewed), "link_limitations": [r['source']['company'] for r in reviewed if r.get('link_limitation')], "reviews": reviewed}
    Path("BIO_EXPANSION_100.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    assert all(r['sample_http_status'] == 200 or (r['source']['company'] == 'Ocular Therapeutix' and r['sample_http_status'] == 403 and r.get('job_detail_http_status') == 200) for r in reviewed), 'Unexpected sample link failure'
    print(json.dumps({k: v for k, v in report.items() if k != "reviews"}), flush=True)


if __name__ == "__main__":
    asyncio.run(main())
