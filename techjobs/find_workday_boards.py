"""Check discovered Workday sites and selected public candidate sites."""
import asyncio
import json
import re
from pathlib import Path
from urllib.parse import urlsplit, unquote
from companies import all_sources
from sources import make_client

GUESSES = """Lonza|lonza.wd3.myworkdayjobs.com|Lonza_Careers
Labcorp|labcorp.wd1.myworkdayjobs.com|External
Catalent|catalent.wd1.myworkdayjobs.com|External
Avantor|avantor.wd1.myworkdayjobs.com|AvantorCareers
Medtronic|medtronic.wd1.myworkdayjobs.com|MedtronicCareers
Edwards Lifesciences|edwards.wd5.myworkdayjobs.com|EdwardsCareers
Zimmer Biomet|zimmerbiomet.wd1.myworkdayjobs.com|External
Intuitive Surgical|intuitive.wd1.myworkdayjobs.com|External
Insulet|insulet.wd5.myworkdayjobs.com|Insulet
Organon|organon.wd5.myworkdayjobs.com|Careers
CSL|csl.wd1.myworkdayjobs.com|External
Neurocrine Biosciences|neurocrine.wd5.myworkdayjobs.com|NeurocrineCareers
Ionis Pharmaceuticals|ionispharmaceuticals.wd5.myworkdayjobs.com|IonisCareers
BioMarin|biomarin.wd5.myworkdayjobs.com|BioMarinCareers
Fortrea|fortrea.wd1.myworkdayjobs.com|External
ICON|icon.wd3.myworkdayjobs.com|ICON
Parexel|parexel.wd5.myworkdayjobs.com|ParexelCareers
Clario|clario.wd5.myworkdayjobs.com|Careers
Waters|waters.wd5.myworkdayjobs.com|External
Revvity|revvity.wd1.myworkdayjobs.com|RevvityCareers
PerkinElmer|perkinelmer.wd1.myworkdayjobs.com|PerkinElmer
PTC Therapeutics|ptctherapeutics.wd5.myworkdayjobs.com|Careers
Prothena|prothena.wd5.myworkdayjobs.com|ProthenaCareers
Vaxart|vaxart.wd5.myworkdayjobs.com|Careers
Incyte|incyte.wd5.myworkdayjobs.com|IncyteCareers
Viatris|viatris.wd5.myworkdayjobs.com|External
Conagra Brands|conagra.wd5.myworkdayjobs.com|Careers
TreeHouse Foods|treehousefoods.wd1.myworkdayjobs.com|THS_Careers
B&G Foods|bgfoods.wd5.myworkdayjobs.com|BGFOODSCAREERS
Mars|mars.wd3.myworkdayjobs.com|External
Mondelez|wd3.myworkdayjobs.com|External
IFF|iff.wd5.myworkdayjobs.com|IFF_Careers
DSM-Firmenich|dsm.wd3.myworkdayjobs.com|DSM
Saputo|saputo.wd5.myworkdayjobs.com|Careers
J.R. Simplot|simplot.wd1.myworkdayjobs.com|External
Australian Agricultural Company|aaco.wd105.myworkdayjobs.com|AACo_Careers
Golden Agri-Resources|goldenagri.wd3.myworkdayjobs.com|SMART_Careers
Harvest Road|harvestroad.wd105.myworkdayjobs.com|higcareers
STEMCELL Technologies|stemcell.wd3.myworkdayjobs.com|STEMCELL
Oxford Nanopore Technologies|nanoporetech.wd3.myworkdayjobs.com|ONT
PacBio|pacificbiosciences.wd1.myworkdayjobs.com|External
Hologic|hologic.wd1.myworkdayjobs.com|External
Masimo|masimo.wd5.myworkdayjobs.com|Careers
Integra LifeSciences|integralife.wd1.myworkdayjobs.com|Integra
Penumbra|penumbra.wd5.myworkdayjobs.com|Penumbra
Exact Sciences|exactsciences.wd1.myworkdayjobs.com|ExactSciences
Fulgent Genetics|fulgentgenetics.wd1.myworkdayjobs.com|Careers
Fujifilm|fujifilm.wd5.myworkdayjobs.com|External
Elutia|elutia.wd1.myworkdayjobs.com|External
Danone|danone.wd3.myworkdayjobs.com|Danone
Dairy Farmers of America|dfamilk.wd1.myworkdayjobs.com|External
Glanbia|glanbia.wd3.myworkdayjobs.com|External"""
AGRICULTURE = {"Smithfield Foods", "Campbell's", "Lamb Weston", "Enza Zaden", "Conagra Brands", "TreeHouse Foods", "B&G Foods", "Mars", "Mondelez", "IFF", "DSM-Firmenich", "Saputo", "J.R. Simplot", "Australian Agricultural Company", "Golden Agri-Resources", "Harvest Road", "Danone", "Dairy Farmers of America", "Glanbia"}

async def main():
    current = {s["company"] for s in all_sources()}
    candidates = []
    pages = json.loads(Path("bio_100_career_links.json").read_text(encoding="utf-8"))
    for page in pages:
        for link in page.get("links", []):
            if not link.startswith("https://") or ".myworkdayjobs.com/" not in link:
                continue
            parsed = urlsplit(link.rstrip("\\"))
            parts = [unquote(p) for p in parsed.path.split("/") if p]
            if parts and re.fullmatch(r"[a-z]{2}-[A-Za-z]{2}", parts[0]):
                parts.pop(0)
            if parts:
                candidates.append({"company": page["company"], "ats": "workday", "host": parsed.hostname, "tenant": parsed.hostname.split(".")[0], "site": parts[0], "evidence": page["url"]})
    for line in GUESSES.splitlines():
        company, host, site = line.split("|")
        candidates.append({"company": company, "ats": "workday", "host": host, "tenant": host.split(".")[0], "site": site, "evidence": "Public Workday board; inspect employer description"})
    groups = {}
    for source in candidates:
        if source["company"] not in current and source not in groups.setdefault(source["company"], []):
            groups[source["company"]].append(source)
    found = []
    semaphore = asyncio.Semaphore(8)
    async with make_client() as client:
        async def inspect(company, variants):
            async with semaphore:
                for source in variants:
                    try:
                        base = f"https://{source['host']}/wday/cxs/{source['tenant']}/{source['site']}"
                        response = await asyncio.wait_for(client.post(base + "/jobs", json={"limit":20,"offset":0,"searchText":"","appliedFacets":{}}), timeout=18)
                        if response.status_code != 200:
                            continue
                        data = response.json()
                        jobs = data.get("jobPostings", [])
                        if not jobs:
                            continue
                        detail = await client.get(base + jobs[0]["externalPath"])
                        info = detail.json().get("jobPostingInfo", {}) if detail.status_code == 200 else {}
                        description = " ".join(re.sub("<[^>]+>", " ", info.get("jobDescription", "")).split())
                        evidence = source.pop("evidence")
                        item = {"source": source, "sectors": ["agriculture" if company in AGRICULTURE else "biotech"], "identity_evidence": evidence, "count": data.get("total"), "titles": [j["title"] for j in jobs[:3]], "description_sample": description[:700], "identity_mentions": [word for word in company.split() if word.lower() in description.lower()]}
                        found.append(item)
                        Path("bio_100_workday_discovery.json").write_text(json.dumps(found, indent=2), encoding="utf-8")
                        print(json.dumps(item), flush=True)
                        return
                    except Exception:
                        pass
        await asyncio.gather(*(inspect(company, variants) for company, variants in groups.items()))
    print("Active candidate Workday companies:", len(found))

if __name__ == "__main__":
    asyncio.run(main())
