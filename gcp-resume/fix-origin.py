from deploy_runtime import *
from datetime import datetime, timezone
route = APP / 'app/api/resume-generations/route.ts'
source = route.read_text(encoding='utf-8')
old = 'if (request.headers.get("origin") !== new URL(request.url).origin)'
new = '''// Cloud Run terminates HTTPS before the container. Use explicit public origins.
  const allowedOrigins = process.env.RESUME_ALLOWED_ORIGINS
    ? process.env.RESUME_ALLOWED_ORIGINS.split(",").map(value => value.trim()).filter(Boolean)
    : [new URL(request.url).origin];
  if (!allowedOrigins.includes(request.headers.get("origin") ?? ""))'''
if old not in source: raise SystemExit('Expected origin guard not found')
route.write_text(source.replace(old, new), encoding='utf-8')
context = ROOT / 'build-context'
(context / 'app/api/resume-generations/route.ts').write_text(route.read_text(encoding='utf-8'), encoding='utf-8')
image = f'{REGION}-docker.pkg.dev/{PROJECT}/job-hunt/job-hunt-web:origin-{datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")}'
config = {'steps':[{'name':'gcr.io/cloud-builders/docker','args':['build','-f','cloud/Dockerfile.web','-t',image,'.']}], 'images':[image], 'timeout':'1800s', 'options':{'machineType':'E2_HIGHCPU_8'}}
configfile = ROOT / 'origin-cloudbuild.json'
configfile.write_text(json.dumps(config))
build = json.loads(cloud('builds','submit',str(context),'--config',str(configfile),'--async','--format=json').stdout)
(ROOT / 'origin-deployment.json').write_text(json.dumps({'build':build['id'],'image':image},indent=2))
print('BUILD ' + build['id'])
