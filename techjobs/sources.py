"""Fetchers for each careers backend. Each returns a list of normalized Job objects."""
from __future__ import annotations

import asyncio
import json
import re
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from urllib.parse import quote, urljoin
from html import unescape

import httpx

UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/128.0 Safari/537.36"
)


@dataclass
class Job:
    company: str
    ats: str
    job_id: str
    title: str
    locations: list[str]
    url: str
    posted_at: str | None = None  # ISO-8601 UTC when the source provides it
    department: str | None = None
    country: str | None = None  # set when the source gives an explicit country
    description_html: str | None = None
    description_text: str | None = None
    apply_url: str | None = None
    salary_min: float | None = None
    salary_max: float | None = None
    salary_currency: str | None = None
    salary_period: str | None = None
    salary_text: str | None = None
    employment_type: str | None = None
    workplace_type: str | None = None
    expires_at: str | None = None
    details_fetched_at: str | None = None
    details_status: str = 'not_requested'
    details_error: str | None = None
    raw_details: dict = field(default_factory=dict)
    extra: dict = field(default_factory=dict)

    @property
    def key(self) -> str:
        return f"{self.ats}:{self.company}:{self.job_id}"

    @property
    def location(self) -> str:
        return "; ".join(self.locations)

    def to_dict(self) -> dict:
        d = asdict(self)
        d.pop("extra")
        d["location"] = self.location
        return d


def _iso_from_epoch(ts: float | int | None) -> str | None:
    if not ts:
        return None
    if ts > 1e12:  # milliseconds
        ts = ts / 1000
    return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat(timespec="seconds")


def _iso(s: str | None) -> str | None:
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00")).astimezone(timezone.utc).isoformat(timespec="seconds")
    except ValueError:
        return None


# ------------------------------------------------------------------ ATS boards

async def fetch_greenhouse(c: httpx.AsyncClient, src: dict, **_) -> list[Job]:
    r = await c.get(f"https://boards-api.greenhouse.io/v1/boards/{src['slug']}/jobs")
    r.raise_for_status()
    out = []
    for j in r.json().get("jobs", []):
        out.append(Job(
            company=src["company"], ats="greenhouse", job_id=str(j["id"]), title=j["title"].strip(),
            locations=[(j.get("location") or {}).get("name") or ""],
            url=j.get("absolute_url", "").replace("http://", "https://", 1),
            posted_at=_iso(j.get("first_published") or j.get("updated_at")),
        ))
    return out


async def fetch_lever(c: httpx.AsyncClient, src: dict, **_) -> list[Job]:
    r = await c.get(f"https://api.lever.co/v0/postings/{src['slug']}", params={"mode": "json"})
    r.raise_for_status()
    out = []
    for j in r.json():
        cat = j.get("categories") or {}
        locs = cat.get("allLocations") or [cat.get("location") or ""]
        out.append(Job(
            company=src["company"], ats="lever", job_id=j["id"], title=j["text"].strip(),
            locations=locs, url=j.get("hostedUrl", ""), posted_at=_iso_from_epoch(j.get("createdAt")),
            department=cat.get("team"),
            country="United States" if j.get("country") == "US" else j.get("country"),
        ))
    return out


async def fetch_ashby(c: httpx.AsyncClient, src: dict, **_) -> list[Job]:
    r = await c.get(f"https://api.ashbyhq.com/posting-api/job-board/{src['slug']}")
    r.raise_for_status()
    out = []
    for j in r.json().get("jobs", []):
        if j.get("isListed") is False:
            continue
        locs = [j.get("location") or ""] + [s.get("location", "") for s in j.get("secondaryLocations") or []]
        country = (((j.get("address") or {}).get("postalAddress") or {}).get("addressCountry"))
        out.append(Job(
            company=src["company"], ats="ashby", job_id=j["id"], title=j["title"].strip(),
            locations=locs, url=j.get("jobUrl", ""), posted_at=_iso(j.get("publishedAt")),
            department=j.get("department"),
            # only trust the country when there are no secondary locations
            country=country if len(locs) == 1 else None,
        ))
    return out


