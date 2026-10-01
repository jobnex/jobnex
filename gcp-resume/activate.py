"""Enable generation after the user adds a provider secret in Secret Manager."""
from deploy_runtime import *
import argparse
parser = argparse.ArgumentParser()
parser.add_argument('--secret', default='job-hunt-openrouter-api-key')
parser.add_argument('--version', required=True)
args = parser.parse_args()
if not args.version.isdigit(): raise SystemExit('Use an explicit numeric secret version')
cloud('secrets', 'versions', 'describe', args.version, '--secret', args.secret)
email = f'job-hunt-resume-runtime@{PROJECT}.iam.gserviceaccount.com'
cloud('secrets', 'add-iam-policy-binding', args.secret, '--member', 'serviceAccount:' + email, '--role', 'roles/secretmanager.secretAccessor', '--format=none')
cloud('run', 'services', 'update', 'job-hunt-resume-worker', '--region', REGION,
      '--update-secrets', f'OPENROUTER_API_KEY={args.secret}:{args.version}',
      '--update-env-vars=RESUME_GENERATION_ENABLED=true', '--min-instances=1', '--no-cpu-throttling')
cloud('run', 'services', 'update', 'job-hunt-web', '--region', REGION, '--update-env-vars=RESUME_GENERATION_ENABLED=true')
record = json.loads((ROOT / 'deployment.json').read_text())
record['enabled'] = True
record['provider_secret'] = args.secret + ':' + args.version
(ROOT / 'deployment.json').write_text(json.dumps(record, indent=2))
print('Generation enabled; no live AI request was made')
