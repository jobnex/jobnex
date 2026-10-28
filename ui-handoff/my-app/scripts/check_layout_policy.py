import json
import os
import sys
import tempfile
from pathlib import Path
from io import BytesIO
from reportlab.pdfgen import canvas
from pypdf import PdfWriter

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scratch/profile-test'))
BACKEND = ROOT.parent / 'resume-backend-release/services/job-hunt-profile'
if not BACKEND.exists(): BACKEND = ROOT / 'backend-fixes/job-hunt-profile'
sys.path.insert(0, str(BACKEND))
tempfile.tempdir = str(ROOT / 'scratch')
from service.layout_policy import validate_pdf, MAX_BYTES


def generated(columns=False, size=11, margin=45, pages=1, education_first=False, overlapping=False):
    out = BytesIO()
    c = canvas.Canvas(out, pagesize=(595, 842))
    for page in range(pages):
        c.setFont('Helvetica', size)
        c.drawString(margin, 805, 'Example Candidate')
        c.drawString(margin, 785, 'candidate@example.com | Seattle, WA')
        if education_first:
            c.drawString(margin, 765, 'EDUCATION')
            c.drawString(margin, 752, 'Example University - Bachelor of Science')
        c.drawString(margin, 740, 'PROFESSIONAL EXPERIENCE')
        c.drawString(margin, 715, 'Example Company')
        c.drawRightString(550, 715, 'Sept 2024 - Present')
        c.drawString(margin, 695, 'Software Engineer')
        for i in range(7):
            c.drawString(margin, 670-i*20, '- Built reliable software and improved customer workflows.')
            if columns:
                c.drawString(370, 670-i*20, 'Additional independent sidebar details')
        if not education_first:
            c.drawString(margin, 480, 'EDUCATION')
            c.drawString(margin, 460, 'Example University')
            c.drawString(margin, 440, 'Bachelor of Science in Computer Science')
        c.drawString(margin, 410, 'TECHNICAL SKILLS')
        c.drawString(margin, 390, 'Python, SQL, TypeScript, Testing')
        if overlapping:
            for i in range(7):c.drawString(margin, 670-i*20, '- Built reliable software and improved customer workflows.')
        c.showPage()
    c.save()
    return out.getvalue()


results = []
accepted_markdown = []
downloads = Path(os.environ.get('RESUME_FIXTURE_DIR', Path.home() / 'Downloads'))
for name, expected in [('Shivangi-Resume-1.pdf', False), ("Ria Vijay - Resume_Oct'25-1.pdf", False), ('Mahiswar_Reddy_Desireddy_TDECU_Resume.pdf', True)]:
    result = validate_pdf((downloads / name).read_bytes(), name)
    print(name, result['accepted'], result['reasonCode'], flush=True)
    assert result['accepted'] is expected, (name, result.get('detail'))
    if expected:
        accepted_markdown.append(result['markdown'])
        d = result['resume_details']
        assert len(d['experienceHistory']) == 3
        assert all(len(e['bullets']) == 8 for e in d['experience'])
        assert 'January 2026' in result['markdown'] and 'University at Buffalo' in result['markdown']
        assert 'LangChain' in result['markdown'] and d['personalDetails']['email'] in result['markdown']
    results.append({'fixture': name, 'accepted': result['accepted'], 'reasonCode': result['reasonCode']})
for theme in [2,3,5,6]:
    p = ROOT / f'scratch/verification/resume-preservation-{theme}.pdf'
    result = validate_pdf(p.read_bytes(), 'template.pdf')
    print('template', theme, result['accepted'], result.get('detail'), flush=True)
    assert result['accepted'], (theme, result)
    accepted_markdown.append(result['markdown'])
    assert 'Design Scholarship' in result['markdown'] and 'Mentored students' in result['markdown']
for p in (ROOT/'public/resume-templates').glob('*.pdf'):
    result=validate_pdf(p.read_bytes(),p.name)
    print('gallery',p.name,result['accepted'],result['reasonCode'],flush=True)
    assert result['accepted'], (p.name,result.get('detail'))
    accepted_markdown.append(result['markdown'])
for size, margin, pages in [(10,35,1),(11,45,2),(12,30,1)]:
    result = validate_pdf(generated(size=size,margin=margin,pages=pages), 'standard.pdf')
    assert result['accepted'], result
    accepted_markdown.append(result['markdown'])
reordered=validate_pdf(generated(education_first=True),'reordered.pdf')
assert reordered['accepted']
accepted_markdown.append(reordered['markdown'])
assert not validate_pdf(generated(columns=True), 'columns.pdf')['accepted']
assert validate_pdf(generated(overlapping=True),'overlap.pdf')['reasonCode']=='OVERLAPPING_TEXT'
for data,name,code in [(b'not PDF','fake.pdf','PDF_REQUIRED'),(generated(),'resume.docx','PDF_REQUIRED'),(b'%PDF-broken','broken.pdf','UNREADABLE_PDF'),(b'%PDF-'+b'0'*MAX_BYTES,'large.pdf','FILE_TOO_LARGE')]:
    assert validate_pdf(data,name)['reasonCode'] == code
writer = PdfWriter(); writer.add_blank_page(width=595,height=842)
empty=BytesIO();writer.write(empty)
assert validate_pdf(empty.getvalue(),'scan.pdf')['reasonCode']=='NO_TEXT'
writer.encrypt('password');encrypted=BytesIO();writer.write(encrypted)
assert validate_pdf(encrypted.getvalue(),'encrypted.pdf')['reasonCode']=='ENCRYPTED_PDF'
(ROOT/'scratch/verification/layout-policy-results.json').write_text(json.dumps(results,indent=2),encoding='utf-8')
(ROOT/'scratch/verification/private-accepted-markdown.json').write_text(json.dumps(accepted_markdown),encoding='utf-8')
print('LAYOUT_PDF_FIXTURES_PASSED')