async def fetch_workday(c: httpx.AsyncClient, src: dict, *, max_jobs: int = 400, known: set[str] = frozenset(), **_) -> list[Job]:
    """Workday lists newest-first; list items lack country, so new ones get a detail call."""
    host, tenant, site = src["host"], src["tenant"], src["site"]
    base = f"https://{host}/wday/cxs/{tenant}/{site}"
    headers = {"Accept": "application/json", "Content-Type": "application/json"}
    postings, offset = [], 0
    while offset < max_jobs:
        r = await c.post(f"{base}/jobs", headers=headers,
                         json={"limit": 20, "offset": offset, "searchText": "", "appliedFacets": {}})
        r.raise_for_status()
        if "community.workday.com/maintenance-page" in str(r.url):
            raise RuntimeError("Workday redirected to its maintenance page; retry later or verify the tenant host")
        try:
            page = r.json().get("jobPostings", [])
        except ValueError:
            raise RuntimeError(f"Workday returned non-JSON (HTTP {r.status_code}); endpoint may be unavailable") from None
        postings += page
        if len(page) < 20:
            break
        offset += 20

    sem = asyncio.Semaphore(4)

    async def build(p: dict) -> Job:
        path = p.get("externalPath") or ""
        fallback_id = path.rsplit("_", 1)[-1] if path else (p.get("jobPostingId") or p.get("bulletFields") or "")
        job_id = str((p.get("bulletFields") or [fallback_id])[0])
        job = Job(company=src["company"], ats="workday", job_id=job_id, title=(p.get("title") or "Untitled").strip(),
                  locations=[p.get("locationsText") or ""],
                  url=f"https://{host}/{site}{path}" if path else f"https://{host}/{site}")
        if f"workday:{src['company']}:{job_id}" in known:
            return job  # already seen; skip the detail call
        try:
            async with sem:
                detail = await c.get(f"{base}{path}", headers=headers)
                detail.raise_for_status()
                d = detail.json().get("jobPostingInfo", {})
                if not d:
                    raise ValueError("Workday detail response has no jobPostingInfo")
                job.extra['detail_payload'] = detail.json()
            locs = [d.get("location")] + list(d.get("additionalLocations") or [])
            job.locations = [l for l in locs if l] or job.locations
            job.country = (d.get("country") or {}).get("descriptor") if len(job.locations) == 1 else None
            job.posted_at = _iso(d.get("startDate") and d["startDate"] + "T00:00:00+00:00")
        except Exception as error:
            job.extra["detail_error"] = f"{type(error).__name__}: {str(error)[:120]}"
        return job

    return await asyncio.gather(*(build(p) for p in postings[:max_jobs]))


# ------------------------------------------------------------------ Big Tech

async def fetch_amazon(c: httpx.AsyncClient, src: dict, *, max_jobs: int = 400, **_) -> list[Job]:
    out, offset = [], 0
    while offset < max_jobs:
        r = await c.get("https://www.amazon.jobs/en/search.json", params={
            "result_limit": 100, "offset": offset, "country": "USA", "sort": "recent"},
            headers={"Accept-Encoding": "identity"})
        r.raise_for_status()
        jobs = r.json().get("jobs", [])
        for j in jobs:
            posted = None
            try:
                posted = datetime.strptime(j["posted_date"], "%B %d, %Y").replace(tzinfo=timezone.utc).isoformat()
            except (KeyError, ValueError):
                pass
            out.append(Job(
                company="Amazon", ats="amazon", job_id=str(j.get("id_icims") or j["id"]),
                title=j["title"].strip(), locations=[j.get("normalized_location") or j.get("location", "")],
                url="https://www.amazon.jobs" + j.get("job_path", ""), posted_at=posted,
                department=j.get("job_category"), country="United States",
            ))
        if len(jobs) < 100:
            break
        offset += 100
    return out


async def fetch_eightfold_pcsx(c: httpx.AsyncClient, src: dict, *, max_jobs: int = 400, **_) -> list[Job]:
    """Eightfold 'PCSX' careers sites (Microsoft)."""
    host, domain = src["host"], src["domain"]
    out, start = [], 0
    while start < max_jobs:
        r = await c.get(f"https://{host}/api/pcsx/search", params={
            "domain": domain, "query": "", "location": "United States", "start": start, "sort_by": "timestamp"})
        r.raise_for_status()
        data = r.json().get("data") or {}
        pos = data.get("positions", [])
        for p in pos:
            out.append(Job(
                company=src["company"], ats="eightfold", job_id=str(p.get("displayJobId") or p["id"]),
                title=p["name"].strip(), locations=p.get("locations") or [],
                url=f"https://{host}{p.get('positionUrl', '')}", posted_at=_iso_from_epoch(p.get("postedTs")),
                department=p.get("department"),
                country="United States" if p.get("standardizedLocations") == ["US"] else None,
            ))
        if not pos or start + len(pos) >= data.get("count", 0):
            break
        start += len(pos)
    return out


