import json
from pathlib import Path
from companies import all_sources

p = Path('bio_100_queue.json')
q = json.loads(p.read_text(encoding='utf-8'))
for name, host, tenant, site, evidence, sectors in [
    ('Evotec', 'evotecgroup.wd3.myworkdayjobs.com', 'evotecgroup', 'Evotec_Career_Site', 'https://careers.evotec.com/en', ['biotech', 'pharma']),
    ('Revvity', 'revvity.wd103.myworkdayjobs.com', 'revvity', 'External', 'https://jobs.revvity.com/', ['biotech', 'bioinformatics']),
]:
    assert name not in {s['company'] for s in all_sources()}
    q.append({'source': {'company': name, 'ats': 'workday', 'host': host, 'tenant': tenant, 'site': site}, 'sectors': sectors, 'identity_evidence': evidence})
p.write_text(json.dumps(q, indent=2), encoding='utf-8')
batch = [i['source'] for i in q if i['source']['company'] in {'Insulet', 'Evotec', 'Revvity'}]
assert len(batch) == 3
Path('sector_candidates.json').write_text(json.dumps(batch, indent=2), encoding='utf-8')
print(batch)
