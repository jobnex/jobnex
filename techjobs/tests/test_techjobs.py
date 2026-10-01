"""Offline tests: every fetcher runs against canned responses shaped like the real APIs."""
import asyncio
import json
import sys
from pathlib import Path

import httpx
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import sources  # noqa: E402
import techjobs  # noqa: E402
from location import is_us  # noqa: E402

APPLE_DATA = {"loaderData": {"root": {}, "search": {"totalRecords": 1, "searchResults": [{
    "positionId": "200685172", "postingTitle": "Design Verification Engineer",
    "transformedPostingTitle": "design-verification-engineer", "postDateInGMT": "2026-09-23T22:27:25.414Z",
    "locations": [{"name": "Cupertino", "countryName": "United States of America"}], "team": {"teamName": "Hardware"}}]}}}
APPLE_HTML = ('<script>window.__staticRouterHydrationData = JSON.parse('
              + json.dumps(json.dumps(APPLE_DATA)) + ');</script>')
GOOGLE_ROW = ["1264", "Software Engineer, DeepMind", "u", [None, ""], [None, ""], "p", None, "DeepMind", "en-US",
              [["Mountain View, CA, USA", ["Mountain View, CA, USA"], "Mountain View", None, "CA", "US"]],
              [None, ""], [2], [1790233687, 0]]
GOOGLE_HTML = ("AF_initDataCallback({key: 'ds:1', hash: '2', data:" + json.dumps([[GOOGLE_ROW], None, 1, 20])
               + ", sideChannel: {}});")


def next_html(rows):
    return '<script>self.__next_f.push(' + json.dumps([1, '0:' + json.dumps({"jobs": rows})]) + ')</script>'


KULA_JOB = {"id": 12, "title": "Scientist, Single Cell Assay", "listed": True, "launch_at": "2026-09-24T12:00:00Z",
            "ats_job": {"offices": [{"location": "San Francisco, California, United States", "country": "United States"}],
                        "ats_department": {"name": "R&D"}}}
KULA_HTML = '<a href="/10xgenomics/12-scientist">Apply</a>' + next_html([KULA_JOB])
IQVIA_JOB = {"instance_id": "R1-0", "job_title": "Clinical Research Associate", "date_posted": "2026-09-24",
             "job_location": {"address": {"city": "Boston", "region": "Massachusetts", "country": "United States"}},
             "employment_unit": "Clinical"}
SF_HTML = '''<table><tr class="data-row"><td><a class="jobTitle-link" href="/job/Test/42/">Agricultural Research Scientist</a>
<a class="jobTitle-link" href="/job/Test/42/">Agricultural Research Scientist</a></td>
<td headers="hdrLocation"><span>Kimberly, ID, US, 83341</span></td>
<td headers="hdrDate"><span>Sep 24, 2026</span></td></tr></table>'''


def handler(request: httpx.Request) -> httpx.Response:
    u = str(request.url)
    if "careers.kula.ai" in u:
        return httpx.Response(200, text=KULA_HTML)
    if "apply.workable.com" in u:
        return httpx.Response(200, json={"jobs": [{"shortcode": "W1", "title": "Clinical Scientist", "url": "https://apply.workable.com/j/W1",
            "published_on": "2026-09-24", "locations": [{"city": "Cambridge", "region": "MA", "country": "United States"}]}]})
    if "jobs.iqvia.com" in u:
        return httpx.Response(200, text=next_html([IQVIA_JOB]))
    if "guardanthealth.com/careers/" in u:
        return httpx.Response(200, text='var workdayApi = {"ajax_url":"https://guardanthealth.com/wp-admin/admin-ajax.php","nonce":"public"};')
    if "guardanthealth.com/wp-admin" in u:
        return httpx.Response(200, json={"success": True, "data": {"data": [{"id": "G1", "title": "Medical Science Liaison",
            "url": "https://gh.wd1.myworkdayjobs.com/gh/job/MSL_R1", "startDate": "2026-09-24",
            "primaryLocation": {"descriptor": "Boston, MA", "country": {"descriptor": "United States of America"}}}]}})
    if "careers.agcocorp.com" in u:
        return httpx.Response(200, text=SF_HTML)
    if "greenhouse" in u:
        return httpx.Response(200, json={"jobs": [
            {"id": 1, "title": "Software Engineer", "location": {"name": "San Francisco, CA"},
             "absolute_url": "http://x/1", "first_published": "2026-09-24T10:00:00-04:00"},
            {"id": 2, "title": "Account Exec", "location": {"name": "Dublin"}, "absolute_url": "https://x/2"}]})
    if "lever.co" in u:
        return httpx.Response(200, json=[{"id": "abc", "text": "ML Engineer", "hostedUrl": "https://l/abc",
            "createdAt": 1790233687000, "country": "US",
            "categories": {"location": "New York, NY", "allLocations": ["New York, NY"], "team": "Eng"}}])
    if "ashbyhq" in u:
        return httpx.Response(200, json={"jobs": [{"id": "a1", "title": "Research Engineer", "location": "London",
            "secondaryLocations": [], "isListed": True, "jobUrl": "https://a/a1", "publishedAt": "2026-09-24T01:00:00Z",
            "address": {"postalAddress": {"addressCountry": "United Kingdom"}}}]})
    if "myworkdayjobs" in u and request.method == "POST":
        return httpx.Response(200, json={"total": 1, "jobPostings": [{"title": "Senior SWE",
            "externalPath": "/job/San-Jose/Senior-SWE_R1", "locationsText": "San Jose", "bulletFields": ["R1"]}]})
    if "myworkdayjobs" in u:
        return httpx.Response(200, json={"jobPostingInfo": {"location": "San Jose", "startDate": "2026-09-22",
            "country": {"descriptor": "United States of America"}}})
    if "amazon.jobs" in u:
        return httpx.Response(200, json={"jobs": [{"id_icims": "10558489", "title": "SDE II",
            "normalized_location": "Seattle, Washington, USA", "job_path": "/en/jobs/10558489/sde",
            "posted_date": "September 24, 2026", "job_category": "Software Development"}]})
    if "pcsx" in u:
        return httpx.Response(200, json={"data": {"count": 1, "positions": [{"id": 9, "displayJobId": "200053397",
            "name": "Software Engineer II", "locations": ["United States, Redmond, WA"], "standardizedLocations": ["US"],
            "postedTs": 1790201884, "positionUrl": "/careers/job/9"}]}})
    if "apply/v2" in u:
        return httpx.Response(200, json={"count": 1, "positions": [{"id": 7, "display_job_id": "JR1",
            "name": "Senior Software Engineer", "locations": ["Los Gatos,California,United States of America"],
            "t_create": 1790121600, "canonicalPositionUrl": "https://n/7"}]})
    if "smartrecruiters" in u:
        return httpx.Response(200, json={"offset": 0, "limit": 100, "totalFound": 1, "content": [{
            "id": "744000012345678", "name": "Senior Software Engineer", "releasedDate": "2026-09-24T15:00:00.000Z",
            "location": {"city": "Santa Clara", "region": "CA", "country": "us", "fullLocation": "Santa Clara, CA, United States"},
            "department": {"label": "Engineering"}}]})
    if "jobs.apple.com" in u:
        return httpx.Response(200, text=APPLE_HTML)
    if "google.com" in u:
        return httpx.Response(200, text=GOOGLE_HTML)
    return httpx.Response(404)


