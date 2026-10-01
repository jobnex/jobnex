"""Regression checks for the actual source and role-filter failure cases."""
import asyncio
import json
import sys
from pathlib import Path

import httpx
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from sectors import in_sector, role_tracks
from sources import fetch_successfactors, fetch_workable, fetch_workday, fetch_iqvia, parse_kula, parse_successfactors
from techjobs import select_sources
from argparse import Namespace


def test_inclusive_role_levels_and_talent_pools():
    for title in ["Bioinformatics Intern", "Principal Scientist", "Director, Regulatory Affairs", "Research Associate",
                  "Agronomist", "Statistical Programmer", "Senior Engineer, Bioprocess", "Quality Control Technician"]:
        assert role_tracks(title), title
    assert not role_tracks("Join the Caribou Herd: Future Career Opportunities")
    assert not role_tracks("Talent Community, US Based Roles")
    assert not role_tracks("Accountant")


def test_sector_selection_excludes_unrelated_companies():
    args = Namespace(sector=["agriculture"], company=None, ats=None)
    names = {source["company"] for source in select_sources(args)}
    assert {"Bayer", "KWS", "Yara", "Syngenta Group", "Corteva Agriscience"} <= names
    assert "Amazon" not in names
    assert in_sector("IQVIA", ["life-sciences"])


def test_public_page_schema_changes_fail_visibly():
    for parser in [parse_kula, parse_successfactors]:
        with pytest.raises(ValueError):
            parser("<html>Maintenance</html>")
    rows = [{"id": 12, "ats_job": {"offices": []}}]
    text = '0:' + json.dumps({"jobs": rows})
    midpoint = len(text) // 2
    html = ''.join('<script>self.__next_f.push(' + json.dumps([1, chunk]) + ')</script>' for chunk in [text[:midpoint], text[midpoint:]])
    assert parse_kula(html) == rows
    html = '''<tr class="data-row"><td><a class="jobTitle-link" href="/job/Test/1/">Agronomist</a>
<span class="jobDate visible-phone">Sep 26, 2026</span></td><td headers="hdrLocation">Kimberly, ID, US</td></tr>'''
    assert parse_successfactors(html)[0]["posted_at"].startswith("2026-09-26")
    assert parse_successfactors(html.replace("Sep 26, 2026", "26 Sept 2026"))[0]["posted_at"].startswith("2026-09-26")


def test_foreign_country_not_misread_as_state_and_multi_country_workable():
    def handler(request):
        if "apply.workable" in str(request.url):
            return httpx.Response(200, json={"jobs": [{"shortcode": "W", "title": "Scientist", "url": "https://apply.workable.com/j/W",
                "locations": [{"city": "London", "country": "United Kingdom"}, {"city": "Boston", "country": "United States"}]}]})
        return httpx.Response(200, text='''<tr class="data-row"><td><a class="jobTitle-link" href="/job/Test/1/">Scientist</a></td>
<td headers="hdrLocation">Winnipeg, MB, CA, R3C 0V8</td><td headers="hdrDate">Sep 24, 2026</td></tr>''')

    async def check():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            jobs = await fetch_successfactors(client, {"company": "Bunge", "host": "jobs.bunge.com"}, max_jobs=1)
            assert jobs[0].country == "CA"
            jobs = await fetch_workable(client, {"company": "Editas Medicine", "account": "401841"})
            assert jobs[0].country is None
            assert len(jobs[0].locations) == 2
    asyncio.run(check())


def test_workday_detail_failure_is_visible():
    def handler(request):
        if request.method == "POST":
            return httpx.Response(200, json={"jobPostings": [{"title": "Scientist", "externalPath": "/job/Scientist_R1", "bulletFields": ["R1"]}]})
        return httpx.Response(503, json={"error": "unavailable"})
    async def check():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            jobs = await fetch_workday(client, {"company": "Test", "host": "test.wd1.myworkdayjobs.com", "tenant": "test", "site": "Careers"})
            assert len(jobs) == 1
            assert "503" in jobs[0].extra["detail_error"]
            assert jobs[0].posted_at is None
    asyncio.run(check())


def test_iqvia_merges_locations_and_links_to_us_instance():
    rows = [{"instance_id": "R1-0", "job_req_id": "R1", "job_title": "Clinical Scientist", "date_posted": "2026-09-24",
             "job_location": {"address": {"city": "London", "country": "United Kingdom"}}},
            {"instance_id": "R1-1", "job_req_id": "R1", "job_title": "Clinical Scientist", "date_posted": "2026-09-23",
             "job_location": {"address": {"city": "Boston", "country": "United States"}}}]
    html = '<script>self.__next_f.push(' + json.dumps([1, '0:' + json.dumps({"jobs": rows})]) + ')</script>'
    async def check():
        async with httpx.AsyncClient(transport=httpx.MockTransport(lambda request: httpx.Response(200, text=html))) as client:
            jobs = await fetch_iqvia(client, {"company": "IQVIA"})
            assert len(jobs) == 1
            assert jobs[0].job_id == "R1"
            assert jobs[0].url.endswith("R1-1")
            assert jobs[0].posted_at.startswith("2026-09-23")
            assert jobs[0].country is None
            assert jobs[0].locations == ["Boston, United States", "London, United Kingdom"]
    asyncio.run(check())
