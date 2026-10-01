import asyncio
import json
from pathlib import Path
from sources import make_client

async def main():
    checks = json.loads(Path('sector_checks.json').read_text(encoding='utf-8'))
    check = next(c for c in reversed(checks) if c['source']['company'] == 'Ocular Therapeutix')
    async with make_client() as client:
        for job in check['jobs'][:6]:
            for url in [job['url'], f"https://boards.greenhouse.io/oculartherapeutix/jobs/{job['job_id']}"]:
                response = await client.get(url)
                print(job['title'], response.status_code, str(response.url), flush=True)

asyncio.run(main())
