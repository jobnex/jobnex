"""Adversarial positive controls: each defect must trip the actual final-byte checker."""
import copy
import json
from pathlib import Path
import sys

from pypdf import PdfReader, PdfWriter, Transformation
from pypdf.generic import ArrayObject, DictionaryObject, FloatObject, NameObject, NumberObject, TextStringObject
from reportlab.pdfgen import canvas

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from validate_pdf import validate


pdf_path, manifest_path, work_path = map(Path, sys.argv[1:])
manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
assert validate(pdf_path, manifest)["issues"] == []
work = Path(work_path)


def check(name, edit, expected_code):
    writer = PdfWriter()
    writer.append(PdfReader(pdf_path))
    edit(writer)
    output = work / (name + ".pdf")
    writer.write(output)
    codes = {issue["code"] for issue in validate(output, copy.deepcopy(manifest))["issues"]}
    assert expected_code in codes, (name, expected_code, codes)


check("empty-page", lambda w: w.add_blank_page(width=612, height=792), "pdf.empty_page")
check("clipping", lambda w: w.pages[0].add_transformation(Transformation().translate(tx=700)), "pdf.clipping")
check("missing-page", lambda w: w.remove_page(0), "pdf.integrity")
check("overlap", lambda w: w.pages[0].merge_page(PdfReader(pdf_path).pages[0]), "pdf.overlap")
check("missing-links", lambda w: w.pages[0].pop("/Annots", None), "pdf.links")

overlay = work / "white-overlay.pdf"
c = canvas.Canvas(str(overlay), pagesize=(612, 792))
c.setFillColorRGB(1, 1, 1)
c.rect(0, 0, 612, 792, fill=1, stroke=0)
c.save()
check("obscured-text", lambda w: w.pages[0].merge_page(PdfReader(overlay).pages[0]), "pdf.obscured_text")

partial = work / "partial-overlap.pdf"
c = canvas.Canvas(str(partial), pagesize=(612, 792))
c.setFont("Helvetica", 10)
c.drawString(36, 750, "Overlapping lines")
c.drawString(36, 745, "Overlapping lines")
c.save()
assert "pdf.overlap" in {i["code"] for i in validate(partial, copy.deepcopy(manifest))["issues"]}

small = work / "tiny-text.pdf"
c = canvas.Canvas(str(small), pagesize=(612, 792))
c.setFont("Helvetica", 7)
c.drawString(36, 750, "Café Candidate")
c.save()
minimal = {"fields": [{"id": "name", "text": "Café Candidate", "kind": "name", "minPt": 10, "link": None}],
           "sourceMap": [{"id": "name", "positions": {"start": {"page": 1, "x": 36000, "y": 42000}, "end": {"page": 1, "x": 130000, "y": 42000}}}]}
assert "pdf.font_size" in {i["code"] for i in validate(small, minimal)["issues"]}
invisible = work / "invisible.pdf"
c = canvas.Canvas(str(invisible), pagesize=(612, 792))
t = c.beginText(36, 750)
t.setFont("Helvetica", 10)
t.setTextRenderMode(3)
t.textOut("Café Candidate")
c.drawText(t)
c.save()
assert "pdf.invisible_text" in {i["code"] for i in validate(invisible, minimal)["issues"]}
orphan = copy.deepcopy(minimal)
orphan["fields"][0]["kind"] = "section"
assert "pdf.orphan_heading" in {i["code"] for i in validate(small, orphan)["issues"]}
wrong = copy.deepcopy(manifest)
wrong["fields"][0]["text"] = "Missing Candidate"
assert "pdf.required_content" in {i["code"] for i in validate(pdf_path, wrong)["issues"]}
print("ADVERSARIAL_FINAL_PDF_VERIFIED")
