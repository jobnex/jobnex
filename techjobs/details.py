"""Read employer job details. Keep missing values null and preserve source data."""
from __future__ import annotations

import asyncio
import json
import re
from datetime import datetime, timezone
from html import unescape
from html.parser import HTMLParser
from urllib.parse import urljoin, urlparse

from sources import _iso, make_client


class JobHTML(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts, self.scripts, self.links = [], [], []
        self.skip = 0
        self.script = None

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag in ('script', 'style'):
            self.skip += 1
        if tag == 'script' and attrs.get('type', '').lower() == 'application/ld+json':
            self.script = []
        if tag in ('p', 'div', 'br', 'li', 'section', 'h1', 'h2', 'h3'):
            self.parts.append('\n')
        if tag == 'a' and attrs.get('href'):
            self.links.append(attrs['href'])

    def handle_endtag(self, tag):
        if tag == 'script' and self.script is not None:
            self.scripts.append(''.join(self.script))
            self.script = None
        if tag in ('script', 'style'):
            self.skip = max(0, self.skip - 1)
        if tag in ('p', 'div', 'li', 'section'):
            self.parts.append('\n')

    def handle_data(self, text):
        if self.script is not None:
            self.script.append(text)
        if not self.skip:
            self.parts.append(text)


class DescriptionHTML(HTMLParser):
    """Preserve the entire SuccessFactors description, including nested spans."""
    def __init__(self):
        super().__init__(convert_charrefs=False)
        self.depth, self.parts = 0, []

    def handle_starttag(self, tag, attrs):
        if self.depth:
            self.parts.append(self.get_starttag_text())
            if tag not in ('br', 'hr', 'img', 'input', 'meta', 'link', 'wbr', 'source', 'area', 'base', 'embed', 'param', 'track', 'col'):
                self.depth += 1
        elif 'jobdescription' in dict(attrs).get('class', '').lower().split():
            self.depth = 1

    def handle_endtag(self, tag):
        if self.depth:
            self.depth -= 1
            if self.depth:
                self.parts.append(f'</{tag}>')

    def handle_startendtag(self, tag, attrs):
        if self.depth:
            self.parts.append(self.get_starttag_text())

    def handle_data(self, value):
        if self.depth:
            self.parts.append(value)

    def handle_entityref(self, value):
        self.handle_data('&' + value + ';')

    def handle_charref(self, value):
        self.handle_data('&#' + value + ';')


def plain_html(value):
    parser = JobHTML()
    parser.feed(unescape(value or ''))
    return '\n'.join(line for line in (' '.join(x.split()) for x in ''.join(parser.parts).splitlines()) if line)


def job_schema(value):
    if isinstance(value, list):
        for item in value:
            found = job_schema(item)
            if found:
                return found
    elif isinstance(value, dict):
        kind = value.get('@type', [])
        if kind == 'JobPosting' or (isinstance(kind, list) and 'JobPosting' in kind):
            return value
        for item in value.values():
            if isinstance(item, (dict, list)):
                found = job_schema(item)
                if found:
                    return found
    return None


def normalize(job, payload, ats, detail_url):
    job.raw_details = payload
    data = payload.get('jobPostingInfo', payload) if ats == 'workday' else payload
    description = data.get('descriptionHtml') or data.get('jobDescription') or data.get('content') or data.get('description')
    if ats == 'lever':
        sections = [data.get('opening') or data.get('openingPlain') or '', data.get('description') or data.get('descriptionPlain') or '']
        for section in data.get('lists') or []:
            sections.extend([section.get('text') or '', section.get('content') or ''])
        sections.append(data.get('additional') or data.get('additionalPlain') or '')
        description = '\n'.join(sections)
    elif ats == 'smartrecruiters':
        sections = (data.get('jobAd') or {}).get('sections') or {}
        description = '\n'.join((section.get('title', '') + '\n' + section.get('text', '')) for section in sections.values() if isinstance(section, dict))
    elif ats == 'workable':
        description = '\n'.join(data.get(key) or '' for key in ('description', 'requirements', 'benefits'))
    if description and isinstance(description, str):
        job.description_html = unescape(description)
        job.description_text = plain_html(description)
    apply = data.get('applyUrl') or data.get('applyURL') or data.get('applicationUrl')
    if isinstance(apply, str) and apply:
        resolved = urljoin(detail_url, apply)
        if urlparse(resolved).scheme in ('https', 'http'):
            job.apply_url = resolved
    job.apply_url = job.apply_url or job.url
    employment = data.get('employmentType') or data.get('timeType') or data.get('typeOfEmployment') or (data.get('categories') or {}).get('commitment') or (data.get('type') if ats == 'workable' else None)
    if isinstance(employment, dict):
        employment = employment.get('label') or employment.get('descriptor')
    if isinstance(employment, list):
        employment = ' | '.join(str(x) for x in employment)
    job.employment_type = employment if isinstance(employment, str) else None
    remote = data.get('workplaceType') or data.get('remoteType') or data.get('jobLocationType') or data.get('workplace')
    if isinstance(remote, dict):
        remote = remote.get('descriptor') or remote.get('label')
    job.workplace_type = remote if isinstance(remote, str) else ('Remote' if data.get('isRemote') is True else None)
    if not job.department:
        departments = data.get('departments') or []
        job.department = ' | '.join(d['name'] for d in departments if isinstance(d, dict) and d.get('name')) or None
    expiry = data.get('validThrough') or data.get('endDate')
    if isinstance(expiry, str):
        job.expires_at = _iso(expiry)
    salary = data.get('salaryRange') or data.get('baseSalary') or {}
    if isinstance(salary, dict):
        amount = salary.get('value', salary)
        if isinstance(amount, dict):
            for field, key in [('salary_min', 'min'), ('salary_max', 'max')]:
                value = amount.get(key, amount.get(key + 'Value'))
                if isinstance(value, (int, float)) and not isinstance(value, bool):
                    setattr(job, field, value)
            value = amount.get('value')
            if isinstance(value, (int, float)) and not isinstance(value, bool):
                job.salary_min = job.salary_max = value
            job.salary_period = amount.get('interval') or amount.get('unitText') or salary.get('interval')
        job.salary_currency = salary.get('currency')
    compensation = data.get('compensation')
    if compensation:
        job.salary_text = json.dumps(compensation, ensure_ascii=False)
        salary_components = [item for item in compensation.get('summaryComponents', []) if item.get('compensationType') == 'Salary'] if isinstance(compensation, dict) else []
        if len(salary_components) == 1:
            component = salary_components[0]
            job.salary_min, job.salary_max = component.get('minValue'), component.get('maxValue')
            job.salary_currency, job.salary_period = component.get('currencyCode'), component.get('interval')
    elif job.salary_min is not None or job.salary_max is not None:
        job.salary_text = json.dumps(salary, ensure_ascii=False)
    elif job.description_text:
        # Keep exact salary statements, including multiple geography-specific ranges.
        lines = [line for line in job.description_text.splitlines() if re.search(r'(?:\$|€|£|\bUSD\b|\bEUR\b|\bGBP\b)\s*[\d,.]+', line) and re.search(r'\bsalary\b|\bcompensation\b|\bbase pay\b|\bhourly (?:range|rate)\b|\bpay range\b', line, re.I)]
        job.salary_text = '\n'.join(lines) or None
    ranges = data.get('pay_input_ranges') or []
    if ranges:
        job.salary_text = json.dumps(ranges, ensure_ascii=False)
        if len(ranges) == 1:
            pay = ranges[0]
            job.salary_min = pay.get('min_cents', 0) / 100 if pay.get('min_cents') is not None else None
            job.salary_max = pay.get('max_cents', 0) / 100 if pay.get('max_cents') is not None else None
            job.salary_currency = pay.get('currency_type')
            job.salary_period = pay.get('pay_period')
            if not job.salary_period and re.search(r'\bannual\b', plain_html(pay.get('blurb', '')), re.I):
                job.salary_period = 'year'
    if job.salary_min is None and job.salary_text and not ranges and not compensation:
        # Only a single explicit range; multiple salary bands stay in source text.
        pattern = r'(?P<currency>USD|EUR|GBP|\$|€|£)\s*(?P<low>\d[\d,]*(?:\.\d+)?)\s*(?:-|–|—|to)\s*(?:USD|EUR|GBP|\$|€|£)?\s*(?P<high>\d[\d,]*(?:\.\d+)?)'
        matches = list(re.finditer(pattern, job.salary_text, re.I))
        if len(matches) == 1:
            match = matches[0]
            job.salary_min = float(match['low'].replace(',', ''))
            job.salary_max = float(match['high'].replace(',', ''))
            symbol = match['currency'].upper()
            job.salary_currency = {'€': 'EUR', '£': 'GBP'}.get(symbol, symbol if symbol != '$' else None)
            if symbol == '$' and (job.country in ('US', 'USA', 'United States', 'United States of America') or re.search(r'U\.S\.-based', job.salary_text)):
                job.salary_currency = 'USD'
            if re.search(r'\b(?:annual|annually|yearly|per year)\b', job.salary_text, re.I):
                job.salary_period = 'year'
            elif re.search(r'\b(?:hourly|per hour)\b', job.salary_text, re.I):
                job.salary_period = 'hour'
    job.details_status = 'complete' if job.description_text else 'missing_description'


async def enrich_jobs(jobs, sources, concurrency=4):
    lookup = {source['company']: source for source in sources}
    semaphore = asyncio.Semaphore(concurrency)
    boards = {}
    async with make_client() as client:
        async def get_json(url, **kwargs):
            response = await client.get(url, **kwargs)
            response.raise_for_status()
            return response.json()

        async def enrich(job):
            source = lookup.get(job.company)
            job.details_fetched_at = datetime.now(timezone.utc).isoformat(timespec='seconds')
            if source is None:
                source = next((s for s in sources if job.company.startswith(s['company'] + ' (')), None)
            try:
                async with semaphore:
                    ats = source['ats'] if source else job.ats
                    detail_url = job.url
                    if ats == 'greenhouse':
                        detail_url = f"https://boards-api.greenhouse.io/v1/boards/{source['slug']}/jobs/{job.job_id}"
                        payload = await get_json(detail_url, params={'pay_transparency': 'true'})
                    elif ats == 'lever':
                        detail_url = f"https://api.lever.co/v0/postings/{source['slug']}/{job.job_id}"
                        payload = await get_json(detail_url, params={'mode': 'json'})
                    elif ats == 'ashby':
                        detail_url = f"https://api.ashbyhq.com/posting-api/job-board/{source['slug']}"
                        if detail_url not in boards:
                            boards[detail_url] = asyncio.create_task(get_json(detail_url, params={'includeCompensation': 'true'}))
                        board = await boards[detail_url]
                        payload = next(j for j in board.get('jobs', []) if j['id'] == job.job_id)
                    elif ats == 'workday':
                        payload = job.extra.get('detail_payload')
                        if not payload:
                            path = urlparse(job.url).path.split('/' + source['site'], 1)[-1]
                            detail_url = f"https://{source['host']}/wday/cxs/{source['tenant']}/{source['site']}{path}"
                            payload = await get_json(detail_url)
                    elif ats == 'smartrecruiters':
                        detail_url = f"https://api.smartrecruiters.com/v1/companies/{source['slug']}/postings/{job.job_id}"
                        payload = await get_json(detail_url)
                    elif ats == 'workable':
                        detail_url = f"https://apply.workable.com/api/v2/accounts/{source['account']}/jobs/{job.job_id}"
                        payload = await get_json(detail_url)
                    else:
                        response = await client.get(job.url)
                        response.raise_for_status()
                        parser = JobHTML()
                        parser.feed(response.text)
                        payload = None
                        for script in parser.scripts:
                            try:
                                payload = job_schema(json.loads(script))
                            except ValueError:
                                continue
                            if payload:
                                break
                        if not payload and ats == 'successfactors':
                            description = DescriptionHTML()
                            description.feed(response.text)
                            if description.parts:
                                payload = {'description': ''.join(description.parts)}
                        if not payload:
                            raise ValueError('Job description missing from public structured data')
                    normalize(job, payload, ats, detail_url)
                    job.raw_details['_detail_url'] = detail_url
                    if job.details_status != 'complete':
                        job.details_error = 'Employer response contains no full description'
            except Exception as error:
                job.details_status = 'failed'
                job.details_error = f'{type(error).__name__}: {str(error)[:240]}'
                job.apply_url = job.apply_url or job.url
        await asyncio.gather(*(enrich(job) for job in jobs))
    return jobs
