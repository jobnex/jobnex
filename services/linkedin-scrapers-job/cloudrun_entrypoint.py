"""
Google Cloud Run Task Array Entrypoint.

When Cloud Run Job executes with --tasks 10 --parallelism 10:
Cloud Run injects CLOUD_RUN_TASK_INDEX (0 to 9) into each container.
This script maps that task index to one of the 10 scrapers, executing all 10
simultaneously in parallel across 10 isolated microVM containers.
"""
from __future__ import annotations

import importlib
import os
import sys
import time
from datetime import datetime, timezone

# Ensure project root is in sys.path
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

# 10 Role Scraper Mapping
ROLE_SCRAPERS: list[tuple[str, str]] = [
    ("analyst", "scrapers.scrape_analyst"),
    ("developer", "scrapers.scrape_developer"),
    ("consultant", "scrapers.scrape_consultant"),
    ("administrator", "scrapers.scrape_administrator"),
    ("engineer", "scrapers.scrape_engineer"),
    ("scrum_master", "scrapers.scrape_scrum_master"),
    ("project_manager", "scrapers.scrape_project_manager"),
    ("it", "scrapers.scrape_it"),
    ("researcher", "scrapers.scrape_researcher"),
    ("architect", "scrapers.scrape_architect"),
]


def main() -> None:
    # Cloud Run injects CLOUD_RUN_TASK_INDEX (0, 1, 2, ... 9)
    raw_task_idx = os.getenv("CLOUD_RUN_TASK_INDEX", "0")
    try:
        task_idx = int(raw_task_idx)
    except ValueError:
        task_idx = 0

    # Scrape lookback hours (default: 2 hours)
    raw_hours = os.getenv("SCRAPE_HOURS", "2")
    try:
        hours_old = int(raw_hours)
    except ValueError:
        hours_old = 2

    # Optional results cap per role (default: None = all available up to 1,000)
    raw_limit = os.getenv("SCRAPE_RESULTS_LIMIT")
    results_wanted = int(raw_limit) if raw_limit and raw_limit.isdigit() else None

    # Check bounds
    if task_idx < 0 or task_idx >= len(ROLE_SCRAPERS):
        print(f"[CLOUD_RUN] Notice: Task index {task_idx} is outside configured roles (0..{len(ROLE_SCRAPERS)-1}). Nothing to do.")
        sys.exit(0)

    role_name, module_name = ROLE_SCRAPERS[task_idx]
    now_utc = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    limit_str = f"{results_wanted}" if results_wanted else "ALL available"

    print("=================================================================")
    print(f"[{now_utc}] GOOGLE CLOUD RUN SCRAPER TASK #{task_idx}")
    print(f"Role: {role_name.upper()}")
    print(f"Module: {module_name}")
    print(f"Lookback: Past {hours_old} hours")
    print(f"Target: {limit_str}")
    print("=================================================================")

    # Anti-burst stagger so concurrent tasks don't hit at the exact same millisecond
    stagger_sec = (task_idx % 5) * 4
    if stagger_sec > 0:
        print(f"Applying anti-burst stagger: pausing {stagger_sec}s before request...")
        time.sleep(stagger_sec)

    start_time = time.time()
    try:
        mod = importlib.import_module(module_name)
        scrape_fn = getattr(mod, "scrape", None)
        if not callable(scrape_fn):
            raise AttributeError(f"Module '{module_name}' has no callable 'scrape()' function.")

        res = scrape_fn(hours_old=hours_old, results_wanted=results_wanted)
        elapsed = round(time.time() - start_time, 1)

        print("\n=================================================================")
        print(f"TASK #{task_idx} [{role_name.upper()}] FINISHED IN {elapsed}s")
        print(f"Valid US Jobs: {res.get('valid', 0)} (Contract: {res.get('contract', 0)}, Full-time: {res.get('full_time', 0)})")
        print(f"Inserted: {res.get('inserted', 0)} | Updated: {res.get('updated', 0)} | Failed: {res.get('failed', 0)}")
        print("=================================================================")

        # Exit 0 on success
        sys.exit(0)
    except Exception as exc:
        elapsed = round(time.time() - start_time, 1)
        print(f"\n[ERROR] Task #{task_idx} [{role_name.upper()}] failed after {elapsed}s: {exc}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        # Exit with error code so Cloud Run marks this task for retry
        sys.exit(1)


if __name__ == "__main__":
    main()
