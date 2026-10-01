"""Create a reviewed discovery queue; discard mismatched and placeholder boards."""
import json
from pathlib import Path

names = """Remix Therapeutics|Aralez Bio|Forge Biologics|4D Molecular Therapeutics|Kymera Therapeutics|Disc Medicine|Dianthus Therapeutics|Replimune|Kiniksa Pharmaceuticals|Avalyn Pharma|AAlphaBio|Fate Therapeutics|Ultima Genomics|Absci|Volta Labs|Slingshot Biosciences|Alamar Biosciences|Florence Healthcare|Precision Medicine Group|Science 37|Suvoda|Unlearn|Truveta|DNA Script|Dotmatics|Form Bio|LatchBio|Sapio Sciences|AidocMedical|Whiterabbit|Cellanome|Arable|Finagra|Carbon Robotics|Nitricity|Halter|The EVERY Company""".split("|")
discovery = json.loads(Path("bio_100_discovery.json").read_text(encoding="utf-8"))
queue = []
for name in names:
    items = [i for i in discovery if i["source"]["company"] == name]
    item = next((i for i in items if i["source"]["ats"] == "ashby"), items[0])
    item["source"]["company"] = {"AAlphaBio": "A-Alpha Bio", "AidocMedical": "Aidoc"}.get(name, name)
    tags = [item["sector"]]
    if name in {"Remix Therapeutics", "4D Molecular Therapeutics", "Kymera Therapeutics", "Disc Medicine", "Dianthus Therapeutics", "Replimune", "Kiniksa Pharmaceuticals", "Avalyn Pharma", "Fate Therapeutics", "Absci", "Precision Medicine Group", "Science 37", "Suvoda", "Unlearn"}:
        tags.append("pharma")
    if name in {"Aralez Bio", "AAlphaBio", "Ultima Genomics", "Absci", "Alamar Biosciences", "Florence Healthcare", "Suvoda", "Unlearn", "Truveta", "Dotmatics", "Form Bio", "LatchBio", "Sapio Sciences", "AidocMedical", "Whiterabbit", "Cellanome"}:
        tags.append("bioinformatics")
    queue.append({"source": item["source"], "sectors": tags, "identity_evidence": item.get("board_name") or "Employer-specific public ATS board; confirm sample page identity before registration"})
Path("bio_100_queue.json").write_text(json.dumps(queue, indent=2), encoding="utf-8")
print("Prepared candidates", len(queue))
