from deploy_runtime import *
from datetime import datetime, timezone
path=APP / 'app/(main)/job-hunt/resumes/page.tsx'
text=path.read_text(encoding='utf-8')
old='item.error_code.replaceAll("_", " ")'
new='''(({ provider_http_402: "OpenRouter account has insufficient provider credits. Add provider credits and retry",
          provider_http_401: "Provider API key is invalid or expired", provider_http_403: "Provider API key lacks model access",
          provider_timeout_unknown: "Provider timed out; billing outcome is unknown", provider_network_unknown: "Provider network request failed; billing outcome is unknown",
          provider_response_unknown: "Provider returned an unreadable response; billing outcome is unknown" } as Record<string,string>)[item.error_code] ?? item.error_code.replaceAll("_", " "))'''
if old not in text:raise SystemExit('Expected UI error display missing')
path.write_text(text.replace(old,new),encoding='utf-8')
(ROOT / 'build-context' / path.relative_to(APP)).write_text(path.read_text(encoding='utf-8'),encoding='utf-8')
image=f'{REGION}-docker.pkg.dev/{PROJECT}/job-hunt/job-hunt-web:provider-ui-{datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")}'
config={'steps':[{'name':'gcr.io/cloud-builders/docker','args':['build','-f','cloud/Dockerfile.web','-t',image,'.']}],'images':[image],'timeout':'1800s','options':{'machineType':'E2_HIGHCPU_8'}}
file=ROOT / 'provider-ui-cloudbuild.json';file.write_text(json.dumps(config))
build=json.loads(cloud('builds','submit',str(ROOT / 'build-context'),'--config',str(file),'--async','--format=json').stdout)
(ROOT / 'provider-ui-deployment.json').write_text(json.dumps({'build':build['id'],'image':image},indent=2))
print('BUILD '+build['id'])
