from deploy_runtime import *
import shutil
from datetime import datetime, timezone
path=ROOT.parent / 'resume-agent-inspect/src/low_risk_agent/portal.py'
text=path.read_text(encoding='utf-8')
text=text.replace('''                        if error.code == 429:
                            event({**base, "status": "reported", "usage": {"prompt_tokens": 0, "completion_tokens": 0, "cost": 0}})
                            raise''','''                        if error.code in {401, 402, 403, 429}:
                            event({**base, "status": "reported", "usage": {"prompt_tokens": 0, "completion_tokens": 0, "cost": 0}})
                            if error.code == 429:
                                raise
                            print(f"[provider] stage={self.stage} http_status={error.code}", file=sys.stderr, flush=True)
                            raise RuntimeError(f"provider_http_{error.code}") from None''')
path.write_text(text,encoding='utf-8')
for destination in [APP / 'service/resume-agent/src/low_risk_agent/portal.py', ROOT / 'build-context/service/resume-agent/src/low_risk_agent/portal.py']:
    shutil.copy2(path,destination)
path=APP / 'app/(main)/job-hunt/resumes/page.tsx'
text=path.read_text(encoding='utf-8')
text=text.replace('row.error_code.replaceAll("_", " ")', '''({ provider_http_402: "OpenRouter account has insufficient provider credits. Add credits to the provider account and retry.",
        provider_http_401: "Provider API key is invalid or expired.", provider_http_403: "Provider API key does not have access to this model.",
        provider_timeout_unknown: "Provider timed out; billing outcome is unknown.", provider_network_unknown: "Provider network request failed; billing outcome is unknown." } as Record<string,string>)[row.error_code] ?? row.error_code.replaceAll("_", " ")''')
path.write_text(text,encoding='utf-8')
shutil.copy2(path,ROOT / 'build-context' / path.relative_to(APP))
tag=datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')
images={kind:f'{REGION}-docker.pkg.dev/{PROJECT}/job-hunt/job-hunt-{kind}:diagnostics-{tag}' for kind in ['web','resume-worker']}
config={'steps':[{'name':'gcr.io/cloud-builders/docker','args':['build','-f','cloud/Dockerfile.'+('web' if kind=='web' else 'worker'),'-t',image,'.']} for kind,image in images.items()],'images':list(images.values()),'timeout':'1800s','options':{'machineType':'E2_HIGHCPU_8'}}
file=ROOT / 'diagnostics-cloudbuild.json';file.write_text(json.dumps(config))
build=json.loads(cloud('builds','submit',str(ROOT / 'build-context'),'--config',str(file),'--async','--format=json').stdout)
(ROOT / 'diagnostics-deployment.json').write_text(json.dumps({'build':build['id'],'images':images},indent=2))
print('BUILD '+build['id'])
