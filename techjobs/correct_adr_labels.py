"""Correct the earlier ADM/ADR identity mistake without discarding job records.

adr.org/careers redirects to adr.wd504.myworkdayjobs.com/ExternalCareers.
ADM's own careers page links to BrassRing, which was under maintenance during
this pass. Original state and changed exports are backed up before relabeling.
"""
import copy
import csv
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

from techjobs import load_state, save_state, STATE_FILE

OLD = "Archer-Daniels-Midland"
NEW = "American Arbitration Association"


def backup(path):
    target = path.with_name(path.name + ".before_bio.bak")
    if not target.exists():
        shutil.copyfile(path, target)


def rename(rows):
    count = 0
    for row in rows:
        if row.get("company") == OLD:
            row["company"] = NEW
            count += 1
    return count


def main():
    seen = load_state(STATE_FILE)
    prefix = "workday:" + OLD + ":"
    keys = [key for key in seen if key.startswith(prefix)]
    if keys:
        backup(STATE_FILE)
        for key in keys:
            value = seen.pop(key)
            seen.setdefault("workday:" + NEW + ":" + key[len(prefix):], value)
        save_state(STATE_FILE, seen)
    print(f"Relabeled {len(keys)} seen IDs; retained job IDs and first-seen dates")
    for path in sorted(Path(".").glob("jobs*.csv")):
        with path.open(encoding="utf-8-sig", newline="") as file:
            reader = csv.DictReader(file)
            fields, rows = reader.fieldnames, list(reader)
        count = rename(rows)
        if count:
            backup(path)
            with path.open("w", encoding="utf-8", newline="") as file:
                writer = csv.DictWriter(file, fieldnames=fields)
                writer.writeheader()
                writer.writerows(rows)
            print(path, count, "labels corrected")
    for path in sorted(Path(".").glob("jobs*.json")):
        text = path.read_text(encoding="utf-8")
        try:
            rows = json.loads(text)
            jsonl = False
        except json.JSONDecodeError:
            rows = [json.loads(line) for line in text.splitlines() if line.strip()]
            jsonl = True
        if not isinstance(rows, list):
            continue
        count = rename(rows)
        if count:
            backup(path)
            text = "".join(json.dumps(row) + "\n" for row in rows) if jsonl else json.dumps(rows, indent=2)
            path.write_text(text, encoding="utf-8")
            print(path, count, "labels corrected")
    path = Path("sector_checks.json")
    checks = json.loads(path.read_text(encoding="utf-8"))
    if not any(check["source"]["company"] == NEW for check in checks):
        corrected = copy.deepcopy(next(check for check in reversed(checks) if check["source"]["company"] == OLD and check.get("count")))
        corrected["source"]["company"] = NEW
        rename(corrected["jobs"])
        corrected["identity_correction"] = "Verified employer through https://www.adr.org/careers; earlier ADM label was incorrect."
        checks.append(corrected)
        checks.append({"source": {"company": OLD, "ats": "brassring", "url": "https://sjobs.brassring.com/TGnewUI/Search/home/Home?partnerid=25416&siteid=5998"},
                       "checked_at": datetime.now(timezone.utc).isoformat(),
                       "error": "Official ADM BrassRing portal reports scheduled maintenance; no ADM jobs verified in this pass."})
        path.write_text(json.dumps(checks, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
