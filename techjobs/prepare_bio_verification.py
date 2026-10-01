from pathlib import Path

p = Path('verify_bio_50.py').read_text(encoding='utf-8')
p = p.replace('50-company', '100-company').replace('bio_50_baseline.json', 'bio_100_baseline.json')
p = p.replace('len(baseline) == 533 and len(registry) == 583 and len(additions) == 50', 'len(baseline) == 583 and len(registry) == 683 and len(additions) == 100')
p = p.replace('/50', '/100').replace('BIO_EXPANSION_50.json', 'BIO_EXPANSION_100.json')
Path('verify_bio_100.py').write_text(p, encoding='utf-8')
