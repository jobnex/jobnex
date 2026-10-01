"""Map detailed postings to trail_dev.public.jobs without writing to Neon."""
import json
from pathlib import Path
from uuid import NAMESPACE_URL, uuid5


def db_record(row):
    employment = (row.get('employment_type') or '').lower().replace('-', '').replace(' ', '').replace('_', '')
    work = (row.get('workplace_type') or '').lower().replace('-', '').replace(' ', '').replace('_', '')
    employment = {'full': 'full_time', 'part': 'part_time', 'fulltime': 'full_time', 'parttime': 'part_time', 'contract': 'contract', 'contractor': 'contract', 'internship': 'internship', 'intern': 'internship', 'temporary': 'temporary'}.get(employment, 'full_time' if 'fulltime' in employment else 'part_time' if 'parttime' in employment else 'unknown')
    work = {'onsite': 'on_site', 'remote': 'remote', 'telecommute': 'remote', 'hybrid': 'hybrid'}.get(work, 'unknown')
    raw = row.get('raw_details') or {}
    requirements = []
    if row['ats'] == 'smartrecruiters':
        qualification = ((raw.get('jobAd') or {}).get('sections') or {}).get('qualifications') or {}
        qualification = qualification.get('text')
    else:
        qualification = raw.get('requirements') or raw.get('qualifications') or raw.get('experienceRequirements')
    if isinstance(qualification, str) and qualification:
        from details import plain_html
        requirements = [{'type': 'section', 'items': [plain_html(qualification)]}]
    # The DB has integer salary bounds and no pay-period column. Do not turn
    # hourly/monthly or fractional amounts into misleading annual salaries.
    yearly = (row.get('salary_period') or '').casefold() in {'year', 'yearly', 'annual', 'annually', 'per year', '1 year'}
    def salary(key):
        value = row.get(key)
        return int(value) if yearly and row.get('salary_currency') and isinstance(value, (int, float)) and not isinstance(value, bool) and value == int(value) and 0 <= value <= 2147483647 else None
    countries_path = Path(__file__).with_name('neon_countries.json')
    countries = json.loads(countries_path.read_text(encoding='utf-8')) if countries_path.exists() else []
    country = row.get('country')
    if country in ('USA', 'United States of America'):
        country = 'United States'
    country_id = next((c['id'] for c in countries if country and country.casefold() in {c['name'].casefold(), c['code'].casefold()}), None)
    experience = raw.get('experienceRequirements')
    months = experience.get('monthsOfExperience') if isinstance(experience, dict) else None
    experience_years = int(months) // 12 if isinstance(months, (int, float)) and months >= 0 and months % 12 == 0 else None
    return {
        'id': str(uuid5(NAMESPACE_URL, f"techjobs:{row['ats']}:{row['company']}:{row['job_id']}")),
        'source_service': 'techjobs', 'job_source': row['ats'],
        'job_role_title': row['title'], 'job_description': row.get('description_text'),
        'company_name': row['company'], 'location': row.get('location') or 'Unknown',
        'employment_type': employment, 'work_model': work,
        'salary_min': salary('salary_min'), 'salary_max': salary('salary_max'),
        'currency': row.get('salary_currency'), 'status': 'draft', 'is_external': True,
        'external_apply_url': row.get('apply_url') or row.get('url'),
        'requirements': requirements, 'published_at': row.get('posted_at'),
        'country_id': country_id, 'experience_required': experience_years,
        'visa_sponsorship': False, 'visa_sponsorship_status': 'unknown',
        'visa_sponsorship_evidence': None, 'visa_sponsorship_description_hash': None,
        'visa_sponsorship_source': None, 'visa_sponsorship_assessed_at': None,
    }


def export_db(rows, path):
    missing = []
    with Path(path).open('a', encoding='utf-8') as output:
        for row in rows:
            if row.get('details_status') != 'complete' or not row.get('description_text'):
                missing.append({'company': row['company'], 'job_id': row['job_id'], 'error': row.get('details_error') or 'Missing full description'})
                continue
            output.write(json.dumps(db_record(row), ensure_ascii=False) + '\n')
    if missing:
        with Path(str(path) + '.rejected.jsonl').open('a', encoding='utf-8') as output:
            output.writelines(json.dumps(row) + '\n' for row in missing)
    return len(rows) - len(missing), len(missing)
