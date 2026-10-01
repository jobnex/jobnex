"""Register the reviewed successful sources in one candidate batch."""
import json
import re
from pathlib import Path

from companies import all_sources


def main():
    batch = json.loads(Path("sector_candidates.json").read_text(encoding="utf-8"))
    checks = json.loads(Path("sector_checks.json").read_text(encoding="utf-8"))
    current = {source["company"] for source in all_sources()}
    text = Path("companies.py").read_text(encoding="utf-8")
    for source in batch:
        check = next((item for item in reversed(checks) if item["source"] == source), {})
        if not check.get("count") or check.get("error") or source["company"] in current:
            continue
        ats = source["ats"]
        section = ats.upper() if ats in {"greenhouse", "lever", "ashby", "smartrecruiters", "workday"} else "CUSTOM"
        closing = "]" if section in {"WORKDAY", "CUSTOM"} else "}"
        pattern = rf"(?ms)(^{section} = [\[{{].*?)(^{re.escape(closing)})"
        if closing == "]":
            entry = dict(source)
            if section == "WORKDAY":
                entry.pop("ats")
            line = "    " + json.dumps(entry) + ",\n"
        else:
            line = "    " + json.dumps(source["slug"]) + ": " + json.dumps(source["company"]) + ",\n"
        text, count = re.subn(pattern, lambda match: match[1] + line + match[2], text, count=1)
        assert count == 1, section
        current.add(source["company"])
        print("Registered", source["company"])
    Path("companies.py").write_text(text, encoding="utf-8")


if __name__ == "__main__":
    main()
