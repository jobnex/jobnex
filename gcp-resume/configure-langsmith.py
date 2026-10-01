"""Configure existing builder tracing without triggering a generation."""
from deploy_runtime import *
import argparse
parser = argparse.ArgumentParser()
parser.add_argument('--version', required=True)
parser.add_argument('--allow-content', action='store_true')
args = parser.parse_args()
if not args.version.isdigit(): raise SystemExit('Use an explicit numeric secret version')
secret = 'job-hunt-langsmith-api-key'
version = json.loads(cloud('secrets', 'versions', 'describe', args.version, '--secret', secret, '--format=json').stdout)
if version['state'] != 'ENABLED': raise SystemExit('Secret version is not enabled')
email = f'job-hunt-resume-runtime@{PROJECT}.iam.gserviceaccount.com'
cloud('secrets', 'add-iam-policy-binding', secret, '--member', 'serviceAccount:' + email, '--role', 'roles/secretmanager.secretAccessor', '--format=none')
cloud('run', 'services', 'update', 'job-hunt-resume-worker', '--region', REGION,
      '--update-secrets', f'LANGSMITH_API_KEY={secret}:{args.version}',
      '--update-env-vars', 'RESUME_ENABLE_LANGSMITH=1,LANGSMITH_TRACING=true,LANGSMITH_PROJECT=resume-builder-gcp,LANGSMITH_ENDPOINT=https://api.smith.langchain.com,RESUME_LANGSMITH_ALLOW_CONTENT=' + ('1' if args.allow_content else '0'))
service = json.loads(cloud('run', 'services', 'describe', 'job-hunt-resume-worker', '--region', REGION, '--format=json').stdout)
assert any(item['type']=='Ready' and item['status']=='True' for item in service['status']['conditions'])
environment = {item['name']: item for item in service['spec']['template']['spec']['containers'][0]['env']}
assert environment['LANGSMITH_API_KEY']['valueFrom']['secretKeyRef']['key']==args.version
assert environment['RESUME_ENABLE_LANGSMITH']['value']=='1'
assert environment['DATABASE_URL']['valueFrom']['secretKeyRef']['name']=='job-hunt-profile-database-url'
record = json.loads((ROOT / 'deployment.json').read_text())
record['langsmith'] = {'secret':secret + ':' + args.version, 'project':'resume-builder-gcp', 'allow_content':args.allow_content}
(ROOT / 'deployment.json').write_text(json.dumps(record, indent=2))
print('LANGSMITH_CONFIGURED; no generation or credential validation request was made')
