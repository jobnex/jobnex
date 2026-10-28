"""Strict single-column PDF admission. Never writes profile state."""
import hashlib
import io
import re
import tempfile
from pathlib import Path

import pdfplumber
from pypdf import PdfReader

VERSION = "single-column-v1"
MAX_BYTES = 10 * 1024 * 1024
UNSUPPORTED = "This layout isn't supported. Use one of our four templates or upload a standard single-column PDF."
DATE = re.compile(r"^(?:(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)[.,]?\s*)?(?:19|20)\d{2}(?:\s*[-–—/]\s*(?:(?:[A-Za-z]+[.,]?\s*)?(?:19|20)\d{2}|Present|Current|Now))?$", re.I)


def rejected(code, detail):
    return {"accepted": False, "reasonCode": code, "message": UNSUPPORTED, "detail": detail, "validatorVersion": VERSION}


def inspect_geometry(document):
    for page in document.pages:
        words = page.extract_words(x_tolerance=2, y_tolerance=3)
        if not words:
            return rejected("NO_TEXT", "Every page must contain selectable resume text.")
        for picture in page.images:
            area = (picture['x1'] - picture['x0']) * (picture['bottom'] - picture['top'])
            if area > page.width * page.height * .3:
                return rejected("IMAGE_LAYOUT", "Large image-based page content is not supported.")
        rows = []
        for word in sorted(words, key=lambda w: (round(w['top'] / 3), w['x0'])):
            if not rows or abs(rows[-1][0]['top'] - word['top']) > 3:
                rows.append([])
            rows[-1].append(word)
        from scripts.resume_to_json import HEADINGS
        heading_keys={re.sub(r'[^A-Z]','',name) for name in HEADINGS}
        heading_starts=[]
        for row in rows:
            row.sort(key=lambda w:w['x0'])
            segments=[[]]
            for word in row:
                if segments[-1] and word['x0']-segments[-1][-1]['x1']>max(18,page.width*.032):segments.append([])
                segments[-1].append(word)
            for segment in segments:
                label=re.sub(r'[^A-Z]','',' '.join(w['text'] for w in segment).upper())
                if label in heading_keys:heading_starts.append(segment[0]['x0'])
        if heading_starts and max(heading_starts)-min(heading_starts)>page.width*.18:
            return rejected("MULTIPLE_COLUMNS", "Independent section headings reveal a sidebar or multiple text columns.")
        # A genuine column gutter has substantial prose on BOTH sides on several
        # rows. A name/contact header or right-aligned date isn't a text column.
        gutters = []
        for row in rows:
            row.sort(key=lambda w: w['x0'])
            if row[0]['top'] < page.height * .13:
                continue
            for i in range(1, len(row)):
                gap = row[i]['x0'] - row[i - 1]['x1']
                if gap < max(18, page.width * .032):
                    continue
                left = ' '.join(w['text'] for w in row[:i])
                right = ' '.join(w['text'] for w in row[i:])
                from service.document_structure import DATE_RANGE
                if len(left) < 12 or len(right) < 18 or DATE_RANGE.search(right):
                    continue
                if len(right.split()) < 4:
                    continue
                gutters.append((row[i - 1]['x1'], row[i]['x0'], row[0]['top']))
        for left, right, _ in gutters:
            cut = (left + right) / 2
            matching = sorted({round(top / 4)*4 for a, b, top in gutters if a < cut < b})
            if any(sum(start <= y <= start+80 for y in matching)>=4 for start in matching):
                return rejected("MULTIPLE_COLUMNS", "Multiple text columns or a sidebar were detected.")
        # Also catch columns whose baselines don't align with each other.
        prose = []
        for row in rows:
            if row[0]['top'] < page.height * .13:
                continue
            text = ' '.join(w['text'] for w in row)
            if len(re.findall(r'\b[a-z]{3,}\b', text)) >= 3:
                prose.append(row[0]['x0'])
        if prose and sum(x > min(prose) + page.width * .22 for x in prose) >= 4:
            return rejected("SCATTERED_TEXT", "Independent or scattered body text makes reading order unreliable.")
        # Duplicate text layers cause ambiguous reading order. Compare each glyph
        # with nearby glyphs at the same position, ignoring ordinary kerning.
        positions = set()
        duplicates = 0
        chars = [c for c in page.chars if c.get('text', '').strip()]
        for char in chars:
            key = (round(char['x0'], 1), round(char['top'], 1), char['text'])
            duplicates += key in positions
            positions.add(key)
        if chars and duplicates / len(chars) > .02:
            return rejected("OVERLAPPING_TEXT", "Overlapping or duplicate text makes reading order unreliable.")
    return None


