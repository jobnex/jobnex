from deploy_runtime import *
fix = json.loads((ROOT / 'credits-deployment.json').read_text())
if cloud('builds','describe',fix['build'],'--format=value(status)').stdout.strip() != 'SUCCESS': raise SystemExit('Build is not ready')
for kind in ['resume-worker','web']:
    cloud('run','services','update','job-hunt-'+kind,'--region',REGION,'--image',fix['images'][kind],'--remove-env-vars=DAILY_TOKEN_BUDGET,GENERATION_COST_LIMIT_USD')
record = json.loads((ROOT / 'deployment.json').read_text())
record['images'] = fix['images']
record['credits_only_build'] = fix['build']
(ROOT / 'deployment.json').write_text(json.dumps(record,indent=2))
print('Credits-only gating deployed')
