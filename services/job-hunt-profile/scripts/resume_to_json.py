"""Extract resume PDF or DOCX text into one JSON file per document.

Install: pip install pypdf python-docx
Run: python scripts/resume_to_json.py resume.pdf resume.docx --output-dir output
"""

import argparse
import json
import re
import sys
import tempfile
from pathlib import Path

from docx import Document
from docx.table import Table
from pypdf import PdfReader
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from service.contacts import extract_contacts
from service.document_structure import experience_entries as structured_experience, education_entries, INSTITUTION, DEGREE


HEADINGS = {
    "SUMMARY": "summary", "PROFESSIONAL SUMMARY": "summary", "PROFILE": "summary",
    "OBJECTIVE": "summary", "CAREER OBJECTIVE": "summary",
    "SKILLS": "skills", "TECHNICAL SKILLS": "skills", "CORE COMPETENCIES": "skills",
    "SKILLS & TECHNOLOGIES": "skills", "SKILLS AND TECHNOLOGIES": "skills",
    "EXPERIENCE": "experience", "WORK EXPERIENCE": "experience",
    "PROFESSIONAL EXPERIENCE": "experience", "EMPLOYMENT HISTORY": "experience",
    "PROJECTS": "projects", "TECHNICAL PROJECTS": "projects",
    "PERSONAL PROJECTS": "projects", "ACADEMIC PROJECTS": "projects",
    "SELECTED PROJECTS": "projects", "KEY PROJECTS": "projects",
    "EDUCATION": "education", "ACADEMIC BACKGROUND": "education",
    "CERTIFICATIONS": "certifications", "CERTIFICATES": "certifications",
    "AWARDS": "awards", "PUBLICATIONS": "publications",
    "VOLUNTEERING": "volunteering", "VOLUNTEER EXPERIENCE": "volunteering",
    "LANGUAGES": "languages", "INTERESTS": "interests",
    "ACHIEVEMENTS": "achievements", "HONORS": "awards",
    "TRAINING": "training", "RESEARCH": "research",
    "LEADERSHIP": "leadership", "ADDITIONAL INFORMATION": "additional_information",
    "SKILLS & TOOLS": "skills", "MENTORING": "mentoring",
    "WORK EXPERIENCE (CONTINUED)": "experience",
}
EMAIL = re.compile(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}")
PHONE = re.compile(r"(?im)^\s*(?:phone|mobile|tel(?:ephone)?)\s*:\s*([^\n]+)")
URL = re.compile(r"(?:https?://|www\.)[^\s|]+", re.I)
DATE = re.compile(
    r"\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|"
    r"Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|"
    r"Dec(?:ember)?)\s+\d{4}\b|\b(?:19|20)\d{2}\b",
    re.I,
)


def experience_entries(raw: str) -> list[dict]:
    """Split employer/date rows into jobs while retaining full section text."""
    parsed = structured_experience(raw)
    if parsed:
        return parsed
    entries = []
    current = None
    for line in raw.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        parts = re.split(r"\s{2,}|\s+\|\s+", stripped)
        if len(parts) >= 2 and DATE.search(parts[-1]) and not stripped.startswith(("•", "-")):
            current = {"company": parts[0], "dates": parts[-1], "bullets": []}
            entries.append(current)
        elif current is None:
            continue
        elif "title" not in current and not stripped.startswith(("•", "-")):
            current["title"] = parts[0]
            if len(parts) >= 2:
                current["location"] = parts[-1]
        elif stripped.startswith(("•", "\uf0b7", "-", "�")):
            current["bullets"].append(stripped.lstrip("•\uf0b7-� ").strip())
        elif current["bullets"]:
            current["bullets"][-1] += " " + stripped
    return entries


