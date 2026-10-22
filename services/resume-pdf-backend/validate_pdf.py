"""Fail closed on the final PDF bytes. Geometry is returned in integer millipoints.

This runs after Typst compilation; it never repairs, rewrites, or truncates a PDF.
The manifest is produced by the canonical renderer, never accepted from an API caller.
"""
from collections import Counter
import json
import math
from pathlib import Path
import sys
import unicodedata

import pdfplumber
from pypdf import PdfReader
from pypdf.generic import ContentStream


def normalize(value):
    return "".join(c for c in unicodedata.normalize("NFKC", value) if not c.isspace())


def validate(pdf_path, manifest):
    issues = []
    seen = set()

    def fail(code, message, field="document"):
        key = (code, field)
        if key not in seen:
            seen.add(key)
            issues.append({"code": code, "message": message, "fieldId": field})

    fields = manifest.get("fields")
    source_map = manifest.get("sourceMap")
    if not isinstance(fields, list) or not fields or not isinstance(source_map, list):
        raise ValueError("Renderer manifest is missing required field/source-map arrays")
    field_ids = {f["id"] for f in fields}
    if len(field_ids) != len(fields) or {s["id"] for s in source_map} != field_ids:
        raise ValueError("Renderer manifest field identity mismatch")
    maps = {s["id"]: s for s in source_map}
    raw = Path(pdf_path).read_bytes()
    if not raw.startswith(b"%PDF-") or len(raw) > 16_000_000:
        fail("pdf.integrity", "Output is not a bounded PDF")
        return {"issues": issues, "sourceMap": source_map}
    reader = PdfReader(pdf_path, strict=True)
    if reader.is_encrypted or not reader.pages:
        fail("pdf.integrity", "PDF is encrypted or contains no pages")
        return {"issues": issues, "sourceMap": source_map}
    root = reader.trailer["/Root"]
    if root.get("/OpenAction") or root.get("/AA") or root.get("/AcroForm") or root.get("/Names", {}).get("/JavaScript"):
        fail("pdf.active_content", "PDF contains active or form content")

    annotations = []
    for pnum, page in enumerate(reader.pages, 1):
        if int(page.get("/Rotate", 0)) != 0 or list(page.mediabox) != list(page.cropbox):
            fail("pdf.clipping", "Rotated or cropped pages are not certifiable")
        resources = page.get("/Resources", {})
        for graphics in resources.get("/ExtGState", {}).values():
            state = graphics.get_object()
            if any(float(state.get(key, 1)) < .99 for key in ("/ca", "/CA")):
                fail("pdf.invisible_text", "Transparent page content is not certifiable")
        contents = page.get_contents()
        if contents is not None:
            for operands, operator in ContentStream(contents, reader).operations:
                if operator == b"Tr" and int(operands[0]) != 0:
                    fail("pdf.invisible_text", "Nonstandard text rendering may hide required content")
                if operator in (b"W", b"W*"):
                    fail("pdf.clipping", "Clipped page content is not certifiable")
                if operator == b"Do":
                    fail("pdf.unverified_graphics", "External images or forms cannot replace resume text")
        for ref in page.get("/Annots", []):
            annotation = ref.get_object()
            action = annotation.get("/A", {})
            if annotation.get("/Subtype") != "/Link" or action.get("/S") != "/URI" or annotation.get("/AA"):
                fail("pdf.active_content", "Unexpected PDF annotation or action")
                continue
            annotations.append({"uri": str(action.get("/URI", "")), "page": pnum,
                                "rect": [float(x) for x in annotation["/Rect"]]})

    chars = []
    pages = []
    with pdfplumber.open(pdf_path) as pdf:
        for pnum, page in enumerate(pdf.pages, 1):
            pages.append({"width": page.width, "height": page.height})
            visible = [c for c in page.chars if normalize(c.get("text", ""))]
            if not visible:
                fail("pdf.empty_page", f"Page {pnum} contains no text")
            for c in page.chars:
                c = dict(c, page=pnum)
                if not all(math.isfinite(float(c[k])) for k in ("x0", "x1", "top", "bottom", "size")):
                    fail("pdf.geometry", "PDF contains nonfinite geometry")
                    continue
                if c["x0"] < -.01 or c["top"] < -.01 or c["x1"] > page.width + .01 or c["bottom"] > page.height + .01:
                    fail("pdf.clipping", f"Text extends outside page {pnum}")
                if "\ufffd" in c.get("text", "") or "(cid:" in c.get("text", ""):
                    fail("pdf.glyph", "PDF contains an unmapped or replacement glyph")
                chars.append(c)
            # Spatial overlap of substantial glyph area catches overprinted lines and columns.
            # Adjacent kerning can overlap slightly, but never most of a glyph's area.
            ordered = sorted(visible, key=lambda c: (c["top"], c["x0"]))
            active = []
            for c in ordered:
                active = [a for a in active if a["bottom"] > c["top"] + .5]
                for a in active:
                    w = min(a["x1"], c["x1"]) - max(a["x0"], c["x0"])
                    h = min(a["bottom"], c["bottom"]) - max(a["top"], c["top"])
                    area = min((a["x1"]-a["x0"])*(a["bottom"]-a["top"]),
                               (c["x1"]-c["x0"])*(c["bottom"]-c["top"]))
                    baseline_gap = abs(a.get("matrix", (0, 0, 0, 0, 0, 0))[5] - c.get("matrix", (0, 0, 0, 0, 0, 0))[5])
                    # Font boxes include empty descent space. Distinct baselines
                    # closer than three quarters of the font size are a collision.
                    line_collision = .5 < baseline_gap < min(a["size"], c["size"])*.75
                    if w > 1 and h > 1 and area > 0 and (line_collision or w*h > area*.65):
                        fail("pdf.overlap", f"Text overlaps on page {pnum}")
                active.append(c)
            # Extractable text can still be obscured by a filled path. The fixed
            # templates use thin rules and side stripes, never fills over glyphs.
            for shape in [*page.rects, *page.curves]:
                if not shape.get("fill"):
                    continue
                for c in visible:
                    w = min(shape["x1"], c["x1"]) - max(shape["x0"], c["x0"])
                    h = min(shape["bottom"], c["bottom"]) - max(shape["top"], c["top"])
                    if w > 1 and h > 1:
                        fail("pdf.obscured_text", f"A filled vector shape overlaps text on page {pnum}")

    # PDF text operators preserve canonical field order. Whitespace and list ornaments
    # are layout; every other extracted character must be accounted for exactly.
    stream = []
    char_refs = []
    for i, c in enumerate(chars):
        for ch in normalize(c.get("text", "")):
            stream.append(ch)
            char_refs.append(i)
    stream = "".join(stream)
    expected = "".join(("•" if f["kind"] == "bullet" else "") + normalize(f["text"]) for f in fields)
    if Counter(stream) != Counter(expected):
        fail("pdf.text_mismatch", "Extracted PDF text differs from the complete canonical content")
    used = set()
    field_chars = {}
    cursor = 0
    for field in fields:
        fid = field["id"]
        expected_text = normalize(field["text"])
        offset = stream.find(expected_text, cursor)
        if offset < 0:
            # A field must not move into another role/section or appear only as a substring
            # in an unrelated earlier field.
            fail("pdf.required_content", "Required canonical field is missing or out of order", fid)
            continue
        prefix = stream[cursor:offset]
        if prefix != ("•" if field["kind"] == "bullet" else ""):
            fail("pdf.text_mismatch", "Unexpected or missing text between canonical fields", fid)
        if prefix == "•" and float(chars[char_refs[cursor]]["size"]) < 9.95:
            fail("pdf.font_size", "List marker is smaller than 10pt", fid)
        refs = set(char_refs[offset:offset+len(expected_text)])
        if refs & used:
            fail("pdf.required_content", "Canonical fields reuse the same rendered text", fid)
            continue
        used.update(refs)
        cursor = offset + len(expected_text)
        selected = [chars[i] for i in sorted(refs)]
        field_chars[fid] = selected
        if any(float(c["size"]) < field["minPt"] - .05 for c in selected):
            fail("pdf.font_size", f"Field is smaller than {field['minPt']}pt", fid)
        positions = maps[fid].get("positions", {})
        start, end = positions.get("start", {}), positions.get("end", {})
        if not start or not end or not all(isinstance(p.get(k), int) for p in (start, end) for k in ("page", "x", "y")):
            fail("pdf.source_map", "Source positions are missing or not integer millipoints", fid)
        else:
            for c in selected:
                if c["page"] < start["page"] or c["page"] > end["page"] or (c["page"] == start["page"] and c["bottom"] < start["y"]/1000-24) or (c["page"] == end["page"] and c["top"] > end["y"]/1000+24):
                    fail("pdf.source_map", "PDF field escaped its labeled source range", fid)
        boxes = []
        for pnum in sorted({c["page"] for c in selected}):
            on_page = [c for c in selected if c["page"] == pnum]
            boxes.append({"page": pnum, "box": [round(min(c["x0"] for c in on_page)*1000),
                                                  round(min(c["top"] for c in on_page)*1000),
                                                  round(max(c["x1"] for c in on_page)*1000),
                                                  round(max(c["bottom"] for c in on_page)*1000)]})
        maps[fid]["boxes"] = boxes
    if cursor != len(stream):
        fail("pdf.text_mismatch", "Unaccounted text follows the final canonical field")

    # A section/entry title must share a page with its following content. A run of
    # employer/role/date fields is treated as one heading followed by its first bullet.
    for i, field in enumerate(fields):
        if field["kind"] not in ("section", "entry") or field["id"] not in field_chars:
            continue
        next_field = next((f for f in fields[i+1:] if f["kind"] not in ("entry", "date") and f["id"] in field_chars), None)
        if next_field is None or next_field["kind"] == "section":
            fail("pdf.orphan_heading", "Heading has no following content", field["id"])
        elif field_chars[field["id"]][-1]["page"] != field_chars[next_field["id"]][0]["page"]:
            fail("pdf.orphan_heading", "Heading is separated from its following content", field["id"])

    expected_links = [f for f in fields if f.get("link")]
    if {a["uri"] for a in annotations} != {f["link"] for f in expected_links}:
        fail("pdf.links", "PDF link targets differ from canonical contact links")
    for field in expected_links:
        selected = field_chars.get(field["id"], [])
        matching = [a for a in annotations if a["uri"] == field["link"]]
        for c in selected:
            if not any(a["page"]==c["page"] and c["x0"]>=a["rect"][0]-1 and c["x1"]<=a["rect"][2]+1 and c["top"]>=pages[c["page"]-1]["height"]-a["rect"][3]-2 and c["bottom"]<=pages[c["page"]-1]["height"]-a["rect"][1]+2 for a in matching):
                fail("pdf.links", "Canonical link text is not completely covered by its link annotations", field["id"])
        for a in matching:
            height = pages[a["page"]-1]["height"]
            x0, y0, x1, y1 = a["rect"]
            if not selected or not any(c["page"] == a["page"] and c["x0"] >= x0-1 and c["x1"] <= x1+1 and c["top"] >= height-y1-2 and c["bottom"] <= height-y0+2 for c in selected):
                fail("pdf.links", "Link annotation is detached from its canonical field", field["id"])
    return {"issues": issues, "sourceMap": source_map}


if __name__ == "__main__":
    try:
        result = validate(sys.argv[1], json.loads(Path(sys.argv[2]).read_text(encoding="utf-8")))
        print(json.dumps(result, ensure_ascii=False, separators=(",", ":")))
    except Exception as error:
        print(f"Final PDF validation could not complete: {type(error).__name__}: {error}", file=sys.stderr)
        raise SystemExit(2)
