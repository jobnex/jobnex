"""Discover more public scientific employer ATS boards for manual review."""
import asyncio
import json
import re
from pathlib import Path
from companies import all_sources
from sources import make_client
from find_bio_boards import GROUPS

MORE = """Apogee Therapeutics|Spyre Therapeutics|Rezolute|Crinetics Pharmaceuticals|Ardelyx|Phathom Pharmaceuticals|Corcept Therapeutics|Immunome|Zymeworks|Xencor|Agenus|ImmunityBio|TerSera Therapeutics|Sutro Biopharma|SutroBio|Sutro|ALX Oncology|ALXOncology|ALXOncologyInc|Aulos Bioscience|AulosBioscience|Arcus Biosciences|ArcusBiosciences|Arcus|ArcusBio|ArcusBiosciencesInc|ArcusBiopharma|ArcusBiotherapeutics|BOLT Biotherapeutics|BoltBiotherapeutics|BoltBio|BoltBioTherapeuticsInc|BioAtla|BioAtlaInc|BioTheryX|Biotheryx|BiotheryxInc|Boundless Bio|Boundless|Bright Peak Therapeutics|BrightPeakTherapeutics|BrightPeak|Captor Therapeutics|CaptorTherapeutics|Captor|Celsius Therapeutics|CelsiusTherapeutics|CelsiusTx|Celsius|Circle Pharma|CirclePharma|CirclePharmaInc|Circle|Codiak BioSciences|CodiakBiosciences|Codiak|Cue Biopharma|CueBiopharma|Cue|DICE Therapeutics|DICETherapeutics|DicetherapeuticsInc|Enliven Therapeutics|EnlivenTherapeutics|Enliven|EnlivenTx|Elicio Therapeutics|ElicioTherapeutics|Elicio|ErascaInc|Escient Pharmaceuticals|EscientPharmaceuticals|Escient|ImmuneOnco|Jasper Therapeutics|JasperTherapeutics|JasperTx|Kinnate Biopharma|KinnateBiopharma|Kinnate|Lassen Therapeutics|LassenTherapeutics|Lassen|LassenTx|Leap Therapeutics|LeapTherapeutics|Leap|Neurona Therapeutics|NeuronaTherapeutics|Neurona|NeuronaTx|NodThera|NodTheraLtd|Novome Biotechnologies|NovomeBiotechnologies|Novome|NovomeBio|Nucleai|NucleaiInc|OnKure Therapeutics|OnKureTherapeutics|OnKure|OnKureInc|ORIC Pharmaceuticals|ORICPharmaceuticals|ORIC|OricPharma|Orum Therapeutics|OrumTherapeutics|Orum|OrumTx|Oryzon Genomics|OryzonGenomics|Oryzon|Palleon Pharmaceuticals|PalleonPharmaceuticals|Palleon|PalleonPharma|Pelage Pharmaceuticals|PelagePharmaceuticals|Pelage|PelagePharma|Peloton Therapeutics|PelotonTherapeutics|Pheon Therapeutics|PheonTherapeutics|Pheon|Pliant|PliantTx|Quell Therapeutics|QuellTherapeutics|Quell|QuellTx|Reneo Pharmaceuticals|ReneoPharmaceuticals|Reneo|ReneoPharma|Resolve Biosciences|ResolveBiosciences|ResolveBio|Resolution Bioscience|ResolutionBioscience|ResolutionBio|Ribon Therapeutics|RibonTherapeutics|Ribon|RibonTx|Rincon Biosciences|RinconBiosciences|RinconBio|Sail Biomedicines|SailBiomedicines|SailBio|Seismic Therapeutic|SeismicTherapeutic|Seismic|SeismicTx|Siolta Therapeutics|SioltaTherapeutics|Siolta|SioltaTx|Sphere Fluidics|SphereFluidics|Sphere|Spotlight Therapeutics|SpotlightTherapeutics|Spotlight|SpotlightTx|Stealth BioTherapeutics|StealthBioTherapeutics|StealthBio|SUDO Biosciences|SUDOBiosciences|SudoBio|TScan Therapeutics|TScanTherapeutics|TScan|TScanTx|Valneva|ValnevaSE|ValnevaUSA|VedaBio|VedaBioInc|Veda|VentureMed|VentureMedGroup|Versanis Bio|VersanisBio|Versanis|Vigil Neuroscience|VigilNeuroscience|VigilNeuro|Viracta Therapeutics|ViractaTherapeutics|Viracta|Visgenx|VisgenxInc|Visus Therapeutics|VisusTherapeutics|Visus|VisusTx|Zentalis Pharmaceuticals|ZentalisPharmaceuticals|Zentalis|ZentalisPharma|Zymergen|ZymergenInc|ZymeworksInc|Zymeworks|Cytek Biosciences|CytekBiosciences|Cytek|CytekBio|Cyteir Therapeutics|CyteirTherapeutics|Cyteir|CyteirTx|Cytonome|CytonomeInc|CytoTronics|CytoTronicsInc|CytoTronicsBio|EpiCypher|EpiCypherInc|Epicypher|EpiCypherBio|Epios|EpiosInc|Epic Bio|EpicBio|EpicBioInc|EpicBiotechnologies|EpicBiotechnology|Epigenic Therapeutics|EpigenicTherapeutics|Epigenic|EpigenicTx|Esco Lifesciences|EscoLifesciences|Esco|EscoScientific|Evotec|EvotecSE|EvotecUSA|Exscientia|ExscientiaLtd|ExscientiaAI|Exai|Fusion Pharmaceuticals|FusionPharmaceuticals|Fusion|FusionPharma|Gossamer Bio|GossamerBio|Gossamer|GossamerBioInc|Guardant|Gyroscope Therapeutics|GyroscopeTherapeutics|Gyroscope|Hummingbird Bioscience|HummingbirdBioscience|HummingbirdBio|Hummingbird|Immatics|ImmaticsUS|ImmaticsInc|Innovent Biologics|InnoventBiologics|InnoventBio|Innovent|Instil Bio|InstilBio|Instil|InstilBioInc|Integra|Inventprise|InventpriseInc|InventpriseLLC|Invivyd|InvivydInc|IO Biotech|IOBiotech|IOBiotechInc|IOBiotechLLC|Ironwood Pharmaceuticals|IronwoodPharmaceuticals|Ironwood|IronwoodPharma|Jounce Therapeutics|JounceTherapeutics|Jounce|Kane Biotech|KaneBiotech|Kane|KaneBio|Korro Bio|KorroBio|Korro|KorroBioInc|KorroBiosciences|Kronos Bio|KronosBio|Kronos|KronosBioInc|KronosBiosciences|LAVA Therapeutics|LAVATherapeutics|LAVATx|LAVA|Leucid Bio|LeucidBio|Leucid|LeucidBiosciences|Longboard Pharmaceuticals|LongboardPharmaceuticals|Longboard|LongboardPharma|Lycia Therapeutics|LyciaTherapeutics|Lycia|LyciaTx|Merus|MerusNV|MerusUS|MerusBio|Metrion Biosciences|MetrionBiosciences|Metrion|MetrionBio|Mineralys Therapeutics|MineralysTherapeutics|Mineralys|MineralysTx|Nektar Therapeutics|NektarTherapeutics|Nektar|NektarTherapeuticsInc|NexImmune|NexImmuneInc|NuCana|NuCanaPLC|Nucana|NuCanaBiomed|Nuclera|NucleraLtd|NucleraNucleics|NucleraBio|Nurix|Obsidian Therapeutics|ObsidianTherapeutics|Obsidian|ObsidianTx|Ocular Therapeutix|OcularTherapeutix|Ocular|OcularTx|OcularTherapeutixInc|Omega Therapeutics|OmegaTherapeutics|Omega|OmegaTx|Organogenesis|OrganogenesisInc|OrganogenesisAdvancedWoundCare|OrganogenesisHoldings|Ovid Therapeutics|OvidTherapeutics|Ovid|OvidTx|Passage Bio|PassageBio|Passage|PassageBioInc|PDS Biotechnology|PDSBiotechnology|PDSBio|PDS|PharmaEssentia|PharmaEssentiaUSA|PharmaEssentiaUS|PharmaEssentiaCorp|Pharming Group|PharmingGroup|Pharming|PharmingHealthcare|Pharmaron|PharmaronUSA|PharmaronUS|PharmaronUK|PharmaronInc|WuXi AppTec|WuXiAppTec|WuXiBiologics|WuXi Biologics|WuXiAdvancedTherapies|WuXi Advanced Therapies|WuXiSTA|WuXi STA|WuXi|Avid Bioservices|AvidBioservices|Avid|Ajinomoto Bio-Pharma Services|AjinomotoBioPharmaServices|AjinomotoBioPharma|AjinomotoBioServices|ABPS|Alcami|AlcamiCorporation|AlcamiCorp|AlcamiInc|Bionova Scientific|BionovaScientific|Bionova|BionovaInc|Bora Pharmaceuticals|BoraPharmaceuticals|Bora|BoraPharma|CordenPharma|CordenPharmaInternational|CordenPharmaUS|CordenPharmaInc|Curia|CuriaGlobal|Curia Global|CuriaInc|KBI Biopharma|KBIBiopharma|KBI|KBIBiopharmaInc|Kymanox|KymanoxCorporation|KymanoxCorp|KymanoxInc|Oxford Biomedica|OxfordBiomedica|OxfordBio|OxfordBiomedicaSolutions|Oxford Biomedica Solutions|Rentschler Biopharma|RentschlerBiopharma|Rentschler|RentschlerBiopharmaSE|Samsung Biologics|SamsungBiologics|SamsungBio|SamsungBiologicsAmerica|SK Pharmteco|SKPharmteco|SK|SKBio|SKBioscience|SK Bioscience|SKBiopharmaceuticals|SK Biopharmaceuticals|Vetter Pharma|VetterPharma|Vetter|VetterPharmaInternational|Veranova|VeranovaLP|VeranovaInc|Vibalogics|VibalogicsGmbH|VibalogicsInc|VibalogicsUS|Avance Clinical|AvanceClinical|Avance|AvanceClinicalPtyLtd|Aptuit|AptuitLLC|AptuitInc|Bioscript Group|BioscriptGroup|Bioscript|Clinigen|ClinigenGroup|ClinigenGroupPLC|ClinigenInc|Norgine|NorgineLtd|NorgineLimited|NorgineBV|Ergomed|ErgomedGroup|ErgomedPLC|ErgomedInc|Medison Pharma|MedisonPharma|Medison|MedisonPharmaLtd|Synthon|SynthonBV|SynthonBiopharmaceuticals|Synthon Biopharmaceuticals|Lumanity|LumanityInc|LumanityGroup|PharmaReview|Pharma Review|PharmaReviewLimited|PharmaReviewLtd|hVIVO|Hvivo|HVIVO|HvivoServices|OPEN Health|OPENHealth|OPENHealthGroup|OpenHealth|OPENHealthCommunications|HealthEconomicsAndOutcomesResearch|HEOR|HEORLtd|HealthEconomics|Costello Medical|CostelloMedical|CostelloMedicalConsulting|Costello|Scendea|ScendeaLtd|ScendeaLimited|ScendeaGroup|BioPhorum|BioPhorumOperationsGroup|BioPhorumGroup|Biophorum|BioPhorumLtd|Frontage Laboratories|FrontageLaboratories|Frontage|FrontageLabs|FrontageHoldings|PharmaLex|PharmaLexGroup|PharmaLexGmbH|Pharmalex|ProductLife Group|ProductLifeGroup|ProductLife|Productlife|ProductLifeGroupLtd|ProductLifeGroupGmbH|ProductLifeGroupFrance|Knoell|KnoellGroup|KnoellConsult|KnoellConsultGmbH|KnoellUSA""".split("|")