def resume_details(text: str, targets=()) -> dict:
    """Preserve detected sections verbatim; omit sections not found."""
    text = re.sub(
        r"(?<!\w)((?:SELECTED|TECHNICAL|PERSONAL|ACADEMIC|KEY) PROJECTS)(?!\w)\s*",
        r"\n\1\n", text,
    )
    sections = {}
    other = {}
    header_lines = []
    current = None
    lines = []

    def save_section() -> None:
        content = "\n".join(lines).strip()
        if current and content:
            target = sections if current in HEADINGS.values() else other
            target[current] = f"{target[current]}\n\n{content}" if current in target else content

    for line in text.splitlines():
        stripped = line.strip()
        label = re.sub(r"\s+", " ", stripped.lstrip("# ").rstrip(": ")).upper()
        known = HEADINGS.get(label)
        # Markdown headings can name extra sections. Plain uppercase employer names
        # are not treated as headings.
        extra = stripped.startswith("## ") and not known
        if known or extra:
            save_section()
            current = known or stripped[3:].strip()
            lines = []
        elif current:
            lines.append(line)
        else:
            header_lines.append(line)
    save_section()

    # Some resumes present education cards before the first labelled section.
    school_row=next((i for i,line in enumerate(header_lines) if INSTITUTION.search(line)
                     and not DEGREE.search(line) and not EMAIL.search(line)),None)
    if school_row is not None:
        schools=[s.strip() for s in re.split(r'\s{2,}',header_lines[school_row].strip()) if s.strip()]
        tail=[s.strip() for s in header_lines[school_row+1:] if s.strip()]
        degrees=[s.strip() for s in re.split(r'\s{2,}','  '.join(tail)) if s.strip()]
        if len(schools)==len(degrees) and all(DEGREE.search(d) for d in degrees):
            sections['education']='\n'.join(value for pair in zip(schools,degrees) for value in pair)
            header_lines=header_lines[:school_row]
    contact_row=next((i for i,line in enumerate(header_lines) if EMAIL.search(line)),None)
    if contact_row is not None and contact_row>2:
        sections.setdefault('summary','\n'.join(header_lines[2:contact_row]).strip())
        header_lines=[*header_lines[:2],*header_lines[contact_row:]]
    header_text = "\n".join(header_lines).strip()
    header = {}
    candidates = [line.strip() for line in header_lines if line.strip()]
    for line in candidates[:6]:
        # PDF extraction often inserts double spaces between given and family names.
        # Prefer the intact name before splitting positioned contact fields.
        for candidate in [*re.split(r'\s*\|\s*', line), *re.split(r'\s{2,}', line)]:
            candidate = candidate.strip('#* ')
            if re.fullmatch(r"[^\W\d_][\w .'\u2019-]{1,79}", candidate) and candidate.lower() not in {'resume','curriculum vitae','cv','linkedin','github','portfolio'} and not re.search(r'\b(?:engineer|scientist|developer|architect|analyst|designer|manager|consultant)\b',candidate,re.I):
                header['name'] = re.sub(r'\s+', ' ', candidate)
                break
        if header.get('name'): break
    if match := EMAIL.search(header_text):
        header["email"] = match.group()
    contacts = extract_contacts(text, targets)
    if contacts['emails']:
        header['email'] = header.get('email') or contacts['emails'][0]
        header['emails'] = contacts['emails']
    if contacts['phones']:
        header['phone'] = contacts['phones'][0]
        header['phones'] = contacts['phones']
    if contacts['links']:
        header['links'] = contacts['links']
    for line in [part.strip() for candidate in candidates[1:] for part in re.split(r'\s{2,}',candidate)]:
        if re.search(r"\b(?:engineer|scientist|developer|architect|analyst|designer|manager|consultant)\b", line, re.I) and len(line) <= 80:
            header["title"] = line.strip("*_ ")
            break
    additional = []
    known = [header.get('name',''), *header.get('title','').split('|'), *contacts['emails'], *contacts['phones'], *contacts['links']]
    for line in candidates:
        if re.sub(r'\s+', ' ', line.strip('#* ')) == header.get('name'):
            continue
        for part in re.split(r'\s*\|\s*|\s{2,}', line):
            part = part.strip('#* ')
            if not part or part.lower() in {'resume','cv','linkedin','github','portfolio'}: continue
            if any(value.strip() and value.strip() in part for value in known): continue
            # Retain addresses, handles and other supplied header details verbatim.
            additional.append(part)
    if additional: header['additional_contacts'] = list(dict.fromkeys(additional))
    result = {"header": header} if header else {}
    result.update(sections)
    if "experience" in result:
        entries = experience_entries(result["experience"])
        if entries:
            result["experience_text"] = result["experience"]
            result["experience"] = entries
    if other:
        result["other_sections"] = other
    if isinstance(result.get('education'),str):
        result['educationHistory']=education_entries(result['education'])
    return result