async def fetch_eightfold_v2(c: httpx.AsyncClient, src: dict, *, max_jobs: int = 400, **_) -> list[Job]:
    """Older Eightfold careers API (Netflix)."""
    host, domain = src["host"], src["domain"]
    out, start = [], 0
    while start < max_jobs:
        r = await c.get(f"https://{host}/api/apply/v2/jobs", params={
            "domain": domain, "start": start, "num": 50, "location": "United States", "sort_by": "new"})
        r.raise_for_status()
        data = r.json()
        pos = data.get("positions", [])
        for p in pos:
            out.append(Job(
                company=src["company"], ats="eightfold", job_id=str(p.get("display_job_id") or p["id"]),
                title=p["name"].strip(), locations=p.get("locations") or [p.get("location", "")],
                url=p.get("canonicalPositionUrl") or f"https://{host}/careers/job/{p['id']}",
                posted_at=_iso_from_epoch(p.get("t_create")), department=p.get("department"),
            ))
        if not pos or start + len(pos) >= data.get("count", 0):
            break
        start += len(pos)
    return out


_APPLE_RE = re.compile(r'window\.__staticRouterHydrationData\s*=\s*JSON\.parse\(("(?:[^"\\]|\\.)*")\)')


def parse_apple(html: str) -> tuple[list[dict], int]:
    m = _APPLE_RE.search(html)
    if not m:
        return [], 0
    data = json.loads(json.loads(m.group(1)))
    search = (data.get("loaderData") or {}).get("search") or {}
    return search.get("searchResults") or [], search.get("totalRecords") or 0


async def fetch_apple(c: httpx.AsyncClient, src: dict, *, max_jobs: int = 400, **_) -> list[Job]:
    out, page = [], 1
    while len(out) < max_jobs:
        r = await c.get("https://jobs.apple.com/en-us/search",
                        params={"location": "united-states-USA", "sort": "newest", "page": page})
        r.raise_for_status()
        results, total = parse_apple(r.text)
        for j in results:
            out.append(Job(
                company="Apple", ats="apple", job_id=j["positionId"], title=j["postingTitle"].strip(),
                locations=[l.get("name", "") for l in j.get("locations", [])],
                url=f"https://jobs.apple.com/en-us/details/{j['positionId']}/{j.get('transformedPostingTitle', '')}",
                posted_at=_iso(j.get("postDateInGMT")), department=(j.get("team") or {}).get("teamName"),
                country="United States",
            ))
        if not results or len(out) >= total:
            break
        page += 1
    return out


_GOOGLE_RE = re.compile(r"key: 'ds:1'.*?data:(\[.*?\]), sideChannel", re.S)


def parse_google(html: str) -> list[list]:
    m = _GOOGLE_RE.search(html)
    if not m:
        return []
    data = json.loads(m.group(1))
    return data[0] or []


async def fetch_google(c: httpx.AsyncClient, src: dict, *, max_jobs: int = 400, **_) -> list[Job]:
    out, page = [], 1
    while len(out) < max_jobs:
        r = await c.get("https://www.google.com/about/careers/applications/jobs/results",
                        params={"location": "United States", "sort_by": "date", "page": page})
        r.raise_for_status()
        rows = parse_google(r.text)
        for j in rows:
            locs = [l[0] for l in (j[9] or []) if l]
            ts = j[12][0] if len(j) > 12 and j[12] else None
            out.append(Job(
                company=f"Google ({j[7]})" if len(j) > 7 and j[7] and j[7] != "Google" else "Google",
                ats="google", job_id=str(j[0]), title=j[1].strip(), locations=locs,
                url=f"https://www.google.com/about/careers/applications/jobs/results/{j[0]}",
                posted_at=_iso_from_epoch(ts),
            ))
        if len(rows) < 20:
            break
        page += 1
    return out