async def main():
    current = all_sources()
    existing = {(s["ats"], s.get("slug", s.get("account"))) for s in current}
    current_names = {re.sub(r"[^a-z0-9]", "", s["company"].lower()) for s in current}
    targets = {}
    for name in MORE:
        if re.sub(r"[^a-z0-9]", "", name.lower()) not in current_names:
            targets.setdefault(re.sub(r"[^a-z0-9-]", "", name.lower()), name)
    for name in GROUPS["biotech"] + GROUPS["agriculture"]:
        if re.sub(r"[^a-z0-9]", "", name.lower()) not in current_names:
            targets.setdefault(re.sub(r"[^a-z0-9-]", "", name.lower()), name)
    found = []
    semaphore = asyncio.Semaphore(15)
    async with make_client() as client:
        async def inspect(slug, name):
            async with semaphore:
                choices = [("workable", f"https://apply.workable.com/api/v1/widget/accounts/{slug}")]
                if name in MORE:
                    choices += [("greenhouse", f"https://boards-api.greenhouse.io/v1/boards/{slug}/jobs"), ("lever", f"https://api.lever.co/v0/postings/{slug}?mode=json"), ("ashby", f"https://api.ashbyhq.com/posting-api/job-board/{slug}")]
                if " " in name:
                    choices += [("workable", "https://apply.workable.com/api/v1/widget/accounts/" + re.sub(r"[^a-z0-9 -]", "", name.lower()).replace(" ", "-"))]
                for ats, url in choices:
                    if (ats, slug) in existing:
                        continue
                    try:
                        response = await asyncio.wait_for(client.get(url), timeout=12)
                        if response.status_code != 200:
                            continue
                        data = response.json()
                        jobs = data if ats == "lever" else data.get("jobs", [])
                        if not jobs:
                            continue
                        source = {"company": name, "ats": ats, "account" if ats == "workable" else "slug": url.rstrip("/").rsplit("/", 1)[-1].split("?")[0] if ats == "workable" else slug}
                        item = {"source": source, "count": len(jobs), "titles": [j.get("text", j.get("title")) for j in jobs[:3]]}
                        if ats == "greenhouse":
                            board = await client.get(f"https://boards-api.greenhouse.io/v1/boards/{slug}")
                            item["board_name"] = board.json().get("name")
                        found.append(item)
                        Path("bio_100_other_discovery.json").write_text(json.dumps(found, indent=2), encoding="utf-8")
                        print(json.dumps(item), flush=True)
                    except Exception:
                        pass
        await asyncio.gather(*(inspect(slug, name) for slug, name in targets.items()))
    print("Candidate boards:", len(found))

if __name__ == "__main__":
    asyncio.run(main())
