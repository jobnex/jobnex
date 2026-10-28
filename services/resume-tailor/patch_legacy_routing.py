"""Add request-version isolation to the deployed compatibility worker only.

The legacy model, admission, billing and recovery behavior is otherwise retained.
Run in an immutable derivative of the existing legacy image, not the strict image.
"""
from pathlib import Path
import sys

path=Path(sys.argv[1] if len(sys.argv)>1 else '/app/services/resume-tailor/worker.ts')
source=path.read_text(encoding='utf-8')
changes=[
    ("WHERE id=$2 AND status='queued'", "WHERE id=$2 AND publication_contract='legacy' AND status='queued'"),
    ("FROM resume_generation_requests WHERE status='running'", "FROM resume_generation_requests WHERE publication_contract='legacy' AND status='running'"),
    ("WHERE r.status='queued' AND r.credit_state='held' AND o.attempts>=10", "WHERE r.status='queued' AND r.publication_contract='legacy' AND r.credit_state='held' AND o.attempts>=10"),
]
for before,after in changes:
    if source.count(before)!=1:raise RuntimeError('Compatibility worker changed; routing patch must be reviewed')
    source=source.replace(before,after,1)
path.write_text(source,encoding='utf-8')
print('LEGACY_VERSION_ROUTING_PATCHED')
