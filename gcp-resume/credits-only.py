from deploy_runtime import *
from datetime import datetime, timezone
import shutil
path = APP / 'lib/resume-generation.ts'
text = path.read_text(encoding='utf-8')
start = text.index('export const dailyLimit = () => {')
end = text.index('export function textHash', start)
text = text[:start] + text[end:]
text = text.replace(', limit: dailyLimit()', '')
text = text.replace('    const allowance = await budget(client, userId);\n    if (allowance.used + allowance.reserved >= allowance.limit) throw new Error("Daily AI token allowance is exhausted or reserved");\n', '')
path.write_text(text, encoding='utf-8')
path = APP / 'lib/resume-worker.ts'
text = path.read_text(encoding='utf-8').replace('{ budget, lockWallet,', '{ lockWallet,')
text = text.replace('      const allowance = await budget(client, job.user_id);\n      if (tokens > allowance.limit - allowance.used - allowance.reserved) throw new Error("daily_token_allowance_exhausted");\n', '')
path.write_text(text, encoding='utf-8')
path = APP / 'app/api/resume-generations/route.ts'
text = path.read_text(encoding='utf-8').replace('{ budget, credits,', '{ credits,')
text = text.replace('[generations, wallet, tokens, resumes]', '[generations, wallet, resumes]')
text = text.replace('      budget(resumePool, user.id), ', '      ')
text = text.replace('tokens, resumes:', 'resumes:')
text = text.replace(', "Daily AI token allowance is exhausted or reserved"', '')
path.write_text(text, encoding='utf-8')
path = APP / 'app/(main)/job-hunt/resumes/page.tsx'
text = path.read_text(encoding='utf-8')
text = '\n'.join(line for line in text.splitlines() if 'Today&apos;s AI tokens:' not in line and 'data.tokens.unresolved' not in line)
text = text.replace('tokens: { used: number; reserved: number; limit: number; unresolved: number }; ', '')
path.write_text(text+'\n', encoding='utf-8')
path = ROOT.parent / 'resume-agent-inspect/src/low_risk_agent/portal.py'
text = path.read_text(encoding='utf-8').replace('                    limit = Decimal(os.getenv("GENERATION_COST_LIMIT_USD", "1"))\n', '')
text = text.replace('if self.calls > 20 or self.spend >= limit:', 'if self.calls > 20:')
path.write_text(text, encoding='utf-8')
for folder in ['app', 'lib']:
    for source in (APP / folder).rglob('*'):
        if source.is_file(): shutil.copy2(source, ROOT / 'build-context' / source.relative_to(APP))
shutil.copy2(path, ROOT / 'build-context/service/resume-agent/src/low_risk_agent/portal.py')
shutil.copy2(path, APP / 'service/resume-agent/src/low_risk_agent/portal.py')
tag = datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')
images = {kind:f'{REGION}-docker.pkg.dev/{PROJECT}/job-hunt/job-hunt-{kind}:credits-{tag}' for kind in ['web','resume-worker']}
config = {'steps':[{'name':'gcr.io/cloud-builders/docker','args':['build','-f','cloud/Dockerfile.' + ('web' if kind=='web' else 'worker'),'-t',image,'.']} for kind,image in images.items()], 'images':list(images.values()),'timeout':'1800s','options':{'machineType':'E2_HIGHCPU_8'}}
configfile = ROOT / 'credits-cloudbuild.json'
configfile.write_text(json.dumps(config))
result = json.loads(cloud('builds','submit',str(ROOT / 'build-context'),'--config',str(configfile),'--async','--format=json').stdout)
(ROOT / 'credits-deployment.json').write_text(json.dumps({'build':result['id'],'images':images},indent=2))
print('BUILD ' + result['id'])