async def fetch_smartrecruiters(c: httpx.AsyncClient, src: dict, *, max_jobs: int = 400, **_) -> list[Job]:
    """SmartRecruiters public posting API (paged, newest first)."""
    slug = src["slug"]
    out, offset = [], 0
    while offset < max_jobs:
        r = await c.get(f"https://api.smartrecruiters.com/v1/companies/{slug}/postings",
                        params={"limit": 100, "offset": offset})
        r.raise_for_status()
        data = r.json()
        page = data.get("content") or []
        if offset == 0 and not data.get("totalFound"):
            raise ValueError(f"no postings for SmartRecruiters id '{slug}' (wrong company id?)")
        for j in page:
            loc = j.get("location") or {}
            full = ", ".join(x.strip() for x in (loc.get("fullLocation") or ", ".join(x for x in (loc.get("city"), loc.get("region"), (loc.get("country") or "").upper()) if x)).split(",") if x.strip())
            cc = (loc.get("country") or "").lower()
            out.append(Job(
                company=src["company"], ats="smartrecruiters", job_id=str(j.get("id") or j.get("uuid") or ""),
                title=(j.get("name") or "Untitled").strip(), locations=[full or ""],
                url=f"https://jobs.smartrecruiters.com/{slug}/{j.get('id')}",
                posted_at=_iso(j.get("releasedDate")),
                department=(j.get("department") or {}).get("label"),
                country="United States" if cc == "us" else (cc.upper() or None),
            ))
        offset += len(page)
        if not page or offset >= (data.get("totalFound") or 0):
            break
    return out[:max_jobs]


def parse_next_jobs(html: str, required_key: str) -> list[dict]:
    """Read a job list already rendered in a public Next.js page."""
    chunks = []
    for match in re.finditer(r'self\.__next_f\.push\((\[.*?\])\)</script>', html, re.S):
        chunk = json.loads(match[1])
        if len(chunk) > 1 and isinstance(chunk[1], str):
            chunks.append(chunk[1])
    stream = "".join(chunks)
    for match in re.finditer(r'"jobs":\s*(?=\[)', stream):
        rows, _ = json.JSONDecoder().raw_decode(stream[match.end():])
        if isinstance(rows, list) and (not rows or all(isinstance(row, dict) and required_key in row for row in rows)):
            return rows
    raise ValueError("Public job list missing; page schema may have changed")


def parse_kula(html: str) -> list[dict]:
    return parse_next_jobs(html, "ats_job")


async def fetch_kula(c: httpx.AsyncClient, src: dict, **_) -> list[Job]:
    slug = src["slug"]
    r = await c.get(f"https://careers.kula.ai/{slug}")
    r.raise_for_status()
    links = {job_id: unescape(path) for path, job_id in re.findall(r'href="(/' + re.escape(slug) + r'/(\d+)[^"]*)"', r.text)}
    out = []
    for j in parse_kula(r.text):
        if j.get("listed") is False or j.get("is_confidential"):
            continue
        info = j["ats_job"]
        offices = info.get("offices") or []
        countries = {office.get("country") for office in offices if office.get("country")}
        job_id = str(j["id"])
        if job_id not in links:
            raise ValueError(f"Kula public application link missing for job {job_id}")
        out.append(Job(company=src["company"], ats="kula", job_id=job_id, title=j["title"].strip(),
                       locations=[office.get("location") or office.get("name") or "" for office in offices],
                       url="https://careers.kula.ai" + links[job_id], posted_at=_iso(j.get("launch_at")),
                       department=(info.get("ats_department") or {}).get("name"),
                       country=next(iter(countries)) if len(countries) == 1 else None))
    return out


async def fetch_workable(c: httpx.AsyncClient, src: dict, **_) -> list[Job]:
    r = await c.get(f"https://apply.workable.com/api/v1/widget/accounts/{src['account']}")
    r.raise_for_status()
    data = r.json()
    if "jobs" not in data:
        raise ValueError("Workable job list missing")
    out = []
    for j in data["jobs"]:
        offices = j.get("locations") or [{"city": j.get("city"), "region": j.get("state"), "country": j.get("country")}]
        countries = {office.get("country") for office in offices if office.get("country")}
        locations = [", ".join(office[key] for key in ("city", "region", "country") if office.get(key)) for office in offices]
        out.append(Job(company=src["company"], ats="workable", job_id=j["shortcode"], title=j["title"].strip(),
                       locations=locations, url=j["url"], posted_at=_iso(j.get("published_on") and j["published_on"] + "T00:00:00Z"),
                       department=j.get("department"), country=next(iter(countries)) if len(countries) == 1 else None))
    return out