@pytest.fixture(autouse=True)
def mock_http(monkeypatch):
    real = httpx.AsyncClient
    monkeypatch.setattr(techjobs, "make_client", lambda: real(transport=httpx.MockTransport(handler)))


def test_every_fetcher_parses():
    srcs = techjobs.all_sources()
    one_each = {}
    for s in srcs:
        one_each.setdefault(s["ats"], s)
    jobs, stats, errors = asyncio.run(techjobs.fetch_all(list(one_each.values()), max_jobs=50, known=set()))
    assert not errors, errors
    by_ats = {j.ats for j in jobs}
    assert by_ats == {"greenhouse", "lever", "ashby", "workday", "amazon", "eightfold", "apple", "google", "smartrecruiters",
                      "kula", "workable", "iqvia", "guardant", "successfactors"}
    wd = next(j for j in jobs if j.ats == "workday")
    assert wd.country == "United States of America" and wd.posted_at.startswith("2026-09-22")
    sr = next(j for j in jobs if j.ats == "smartrecruiters")
    assert sr.country == "United States" and sr.posted_at.startswith("2026-09-24") and sr.url.endswith("/744000012345678")
    g = next(j for j in jobs if j.ats == "google")
    assert g.company == "Google (DeepMind)" and g.locations == ["Mountain View, CA, USA"]
    assert next(j for j in jobs if j.ats == "successfactors").country == "United States"
    assert next(j for j in jobs if j.ats == "iqvia").url == "https://jobs.iqvia.com/en/jobs/R1-0"
    assert next(j for j in jobs if j.ats == "greenhouse" and j.job_id == "1").url == "https://x/1"


def test_us_filter_and_new_detection(tmp_path, capsys):
    args = techjobs.argparse.Namespace(
        keyword=None, exclude=None, any_country=False, strict_us=False, all=False, since=None,
        max_per_company=50, state=tmp_path / "seen.json", csv=str(tmp_path / "out.csv"), json=None, bell=False)
    srcs = [s for s in techjobs.all_sources() if s["company"] in ("Stripe", "OpenAI", "Palantir")]
    asyncio.run(techjobs.one_pass(args, srcs))          # baseline
    seen = json.loads(args.state.read_text())
    assert len(seen) == 4  # 2 greenhouse + 1 lever + 1 ashby
    # UK Ashby job and Dublin GH job are filtered out; SF + NY kept
    jobs, _, _ = asyncio.run(techjobs.fetch_all(srcs, max_jobs=50, known=set()))
    kept = {j.title for j in jobs if techjobs.keep(j, args)}
    assert kept == {"Software Engineer", "ML Engineer"}
    # second pass: nothing new
    args.csv = None
    asyncio.run(techjobs.one_pass(args, srcs))
    assert "nothing new" in capsys.readouterr().out


@pytest.mark.parametrize("loc,expected", [
    ("San Francisco, CA", True), ("Bengaluru, IN", False), ("Remote", True), ("Remote - Canada", False),
    ("San Francisco, CA; London, UK", True), ("Cambridge, UK", False), ("Cambridge, MA", True),
    ("US, WA, Seattle", True), ("Toronto, ON", False), ("Kent, Washington, USA", True),
])
def test_is_us(loc, expected):
    assert is_us(loc) is expected
