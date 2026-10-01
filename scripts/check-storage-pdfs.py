from pathlib import Path
import pdfplumber
templates = ["mit-capd", "modern-ivy", "tech-specialist", "minimalist-exec", "contemporary-compact", "standard-overleaf"]
for template in templates:
    with pdfplumber.open(Path("scratch/resume-export-qa") / (template + ".pdf")) as pdf:
        text = "\n".join(page.extract_text() or "" for page in pdf.pages)
        assert "Integration Example" in text, template
        assert "Built reliable services." in text, template
        for page in pdf.pages:
            assert (round(page.width), round(page.height)) == (612, 792)
            for word in page.extract_words():
                assert 20 <= word["x0"] <= word["x1"] <= 592, (template, "horizontal clipping")
                assert 15 <= word["top"] <= word["bottom"] <= 777, (template, "vertical clipping")
print("STORED PDF LAYOUT VERIFIED")
