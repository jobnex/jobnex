from __future__ import annotations

import json
import os
import random
import re
import threading
import time
import urllib.parse
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parents[1]
load_dotenv(PROJECT_ROOT / ".env")
load_dotenv()

# Fallback US Country UUID in trail_dev
DEFAULT_US_COUNTRY_ID = "a1db6c16-6fc2-4bb8-809d-ee752c2a2573"
NAMESPACE_JOB = uuid.UUID("6ba7b810-9dad-11d1-80b4-00c04fd430c8")

US_LOCATION_PATTERNS = [
    "united states", "usa", "u.s.", "u.s.a.", "remote",
    ", al", ", ak", ", az", ", ar", ", ca", ", co", ", ct", ", de", ", fl", ", ga",
    ", hi", ", id", ", il", ", in", ", ia", ", ks", ", ky", ", la", ", me", ", md",
    ", ma", ", mi", ", mn", ", ms", ", mo", ", mt", ", ne", ", nv", ", nh", ", nj",
    ", nm", ", ny", ", nc", ", nd", ", oh", ", ok", ", or", ", pa", ", ri", ", sc",
    ", sd", ", tn", ", tx", ", ut", ", vt", ", va", ", wa", ", wv", ", wi", ", wy"
]


def get_db_url() -> str:
    raw = (
        os.getenv("TRAIL_DEV_DB_URL")
        or os.getenv("DATABASE_URL")
    )
    if not raw:
        raise RuntimeError("TRAIL_DEV_DB_URL or DATABASE_URL is required")
    return raw.replace("-pooler", "")


def get_connection():
    """Create a resilient pure-python pg8000 connection to Neon DB (trail_dev)."""
    import pg8000.native
    db_url = get_db_url()
    u = urllib.parse.urlparse(db_url)
    return pg8000.native.Connection(
        user=u.username,
        password=u.password,
        host=u.hostname,
        port=u.port or 5432,
        database=u.path.lstrip("/"),
        ssl_context=True,
    )


_US_COUNTRY_ID_CACHE: str | None = None


def get_us_country_id(con=None) -> str:
    global _US_COUNTRY_ID_CACHE
    if _US_COUNTRY_ID_CACHE:
        return _US_COUNTRY_ID_CACHE
    try:
        should_close = False
        if con is None:
            con = get_connection()
            should_close = True
        rows = con.run("SELECT id FROM countries WHERE code = 'US' LIMIT 1;")
        if rows and rows[0]:
            _US_COUNTRY_ID_CACHE = str(rows[0][0])
        if should_close:
            con.close()
    except Exception:
        _US_COUNTRY_ID_CACHE = DEFAULT_US_COUNTRY_ID
    return _US_COUNTRY_ID_CACHE or DEFAULT_US_COUNTRY_ID


def is_us_location(location: str | None) -> bool:
    if not location:
        return True
    loc = location.lower()
    return any(ind in loc for ind in US_LOCATION_PATTERNS)


def canonical_linkedin_url(url: str | None) -> str:
    if not url:
        return ""
    cand = url.strip()
    m = re.search(r"/jobs/view/(\d+)", cand)
    if m:
        return f"https://www.linkedin.com/jobs/view/{m.group(1)}"
    m_qid = re.search(r"[?&]currentJobId=(\d+)", cand)
    if m_qid:
        return f"https://www.linkedin.com/jobs/view/{m_qid.group(1)}"
    # Strip tracking queries
    parsed = urllib.parse.urlparse(cand)
    return f"{parsed.scheme}://{parsed.netloc}{parsed.path}"


def generate_job_uuid(canonical_url: str) -> str:
    return str(uuid.uuid5(NAMESPACE_JOB, canonical_url))


def detect_employment_type(raw_type: str | None, title: str, description: str) -> str:
    """Classifies employment type into valid enum values: contract, full_time, part_time, internship, temporary, freelance."""
    title_lower = title.lower()
    # 1. Title is the clearest direct indicator of contract work
    if any(w in title_lower for w in ["contract", "contractor", "c2c", "1099", "corp-to-corp", "c2h", "temp-to-hire", "w2 contract"]):
        return "contract"

    # 2. Check description contract terms vs full-time terms
    combined = f"{title}\n{description[:2500]}".lower()
    contract_matches = len(re.findall(r"\b(contract|contractor|c2c|corp-to-corp|1099|w2 contract|contract-to-hire|hourly rate|contract duration|long term contract)\b", combined))
    fulltime_matches = len(re.findall(r"\b(full-time|full time|permanent|direct hire|fulltime|fte)\b", combined))

    if contract_matches > fulltime_matches:
        return "contract"

    # 3. Check LinkedIn raw metadata tag
    if raw_type:
        jt = str(raw_type).lower().replace("-", "_").strip()
        if any(w in jt for w in ["contract", "c2c", "1099"]):
            return "contract"
        if any(w in jt for w in ["full", "permanent", "direct"]):
            return "full_time"
        if "part" in jt:
            return "part_time"
        if "intern" in jt:
            return "internship"
        if "temp" in jt:
            return "temporary"
        if "free" in jt:
            return "freelance"

    return "full_time"


