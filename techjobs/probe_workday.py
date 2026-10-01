#!/usr/bin/env python3
"""Probe candidate Workday (host, tenant, site) combos, visiting the page first
to pick up any session cookie some tenants require before the API accepts POST.
"""
import httpx

CANDIDATES = {
    "Comcast": [
        ("comcast.wd5.myworkdayjobs.com", "comcast", "Comcast_Careers"),
        ("comcast.wd1.myworkdayjobs.com", "comcast", "Comcast_Careers"),
    ],
    "Dell Technologies": [
        ("dell.wd1.myworkdayjobs.com", "dell", "External"),
        ("dell.wd1.myworkdayjobs.com", "dell", "ExternalNonPublic"),
    ],
    "Otis Worldwide": [
        ("otis.wd5.myworkdayjobs.com", "otis", "REC_Ext_Gateway"),
    ],
}

headers = {"Accept": "application/json", "Content-Type": "application/json",
           "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
payload = {"limit": 5, "offset": 0, "searchText": "", "appliedFacets": {}}

for company, cands in CANDIDATES.items():
    print(f"\n=== {company} ===")
    for host, tenant, site in cands:
        with httpx.Client(timeout=15, headers={"User-Agent": headers["User-Agent"]}, follow_redirects=True) as c:
            page_url = f"https://{host}/{site}"
            api_url = f"https://{host}/wday/cxs/{tenant}/{site}/jobs"
            try:
                page_r = c.get(page_url)
                api_headers = dict(headers)
                r = c.post(api_url, headers=api_headers, json=payload)
                n = len(r.json().get("jobPostings", [])) if r.status_code == 200 else None
                print(f"  page_status={page_r.status_code}  api_status={r.status_code}  site={site!r}  jobs_returned={n}")
                if r.status_code != 200:
                    print(f"     body: {r.text[:200]}")
            except Exception as e:
                print(f"  ERROR  site={site!r}  {type(e).__name__}: {e}")