async def fetch_iqvia(c: httpx.AsyncClient, src: dict, **_) -> list[Job]:
    r = await c.get("https://jobs.iqvia.com/en/jobs")
    r.raise_for_status()
    grouped = {}
    for j in parse_next_jobs(r.text, "instance_id"):
        job_id = j.get("job_req_id") or j["instance_id"].rsplit("-", 1)[0]
        grouped.setdefault(job_id, []).append(j)
    out = []
    for job_id, instances in grouped.items():
        # Location-specific instances share one requisition. Prefer a US page
        # when available, so a US result does not link to a foreign instance.
        us = [j for j in instances if j["job_location"]["address"].get("country") == "United States"]
        primary = (us or instances)[0]
        addresses = [j["job_location"]["address"] for j in [primary, *instances]]
        countries = {address.get("country") for address in addresses if address.get("country")}
        locations = list(dict.fromkeys(", ".join(address[key] for key in ("city", "region", "country") if address.get(key)) for address in addresses))
        date = max((j.get("date_posted") or "" for j in (us or instances)), default="")
        out.append(Job(company=src["company"], ats="iqvia", job_id=job_id, title=primary["job_title"].strip(),
                       locations=locations, country=next(iter(countries)) if len(countries) == 1 else None,
                       department=primary.get("employment_unit"), posted_at=_iso(date and date + "T00:00:00Z"),
                       url="https://jobs.iqvia.com/en/jobs/" + primary["instance_id"]))
    return out


async def fetch_guardant(c: httpx.AsyncClient, src: dict, **_) -> list[Job]:
    """Use the same public Workday feed as Guardant's own career site."""
    r = await c.get("https://guardanthealth.com/careers/")
    r.raise_for_status()
    match = re.search(r'var workdayApi = (\{.*?\});', r.text)
    if not match:
        raise ValueError("Guardant public feed settings missing")
    settings = json.loads(match[1])
    # The nonce is a public request parameter supplied by the employer's page.
    endpoint = settings["ajax_url"]
    if not endpoint.startswith("https://guardanthealth.com/"):
        raise ValueError("Unexpected Guardant feed host")
    r = await c.post(endpoint, data={"action": "get_workday_data", "nonce": settings["nonce"]})
    r.raise_for_status()
    data = r.json()
    if data.get("success") is not True or not isinstance(data.get("data", {}).get("data"), list):
        raise ValueError("Guardant public feed failed")
    out = []
    for j in data["data"]["data"]:
        if "private_posting" in j.get("url", "").lower():
            continue
        places = [j.get("primaryLocation") or {}] + (j.get("additionalLocations") or [])
        countries = {(place.get("country") or {}).get("descriptor") for place in places}
        countries.discard(None)
        out.append(Job(company=src["company"], ats="guardant", job_id=j["id"], title=j["title"].strip(),
                       locations=[place.get("descriptor") or "" for place in places], url=j["url"],
                       country=next(iter(countries)) if len(countries) == 1 else None,
                       department="; ".join(category.get("descriptor", "") for category in j.get("categories", [])),
                       posted_at=_iso(j.get("startDate") and j["startDate"] + "T00:00:00Z")))
    return out


def parse_successfactors(html: str) -> list[dict]:
    """Parse SuccessFactors' public search table, ignoring duplicate mobile links."""
    rows = []
    blocks = list(re.finditer(r'<tr\b[^>]*class="[^"\n]*\bdata-row\b[^"\n]*"[^>]*>(.*?)</tr>', html, re.S))
    blocks += list(re.finditer(r'<li\b[^>]*class="[^"\n]*\bjob-tile\b[^"\n]*"[^>]*>(.*?)</li>', html, re.S))
    for match in blocks:
        block = match[1]
        link = re.search(r'<a\b([^>]*\bclass="[^"\n]*\bjobTitle-link\b[^"\n]*"[^>]*)>(.*?)</a>', block, re.S)
        location = re.search(r'<td\b[^>]*headers="hdrLocation"[^>]*>(.*?)</td>', block, re.S)
        date = re.search(r'<td\b[^>]*headers="hdrDate"[^>]*>(.*?)</td>', block, re.S)
        if not location:
            location = re.search(r'<div\b[^>]*id="[^"]+-section-location-value"[^>]*>(.*?)</div>|<span\b[^>]*class="[^"\n]*\bjobLocation\b[^"\n]*"[^>]*>(.*?)</span>', block, re.S)
        if not date:
            date = re.search(r'<div\b[^>]*id="[^"]+-section-date-value"[^>]*>(.*?)</div>', block, re.S)
        def plain(value):
            return " ".join(unescape(re.sub(r"<[^>]+>", " ", value)).split())
        fields = {plain(label).lower(): plain(value) for label, value in re.findall(r'<span\b[^>]*id="[^"]+-desktop-section-[^"]+-label"[^>]*>(.*?)</span>\s*<div\b[^>]*id="[^"]+-value"[^>]*>(.*?)</div>', block, re.S)}
        place = ", ".join(fields[key] for key in ("location", "city", "state", "country") if fields.get(key))
        if not date:
            # Some employers, including KWS, expose dates only in the mobile row.
            date = re.search(r'<span\b[^>]*class="[^"\n]*\bjobDate\b[^"\n]*"[^>]*>(.*?)</span>', block, re.S)
        if not link or not (location or place):
            raise ValueError("SuccessFactors search row changed")
        href = re.search(r'href="([^"]+)"', link[1])
        if not href:
            raise ValueError("SuccessFactors application link missing")
        posted = None
        if date:
            try:
                stamp = re.sub(r"\bSept\b", "Sep", plain(date[1]))
                format = "%b %d, %Y" if "," in stamp else "%d %b %Y"
                posted = datetime.strptime(stamp, format).replace(tzinfo=timezone.utc).isoformat()
            except ValueError:
                pass
        rows.append({"title": plain(link[2]), "location": plain(next(group for group in location.groups() if group is not None)) if location else place, "url": unescape(href[1]), "posted_at": posted, "country": fields.get("country")})
    if not rows and re.search(r'<a\b[^>]*class="[^"\n]*\bjobTitle-link\b', html):
        raise ValueError("SuccessFactors job rows missing; page schema may have changed")
    if not rows and not re.search(r'noresults|no results|no jobs|no matching|no current', html, re.I):
        raise ValueError("SuccessFactors public search table missing")
    return rows