def recover_pdf_spacing(layout: str, plain: str) -> str:
    """Recover only observed spaces from a second extraction of identical glyphs.

    Keep layout line order, indentation, punctuation and word casing. A differing
    glyph sequence (e.g. reordered columns) is ambiguous and remains untouched.
    """
    if re.sub(r"\s", "", layout) != re.sub(r"\s", "", plain):
        return layout
    boundaries = set()
    glyphs = 0
    for match in re.finditer(r"\S|\s+", plain):
        if match.group().isspace():
            if glyphs:
                boundaries.add(glyphs)
        else:
            glyphs += 1
    output = []
    glyphs = 0
    for char in layout:
        if not char.isspace():
            if glyphs in boundaries and output and output[-1].isalnum() and char.isalnum():
                output.append(" ")
            glyphs += 1
        output.append(char)
    return "".join(output)


def extract_pdf_page(page) -> str:
    if "/Contents" not in page:
        return ""
    plain = page.extract_text() or ""
    try:
        layout = page.extract_text(extraction_mode="layout") or ""
    except (ZeroDivisionError, ValueError):
        return plain.strip()
    # Soft hyphens are formatting hints, not part of a word.
    return recover_pdf_spacing(layout, plain).replace("\u00ad", "").replace("\uf0b7", "•").strip()


def convert(input_path: Path, output_dir: Path) -> Path:
    if not input_path.is_file() or input_path.suffix.lower() not in {".pdf", ".docx"}:
        raise ValueError(f"Expected a PDF or DOCX file: {input_path}")

    targets = []
    if input_path.suffix.lower() == ".pdf":
        reader = PdfReader(input_path)
        if reader.is_encrypted:
            raise ValueError(f"Encrypted PDF: {input_path}")
        import pdfplumber
        from service.pdf_layout import page_text
        with pdfplumber.open(input_path) as document:
            pages = [page_text(page, HEADINGS).replace("\uf0b7", "•") for page in document.pages]
        text = "\n\n".join(page for page in pages if page)
        if not text:
            raise ValueError(f"No extractable text in {input_path}; scanned PDFs need OCR")
        page_count = len(pages)
        page_data = [{"number": number, "text": page} for number, page in enumerate(pages, 1)]
        for page in reader.pages:
            for reference in page.get('/Annots', []):
                action = reference.get_object().get('/A')
                if action:
                    targets.append(action.get_object().get('/URI', ''))
    else:
        document = Document(input_path)
        for part in [document.part, *(section.header.part for section in document.sections),
                     *(section.footer.part for section in document.sections)]:
            targets.extend(rel.target_ref for rel in part.rels.values()
                           if rel.is_external and rel.reltype.endswith('/hyperlink'))
        blocks = []
        for block in document.iter_inner_content():
            if isinstance(block, Table):
                blocks.extend(
                    " | ".join(cell.text.strip() for cell in row.cells)
                    for row in block.rows
                )
            else:
                blocks.append(block.text.strip())
        text = "\n".join(block for block in blocks if block)
        # Word header/footer contacts are outside the main body.
        margins = [node.text or '' for section in document.sections
                   for container in (section.header, section.footer) for node in container._element.iter()
                   if node.tag.endswith('}t')]
        text = '\n'.join(filter(None, [*dict.fromkeys(margins), text]))
        xml_text = '\n'.join(node.text or '' for node in document.element.iter() if node.tag.endswith('}t'))
        if not text.strip(): text = xml_text
        # Contacts in Word text boxes may not appear in paragraph.text.
        recovered = extract_contacts(xml_text)
        text += ''.join('\n'+value for values in recovered.values() for value in values if value not in text)
        if not text:
            raise ValueError(f"No extractable text in {input_path}")
        page_count = None  # DOCX page count depends on the rendering application.
        page_data = []

    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / f"{input_path.name}.json"
    temporary_path = None
    data = {
        "source_file": input_path.name,
        "page_count": page_count,
        "pages": page_data,
        "text": text,
        **resume_details(text, targets),
    }
    try:
        with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=output_dir, suffix=".tmp", delete=False) as file:
            temporary_path = Path(file.name)
            json.dump(data, file, ensure_ascii=False, indent=2)
            file.write("\n")
        temporary_path.replace(output_path)
    finally:
        if temporary_path:
            temporary_path.unlink(missing_ok=True)
    return output_path


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("documents", type=Path, nargs="+", help="Resume PDF or DOCX files")
    parser.add_argument("--output-dir", type=Path, default=Path("output"))
    args = parser.parse_args()

    failed = False
    for input_path in args.documents:
        try:
            print(convert(input_path, args.output_dir))
        except Exception as error:
            print(f"{input_path}: {error}", file=sys.stderr)
            failed = True
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