def validate_pdf(contents: bytes, filename: str):
    if len(contents) > MAX_BYTES:
        return rejected("FILE_TOO_LARGE", "PDFs must be 10 MB or smaller.")
    if Path(filename).suffix.lower() != '.pdf' or not contents.startswith(b'%PDF-'):
        return rejected("PDF_REQUIRED", "Upload a PDF. Export Word documents to PDF first.")
    try:
        reader = PdfReader(io.BytesIO(contents), strict=True)
        if reader.is_encrypted:
            return rejected("ENCRYPTED_PDF", "Upload a PDF without password protection.")
        if not reader.pages:
            return rejected("NO_TEXT", "The PDF has no pages.")
        with pdfplumber.open(io.BytesIO(contents)) as document:
            failure = inspect_geometry(document)
            if failure:
                return failure
        from scripts.resume_to_json import convert
        from service.document_structure import form_details
        from service.resume_content import normalize, markdown_from
        import json
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder) / 'resume.pdf'
            source.write_bytes(contents)
            details = json.loads(convert(source, Path(folder)).read_text(encoding='utf-8'))
        text = details.get('text', '')
        if len(re.findall(r'[A-Za-z]{2,}', text)) < 20:
            return rejected("UNREADABLE_TEXT", "Too little readable resume text was extracted.")
        tokens = re.findall(r'\b[A-Za-z]+\b', text)
        if text.count('\ufffd') > max(2, len(text) * .005) or (len(tokens) > 50 and sum(len(t)==1 for t in tokens)/len(tokens) > .2):
            return rejected("UNREADABLE_TEXT", "Broken character spacing or unreadable glyphs were detected.")
        if not any(details.get(field) for field in ('experience','education','skills','projects','summary','certifications')):
            return rejected("AMBIGUOUS_STRUCTURE", "Recognizable resume sections could not be identified.")
        header = details.get('header', {})
        details['personalDetails'] = {'fullName': header.get('name', ''), 'email': header.get('email', ''),
            'phoneNumber': header.get('phone', ''), 'location': header.get('location', ''),
            'links': header.get('links', []), 'emails': header.get('emails', []), 'phones': header.get('phones', [])}
        details = form_details(details)
        details = normalize(details, edited=True)
        markdown = markdown_from(details)
        # These are extraction checks, not eligibility requirements for graduates.
        # Any detected work history must have role/company associations and text.
        for entry in details.get('experience', []):
            if not entry.get('company') or not entry.get('title') or not entry.get('bullets'):
                return rejected("AMBIGUOUS_STRUCTURE", "Employment details could not be associated reliably.")
        if not (details.get('personalDetails') or {}).get('fullName'):
            return rejected("AMBIGUOUS_STRUCTURE", "The resume name could not be identified reliably.")
        if not markdown.strip():
            return rejected("AMBIGUOUS_STRUCTURE", "The extracted resume is incomplete.")
        from scripts.resume_json_to_preferences import build_preferences
        from service.resume_document import source_document
        try:
            canonical = source_document(details, hashlib.sha256(contents).hexdigest(), "pending", details.get('pages'))
        except (ValueError, TypeError, KeyError):
            return rejected("AMBIGUOUS_STRUCTURE", "Source fields, roles or PDF evidence could not be associated reliably.")
        details['originalText'] = text
        details['resumeDocument'] = canonical
        return {"accepted": True, "reasonCode": "ACCEPTED", "message": "Supported PDF. Review the extracted details before confirming.",
                "validatorVersion": VERSION, "fileSha256": hashlib.sha256(contents).hexdigest(),
                "resume_details": details, "resumeDocument": canonical, "markdown": markdown, "preferences": build_preferences(markdown)}
    except Exception:
        return rejected("UNREADABLE_PDF", "The PDF could not be read safely. Export a new text-based PDF.")