def detect_work_model(is_remote_flag: bool, location: str, title: str, description: str) -> str:
    combined = f"{location} {title} {description[:1200]}".lower()
    if "hybrid" in combined:
        return "hybrid"
    if is_remote_flag or any(w in combined for w in ["remote", "work from home", "wfh", "telecommute", "virtual"]):
        return "remote"
    return "on_site"


def extract_salary_from_text(text: str) -> tuple[int | None, int | None, str]:
    """
    High-accuracy salary extractor from job description text.
    Handles:
      - $120,000 - $150,000 / year or per year or annually
      - $116,200 to $229,100
      - $120k to $145k or $120 - $145k
      - $50.00 - $75.00 / hour or / hr
      - Salary Range: $100,000 - $130,000
    Avoids benefits (401k, tuition, bonus, etc.).
    """
    if not text:
        return None, None, "USD"

    clean_text = text.replace("&nbsp;", " ").replace("\u00a0", " ").replace("\\", "")

    def parse_amount(val_str: str) -> int | None:
        if not val_str:
            return None
        v = val_str.lower().strip().replace("$", "").replace(",", "").strip()
        if not v:
            return None
        is_k = False
        if v.endswith("k"):
            v = v[:-1].strip()
            is_k = True
        try:
            num = float(v)
            if is_k and num < 1000:
                num *= 1000
            return int(round(num))
        except ValueError:
            return None

    negative_prefixes = r"(?:bonus|sign-on|signing|tuition|reimbursement|401\s*\(?k\)?|stipend|revenue|budget|assets|valued\s+at)"
    num_token = r"\$?[ \t]*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?(?:[ \t]*[kK]\b)?|[0-9]{2,3}[ \t]*[kK]\b)"

    # Pattern 1: Explicit labeled salary lines (highest accuracy)
    p_labeled = re.compile(
        r"(?:base\s+)?(?:salary|pay|compensation|rate)\s*(?:range)?\s*[*_]*[:\-][*_]*\s*"
        + num_token +
        r"(?:[ \t]*(?:-|to|–|—)\s*" + num_token + r")?"
        r"(?:[ \t]*(?:/|\bper\b)\s*(hour|hr|year|yr|annum|month|mo))?",
        re.IGNORECASE
    )

    for m in p_labeled.finditer(clean_text):
        start_idx = max(0, m.start() - 30)
        preceding = clean_text[start_idx:m.start()].lower()
        if re.search(negative_prefixes, preceding):
            continue
        v1 = parse_amount(m.group(1))
        v2 = parse_amount(m.group(2)) if m.group(2) else v1
        if v1:
            if v2 and v2 >= 10000 and v1 < 1000:
                v1 *= 1000
            if v2 and v2 < v1:
                v1, v2 = v2, v1
            if v1 < 10 or v1 == 5250:
                continue
            return v1, v2, "USD"

    # Pattern 2: Explicit range with dollar signs: "$120,000 - $150,000" or "$120k to $145k" or "$50 - $70/hr"
    p_range = re.compile(
        r"\$\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?(?:[ \t]*[kK]\b)?|[0-9]{2,3}[ \t]*[kK]\b)"
        r"[ \t]*(?:-|to|–|—)\s*"
        r"\$?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?(?:[ \t]*[kK]\b)?|[0-9]{2,3}[ \t]*[kK]\b)"
        r"(?:[ \t]*(?:/|\bper\b)\s*(hour|hr|year|yr|annum|month|mo))?",
        re.IGNORECASE
    )

    for m in p_range.finditer(clean_text):
        start_idx = max(0, m.start() - 30)
        preceding = clean_text[start_idx:m.start()].lower()
        if re.search(negative_prefixes, preceding):
            continue
        v1 = parse_amount(m.group(1))
        v2 = parse_amount(m.group(2))
        if v1 and v2:
            if v2 >= 10000 and v1 < 1000:
                v1 *= 1000
            if v2 < v1:
                v1, v2 = v2, v1
            if v1 < 10 or v1 == 5250:
                continue
            return v1, v2, "USD"

    # Pattern 3: Explicit single figure with rate keyword: "$140,000 per year" or "$65/hr"
    p_single = re.compile(
        r"\$\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?(?:[ \t]*[kK]\b)?|[0-9]{2,3}[ \t]*[kK]\b)"
        r"[ \t]*(?:/|\bper\b)\s*(hour|hr|year|yr|annum)",
        re.IGNORECASE
    )

    for m in p_single.finditer(clean_text):
        start_idx = max(0, m.start() - 30)
        preceding = clean_text[start_idx:m.start()].lower()
        if re.search(negative_prefixes, preceding):
            continue
        v = parse_amount(m.group(1))
        if v and v >= 10 and v != 5250:
            return v, v, "USD"

    return None, None, "USD"


