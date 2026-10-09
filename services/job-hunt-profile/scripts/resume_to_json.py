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


HEADINGS = {
    "SUMMARY": "summary", "PROFESSIONAL SUMMARY": "summary", "PROFILE": "summary",
    "OBJECTIVE": "summary", "CAREER OBJECTIVE": "summary",
    "SKILLS": "skills", "TECHNICAL SKILLS": "skills", "CORE COMPETENCIES": "skills",
    "EXPERIENCE": "experience", "WORK EXPERIENCE": "experience",
    "PROFESSIONAL EXPERIENCE": "experience", "EMPLOYMENT HISTORY": "experience",
    "PROJECTS": "projects", "TECHNICAL PROJECTS": "projects",
    "PERSONAL PROJECTS": "projects", "ACADEMIC PROJECTS": "projects",
    "EDUCATION": "education", "ACADEMIC BACKGROUND": "education",
    "CERTIFICATIONS": "certifications", "CERTIFICATES": "certifications",
    "AWARDS": "awards", "PUBLICATIONS": "publications",
    "VOLUNTEERING": "volunteering", "VOLUNTEER EXPERIENCE": "volunteering",
    "LANGUAGES": "languages", "INTERESTS": "interests",
    "ACHIEVEMENTS": "achievements", "HONORS": "awards",
    "TRAINING": "training", "RESEARCH": "research",
    "LEADERSHIP": "leadership", "ADDITIONAL INFORMATION": "additional_information",
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


def resume_details(text: str) -> dict:
    """Preserve detected sections verbatim; omit sections not found."""
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

    header_text = "\n".join(header_lines).strip()
    header = {}
    candidates = [line.strip() for line in header_lines if line.strip()]
    if candidates and re.fullmatch(r"[A-Za-z][A-Za-z .'-]{2,80}", candidates[0]) and len(candidates[0].split()) >= 2:
        header["name"] = candidates[0]
    if match := EMAIL.search(header_text):
        header["email"] = match.group()
    if match := PHONE.search(header_text):
        header["phone"] = match.group(1).strip()
    if links := URL.findall(header_text):
        header["links"] = links
    for line in candidates[1:]:
        if re.search(r"\b(?:engineer|scientist|developer|architect|analyst|designer|manager|consultant)\b", line, re.I) and len(line) <= 80:
            header["title"] = line
            break
    result = {"header": header} if header else {}
    result.update(sections)
    if "experience" in result:
        entries = experience_entries(result["experience"])
        if entries:
            result["experience_text"] = result["experience"]
            result["experience"] = entries
    if other:
        result["other_sections"] = other
    return result


def convert(input_path: Path, output_dir: Path) -> Path:
    if not input_path.is_file() or input_path.suffix.lower() not in {".pdf", ".docx"}:
        raise ValueError(f"Expected a PDF or DOCX file: {input_path}")

    if input_path.suffix.lower() == ".pdf":
        reader = PdfReader(input_path)
        if reader.is_encrypted:
            raise ValueError(f"Encrypted PDF: {input_path}")
        pages = [
            page.extract_text(extraction_mode="layout").replace("\uf0b7", "•").strip()
            for page in reader.pages
        ]
        text = "\n\n".join(page for page in pages if page)
        if not text:
            raise ValueError(f"No extractable text in {input_path}; scanned PDFs need OCR")
        page_count = len(pages)
        page_data = [{"number": number, "text": page} for number, page in enumerate(pages, 1)]
    else:
        document = Document(input_path)
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
        **resume_details(text),
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
