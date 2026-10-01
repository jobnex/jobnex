from deploy_runtime import *
fix = json.loads((ROOT / 'provider-deployment.json').read_text())
if cloud('builds','describe',fix['build'],'--format=value(status)').stdout.strip() != 'SUCCESS': raise SystemExit('Build not ready')
cloud('run','services','update','job-hunt-resume-worker','--region',REGION,'--image',fix['image'])
record = json.loads((ROOT / 'deployment.json').read_text())
record['images']['resume-worker']=fix['image']
record['provider_fix_build']=fix['build']
(ROOT / 'deployment.json').write_text(json.dumps(record,indent=2))
print('Corrected worker deployed')
