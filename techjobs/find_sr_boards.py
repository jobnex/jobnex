"""Discover employer-owned life-science boards on SmartRecruiters."""
import asyncio
import json
from pathlib import Path
from companies import all_sources
from sources import make_client

BOARDS = {
 "SGS": ["SGS", "SGS1", "SGS2"],
 "QIMA": ["QIMA", "QIMA1", "QIMA2"],
 "LGC Group": ["LGCGroup", "LGC", "LGC1", "LGC2"],
 "Sobi": ["Sobi", "Sobi1", "Sobi2", "SwedishOrphanBiovitrum"],
 "Santen": ["Santen", "Santen1", "Santen2"],
 "Dr. Reddy's Laboratories": ["DrReddysLaboratories", "DrReddysLaboratories1", "DrReddysLaboratories2"],
 "Miltenyi Biotec": ["MiltenyiBiotec", "MiltenyiBiotec1", "MiltenyiBiotec2", "Miltenyi"],
 "BioAgilytix": ["BioAgilytix", "BioAgilytixLabs"],
 "Boehringer Ingelheim": ["BoehringerIngelheim", "BoehringerIngelheim1", "BoehringerIngelheim2"],
 "Chiesi": ["Chiesi", "ChiesiGroup", "Chiesi1"],
 "Haleon": ["Haleon", "Haleon1"],
 "Pharmaron": ["Pharmaron", "Pharmaron1"],
 "Ferring Pharmaceuticals": ["Ferring", "FerringPharmaceuticals"],
 "Virbac": ["Virbac", "Virbac1"],
 "Dechra": ["Dechra", "DechraPharmaceuticals"],
 "CEVA Animal Health": ["CevaSanteAnimale", "CevaAnimalHealth"],
 "DeLaval": ["DeLaval", "DeLaval1"],
 "GEA Group": ["GEAGroup", "GEA", "GEA1"],
 "Tetra Pak": ["TetraPak", "TetraPak1"],
 "Alfa Laval": ["AlfaLaval", "AlfaLaval1"],
 "Symrise": ["Symrise", "Symrise1"],
 "Danone": ["Danone", "Danone1", "Danone2"],
 "McCain Foods": ["McCainFoods", "McCainFoods1"],
 "Glanbia": ["Glanbia", "Glanbia1"],
 "Hain Celestial": ["HainCelestial", "TheHainCelestialGroup"],
 "Royal Canin": ["RoyalCanin", "RoyalCanin1"],
 "Avery Dennison": ["AveryDennison", "AveryDennison1"],
 "Eurofins CDMO": ["EurofinsCDMO", "EurofinsCDMOAlphora"],
 "Sartorius Stedim": ["SartoriusStedim", "SartoriusStedimBiotech"],
 "Viatris": ["Viatris", "Viatris1"],
 "Sandoz": ["Sandoz", "Sandoz1"],
 "Lesaffre": ["Lesaffre", "Lesaffre1"],
 "Lallemand": ["Lallemand", "Lallemand1"],
 "PharmaEssentia": ["PharmaEssentia", "PharmaEssentiaUSA"],
 "ProPharma Group": ["ProPharmaGroup", "ProPharma"],
 "Ergomed": ["Ergomed", "Ergomed1"],
 "PrimeVigilance": ["PrimeVigilance", "PrimeVigilance1"],
 "PSI CRO": ["PSICRO", "PSI", "PSICRO1"],
 "Precision for Medicine": ["PrecisionForMedicine", "PrecisionforMedicine"],
 "Indivior": ["Indivior", "Indivior1"],
 "Recordati": ["Recordati", "Recordati1"],
 "Ipsen": ["Ipsen", "Ipsen1"],
 "Servier": ["Servier", "Servier1", "LaboratoiresServier"],
 "Almirall": ["Almirall", "Almirall1"],
 "Menarini": ["Menarini", "MenariniGroup"],
 "Pierre Fabre": ["PierreFabre", "PierreFabre1"],
 "Vetoquinol": ["Vetoquinol", "Vetoquinol1"],
 "ClinChoice": ["ClinChoice", "ClinChoice1"],
 "Chugai": ["Chugai", "ChugaiPharmaceutical"],
 "Chugai Pharma USA": ["ChugaiPharmaUSA", "ChugaiPharma"],
 "Otsuka": ["Otsuka", "OtsukaPharmaceutical"],
 "Daiichi Sankyo": ["DaiichiSankyo", "DaiichiSankyo1"],
 "Dendreon": ["Dendreon", "Dendreon1"],
 "Novavax": ["Novavax", "Novavax1"],
 "Bavarian Nordic": ["BavarianNordic", "BavarianNordic1"],
 "Abzena": ["Abzena", "Abzena1"],
 "Recipharm": ["Recipharm", "Recipharm1"],
 "AGC Biologics": ["AGCBiologics", "AGCBiologics1"],
 "Cambrex": ["Cambrex", "Cambrex1"],
 "EuroAPI": ["EuroAPI", "EuroAPI1"],
 "Seqens": ["Seqens", "Seqens1"],
}

async def main():
    current = {s["company"] for s in all_sources()}
    semaphore = asyncio.Semaphore(10)
    found = []
    async with make_client() as client:
        async def inspect(company, slugs):
            if company in current:
                return
            async with semaphore:
                for slug in slugs:
                    try:
                        response = await asyncio.wait_for(client.get(f"https://api.smartrecruiters.com/v1/companies/{slug}/postings", params={"limit":3,"offset":0}), timeout=12)
                        if response.status_code != 200:
                            continue
                        data = response.json()
                        jobs = data.get("content", [])
                        if not jobs:
                            continue
                        item = {"source": {"company":company,"ats":"smartrecruiters","slug":slug},"count":data.get("totalFound"),"titles":[j["name"] for j in jobs],"board_name": jobs[0].get("company", {}).get("name")}
                        found.append(item)
                        Path("bio_100_sr_discovery.json").write_text(json.dumps(found,indent=2),encoding="utf-8")
                        print(json.dumps(item),flush=True)
                        return
                    except Exception:
                        pass
        await asyncio.gather(*(inspect(company,slugs) for company,slugs in BOARDS.items()))
    print("Active SmartRecruiters candidates:",len(found))

if __name__ == "__main__":
    asyncio.run(main())
