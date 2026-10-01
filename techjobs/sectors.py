"""Employer groups and inclusive role tracks for life-science job searches."""
import re

# Companies can belong to more than one sector. These are coverage groups,
# not an assertion that every role at an employer is a scientific role.
SECTOR_COMPANIES = {
    "pharma": set("""Pfizer|Eli Lilly|Merck & Co|Bristol-Myers Squibb|Amgen|Gilead Sciences|AstraZeneca|Sanofi|Vertex Pharmaceuticals|Regeneron|Moderna|Biogen|Novartis|Zoetis|Elanco|IQVIA|Roche / Genentech|GSK|AbbVie|Novo Nordisk|Beam Therapeutics|Prime Medicine|Sana Biotechnology|Caribou Biosciences|CRISPR Therapeutics|Alector|Eikon Therapeutics|Revolution Medicines|Mammoth Biosciences|Kyverna Therapeutics|Vera Therapeutics|Relay Therapeutics|Nurix Therapeutics|Arvinas|BridgeBio|Blueprint Medicines|Legend Biotech|Vaxcyte|Ultragenyx|Iambic Therapeutics|Enveda Biosciences|Nimbus Therapeutics""".split("|")),
    "biotech": set("""Ginkgo Bioworks|Recursion|Twist Bioscience|Natera|Freenome|Generate Biomedicines|Abbott Laboratories|Thermo Fisher Scientific|Danaher|Illumina|Adaptive Biotechnologies|Beam Therapeutics|Prime Medicine|Sana Biotechnology|Caribou Biosciences|CRISPR Therapeutics|Arcadia Science|Eikon Therapeutics|Altos Labs|NewLimit|Alector|Veracyte|Insitro|Tempus|AbCellera|Element Biosciences|Singular Genomics|Eurofins Scientific|Vera Therapeutics|Revolution Medicines|Mammoth Biosciences|Kyverna Therapeutics|Valo Health|Relay Therapeutics|Nurix Therapeutics|Arvinas|BridgeBio|Legend Biotech|Vaxcyte|Ultragenyx|10x Genomics|Editas Medicine|Personalis|Guardant Health|Xaira Therapeutics|Isomorphic Labs|Iambic Therapeutics|Profluent|Parse Biosciences|Chai Discovery|Enveda Biosciences|Manifold Bio|Nimbus Therapeutics""".split("|")),
    "agriculture": set("""Corteva Agriscience|Pivot Bio|Inari Agriculture|Syngenta Group|Bayer|AGCO|Bunge|Zoetis|Elanco|Ginkgo Bioworks|Profluent""".split("|")),
    "bioinformatics": set("""Benchling|DNAnexus|Insitro|Tempus|Recursion|Generate Biomedicines|Illumina|10x Genomics|Element Biosciences|Singular Genomics|Personalis|Guardant Health|Adaptive Biotechnologies|Natera|Freenome|Veracyte|Valo Health|Arcadia Science|NewLimit|Altos Labs|Xaira Therapeutics|Isomorphic Labs|Iambic Therapeutics|Profluent|Parse Biosciences|Chai Discovery|Manifold Bio|Inari Agriculture""".split("|")),
}

