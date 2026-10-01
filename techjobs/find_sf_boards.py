"""Inspect public SuccessFactors employer boards with the existing fetcher."""
import asyncio
import json
from pathlib import Path
from sources import make_client, fetch_successfactors

COMPANIES = {
 "Charles River Laboratories": "jobs.criver.com",
 "West Pharmaceutical Services": "careers.westpharma.com",
 "Teva Pharmaceuticals": "careers.tevapharm.com",
 "Perrigo": "careers.perrigo.com",
 "Lundbeck": "jobs.lundbeck.com",
 "Grifols": "careers.grifols.com",
 "BioNTech": "jobs.biontech.com",
 "Sun Pharma": "careers.sunpharma.com",
 "Dr. Reddy's Laboratories": "careers.drreddys.com",
 "Cipla": "careers.cipla.com",
 "Lupin": "careers.lupin.com",
 "Glenmark": "careers.glenmarkpharma.com",
 "J.R. Simplot": "careers.simplot.com",
 "McCain Foods": "careers.mccain.com",
 "Nestle": "jobdetails.nestle.com",
 "McCormick": "careers.mccormick.com",
 "Corbion": "jobs.corbion.com",
 "Givaudan": "jobs.givaudan.com",
 "Olam": "careers.olamgroup.com",
 "Limagrain": "jobs.limagrain.com",
 "Kerry": "jobs.kerry.com",
 "Kellanova": "jobs.kellanova.com",
 "Tetra Pak": "jobs.tetrapak.com",
 "Nutrien": "jobs.nutrien.com",
 "DSM-Firmenich": "jobs.dsm-firmenich.com",
 "Boston Scientific": "jobs.bostonscientific.com",
 "Santen": "jobs.santen.com",
 "BASF": "jobs.basf.com",
 "AkzoNobel": "careers.akzonobel.com",
 "Evonik": "careers.evonik.com",
 "FMC Corporation": "jobs.fmc.com",
}
PHARMA = set(list(COMPANIES)[:12]) | {"Boston Scientific", "Santen"}

async def main():
    semaphore = asyncio.Semaphore(8)
    found = []
    async with make_client() as client:
        async def inspect(company, host):
            async with semaphore:
                source = {"company": company, "ats": "successfactors", "host": host}
                try:
                    jobs = await asyncio.wait_for(fetch_successfactors(client, source, max_jobs=3), timeout=25)
                    if jobs:
                        item = {"source": source, "sectors": ["pharma", "biotech"] if company in PHARMA else ["agriculture"], "identity_evidence": f"https://{host}", "jobs": [j.to_dict() for j in jobs]}
                        found.append(item)
                        print(company, ":", [(j.title, j.location) for j in jobs], flush=True)
                    else:
                        print(company, ": empty", flush=True)
                except Exception as error:
                    print(company, ":", str(error).splitlines()[0][:100], flush=True)
        await asyncio.gather(*(inspect(company, host) for company, host in COMPANIES.items()))
    Path("bio_100_sf_discovery.json").write_text(json.dumps(found, indent=2), encoding="utf-8")
    print("Active SF candidates:", len(found))

if __name__ == "__main__":
    asyncio.run(main())