def parse_salary(row: dict[str, Any], description: str = "") -> tuple[int | None, int | None, str]:
    min_sal = row.get("min_amount")
    max_sal = row.get("max_amount")
    raw_curr = str(row.get("currency") or "USD").upper().strip()
    currency = raw_curr if (len(raw_curr) == 3 and raw_curr.isalpha() and raw_curr != "NAN") else "USD"
    s_min = int(min_sal) if min_sal is not None and not (isinstance(min_sal, float) and min_sal != min_sal) else None
    s_max = int(max_sal) if max_sal is not None and not (isinstance(max_sal, float) and max_sal != max_sal) else None

    # Fallback to high-accuracy description text extraction
    if s_min is None and description:
        d_min, d_max, d_curr = extract_salary_from_text(description)
        if d_min is not None:
            s_min, s_max = d_min, d_max
            if d_curr:
                currency = d_curr

    if currency in ("NAN", "NONE", "") or len(currency) != 3 or not currency.isalpha():
        currency = "USD"
    return s_min, s_max, currency


def save_jobs_to_db(jobs: list[dict[str, Any]], role_source: str = "linkedin") -> dict[str, int]:
    """Persist processed jobs into trail_dev public.jobs table with ON CONFLICT (id) DO UPDATE."""
    if not jobs:
        return {"inserted": 0, "updated": 0, "failed": 0}

    con = get_connection()
    us_country_id = get_us_country_id(con)
    inserted = 0
    updated = 0
    failed = 0

    insert_sql = """
        INSERT INTO jobs (
            id, source_service, job_role_title, job_description, company_name,
            location, country_id, employment_type, work_model, salary_min,
            salary_max, currency, status, is_external, external_apply_url,
            requirements, job_source, experience_required, visa_sponsorship,
            created_at, updated_at, published_at
        ) VALUES (
            :id, :source_service, :job_role_title, :job_description, :company_name,
            :location, :country_id, :employment_type, :work_model, :salary_min,
            :salary_max, :currency, 'published', true, :external_apply_url,
            '[]'::jsonb, 'linkedin', :experience_required, :visa_sponsorship,
            NOW(), NOW(), :published_at
        )
        ON CONFLICT (id) DO UPDATE SET
            job_role_title = EXCLUDED.job_role_title,
            job_description = EXCLUDED.job_description,
            company_name = EXCLUDED.company_name,
            location = EXCLUDED.location,
            employment_type = EXCLUDED.employment_type,
            work_model = EXCLUDED.work_model,
            salary_min = COALESCE(EXCLUDED.salary_min, jobs.salary_min),
            salary_max = COALESCE(EXCLUDED.salary_max, jobs.salary_max),
            external_apply_url = EXCLUDED.external_apply_url,
            published_at = EXCLUDED.published_at,
            status = 'published',
            updated_at = NOW()
        RETURNING (xmax = 0) AS is_inserted;
    """

    for job in jobs:
        try:
            params = {
                "id": job["id"],
                "source_service": f"scraper-{role_source}",
                "job_role_title": job["title"],
                "job_description": job["description"],
                "company_name": job["company"],
                "location": job["location"],
                "country_id": us_country_id,
                "employment_type": job["employment_type"],
                "work_model": job["work_model"],
                "salary_min": job["salary_min"],
                "salary_max": job["salary_max"],
                "currency": job["currency"],
                "external_apply_url": job["external_apply_url"],
                "experience_required": job.get("experience_required"),
                "visa_sponsorship": bool(job.get("visa_sponsorship", False)),
                "published_at": job["published_at"],
            }
            res = con.run(insert_sql, **params)
            if res and res[0][0]:
                inserted += 1
            else:
                updated += 1
        except Exception as e:
            failed += 1
            print(f"Error saving job {job.get('title')} ({job.get('id')}): {e}")

    con.close()
    return {"inserted": inserted, "updated": updated, "failed": failed}


