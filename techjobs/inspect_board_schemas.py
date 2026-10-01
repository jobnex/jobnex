"""Inspect live alternative board schemas without changing the registry."""
import asyncio
import re
from pathlib import Path
from sources import make_client

URLS = {
 "cipla": "https://careers.cipla.com/search/?q=",
 "corbion": "https://jobs.corbion.com/search/?q=",
 "simplot": "https://careers.simplot.com/search/?q=",
 "olam": "https://careers.olamgroup.com/search/?q=",
 "limagrain": "https://jobs.limagrain.com/search/?q=",
 "tetrapak": "https://jobs.tetrapak.com/search/?q=",
 "workable_costello": "https://apply.workable.com/api/v1/widget/accounts/costello-medical",
 "workable_immunocore": "https://apply.workable.com/api/v1/widget/accounts/immunocore",
 "workable_clinigen": "https://apply.workable.com/api/v1/widget/accounts/clinigen",
}

async def main():
    async with make_client() as client:
        async def inspect(name, url):
            try:
                response = await client.get(url)
                text = response.text
                Path(name + "_research.html").write_text(text, encoding="utf-8")
                print(name, response.status_code, str(response.url), len(text))
                if name.startswith("workable"):
                    print(text[:700])
                    return
                match = re.search(r'jobTitle-link|job-tile|job-card|jobCard|jobLocation|<title', text)
                if match:
                    print(text[max(0, match.start()-350):match.start()+2200])
                print("Scripts", re.findall(r'<script[^>]*src="([^"]+)', text)[-5:])
            except Exception as error:
                print(name, str(error)[:180])
        await asyncio.gather(*(inspect(name, url) for name, url in URLS.items()))

if __name__ == "__main__":
    asyncio.run(main())
