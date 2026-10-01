"""Build job-search preferences from extracted resume JSON, entirely offline.

Run: python scripts/resume_json_to_preferences.py resume.pdf.json preferences.json
Optional: --skills-file skills.json (JSON array of canonical skill names)
Optional: --overrides preferences.json (user-selected values take precedence)
"""

import argparse
import json
import re
import tempfile
from datetime import date
from pathlib import Path


SKILLS = (
    "Python", "SQL", "Java", "JavaScript", "TypeScript", "React", "Node.js",
    "Ruby", "RubyGems", "Go", "AWS", "Azure", "Google Cloud", "PyTorch",
    "TensorFlow", "Scikit-learn", "Pandas", "NumPy", "PySpark", "Apache Spark",
    "Kafka", "Databricks", "Snowflake", "FastAPI", "Flask", "Docker",
    "Kubernetes", "Terraform", "MLflow", "Apache Airflow", "LangChain",
    "LangGraph", "LlamaIndex", "FAISS", "Pinecone", "RAG", "NLP",
    "Hugging Face", "OpenCV", "Git", "CI/CD", "Power BI", "Grafana",
    "Prometheus", "MongoDB", "PostgreSQL", "Bash", "Scala", "XGBoost",
)
US_STATES = frozenset(
    "AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS "
    "MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC".split()
)
CITY = re.compile(r"\b([A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){0,3}),\s*([A-Z]{2})\b")
YEARS = re.compile(r"\b(\d{1,2})\+?\s+years?\s+(?:of\s+)?(?:professional\s+)?experience\b", re.I)
ROLE = re.compile(r"\b(?:engineer|scientist|developer|architect|analyst|designer|manager|consultant|technician)\b", re.I)
SECTION = re.compile(r"^[A-Z][A-Z &/]{3,}$")
DATE_RANGE = re.compile(r"\[?([A-Za-z]{3,9})\s+(20\d{2})\]?\s*[-–—]\s*\[?(Present|Current|[A-Za-z]{3,9}\s+20\d{2})\]?", re.I)
MONTHS = {name.lower(): number for number, name in enumerate(
    ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"), 1
)}


def section(text: str, heading: str) -> str:
    lines = text.splitlines()
    start = next((i + 1 for i, line in enumerate(lines) if " ".join(line.upper().split()) == heading), None)
    if start is None:
        return ""
    end = next((i for i in range(start, len(lines)) if SECTION.fullmatch(lines[i].strip())), len(lines))
    return "\n".join(lines[start:end])


def years_from_dates(experience: str) -> int | None:
    ranges = []
    for start_month, start_year, end in DATE_RANGE.findall(experience):
        month = MONTHS.get(start_month[:3].lower())
        if month is None:
            continue
        start = date(int(start_year), month, 1)
        if end.lower() in {"present", "current"}:
            finish = date.today()
        else:
            end_month, end_year = end.split()
            end_number = MONTHS.get(end_month[:3].lower())
            if end_number is None:
                continue
            finish = date(int(end_year), end_number, 1)
        if finish >= start:
            ranges.append((start, finish))
    if not ranges:
        return None
    earliest = min(start for start, _ in ranges)
    latest = max(finish for _, finish in ranges)
    return ((latest.year - earliest.year) * 12 + latest.month - earliest.month) // 12


