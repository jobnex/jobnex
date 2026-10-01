"""Inspect employer career pages concurrently and retain discovered ATS links."""
import asyncio
import json
import re
from html import unescape
from pathlib import Path
from sources import make_client

PAGES = {
 "Medtronic":"https://www.medtronic.com/en-us/our-company/careers.html",
 "Stryker":"https://careers.stryker.com/",
 "Edwards Lifesciences":"https://www.edwards.com/careers",
 "Zimmer Biomet":"https://careers.zimmerbiomet.com/",
 "Intuitive Surgical":"https://careers.intuitive.com/",
 "ResMed":"https://careers.resmed.com/",
 "Dexcom":"https://careers.dexcom.com/",
 "Insulet":"https://www.insulet.com/careers",
 "Tandem Diabetes Care":"https://www.tandemdiabetes.com/careers",
 "Hologic":"https://careers.hologic.com/",
 "Alcon":"https://www.alcon.com/careers",
 "Baxter":"https://jobs.baxter.com/",
 "Bausch Health":"https://www.bauschhealth.com/careers/",
 "Organon":"https://www.organon.com/careers/",
 "CSL":"https://www.csl.com/careers",
 "Lonza":"https://www.lonza.com/careers",
 "Sartorius":"https://www.sartorius.com/en/company/career",
 "Agilent":"https://careers.agilent.com/",
 "Waters":"https://www.waters.com/nextgen/us/en/about-waters/careers.html",
 "Revvity":"https://jobs.revvity.com/",
 "PerkinElmer":"https://jobs.perkinelmer.com/",
 "Labcorp":"https://careers.labcorp.com/global/en",
 "Quest Diagnostics":"https://careers.questdiagnostics.com/",
 "Avantor":"https://www.avantorsciences.com/us/en/about/careers",
 "Catalent":"https://careers.catalent.com/us/en",
 "Charles River Laboratories":"https://jobs.criver.com/",
 "West Pharmaceutical Services":"https://careers.westpharma.com/",
 "ICON":"https://careers.iconplc.com/",
 "Fortrea":"https://careers.fortrea.com/",
 "Parexel":"https://jobs.parexel.com/",
 "Medpace":"https://www.medpace.com/careers/",
 "Certara":"https://www.certara.com/careers/",
 "Clario":"https://clario.com/about/careers/",
 "Jazz Pharmaceuticals":"https://careers.jazzpharma.com/",
 "Insmed":"https://careers.insmed.com/",
 "Sarepta Therapeutics":"https://www.sarepta.com/careers",
 "Neurocrine Biosciences":"https://www.neurocrine.com/careers/",
 "Ionis Pharmaceuticals":"https://www.ionis.com/careers/",
 "Alkermes":"https://www.alkermes.com/careers",
 "Incyte":"https://www.incyte.com/careers",
 "BioMarin":"https://www.biomarin.com/careers/",
 "Takeda":"https://www.takeda.com/careers/",
 "BioNTech":"https://biontech.de/careers",
 "Grifols":"https://www.grifols.com/en/careers",
 "Teva Pharmaceuticals":"https://careers.tevapharm.com/",
 "Viatris":"https://www.viatris.com/en/careers",
 "Sandoz":"https://www.sandoz.com/careers",
 "Perrigo":"https://www.perrigo.com/careers",
 "UCB":"https://careers.ucb.com/global/en",
 "Lundbeck":"https://www.lundbeck.com/global/careers",
 "Boehringer Ingelheim":"https://www.boehringer-ingelheim.com/careers",
 "Fresenius":"https://jobs.fresenius.com/",
 "Nutrien":"https://jobs.nutrien.com/",
 "Cargill":"https://careers.cargill.com/",
 "BASF":"https://www.basf.com/global/en/careers",
 "John Deere":"https://jobs.deere.com/",
 "FMC Corporation":"https://jobs.fmc.com/",
 "J.R. Simplot":"https://careers.simplot.com/",
 "McCain Foods":"https://careers.mccain.com/",
 "Lamb Weston":"https://www.lambweston.com/careers.html",
 "CHS":"https://jobs.chsinc.com/",
 "Smithfield Foods":"https://www.smithfieldfoods.com/careers",
 "JBS":"https://jobs.jbsfoodsgroup.com/",
 "Pilgrim's":"https://www.pilgrims.com/careers/",
 "Hormel Foods":"https://www.hormelfoods.com/careers/",
 "Conagra Brands":"https://careers.conagrabrands.com/",
 "Campbell's":"https://careers.thecampbellscompany.com/",
 "TreeHouse Foods":"https://www.treehousefoods.com/careers/",
 "Post Holdings":"https://www.postholdings.com/careers/",
 "B&G Foods":"https://bgfoods.com/careers/",
 "Nestle":"https://www.nestlejobs.com/",
 "Danone":"https://careers.danone.com/",
 "Kellanova":"https://jobs.kellanova.com/",
 "Mars":"https://careers.mars.com/",
 "Mondelez":"https://careers.mondelezinternational.com/",
 "McCormick":"https://careers.mccormick.com/",
 "Ingredion":"https://www.ingredion.com/na/en-us/company/careers",
 "Corbion":"https://jobs.corbion.com/",
 "Darling Ingredients":"https://www.darlingii.com/careers",
 "Sensus":"https://www.sensus.nl/careers/",
 "DSM-Firmenich":"https://jobs.dsm-firmenich.com/",
 "IFF":"https://www.iff.com/careers/",
 "Givaudan":"https://jobs.givaudan.com/",
 "Symrise":"https://www.symrise.com/career/",
 "Sensient":"https://careers.sensient.com/",
 "Olam":"https://careers.olamgroup.com/",
 "Wilmar":"https://www.wilmar-international.com/careers/",
 "Corteva":"https://careers.corteva.com/",
 "Limagrain":"https://jobs.limagrain.com/",
 "Rijk Zwaan":"https://www.rijkzwaancareers.com/",
 "Enza Zaden":"https://www.enzazaden.com/careers",
 "Sakata":"https://sakata.com/careers/",
 "DLF":"https://dlf.com/about-dlf/career",
 "STEMCELL Technologies":"https://www.stemcell.com/careers/",
 "Promega":"https://careers.promega.com/",
 "QIAGEN":"https://careers.qiagen.com/",
 "Oxford Nanopore Technologies":"https://nanoporetech.com/careers",
 "PacBio":"https://www.pacb.com/company/careers/",
 "Bio-Rad":"https://careers.bio-rad.com/",
 "Hamilton Company":"https://www.hamiltoncompany.com/careers",
 "Molecular Devices":"https://www.moleculardevices.com/about-us/careers",
 "Replimune":"https://www.replimune.com/careers/",
 "Absci":"https://www.absci.com/careers/",
 "Vow":"https://www.vowfood.com/careers",
}

async def main():
    results = []
    semaphore = asyncio.Semaphore(10)
    async with make_client() as client:
        async def inspect(company, url):
            async with semaphore:
                try:
                    response = await asyncio.wait_for(client.get(url), timeout=20)
                    links = sorted(set(unescape(x) for x in re.findall(r'[^\s<>"\x27]*(?:greenhouse|lever\.co|ashbyhq|myworkdayjobs|smartrecruiters|eightfold|kula\.ai|workable|icims|successfactors)[^\s<>"\x27]*', response.text)))
                    item = {"company": company, "url": url, "status": response.status_code, "final_url": str(response.url), "links": [x[:700] for x in links]}
                    results.append(item)
                    if links:
                        print(json.dumps(item), flush=True)
                except Exception as error:
                    results.append({"company": company, "url": url, "error": str(error)[:200]})
        await asyncio.gather(*(inspect(company, url) for company, url in PAGES.items()))
    Path("bio_100_career_links.json").write_text(json.dumps(results, indent=2), encoding="utf-8")
    print("Career pages inspected:", len(results))

if __name__ == "__main__":
    asyncio.run(main())
