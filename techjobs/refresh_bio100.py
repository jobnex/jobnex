import json
from pathlib import Path
from companies import all_sources
from sectors import in_sector

registry = all_sources()
checks = json.loads(Path('sector_checks.json').read_text(encoding='utf-8'))
for source in registry:
    if not in_sector(source['company'], ['life-sciences']):
        continue
    check = next((c for c in reversed(checks) if c['source'] == source), {})
    if not check.get('count') or check.get('error'):
        print('Needs check:', source, check.get('error'))
names = {'ResMed', 'Ocular Therapeutix'}
Path('bio_link_refresh.json').write_text(json.dumps([s for s in registry if s['company'] in names], indent=2), encoding='utf-8')
print('Form Bio jobs:', [c['jobs'] for c in checks if c['source']['company'] == 'Form Bio'][-1])