_JSON_LOCK = threading.Lock()


def append_to_local_applications(jobs: list[dict[str, Any]]) -> int:
    """Also keep local applications.json updated for the dashboard UI."""
    json_path = PROJECT_ROOT / "sudees_job_tracker" / "applications.json"
    if not json_path.exists():
        return 0
    with _JSON_LOCK:
        try:
            with open(json_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            apps = data.get("applications", []) if isinstance(data, dict) else data
            existing_urls = {a.get("source_url") for a in apps if a.get("source_url")}
            added = 0
            now_str = datetime.now(timezone.utc).isoformat()
            for j in jobs:
                if j["external_apply_url"] in existing_urls:
                    continue
                apps.insert(0, {
                    "id": j["id"],
                    "title": j["title"],
                    "company": j["company"],
                    "location": j["location"],
                    "apply_url": j["external_apply_url"],
                    "source_url": j["external_apply_url"],
                    "job_type": j["employment_type"],
                    "work_model": j["work_model"],
                    "salary_min": j.get("salary_min"),
                    "salary_max": j.get("salary_max"),
                    "currency": j.get("currency", "USD"),
                    "stage": "Not applied",
                    "applied_at": now_str,
                    "created_at": now_str,
                    "updated_at": now_str,
                    "is_direct_apply": True,
                })
                existing_urls.add(j["external_apply_url"])
                added += 1

            if isinstance(data, dict):
                data["applications"] = apps
            else:
                data = apps
            with open(json_path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2)
            return added
        except Exception as exc:
            print(f"Local applications.json notice: {exc}")
            return 0


def _ensure_jobspy_patched():
    """Ensure JobSpy does not suffer from the quadratic start offset bug that skips jobs and limits results to 140."""
    try:
        import jobspy.linkedin
        import inspect
        target = Path(inspect.getfile(jobspy.linkedin))
        code = target.read_text(encoding="utf-8")
        if "start += len(job_list)" in code:
            code = code.replace("start += len(job_list)", "start += len(job_cards)")
            target.write_text(code, encoding="utf-8")
    except Exception:
        pass


def execute_role_scrape(
    role_key: str,
    search_term: str,
    hours_old: int = 24,
    results_wanted: int | None = None,
    batch_size: int = 100,
) -> dict[str, Any]:
    """
    Universal execution function for scraping one role:
    - If results_wanted is None, scrapes ALL available jobs up to LinkedIn's 1,000 ceiling.
    - Writes to Neon DB & applications.json incrementally after every 100 jobs.
    - Tags contract vs full_time, work_model, etc.
    """
    _ensure_jobspy_patched()
    limit_str = f"{results_wanted}" if results_wanted else "ALL available"
    print(f"[{role_key.upper()}] Starting LinkedIn scrape: query='{search_term}', past {hours_old}h (target: {limit_str}, flush every {batch_size})...")

    try:
        from jobspy import scrape_jobs
    except ImportError:
        raise RuntimeError("JobSpy not installed. Run: pip install python-jobspy")

    proxies_env = os.getenv("SCRAPER_PROXIES") or os.getenv("HTTP_PROXY")
    proxies_list = [p.strip() for p in proxies_env.split(",") if p.strip()] if proxies_env else None

    # Max target depth (LinkedIn guest ceiling is 1,000)
    max_target = results_wanted if results_wanted and results_wanted > 0 else 1000
    max_target = min(max_target, 1000)

    seen_urls: set[str] = set()
    offset = 0
    batch_num = 0
    total_raw_found = 0
    total_valid_us = 0
    total_contracts = 0
    total_fulltime = 0
    total_inserted = 0
    total_updated = 0
    total_failed = 0
    total_local_added = 0

    MODERN_USER_AGENTS = [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.7; rv:131.0) Gecko/20100101 Firefox/131.0",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15",
    ]

    while offset < max_target:
        chunk_wanted = min(batch_size, max_target - offset)
        if chunk_wanted <= 0:
            break

        if offset > 0:
            time.sleep(1.5)  # polite pagination pacing

        ua = random.choice(MODERN_USER_AGENTS)
        frame = None
        for attempt in range(1, 4):
            try:
                frame = scrape_jobs(
                    site_name=["linkedin"],
                    search_term=search_term,
                    location="United States",
                    results_wanted=chunk_wanted,
                    offset=offset,
                    hours_old=hours_old,
                    linkedin_fetch_description=True,
                    description_format="markdown",
                    proxies=proxies_list,
                    user_agent=ua,
                    verbose=0,
                )
                break
            except Exception as exc:
                err_msg = str(exc)
                if "429" in err_msg and attempt < 3:
                    wait_sec = 25 * attempt
                    print(f"[{role_key.upper()}] LinkedIn rate limit (429) hit. Pausing {wait_sec}s for cooldown (attempt {attempt}/3)...")
                    time.sleep(wait_sec)
                    continue
                print(f"[{role_key.upper()}] Scraping error from JobSpy at offset {offset}: {exc}")
                break

        if frame is None or frame.empty:
            print(f"[{role_key.upper()}] No further jobs found at offset {offset}. End of available listings reached.")
            break

        records = frame.to_dict("records")
        raw_count = len(records)
        total_raw_found += raw_count

        # Process and filter US listings
        batch_jobs: list[dict[str, Any]] = []
        for r in records:
            raw_url = str(r.get("job_url") or "").strip()
            url = canonical_linkedin_url(raw_url)
            if not url or url in seen_urls:
                continue
            seen_urls.add(url)

            location = str(r.get("location") or "United States").strip()
            if not is_us_location(location):
                continue

            desc = str(r.get("description") or "").strip()
            if not desc or len(desc) < 50:
                continue

            title = str(r.get("title") or role_key.title()).strip()
            company = str(r.get("company") or "Unknown Company").strip()

            job_uuid = generate_job_uuid(url)
            emp_type = detect_employment_type(r.get("job_type"), title, desc)
            is_remote = bool(r.get("is_remote") or "remote" in location.lower())
            work_model = detect_work_model(is_remote, location, title, desc)
            s_min, s_max, currency = parse_salary(r, desc)

            posted_date = r.get("date_posted")
            published_at = datetime.now(timezone.utc)
            if posted_date:
                try:
                    published_at = datetime.fromisoformat(str(posted_date).replace("Z", "+00:00"))
                except Exception:
                    published_at = datetime.now(timezone.utc)

            batch_jobs.append({
                "id": job_uuid,
                "title": title,
                "company": company,
                "location": location,
                "description": desc,
                "external_apply_url": url,
                "employment_type": emp_type,
                "work_model": work_model,
                "salary_min": s_min,
                "salary_max": s_max,
                "currency": currency,
                "published_at": published_at,
            })

        batch_num += 1
        total_valid_us += len(batch_jobs)
        batch_contracts = sum(1 for j in batch_jobs if j["employment_type"] == "contract")
        batch_fulltime = sum(1 for j in batch_jobs if j["employment_type"] == "full_time")
        total_contracts += batch_contracts
        total_fulltime += batch_fulltime

        if batch_jobs:
            # Immediate incremental write to Neon DB & applications.json
            db_res = save_jobs_to_db(batch_jobs, role_source=role_key)
            local_added = append_to_local_applications(batch_jobs)
            total_inserted += db_res["inserted"]
            total_updated += db_res["updated"]
            total_failed += db_res["failed"]
            total_local_added += local_added

            print(
                f"[{role_key.upper()}] Batch #{batch_num} written to DB: {len(batch_jobs)} jobs "
                f"({batch_contracts} contract, {batch_fulltime} full-time | +{db_res['inserted']} new, ~{db_res['updated']} updated) | "
                f"Cumulative: {total_valid_us} valid US jobs ({total_contracts} contract)"
            )
        else:
            print(f"[{role_key.upper()}] Batch #{batch_num}: 0 new valid US jobs in this chunk.")

        # If LinkedIn returned fewer than requested chunk, we've exhausted all available jobs!
        if raw_count < chunk_wanted:
            print(f"[{role_key.upper()}] LinkedIn returned {raw_count} < {chunk_wanted}. All available jobs captured.")
            break

        offset += raw_count
        time.sleep(2)  # 2s safety pause between 100-job batches

    print(
        f"[{role_key.upper()}] Complete! Total Valid: {total_valid_us} "
        f"({total_contracts} contract, {total_fulltime} full-time), "
        f"Inserted: {total_inserted}, Updated: {total_updated}, Failed: {total_failed}"
    )

    return {
        "role": role_key,
        "found": total_raw_found,
        "valid": total_valid_us,
        "contract": total_contracts,
        "full_time": total_fulltime,
        "inserted": total_inserted,
        "updated": total_updated,
        "failed": total_failed,
        "local_added": total_local_added,
    }