async def fetch_successfactors(c: httpx.AsyncClient, src: dict, *, max_jobs: int = 400, **_) -> list[Job]:
    out, offset, seen = [], 0, set()
    while len(out) < max_jobs:
        r = await c.get(f"https://{src['host']}/search/", params={"q": "", "sortColumn": "referencedate", "sortDirection": "desc", "startrow": offset})
        r.raise_for_status()
        rows = parse_successfactors(r.text)
        fresh = [row for row in rows if row["url"] not in seen]
        if not fresh:
            break
        for row in fresh:
            seen.add(row["url"])
            code = next((part.strip() for part in reversed(row["location"].split(",")) if re.fullmatch(r"[A-Z]{2}", part.strip())), None)
            country = row.get("country") or code
            if country and country.casefold() in {"us", "usa", "united states", "united states of america"}:
                country = "United States"
            url = urljoin(str(r.url), row["url"])
            out.append(Job(company=src["company"], ats="successfactors", job_id=url.rstrip("/").rsplit("/", 1)[-1],
                           title=row["title"], locations=[row["location"]], url=url, posted_at=row["posted_at"],
                           country=country))
        offset += len(rows)
    out = out[:max_jobs]
    semaphore = asyncio.Semaphore(4)
    async def fill_date(job):
        if job.posted_at:
            return
        async with semaphore:
            try:
                detail = await c.get(job.url)
                detail.raise_for_status()
                stamp = re.search(r'<meta\b[^>]*itemprop="datePosted"[^>]*content="([^"]+)"|"datePosted"\s*:\s*"([^"]+)"', detail.text)
                if stamp:
                    value = unescape(next(part for part in stamp.groups() if part is not None))
                    job.posted_at = _iso(value)
                    if not job.posted_at:
                        job.posted_at = datetime.strptime(value, "%a %b %d %H:%M:%S %Z %Y").replace(tzinfo=timezone.utc).isoformat()
            except Exception as error:
                job.extra["detail_error"] = f"{type(error).__name__}: {error}"
    await asyncio.gather(*(fill_date(job) for job in out))
    return out


FETCHERS = {
    "greenhouse": fetch_greenhouse,
    "lever": fetch_lever,
    "ashby": fetch_ashby,
    "workday": fetch_workday,
    "amazon": fetch_amazon,
    "apple": fetch_apple,
    "google": fetch_google,
    "eightfold_pcsx": fetch_eightfold_pcsx,
    "eightfold_v2": fetch_eightfold_v2,
    "smartrecruiters": fetch_smartrecruiters,
    "kula": fetch_kula,
    "workable": fetch_workable,
    "iqvia": fetch_iqvia,
    "guardant": fetch_guardant,
    "successfactors": fetch_successfactors,
}


def make_client() -> httpx.AsyncClient:
    return httpx.AsyncClient(
        headers={"User-Agent": UA, "Accept-Language": "en-US,en;q=0.9"},
        timeout=httpx.Timeout(30.0),
        follow_redirects=True,
        limits=httpx.Limits(max_connections=20),
    )
