#!/usr/bin/env python3
"""techjobs — pull new job postings straight from top tech companies' career systems.

Examples
  python techjobs.py                        # one pass: show jobs that are new since last run
  python techjobs.py --watch 10             # check every 10 minutes, print only new jobs
  python techjobs.py -k engineer -k "machine learning" --company amazon --company nvidia
  python techjobs.py --all --csv jobs.csv   # show/export everything currently open (US)
  python techjobs.py --list-companies
"""
from __future__ import annotations

import argparse
import asyncio
import csv
import json
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from dataclasses import fields as dataclass_fields

from rich.console import Console
from rich.table import Table

from companies import all_sources
from location import any_us
from sources import FETCHERS, Job, make_client
from sectors import SECTOR_COMPANIES, in_sector, role_tracks
from details import enrich_jobs
from neon_export import export_db

STATE_FILE = Path(__file__).with_name(".techjobs_seen.json")
console = Console()


# ------------------------------------------------------------------ state

def load_state(path: Path) -> dict[str, str]:
    try:
        return json.loads(path.read_text())
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def save_state(path: Path, seen: dict[str, str]) -> None:
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(seen))
    tmp.replace(path)


# ------------------------------------------------------------------ fetching

async def fetch_all(sources: list[dict], *, max_jobs: int, known: set[str], concurrency: int = 12):
    sem = asyncio.Semaphore(concurrency)
    wd_sem = asyncio.Semaphore(3)  # Workday rate-limits aggressively; keep few tenants in flight
    results: list[Job] = []
    errors: dict[str, str] = {}
    stats: dict[str, int] = {}

    async with make_client() as client:
        async def run(src: dict):
            fn = FETCHERS[src["ats"]]
            is_wd = src["ats"] == "workday"
            waits = (10, 30, 60) if is_wd else (2, 4)
            async with sem:
                gate = wd_sem if is_wd else asyncio.Semaphore(1)
                async with gate:
                    for attempt in range(len(waits) + 1):
                        try:
                            jobs = await fn(client, src, max_jobs=max_jobs, known=known)
                            results.extend(jobs)
                            stats[src["company"]] = len(jobs)
                            partial = sum(bool(job.extra.get("detail_error")) for job in jobs)
                            if partial:
                                errors[src["company"]] = f"{partial} detail requests failed; posting dates/countries may be incomplete"
                            return
                        except Exception as e:  # network blips, 429s, throttling, schema changes
                            if attempt == len(waits):
                                errors[src["company"]] = f"{type(e).__name__}: {str(e)[:120]}"
                            else:
                                await asyncio.sleep(waits[attempt])

        await asyncio.gather(*(run(s) for s in sources))
    return results, stats, errors


# ------------------------------------------------------------------ filtering

def keep(job: Job, args) -> bool:
    if not args.any_country:
        if job.country:
            if job.country not in ("United States", "United States of America", "US", "USA"):
                return False
        elif not any_us(job.locations, include_plain_remote=not args.strict_us):
            return False
    title = job.title.lower()
    if getattr(args, "bio_roles", False) and not role_tracks(job.title):
        return False
    if args.keyword and not any(k.lower() in title for k in args.keyword):
        return False
    if args.exclude and any(k.lower() in title for k in args.exclude):
        return False
    return True


def within(job: Job, hours: float | None) -> bool:
    if hours is None or not job.posted_at:
        return hours is None
    posted = datetime.fromisoformat(job.posted_at)
    return posted >= datetime.now(timezone.utc) - timedelta(hours=hours)


# ------------------------------------------------------------------ output

def show(jobs: list[Job], title: str) -> None:
    if not jobs:
        console.print(f"[dim]{title}: nothing new.[/dim]")
        return
    t = Table(title=title, show_lines=False, header_style="bold")
    t.add_column("Company", style="cyan", no_wrap=True)
    t.add_column("Title", overflow="fold")
    t.add_column("Location", overflow="fold", max_width=34)
    t.add_column("Posted", no_wrap=True)
    t.add_column("Link", overflow="fold", style="blue")
    for j in sorted(jobs, key=lambda j: (j.posted_at or "", j.company), reverse=True):
        t.add_row(j.company, j.title, j.location or "-", (j.posted_at or "")[:10] or "-", j.url)
    console.print(t)


def export(jobs: list[Job], args) -> None:
    rows = [j.to_dict() for j in jobs]
    if args.csv:
        new_file = not Path(args.csv).exists()
        if not new_file:
            with open(args.csv, newline='', encoding='utf-8') as existing:
                current_fields = next(csv.reader(existing), [])
            if getattr(args, 'details', False) and 'description_text' not in current_fields:
                raise ValueError('Detailed CSV requires a new filename; existing CSV uses the summary schema')
        with open(args.csv, "a", newline="", encoding="utf-8") as f:
            fields = ["company", "title", "location", "posted_at", "url", "department", "ats", "job_id", "country", "locations"]
            if getattr(args, 'details', False):
                fields = list(rows[0]) if rows else [field.name for field in dataclass_fields(Job) if field.name != 'extra'] + ['location']
            if not new_file:
                fields = current_fields
            w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
            if new_file:
                w.writeheader()
            for r in rows:
                r = dict(r)
                r["locations"] = " | ".join(r["locations"])
                for field in ('raw_details',):
                    if field in r:
                        r[field] = json.dumps(r[field], ensure_ascii=False)
                w.writerow(r)
    if args.json:
        with open(args.json, "a", encoding="utf-8") as f:
            for r in rows:
                f.write(json.dumps(r) + "\n")
    if getattr(args, 'db_json', None):
        written, rejected = export_db(rows, args.db_json)
        console.print(f'DB export: {written} draft records; {rejected} missing-description records excluded')


