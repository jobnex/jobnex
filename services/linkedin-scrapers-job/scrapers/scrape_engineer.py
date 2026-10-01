"""
Scraper for Role 5: Engineer
Target: Software Engineer, DevOps Engineer, Cloud Engineer, Data Engineer, QA Engineer, etc.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

# Ensure package import
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from scrapers.base_scraper import execute_role_scrape

ROLE_KEY = "engineer"
SEARCH_TERM = "engineer"


def scrape(hours_old: int = 24, results_wanted: int | None = None) -> dict:
    return execute_role_scrape(
        role_key=ROLE_KEY,
        search_term=SEARCH_TERM,
        hours_old=hours_old,
        results_wanted=results_wanted,
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=f"Scrape LinkedIn jobs for {ROLE_KEY}")
    parser.add_argument("--hours", type=int, default=24, help="Lookback hours (default: 24)")
    parser.add_argument("--results", type=int, default=None, help="Max results wanted (default: None for all available)")
    args = parser.parse_args()

    scrape(hours_old=args.hours, results_wanted=args.results)
