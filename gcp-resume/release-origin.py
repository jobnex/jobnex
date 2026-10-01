from deploy_runtime import *
fix = json.loads((ROOT / 'origin-deployment.json').read_text())
if cloud('builds','describe',fix['build'],'--format=value(status)').stdout.strip() != 'SUCCESS': raise SystemExit('Build is not ready')
record = json.loads((ROOT / 'deployment.json').read_text())
canonical = cloud('run','services','describe','job-hunt-web','--region',REGION,'--format=value(status.url)').stdout.strip()
origins = list(dict.fromkeys([record['web_url'], canonical]))
cloud('run','services','update','job-hunt-web','--region',REGION,'--image',fix['image'],
      '--update-env-vars','^|^RESUME_ALLOWED_ORIGINS=' + ','.join(origins))
record['images']['web'] = fix['image']
record['origin_fix_build'] = fix['build']
record['allowed_origins'] = origins
(ROOT / 'deployment.json').write_text(json.dumps(record,indent=2))
print('Origin fix deployed with explicit public URLs')
