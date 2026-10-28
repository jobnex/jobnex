"""Verify compiler output with synthetic content. Requires Typst, Cargo, and pypdf."""
from pathlib import Path
import json
import shutil
import subprocess
from pypdf import PdfReader

root = Path(__file__).resolve().parent.parent
work = root / 'scratch' / 'verification'
compiler = root / 'backend-fixes' / 'pdf-compiler'
model = json.loads((work / 'resume-model.json').read_text(encoding='utf-8'))
work.mkdir(parents=True, exist_ok=True)
(work / 'ui-resume.json').write_text(json.dumps(model), encoding='utf-8')
shutil.copy2(compiler / 'src' / 'ui-resume.typ', work / 'ui-resume.typ')
for theme in [2, 3, 5, 6]:
    pdf = work / f'resume-preservation-{theme}.pdf'
    subprocess.run(['typst', 'compile', '--font-path', str(compiler / 'fonts'), '--input', f'theme={theme}', 'ui-resume.typ', str(pdf)], cwd=work, check=True, capture_output=True)
    reader = PdfReader(pdf)
    text = '\n'.join(page.extract_text() for page in reader.pages)
    for expected in ['B.Des Interaction Design', 'example.design', 'Design Scholarship', 'Mentored students', 'Jun 2025', 'Sept 2025']:
        assert expected in text, (theme, expected)
    assert len(reader.pages) == 1
legacy = {'institution': 'Example University', 'location': 'Buffalo, NY', 'degree': 'Master of Science in Data Science', 'duration': 'Aug 2024 – Dec 2025', 'details': 'Relevant Coursework: Statistics, Generative AI, Deep Learning.'}
model['education'] = [legacy]
(work / 'ui-resume.json').write_text(json.dumps(model), encoding='utf-8')
subprocess.run(['typst', 'compile', '--font-path', str(compiler / 'fonts'), 'ui-resume.typ', 'legacy-preservation.pdf'], cwd=work, check=True, capture_output=True)
text = '\n'.join(page.extract_text() for page in PdfReader(work / 'legacy-preservation.pdf').pages)
assert legacy['degree'] in text and 'Generative AI, Deep Learning.' in text
print('RESUME_PDF_REGRESSIONS_PASS')