def build_preferences(text: str, skill_names: tuple[str, ...] = SKILLS) -> dict:
    if not isinstance(text, str) or not text.strip():
        raise ValueError("Resume text is empty")
    experience = section(text, "PROFESSIONAL EXPERIENCE") or section(text, "EXPERIENCE")
    skills_text = section(text, "TECHNICAL SKILLS") or section(text, "SKILLS") or text

    cities = []
    for line in (experience or text).splitlines():
        for column in re.split(r"\s{2,}", line):
            for city, state in CITY.findall(column):
                if state in US_STATES and f"{city}, {state}" not in cities:
                    cities.append(f"{city}, {state}")
    compact_skills = " ".join(skills_text.split())
    skills = [name for name in skill_names if re.search(rf"(?<!\w){re.escape(name)}(?!\w)", compact_skills, re.I)]

    roles = []
    role_lines = list(re.split(r"\bPROFESSIONAL\s+SUMMARY\b", text, maxsplit=1, flags=re.I)[0].splitlines()) + experience.splitlines()
    for line in role_lines:
        line = line.strip()
        if not line or line.startswith(("•", "\uf0b7", "-", "�")):
            continue
        title = re.split(r"\s{2,}|\s*\|\s*", line)[0].strip()
        if ROLE.search(title) and len(title.split()) <= 6 and len(title) <= 60 and title not in roles:
            roles.append(title)

    years_match = YEARS.search(section(text, "PROFESSIONAL SUMMARY") or text)
    years = int(years_match.group(1)) if years_match else years_from_dates(experience)
    seniority = None if years is None else "Entry-level" if years <= 2 else "Mid-level" if years <= 5 else "Senior-level"
    country = "us" if cities else None
    return {
        "cities": cities[:3],
        "skills": skills,
        "country": country,
        "domains": roles,
        "currency": "USD" if country == "us" else None,
        "jobTypes": [],
        "salaryMax": None,
        "salaryMin": None,
        "seniority": seniority,
        "resumeFileName": None,
        "resumeUploaded": False,
        "experienceYears": years,
        "autofillFromResume": True,
        "selectedTemplateId": "modern-ivy",
        "includeSummarySections": True,
    }


def apply_overrides(preferences: dict, overrides: dict) -> dict:
    if not isinstance(overrides, dict) or set(overrides) - set(preferences):
        raise ValueError("Overrides must be an object containing only preference fields")
    result = preferences | overrides
    for field in ("cities", "skills", "domains", "jobTypes"):
        values = result[field]
        if not isinstance(values, list) or any(not isinstance(x, str) or not x.strip() for x in values):
            raise ValueError(f"{field} must be an array of nonempty strings")
    for field in ("country", "currency", "seniority", "resumeFileName", "selectedTemplateId"):
        value = result[field]
        if value is not None and (not isinstance(value, str) or not value.strip()):
            raise ValueError(f"{field} must be a string or null")
    if result["country"] is not None and not re.fullmatch(r"[a-z]{2}", result["country"]):
        raise ValueError("country must be a lowercase two-letter code")
    if result["currency"] is not None and not re.fullmatch(r"[A-Z]{3}", result["currency"]):
        raise ValueError("currency must be a three-letter uppercase code")
    for field in ("resumeUploaded", "autofillFromResume", "includeSummarySections"):
        if type(result[field]) is not bool:
            raise ValueError(f"{field} must be a boolean")
    for field in ("salaryMin", "salaryMax", "experienceYears"):
        value = result[field]
        if value is not None and (type(value) is not int or value < 0):
            raise ValueError(f"{field} must be a nonnegative integer or null")
    if result["salaryMin"] is not None and result["salaryMax"] is not None and result["salaryMin"] > result["salaryMax"]:
        raise ValueError("salaryMin cannot exceed salaryMax")
    if len(result["cities"]) > 3:
        raise ValueError("cities allows at most 3 entries")
    if "country" in overrides and "currency" not in overrides:
        result["currency"] = "USD" if result["country"] == "us" else None
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path, help="JSON from resume_to_json.py")
    parser.add_argument("output", type=Path, help="Preferences JSON to write")
    parser.add_argument("--skills-file", type=Path, help="Optional JSON array of skill names")
    parser.add_argument("--overrides", type=Path, help="JSON object of user-selected preference fields")
    args = parser.parse_args()

    source = json.loads(args.input.read_text(encoding="utf-8"))
    skill_names = SKILLS
    if args.skills_file:
        loaded = json.loads(args.skills_file.read_text(encoding="utf-8"))
        if not isinstance(loaded, list) or any(not isinstance(x, str) or not x.strip() for x in loaded):
            parser.error("skills file must be a JSON array of nonempty strings")
        skill_names = tuple(dict.fromkeys(loaded))
    preferences = build_preferences(source.get("text"), skill_names)
    if args.overrides:
        preferences = apply_overrides(preferences, json.loads(args.overrides.read_text(encoding="utf-8")))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=args.output.parent, suffix=".tmp", delete=False) as file:
            temporary = Path(file.name)
            json.dump(preferences, file, ensure_ascii=False, indent=2)
            file.write("\n")
        temporary.replace(args.output)
    finally:
        if temporary:
            temporary.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
