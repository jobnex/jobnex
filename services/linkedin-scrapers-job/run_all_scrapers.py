"""
Master Orchestrator Runner for All 10 Role Scrapers.

1. Initial Run: Scrapes last 24 hours of jobs for all 10 roles.
2. Continuous Daemon: Runs every 2 hours getting jobs posted in the past 3 hours.
3. Plain direct LinkedIn URL saved as external_apply_url.
4. Automatically tags 'contract' vs 'full_time' and saves directly to trail_dev Neon DB.
"""
from __future__ import annotations

import argparse
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

# Ensure project root in sys.path
PROJECT_ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(PROJECT_ROOT))

from scrapers import (
    scrape_administrator,
    scrape_analyst,
    scrape_architect,
    scrape_consultant,
    scrape_developer,
    scrape_engineer,
    scrape_it,
    scrape_project_manager,
    scrape_researcher,
    scrape_scrum_master,
)

ALL_SCRAPERS = [
    ("analyst", scrape_analyst.scrape),
    ("developer", scrape_developer.scrape),
    ("consultant", scrape_consultant.scrape),
    ("administrator", scrape_administrator.scrape),
    ("engineer", scrape_engineer.scrape),
    ("scrum_master", scrape_scrum_master.scrape),
    ("project_manager", scrape_project_manager.scrape),
    ("it", scrape_it.scrape),
    ("researcher", scrape_researcher.scrape),
    ("architect", scrape_architect.scrape),
]


def run_cycle(hours_old: int = 24, results_per_role: int | None = None, max_workers: int = 2) -> dict:
    """Execute a scrape cycle across all 10 roles."""
    start_time = time.time()
    now_utc = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    print(f"\n=======================================================")
    print(f"[{now_utc}] Starting scrape cycle across all 10 roles (hours_old={hours_old}, workers={max_workers})...")
    print(f"=======================================================")

    total_found = 0
    total_valid = 0
    total_contract = 0
    total_fulltime = 0
    total_inserted = 0
    total_updated = 0
    total_failed = 0
    role_results = []

    # Safe concurrency to avoid LinkedIn 429 IP rate limits
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {}
        for role_name, scraper_fn in ALL_SCRAPERS:
            f = executor.submit(scraper_fn, hours_old=hours_old, results_wanted=results_per_role)
            futures[f] = role_name
            time.sleep(0.5)  # slight stagger
        for future in as_completed(futures):
            role_name = futures[future]
            try:
                res = future.result()
                role_results.append(res)
                total_found += res.get("found", 0)
                total_valid += res.get("valid", 0)
                total_contract += res.get("contract", 0)
                total_fulltime += res.get("full_time", 0)
                total_inserted += res.get("inserted", 0)
                total_updated += res.get("updated", 0)
                total_failed += res.get("failed", 0)
                print(
                    f"-> [{role_name.upper()}] Done: {res.get('valid', 0)} valid "
                    f"({res.get('contract', 0)} contract, {res.get('full_time', 0)} full-time) | "
                    f"+{res.get('inserted', 0)} new, ~{res.get('updated', 0)} updated"
                )
            except Exception as exc:
                print(f"-> [{role_name.upper()}] Exception: {exc}")
                total_failed += 1

    elapsed = round(time.time() - start_time, 1)
    print(f"\n=======================================================")
    print(f"Cycle completed in {elapsed}s!")
    print(f"Total Raw Found: {total_found}")
    print(f"Total Valid US Jobs: {total_valid} (Contract: {total_contract}, Full-Time: {total_fulltime})")
    print(f"Total Inserted: {total_inserted}")
    print(f"Total Updated: {total_updated}")
    print(f"Total Failed: {total_failed}")
    print(f"=======================================================\n")

    return {
        "timestamp": now_utc,
        "elapsed_seconds": elapsed,
        "total_found": total_found,
        "total_valid": total_valid,
        "total_contract": total_contract,
        "total_full_time": total_fulltime,
        "total_inserted": total_inserted,
        "total_updated": total_updated,
        "total_failed": total_failed,
        "roles": role_results,
    }


def run_daemon(
    interval_seconds: int = 7200,
    loop_hours: int = 3,
    initial_hours: int = 24,
    max_workers: int = 2,
    results_per_role: int | None = None,
):
    """
    Continuous runner:
    1. Run initial 24h pull.
    2. Loop every 2h fetching past 3h (1h safety overlap).
    """
    print("=======================================================")
    print("10-ROLE LINKEDIN SCRAPER MASTER DAEMON")
    print(f"1. Initial Lookback: {initial_hours} hours")
    print(f"2. Loop Interval: {interval_seconds // 3600} hours ({interval_seconds}s)")
    print(f"3. Loop Lookback: {loop_hours} hours (1-hour safety overlap)")
    print(f"4. Worker Concurrency: {max_workers}")
    print(f"5. Target per Role: {'ALL available' if results_per_role is None else results_per_role}")
    print("=======================================================")

    # Initial 24h run
    try:
        run_cycle(hours_old=initial_hours, results_per_role=results_per_role, max_workers=max_workers)
    except Exception as exc:
        print(f"Initial run notice: {exc}")

    # 2-hour loop
    cycle_count = 1
    while True:
        next_run_epoch = time.time() + interval_seconds
        next_run_str = datetime.fromtimestamp(next_run_epoch, tz=timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
        print(f"Sleeping {interval_seconds}s (next run at {next_run_str})...")

        try:
            time.sleep(interval_seconds)
        except KeyboardInterrupt:
            print("\nDaemon stopped by user.")
            break

        cycle_count += 1
        print(f"\n--- Starting Scheduled Cycle #{cycle_count} ---")
        try:
            run_cycle(hours_old=loop_hours, results_per_role=results_per_role, max_workers=max_workers)
        except Exception as exc:
            print(f"Scheduled cycle #{cycle_count} error: {exc}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Master runner for 10 LinkedIn role scrapers")
    parser.add_argument("--once", action="store_true", help="Run a single scrape cycle and exit")
    parser.add_argument("--hours", type=int, default=24, help="Hours old for single run (default: 24)")
    parser.add_argument("--results", type=int, default=None, help="Max results wanted per role (default: None for all available)")
    parser.add_argument("--workers", type=int, default=2, help="Parallel role workers (default: 2; safe for direct IP)")
    parser.add_argument("--interval", type=int, default=7200, help="Daemon sleep interval in seconds (default: 7200 = 2h)")
    parser.add_argument("--loop-hours", type=int, default=3, help="Daemon lookback hours per cycle (default: 3)")
    args = parser.parse_args()

    if args.once:
        run_cycle(hours_old=args.hours, results_per_role=args.results, max_workers=args.workers)
    else:
        run_daemon(
            interval_seconds=args.interval,
            loop_hours=args.loop_hours,
            initial_hours=args.hours,
            max_workers=args.workers,
            results_per_role=args.results,
        )
