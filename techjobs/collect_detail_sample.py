"""Collect a small, real detail export from the six expansion platforms."""
import asyncio
import json
import sys
from pathlib import Path
from companies import all_sources
from details import enrich_jobs
from sources import Job

async def main():
    names = ['10x Genomics', 'Ascendis Pharma', 'IQVIA', 'Guardant Health', 'Bayer'] if '--other-platforms' in sys.argv else ['Disc Medicine', 'Fate Therapeutics', 'Unlearn', 'Insulet', 'J.R. Simplot', 'Sobi']
    checks = json.loads(Path('sector_checks.json').read_text(encoding='utf-8'))
    sources = [s for s in all_sources() if s['company'] in names]
    jobs = []
    for source in sources:
        check = next(c for c in reversed(checks) if c['source'] == source)
        row = check['jobs'][0]
        jobs.append(Job(**{k: v for k, v in row.items() if k in Job.__dataclass_fields__}))
    await enrich_jobs(jobs, sources)
    filename = 'jobs_details_other_sample.jsonl' if '--other-platforms' in sys.argv else 'jobs_details_sample.jsonl'
    Path(filename).write_text(''.join(json.dumps(j.to_dict(), ensure_ascii=False) + '\n' for j in jobs), encoding='utf-8')
    for job in jobs:
        print(job.company, job.details_status, len(job.description_text or ''), job.salary_min, job.salary_max, job.salary_currency, job.salary_period, job.employment_type, job.workplace_type, job.details_error, flush=True)
        print('Source fields:', list(job.raw_details), flush=True)

asyncio.run(main())
