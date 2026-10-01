"""Export the latest checked sector jobs and a reproducible coverage report.

The checks contain full small-board results and sampled large-board results.
Use techjobs.py --sector life-sciences --all for a larger collection.
"""
import argparse
import csv
import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from companies import all_sources
from location import any_us
from sectors import company_sectors, role_tracks, in_sector
from techjobs import load_state, save_state, STATE_FILE


def us_match(row, strict=False):
    country = row.get("country")
    if country:
        return country in {"United States", "United States of America", "US", "USA"}
    return any_us(row.get("locations", []), include_plain_remote=not strict)


def write_csv(path, rows):
    columns = ["sector", "track", "company", "title", "location", "posted_at", "url", "department", "ats", "job_id", "country", "locations", "checked_at"]
    with Path(path).open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=columns, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            writer.writerow({**row, "locations": " | ".join(row.get("locations", []))})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--checks", type=Path, default=Path("sector_checks.json"))
    parser.add_argument("--record-seen", action="store_true", help="record checked job IDs in the existing baseline")
    parser.add_argument("--strict-us", action="store_true")
    args = parser.parse_args()
    checks = json.loads(args.checks.read_text(encoding="utf-8"))
    registry = all_sources()
    sources = [source for source in registry if in_sector(source["company"], ["life-sciences"])]
    registered_names = {source["company"] for source in registry}
    latest = {}
    latest_attempt = {}
    for check in checks:
        latest_attempt[check["source"]["company"]] = check
        if check["source"] in sources:
            latest[check["source"]["company"]] = check
    rows, unique, seen = [], set(), load_state(STATE_FILE)
    for source in sources:
        check = latest.get(source["company"], {})
        if check.get("error"):
            continue
        for row in check.get("jobs", []):
            key = f"{row['ats']}:{row['company']}:{row['job_id']}"
            if key in unique:
                continue
            unique.add(key)
            if args.record_seen:
                seen.setdefault(key, check["checked_at"])
            if not us_match(row, args.strict_us):
                continue
            rows.append({**row, "sector": " | ".join(company_sectors(row["company"])),
                         "track": " | ".join(role_tracks(row["title"])) or "Other sector roles / talent pools",
                         "checked_at": check["checked_at"]})
    rows.sort(key=lambda row: (row.get("posted_at") or "", row["company"], row["title"]), reverse=True)
    scientific = [row for row in rows if role_tracks(row["title"])]
    write_csv("jobs_bio_all.csv", rows)
    write_csv("jobs_bio_roles.csv", scientific)
    with Path("jobs_bio_all.jsonl").open("w", encoding="utf-8") as file:
        for row in rows:
            file.write(json.dumps(row, ensure_ascii=False) + "\n")
    if args.record_seen:
        save_state(STATE_FILE, seen)

    active = [source for source in sources if latest.get(source["company"], {}).get("count") and not latest[source["company"]].get("error")]
    pending = [check for company, check in latest_attempt.items() if company not in registered_names]
    report = ["# Life-science coverage", "", f"Generated {datetime.now(timezone.utc).isoformat(timespec='seconds')}.", "",
              f"Registry: {len(registry)} unique companies. Sector coverage: {len(sources)} companies; {len(active)} returned jobs in their latest matching check.", "",
              f"Snapshot: {len(unique)} distinct postings before country filtering; {len(rows)} match the US policy; {len(scientific)} match scientific/technical role tracks.", "",
              "The snapshot is an inspected sample, not every open job at every company. Checks request up to 40 jobs from paginated boards; public boards that return the whole list may exceed 40. A company returning jobs does not imply all its endpoints or application links were checked.", "",
              "US policy uses explicit country first, then location text. Plain Remote and blank locations are included unless --strict-us is used. All seniority levels are retained. Talent pools stay in the all-role export but are excluded from scientific role tracks. Rows with no date are not asserted to be recent. Employer posting dates may represent updates or reposts.", "",
              "Sector groups overlap. Bioinformatics roles also appear at pharma, agricultural and biotech employers. The groups cover employers checked in this pass; they are not a complete worldwide company directory.", "",
              "## Corrected employer identity", "",
              "An earlier Workday entry labeled Archer-Daniels-Midland actually belonged to the American Arbitration Association. This was verified through https://www.adr.org/careers, which redirects to that Workday board. The registry, affected seen IDs, and existing CSV/JSON export labels were corrected; original changed files were backed up with .before_bio.bak suffixes. ADM's official BrassRing portal reported scheduled maintenance, so no genuine ADM postings were registered in this pass. The failed candidate is retained below.", "",
              "## Role matches (a job can match multiple tracks)", ""]
    for track, count in sorted(Counter(track for row in scientific for track in role_tracks(row["title"])).items()):
        report.append(f"- {track}: {count}")
    report += ["", "## Registered sector companies", "", "| Company | Platform | Fetched | US matches | Checked UTC | Status |", "|---|---|---:|---:|---|---|"]
    for source in sorted(sources, key=lambda source: source["company"].casefold()):
        check = latest.get(source["company"], {})
        count = check.get("count", 0)
        us_count = sum(us_match(row, args.strict_us) for row in check.get("jobs", []))
        status = check.get("error") or ("Returned jobs" if count else "Not checked" if not check else "No jobs")
        if check.get("detail_errors"):
            status += f" ({len(check['detail_errors'])} detail failures)"
        status = status.split("\n", 1)[0].replace("|", "\\|")[:240]
        report.append(f"| {source['company']} | {source['ats']} | {count} | {us_count} | {check.get('checked_at', '')[:19]} | {status} |")
    report += ["", "## Candidates needing further work", "", "These candidates were not registered. A failed or empty endpoint is not proof that an employer has no vacancies.", "", "| Company | Latest platform tried | Result |", "|---|---|---|"]
    for check in sorted(pending, key=lambda check: check["source"]["company"].casefold()):
        reason = check.get("error") or check.get("warning") or "Returned a board that still needs identity review"
        reason = reason.split("\n", 1)[0].replace("|", "\\|")[:240]
        report.append(f"| {check['source']['company']} | {check['source']['ats']} | {reason} |")
    report += ["", "## Re-run", "", "```powershell", "python techjobs.py --sector life-sciences --list-companies",
               "python techjobs.py --sector life-sciences --all --bio-roles --max-per-company 300 --csv bio_roles_next.csv",
               "python techjobs.py --sector agriculture --all --any-country --csv agriculture_global_next.csv",
               "python build_bio_outputs.py", "```", "",
               "CSV and JSONL collection flags append. Use a new export filename for each fresh snapshot to avoid duplicates. To verify more candidate boards, write at most six configs into sector_candidates.json, run sector_probe.py, inspect sector_checks.json and the printed job samples, then run register_sector.py only after reviewing successful identities. Update sectors.py when registering employers in a new group."]
    verification_path = Path('BIO_EXPANSION_100.json')
    if verification_path.exists():
        verification = json.loads(verification_path.read_text(encoding='utf-8'))
        report += ['', '## Latest 100-company expansion', '',
                   f"Verified {verification['verified_at']}: {verification['added_companies']} new companies across {len(verification['platforms'])} platforms returned {verification['fetched_postings']} sampled postings. The prior 50-company expansion was also rechecked successfully.", '',
                   f"One job-page link per new company was checked: {verification['sample_links_http_200']} returned HTTP 200. Ocular Therapeutix's employer pages returned HTTP 403 to automated requests; its public job-detail API returned HTTP 200 with the matching posting. Its browser application flow remains unverified.", '',
                   'Collector fixes: SuccessFactors tile layouts, short-page pagination, country normalization and posting-date recovery; SmartRecruiters requested job cap; Form Bio talent-pool classification. 21 automated tests passed.', '',
                   'Full source configurations, timestamps and sample URLs: BIO_EXPANSION_100.json. Failed, empty, stale and mismatched candidate boards were excluded from the new registrations.']
    Path("BIO_COVERAGE.md").write_text("\n".join(report) + "\n", encoding="utf-8")
    print(f"Registry {len(registry)}; sector companies {len(sources)}; latest successful {len(active)}; US rows {len(rows)}; role rows {len(scientific)}; unregistered candidates {len(pending)}")


if __name__ == "__main__":
    main()