# ------------------------------------------------------------------ main loop

def select_sources(args) -> list[dict]:
    srcs = all_sources()
    if getattr(args, "sector", None):
        srcs = [s for s in srcs if in_sector(s["company"], args.sector)]
    if args.company:
        wanted = [c.lower() for c in args.company]
        srcs = [s for s in srcs if any(w in s["company"].lower() for w in wanted)]
    if args.ats:
        srcs = [s for s in srcs if s["ats"].split("_")[0] in args.ats]
    return srcs


async def one_pass(args, sources: list[dict]) -> None:
    seen = load_state(args.state)
    first_run = not seen
    t0 = time.perf_counter()
    # Workday needs details again when exporting existing jobs: list rows omit dates/countries.
    known = set() if args.all or args.since else set(seen)
    jobs, stats, errors = await fetch_all(sources, max_jobs=args.max_per_company, known=known)

    # dedupe within this pass (same job can appear on two pages)
    uniq = {j.key: j for j in jobs}
    matched = [j for j in uniq.values() if keep(j, args)]
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    new = [j for j in matched if j.key not in seen]
    for j in uniq.values():
        seen.setdefault(j.key, now)
    save_state(args.state, seen)

    candidates = [j for j in matched if within(j, args.since)] if args.all else [j for j in (matched if first_run else new) if within(j, (args.since or 24) if first_run else args.since)]
    if getattr(args, 'details', False):
        await enrich_jobs(candidates, sources)
        incomplete = [j for j in candidates if j.details_status != 'complete']
        console.print(f"Details: {len(candidates) - len(incomplete)}/{len(candidates)} full descriptions; {len(incomplete)} incomplete (see details_status/details_error)")
    took = time.perf_counter() - t0
    console.print(
        f"[bold]{len(stats)}[/bold] companies · [bold]{len(uniq)}[/bold] postings · "
        f"[bold]{len(matched)}[/bold] match filters · [green bold]{len(new)} new[/green bold] · {took:.1f}s"
    )
    for company, err in sorted(errors.items()):
        console.print(f"  [yellow]! {company}: {err}[/yellow]")

    if args.all:
        show([j for j in matched if within(j, args.since)], "All matching jobs")
        export([j for j in matched if within(j, args.since)], args)
    elif first_run:
        recent = [j for j in matched if within(j, args.since or 24)]
        console.print("[dim]First run: saved a baseline. Showing jobs posted in the last "
                      f"{args.since or 24:g}h; later runs show only brand-new postings.[/dim]")
        show(recent, "Recently posted")
        export(recent, args)
    else:
        new = [j for j in new if within(j, args.since)] if args.since else new
        show(new, f"New since last check ({now[11:16]} UTC)")
        export(new, args)
        if new and args.bell:
            sys.stdout.write("\a")


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("-k", "--keyword", action="append", help="title must contain this (repeatable, OR)")
    p.add_argument("-x", "--exclude", action="append", help="drop titles containing this (repeatable)")
    p.add_argument("-c", "--company", action="append", help="only these companies (substring, repeatable)")
    p.add_argument("--ats", action="append", choices=sorted({ats.split("_")[0] for ats in FETCHERS}))
    p.add_argument("--sector", action="append", choices=["life-sciences", *SECTOR_COMPANIES], help="only companies in this sector (repeatable, OR)")
    p.add_argument("--bio-roles", action="store_true", help="keep scientific, clinical, regulatory, agriculture, quality and engineering titles; retain all seniority levels")
    p.add_argument("--watch", type=float, metavar="MIN", help="keep running, checking every MIN minutes")
    p.add_argument("--all", action="store_true", help="show all matching open jobs, not just new ones")
    p.add_argument("--since", type=float, metavar="HOURS", help="only jobs posted within the last HOURS")
    p.add_argument("--max-per-company", type=int, default=300, help="newest N postings per big company (default 300)")
    p.add_argument("--strict-us", action="store_true", help="drop plain 'Remote' jobs with no country")
    p.add_argument("--any-country", action="store_true", help="disable the US location filter")
    p.add_argument("--csv", help="append matching/new jobs to this CSV")
    p.add_argument("--json", help="append matching/new jobs to this JSONL file")
    p.add_argument('--details', action='store_true', help='fetch full job descriptions, disclosed salary, application links and raw employer details')
    p.add_argument('--db-json', help='append draft records mapped to trail_dev.public.jobs; implies --details, does not write to the DB')
    p.add_argument("--bell", action="store_true", help="terminal bell when new jobs appear")
    p.add_argument("--state", type=Path, default=STATE_FILE, help="seen-jobs file (default .techjobs_seen.json)")
    p.add_argument("--reset", action="store_true", help="forget seen jobs and start a fresh baseline")
    p.add_argument("--list-companies", action="store_true")
    args = p.parse_args()
    if args.db_json:
        args.details = True

    sources = select_sources(args)
    if args.list_companies:
        for s in sorted(sources, key=lambda s: (s["ats"], s["company"])):
            console.print(f"{s['ats']:<15} {s['company']}")
        console.print(f"[bold]{len(sources)}[/bold] companies")
        return
    if not sources:
        sys.exit("No companies match your --company/--ats filters.")
    if args.reset and args.state.exists():
        args.state.unlink()

    if not args.watch:
        asyncio.run(one_pass(args, sources))
        return
    console.print(f"Watching {len(sources)} companies every {args.watch:g} min. Ctrl+C to stop.")
    try:
        while True:
            asyncio.run(one_pass(args, sources))
            time.sleep(args.watch * 60)
    except KeyboardInterrupt:
        console.print("\nStopped.")


if __name__ == "__main__":
    main()
