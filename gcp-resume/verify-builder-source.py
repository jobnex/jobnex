from pathlib import Path
import hashlib
root = Path(__file__).resolve().parent
builder = root.parent / 'resume-agent-inspect/src'
context = root / 'build-context/service/resume-agent/src'
files = list(builder.rglob('*.py'))
assert files
assert {file.relative_to(builder) for file in files} == {file.relative_to(context) for file in context.rglob('*.py')}
for file in files:
    assert hashlib.sha256(file.read_bytes()).digest() == hashlib.sha256((context / file.relative_to(builder)).read_bytes()).digest()
print('BUILDER_SOURCE_VERIFIED')
