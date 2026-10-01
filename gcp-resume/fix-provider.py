from deploy_runtime import *
import shutil
from datetime import datetime, timezone
path = ROOT.parent / 'resume-agent-inspect/src/low_risk_agent/portal.py'
text = path.read_text(encoding='utf-8')
text = text.replace('import uuid\n', 'import uuid\nfrom urllib.error import HTTPError, URLError\n')
old = '''                    except Exception:
                        event({**base, "status": "unknown"})
                        # An uncertain request is not retried automatically: it may be billable.
                        raise RuntimeError("provider_outcome_unknown") from None'''
new = '''                    except HTTPError as error:
                        # Explicit rate-limit rejection can use the existing bounded backoff.
                        if error.code == 429:
                            event({**base, "status": "reported", "usage": {"prompt_tokens": 0, "completion_tokens": 0, "cost": 0}})
                            raise
                        event({**base, "status": "unknown"})
                        print(f"[provider] stage={self.stage} http_status={error.code}", file=sys.stderr, flush=True)
                        raise RuntimeError(f"provider_http_{error.code}") from None
                    except (TimeoutError, URLError) as error:
                        event({**base, "status": "unknown"})
                        reason = "timeout" if isinstance(error, TimeoutError) or isinstance(getattr(error, "reason", None), TimeoutError) else "network"
                        print(f"[provider] stage={self.stage} failure={reason}", file=sys.stderr, flush=True)
                        raise RuntimeError(f"provider_{reason}_unknown") from None
                    except Exception:
                        event({**base, "status": "unknown"})
                        print(f"[provider] stage={self.stage} failure=invalid_response", file=sys.stderr, flush=True)
                        raise RuntimeError("provider_response_unknown") from None'''
if old not in text: raise SystemExit('Expected provider handler missing')
path.write_text(text.replace(old,new),encoding='utf-8')
for target in [ROOT / 'build-context/service/resume-agent/src/low_risk_agent/portal.py', APP / 'service/resume-agent/src/low_risk_agent/portal.py']:
    shutil.copy2(path,target)
path = APP / 'lib/resume-worker.ts'
text = path.read_text(encoding='utf-8')
text = text.replace('const safeCode = ["provider_outcome_unknown", "provider_cost_unknown", "generation_budget_exhausted"]\n          .find(code => typeof message.code === "string" && message.code.includes(code));', 'const safeCode = typeof message.code === "string"\n          ? message.code.match(/provider_http_\\d{3}|provider_(?:outcome|cost|timeout|network|response)_unknown|generation_budget_exhausted/)?.[0]\n          : undefined;')
text = text.replace('/^[a-z_]+$/.test(error.message)', '/^[a-z_0-9]+$/.test(error.message)')
path.write_text(text,encoding='utf-8')
shutil.copy2(path, ROOT / 'build-context/lib/resume-worker.ts')
image = f'{REGION}-docker.pkg.dev/{PROJECT}/job-hunt/job-hunt-resume-worker:provider-{datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")}'
config = {'steps':[{'name':'gcr.io/cloud-builders/docker','args':['build','-f','cloud/Dockerfile.worker','-t',image,'.']}],'images':[image],'timeout':'1800s','options':{'machineType':'E2_HIGHCPU_8'}}
configfile = ROOT / 'provider-cloudbuild.json'
configfile.write_text(json.dumps(config))
result = json.loads(cloud('builds','submit',str(ROOT / 'build-context'),'--config',str(configfile),'--async','--format=json').stdout)
(ROOT / 'provider-deployment.json').write_text(json.dumps({'build':result['id'],'image':image},indent=2))
print('BUILD '+result['id'])
