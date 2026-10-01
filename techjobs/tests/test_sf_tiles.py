"""Regression check for current SuccessFactors tile and mobile schemas."""
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from sources import parse_successfactors
from sources import fetch_successfactors
from sources import fetch_smartrecruiters
import asyncio
import httpx


def test_tile_fields_and_mobile_location():
    tile = '''<li class="job-tile job-id-1"><a class="jobTitle-link fontcolor" href="/job/Test/1/">Scientist</a>
<div id="job-1-desktop-section-date-value">26 Sept 2026</div>
<span id="job-1-desktop-section-customfield4-label">Country</span><div id="job-1-desktop-section-customfield4-value">India</div>
<span id="job-1-desktop-section-customfield2-label">Location</span><div id="job-1-desktop-section-customfield2-value">Rangpo</div></li>'''
    row = parse_successfactors(tile)[0]
    assert row["title"] == "Scientist" and row["location"] == "Rangpo, India" and row["country"] == "India"
    assert row["posted_at"].startswith("2026-09-26")
    mobile = '''<tr class="data-row"><a href="/job/Test/2/" class="jobTitle-link">Researcher</a>
<span class="jobLocation visible-phone"><span class="jobLocation">OKFOOD-1, NG</span></span>
<td headers="hdrDate">10 Sept 2026</td></tr>'''
    row = parse_successfactors(mobile)[0]
    assert row["location"] == "OKFOOD-1, NG" and row["posted_at"].startswith("2026-09-10")


def test_small_pages_dates_country_and_empty_css():
    def handler(request):
        if request.url.path.startswith("/job/"):
            return httpx.Response(200, text='<meta itemprop="datePosted" content="Sat Sep 26 07:00:00 UTC 2026">')
        offset = int(request.url.params.get("startrow", "0"))
        if offset >= 2:
            return httpx.Response(200, text='<style>.jobTitle-link {color:black}</style><div id="noresults">No jobs</div>')
        return httpx.Response(200, text=f'''<li class="job-tile"><a class="jobTitle-link color" href="/job/Test/{offset}/">Scientist</a>
<span id="job-{offset}-desktop-section-customfield4-label">Country</span><div id="job-{offset}-desktop-section-customfield4-value">United states</div>
<span id="job-{offset}-desktop-section-customfield2-label">Location</span><div id="job-{offset}-desktop-section-customfield2-value">Boston</div></li>''')
    async def check():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            jobs = await fetch_successfactors(client, {"company": "Test", "host": "jobs.test.com"}, max_jobs=3)
            assert len(jobs) == 2
            assert all(j.country == "United States" and j.posted_at == "2026-09-26T07:00:00+00:00" for j in jobs)
    asyncio.run(check())


def test_smartrecruiters_honors_requested_cap():
    async def check():
        payload = {"totalFound": 3, "content": [{"id": str(i), "name": "Scientist"} for i in range(3)]}
        async with httpx.AsyncClient(transport=httpx.MockTransport(lambda request: httpx.Response(200, json=payload))) as client:
            jobs = await fetch_smartrecruiters(client, {"company": "Test", "slug": "Test"}, max_jobs=1)
            assert len(jobs) == 1 and jobs[0].job_id == "0"
    asyncio.run(check())
