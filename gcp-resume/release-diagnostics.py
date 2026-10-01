from deploy_runtime import *
worker=json.loads((ROOT / 'diagnostics-deployment.json').read_text())
web=json.loads((ROOT / 'provider-ui-deployment.json').read_text())
for build in [worker['build'],web['build']]:
    if cloud('builds','describe',build,'--format=value(status)').stdout.strip()!='SUCCESS':raise SystemExit('Build not ready')
images={'resume-worker':worker['images']['resume-worker'],'web':web['image']}
for kind,image in images.items():
    cloud('run','services','update','job-hunt-'+kind,'--region',REGION,'--image',image,'--update-env-vars=RESUME_GENERATION_ENABLED=true')
record=json.loads((ROOT / 'deployment.json').read_text())
record['images']=images
record['diagnostics_builds']=[worker['build'],web['build']]
(ROOT / 'deployment.json').write_text(json.dumps(record,indent=2))
print('Provider diagnostics deployed; generation worker restored')
