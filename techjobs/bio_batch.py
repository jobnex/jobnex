"""Prepare and register manually reviewed expansion batches using existing helpers."""
import json
import sys
from pathlib import Path

from companies import all_sources
from sectors import TALENT_POOL
import register_sector

queue = json.loads(Path("bio_100_queue.json").read_text(encoding="utf-8"))
if sys.argv[1] == "prepare":
    start = int(sys.argv[2])
    batch = [item["source"] for item in queue[start:start + 6]]
    Path("sector_candidates.json").write_text(json.dumps(batch, indent=2), encoding="utf-8")
    print("Prepared", [s["company"] for s in batch])
elif sys.argv[1] == "accept":
    batch = json.loads(Path("sector_candidates.json").read_text(encoding="utf-8"))
    checks = json.loads(Path("sector_checks.json").read_text(encoding="utf-8"))
    current = all_sources()
    accepted = []
    for source in batch:
        check = next((c for c in reversed(checks) if c["source"] == source), {})
        if check.get("error") or not check.get("count") or check.get("detail_errors"):
            continue
        jobs = [j for j in check.get("jobs", []) if not TALENT_POOL.search(j["title"])]
        if not jobs or all("test" in j["title"].lower() for j in jobs):
            continue
        config = {k: v for k, v in source.items() if k != "company"}
        assert not any({k: v for k, v in s.items() if k != "company"} == config and s["company"] != source["company"] for s in current), source
        accepted.append(source)
    Path("sector_candidates.json").write_text(json.dumps(accepted, indent=2), encoding="utf-8")
    register_sector.main()
    text = Path("sectors.py").read_text(encoding="utf-8")
    tags = {}
    for source in accepted:
        item = next(i for i in queue if i["source"] == source)
        for sector in item["sectors"]:
            tags.setdefault(sector, set()).add(source["company"])
    lines = "".join(f"SECTOR_COMPANIES[{sector!r}].update({names!r})\n" for sector, names in tags.items())
    marker = "ROLE_PATTERNS = {track: re.compile(pattern, re.I) for track, pattern in ROLE_PATTERNS.items()}"
    assert marker in text
    Path("sectors.py").write_text(text.replace(marker, lines + marker), encoding="utf-8")
    print("Accepted", len(accepted), "companies")
