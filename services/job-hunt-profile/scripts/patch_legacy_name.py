"""Patch only name extraction in the legacy image; preserve its upload contract."""
from pathlib import Path

path = Path('/app/scripts/resume_to_json.py')
source = path.read_text()
replacements = [
    (r"for candidate in re.split(r'\s*\|\s*|\s{2,}', line):", r"for candidate in [*re.split(r'\s*\|\s*', line), *re.split(r'\s{2,}', line)]:"),
    ("header['name'] = candidate", r"header['name'] = re.sub(r'\s+', ' ', candidate)"),
    ("    for line in candidates:\n        for part in re.split", "    for line in candidates:\n        if re.sub(r'\\s+', ' ', line.strip('#* ')) == header.get('name'):\n            continue\n        for part in re.split"),
]
for old, new in replacements:
    assert old in source, 'Legacy parser anchor missing'
    source = source.replace(old, new, 1)
compile(source, str(path), 'exec')
path.write_text(source)