ROLE_PATTERNS = {
    "Bioinformatics / computational biology": r"bioinformatic|computational (biolog|genom|chem|protein)|cheminformatic|genomic|multi.?omic|proteomic|transcriptomic|protein (design|engineer)|biomedical ai|biostatistic|statistical program|research informatic|medical informatic|clinical data|epidemiolog|real.world (data|evidence)",
    "Research / laboratory": r"scientist|research|laborator|\blab\b|biolog|biochem|chemist|chemistry|pharmacolog|toxicolog|assay|cell (therapy|culture)|molecular|microbiolog|immunolog|virolog|veterinar|preclinical|pre.clinical|drug discovery|translational",
    "Clinical / medical / regulatory": r"clinical|medical|physician|pharmac|patient|regulatory|drug safety|pharmacovigilance|health economics|\bheor\b|nurs|oncolog|therapeutic",
    "Manufacturing / quality / engineering": r"manufactur|process (develop|engineer|scien)|technical (operat|develop)|quality|\bqa\b|\bqc\b|\bgmp\b|\bcgmp\b|\bcmc\b|\bmsat\b|validation|production|fermentation|formulation|downstream|upstream|bioprocess|automation|technician|engineer",
    "Agriculture / plant / food science": r"agronom|agricultur|crop|plant (biolog|scien|breed|patholog)|breeding|seed|soil|horticultur|farm|livestock|animal (health|scien)|food (scien|safety|technolog)|precision ag|sustainab|irrigat",
}
SECTOR_COMPANIES["pharma"].update({"Ascendis Pharma", "Septerna", "Cellarity", "Intellia Therapeutics"})
SECTOR_COMPANIES["biotech"].update({"Ascendis Pharma", "Septerna", "Cellarity", "Flagship Pioneering", "Intellia Therapeutics", "Becton Dickinson"})
SECTOR_COMPANIES["bioinformatics"].update({"Cellarity", "Flagship Pioneering"})
SECTOR_COMPANIES["agriculture"].update({"KWS", "Yara", "Archer-Daniels-Midland", "General Mills", "Tyson Foods", "Kraft Heinz"})
SECTOR_COMPANIES["pharma"].update({"Syndax Pharmaceuticals", "Tessera Therapeutics", "Axsome Therapeutics", "Alnylam Pharmaceuticals"})
SECTOR_COMPANIES["biotech"].update({"Syndax Pharmaceuticals", "PathAI", "Tessera Therapeutics", "Seer", "Axsome Therapeutics", "Alnylam Pharmaceuticals"})
SECTOR_COMPANIES["bioinformatics"].update({"PathAI", "Seer"})
SECTOR_COMPANIES["pharma"].update({"Acadia Pharmaceuticals", "Kura Oncology", "Erasca", "Cogent Biosciences"})
SECTOR_COMPANIES["biotech"].update({"Acadia Pharmaceuticals", "Kura Oncology", "Erasca", "Cogent Biosciences"})
SECTOR_COMPANIES["agriculture"].update({"Sound Agriculture", "TerraClear"})
SECTOR_COMPANIES["pharma"].update({"Stoke Therapeutics", "Rapport Therapeutics", "Praxis Precision Medicines", "Entrada Therapeutics", "Dyne Therapeutics", "Alumis"})
SECTOR_COMPANIES["biotech"].update({"Stoke Therapeutics", "Rapport Therapeutics", "Praxis Precision Medicines", "Entrada Therapeutics", "Dyne Therapeutics", "Alumis"})
SECTOR_COMPANIES["pharma"].update({"Maze Therapeutics", "Nosis Bio", "Genesis Molecular AI", "Owkin"})
SECTOR_COMPANIES["biotech"].update({"Maze Therapeutics", "Latent Labs", "Owkin", "Cradle", "Nosis Bio", "Genesis Molecular AI"})
SECTOR_COMPANIES["bioinformatics"].update({"Latent Labs", "Owkin", "Cradle", "Nosis Bio", "Genesis Molecular AI"})
SECTOR_COMPANIES["pharma"].update({"Relation Therapeutics", "Tabula Bio"})
SECTOR_COMPANIES["biotech"].update({"Prolific Machines", "Ansa Biotechnologies", "Ohalo", "Relation Therapeutics", "Adaptyv", "Tabula Bio"})
SECTOR_COMPANIES["bioinformatics"].update({"Relation Therapeutics", "Adaptyv", "Tabula Bio"})
SECTOR_COMPANIES["agriculture"].update({"Ohalo"})
SECTOR_COMPANIES["pharma"].update({"Strand Therapeutics", "Nuvalent"})
SECTOR_COMPANIES["biotech"].update({"Biohub", "Strand Therapeutics", "Nuvalent", "Synthego", "Mithrl", "Genomics"})
SECTOR_COMPANIES["bioinformatics"].update({"Biohub", "Mithrl", "Genomics"})
SECTOR_COMPANIES["pharma"].update({"Lyell Immunopharma", "Akero Therapeutics", "Scholar Rock", "Hexagon Bio"})
SECTOR_COMPANIES["biotech"].update({"Lyell Immunopharma", "Akero Therapeutics", "Culture Biosciences", "Scholar Rock", "BillionToOne", "Hexagon Bio"})
SECTOR_COMPANIES["bioinformatics"].update({"BillionToOne", "Hexagon Bio"})
SECTOR_COMPANIES["pharma"].update({"Tango Therapeutics"})
SECTOR_COMPANIES["biotech"].update({"Delfi Diagnostics", "Tango Therapeutics", "Basecamp Research"})
SECTOR_COMPANIES["bioinformatics"].update({"Delfi Diagnostics", "Basecamp Research"})
SECTOR_COMPANIES["agriculture"].update({"Land O'Lakes", "Ingredion"})
SECTOR_COMPANIES["biotech"].update({"Nautilus Biotechnology", "Network Bio"})
SECTOR_COMPANIES["bioinformatics"].update({"Nautilus Biotechnology", "Network Bio"})
SECTOR_COMPANIES["agriculture"].update({"Seso"})
SECTOR_COMPANIES['biotech'].update({'Remix Therapeutics', 'Forge Biologics', '4D Molecular Therapeutics', 'Disc Medicine', 'Kymera Therapeutics', 'Aralez Bio'})
SECTOR_COMPANIES['pharma'].update({'Remix Therapeutics', '4D Molecular Therapeutics', 'Kymera Therapeutics', 'Disc Medicine'})
SECTOR_COMPANIES['bioinformatics'].update({'Aralez Bio'})
SECTOR_COMPANIES['biotech'].update({'Kiniksa Pharmaceuticals', 'A-Alpha Bio', 'Dianthus Therapeutics', 'Fate Therapeutics', 'Replimune', 'Avalyn Pharma'})
SECTOR_COMPANIES['pharma'].update({'Kiniksa Pharmaceuticals', 'Dianthus Therapeutics', 'Fate Therapeutics', 'Replimune', 'Avalyn Pharma'})
SECTOR_COMPANIES['bioinformatics'].update({'A-Alpha Bio'})
SECTOR_COMPANIES['biotech'].update({'Ultima Genomics', 'Volta Labs', 'Florence Healthcare', 'Absci', 'Alamar Biosciences', 'Slingshot Biosciences'})
SECTOR_COMPANIES['bioinformatics'].update({'Ultima Genomics', 'Florence Healthcare', 'Absci', 'Alamar Biosciences'})
SECTOR_COMPANIES['pharma'].update({'Absci'})
SECTOR_COMPANIES['biotech'].update({'Truveta', 'Suvoda', 'Precision Medicine Group', 'DNA Script', 'Unlearn', 'Science 37'})
SECTOR_COMPANIES['pharma'].update({'Suvoda', 'Unlearn', 'Science 37', 'Precision Medicine Group'})
SECTOR_COMPANIES['bioinformatics'].update({'Suvoda', 'Unlearn', 'Truveta'})
SECTOR_COMPANIES['biotech'].update({'Sapio Sciences', 'Form Bio', 'Whiterabbit', 'Dotmatics', 'LatchBio', 'Aidoc'})
SECTOR_COMPANIES['bioinformatics'].update({'Sapio Sciences', 'Form Bio', 'Whiterabbit', 'Dotmatics', 'LatchBio', 'Aidoc'})
SECTOR_COMPANIES['biotech'].update({'Cellanome'})
SECTOR_COMPANIES['bioinformatics'].update({'Cellanome'})
SECTOR_COMPANIES['agriculture'].update({'Finagra', 'Carbon Robotics', 'Nitricity', 'Arable', 'Halter'})
SECTOR_COMPANIES['agriculture'].update({'The EVERY Company'})
SECTOR_COMPANIES['biotech'].update({'Sarepta Therapeutics', 'Tandem Diabetes Care', 'Alcon', 'Insmed', 'Agilent'})
SECTOR_COMPANIES['biotech'].update({'Sartorius', 'Viatris', 'Baxter'})
SECTOR_COMPANIES['agriculture'].update({'Smithfield Foods', "Campbell's", 'Lamb Weston'})
SECTOR_COMPANIES['biotech'].update({'Labcorp', 'Neurocrine Biosciences', 'Edwards Lifesciences', 'Lonza', 'Catalent'})
SECTOR_COMPANIES['agriculture'].update({'Enza Zaden'})
SECTOR_COMPANIES['agriculture'].update({'Harvest Road', 'IFF', 'Golden Agri-Resources', 'Australian Agricultural Company', 'Mars'})
SECTOR_COMPANIES['pharma'].update({'Lupin', 'Sun Pharma', 'West Pharmaceutical Services', 'Perrigo', 'BioNTech'})
SECTOR_COMPANIES['biotech'].update({'Lupin', 'Sun Pharma', 'West Pharmaceutical Services', 'Perrigo', 'BioNTech'})
SECTOR_COMPANIES['agriculture'].update({'J.R. Simplot'})
SECTOR_COMPANIES['agriculture'].update({'Kellanova', 'Corbion', 'McCormick', 'Nestle'})
SECTOR_COMPANIES['pharma'].update({'Cipla'})
SECTOR_COMPANIES['biotech'].update({'Cipla'})
SECTOR_COMPANIES['agriculture'].update({'Olam'})
SECTOR_COMPANIES['pharma'].update({'Boston Scientific', 'QIMA', 'LGC Group', 'Santen', 'SGS', 'Sobi'})
SECTOR_COMPANIES['biotech'].update({'Boston Scientific', 'QIMA', 'LGC Group', 'Santen', 'SGS', 'Sobi'})
SECTOR_COMPANIES['biotech'].update({'Lesaffre', 'Vetoquinol', 'Stryker', 'Miltenyi Biotec', 'PSI CRO', 'Ergomed'})
SECTOR_COMPANIES['pharma'].update({'Lesaffre', 'Vetoquinol', 'Miltenyi Biotec', 'PSI CRO', 'Ergomed'})
SECTOR_COMPANIES['biotech'].update({'ResMed', 'Jasper Therapeutics', 'Corcept Therapeutics', 'Spyre Therapeutics', 'Avantor'})
SECTOR_COMPANIES['pharma'].update({'Spyre Therapeutics', 'Jasper Therapeutics', 'Corcept Therapeutics'})
SECTOR_COMPANIES['biotech'].update({'Invivyd', 'Korro Bio', 'Mineralys Therapeutics', 'Epicrispr Biotechnologies', 'Ironwood Pharmaceuticals', 'Gossamer Bio'})
SECTOR_COMPANIES['pharma'].update({'Invivyd', 'Korro Bio', 'Mineralys Therapeutics', 'Epicrispr Biotechnologies', 'Ironwood Pharmaceuticals', 'Gossamer Bio'})
SECTOR_COMPANIES['biotech'].update({'Ocular Therapeutix', 'Jazz Pharmaceuticals', 'Obsidian Therapeutics', 'Otsuka', 'Vow'})
SECTOR_COMPANIES['pharma'].update({'Obsidian Therapeutics', 'Otsuka', 'Ocular Therapeutix', 'Jazz Pharmaceuticals'})
SECTOR_COMPANIES['agriculture'].update({'Vow'})
SECTOR_COMPANIES['biotech'].update({'Evotec', 'Insulet', 'Revvity'})
SECTOR_COMPANIES['pharma'].update({'Evotec'})
SECTOR_COMPANIES['bioinformatics'].update({'Revvity'})
SECTOR_COMPANIES['pharma'].update({'Sarepta Therapeutics', 'Insmed', 'Viatris', 'Neurocrine Biosciences', 'Lonza', 'Catalent', 'Labcorp', 'Baxter'})
SECTOR_COMPANIES['agriculture'].update({'QIMA', 'SGS', 'Lesaffre', 'Vetoquinol'})
ROLE_PATTERNS = {track: re.compile(pattern, re.I) for track, pattern in ROLE_PATTERNS.items()}
TALENT_POOL = re.compile(r"talent (community|network|pool)|future (career )?opportunities|general (interest|application)|join .*herd|^join form bio$|^opportunistic$", re.I)


def company_sectors(company: str) -> list[str]:
    return [sector for sector, companies in SECTOR_COMPANIES.items() if company in companies]


def in_sector(company: str, sectors: list[str]) -> bool:
    groups = company_sectors(company)
    return bool(groups) if "life-sciences" in sectors else any(sector in groups for sector in sectors)


def role_tracks(title: str) -> list[str]:
    if TALENT_POOL.search(title):
        return []
    return [track for track, pattern in ROLE_PATTERNS.items() if pattern.search(title)]
