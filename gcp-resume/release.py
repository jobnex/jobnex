from deploy_runtime import *

record = json.loads((ROOT / 'deployment.json').read_text())
status = cloud('builds', 'describe', record['build'], '--format=value(status)').stdout.strip()
if status != 'SUCCESS': raise SystemExit('Build not successful: ' + status)
values = json.loads(command(['node', '-e', 'process.stdout.write(JSON.stringify(require(process.argv[1]).config({path:process.argv[2],quiet:true}).parsed))', str(APP / 'node_modules/dotenv'), str(APP / '.env.local')]).stdout)
def account(name):
    email = f'{name}@{PROJECT}.iam.gserviceaccount.com'
    if cloud('iam', 'service-accounts', 'describe', email, optional=True).returncode:
        cloud('iam', 'service-accounts', 'create', name)
    return email
def grant(secret, email):
    cloud('secrets', 'add-iam-policy-binding', secret, '--member', 'serviceAccount:' + email, '--role', 'roles/secretmanager.secretAccessor', '--format=none')
web = account('job-hunt-web-runtime')
worker = account('job-hunt-resume-runtime')
secret = 'job-hunt-web-cookie-secret'
if cloud('secrets', 'describe', secret, optional=True).returncode:
    cloud('secrets', 'create', secret, '--replication-policy=automatic')
with tempfile.TemporaryDirectory() as directory:
    path = Path(directory) / 'value'
    path.write_text(values['NEON_AUTH_COOKIE_SECRET'], encoding='utf-8')
    version = cloud('secrets', 'versions', 'add', secret, '--data-file', str(path), '--format=value(name)').stdout.strip().split('/')[-1]
for email in [web, worker]: grant('job-hunt-profile-database-url', email)
grant('job-hunt-profile-service-secret', web)
grant(secret, web)
profile = cloud('run', 'services', 'describe', 'job-hunt-profile', '--region', REGION, '--format=value(status.url)').stdout.strip()
environment = {'NEON_AUTH_BASE_URL': values['NEON_AUTH_BASE_URL'], 'JOB_HUNT_SERVICE_URL': profile, 'RESUME_GENERATION_ENABLED': 'false'}
if record.get('allowed_origins'):
    environment['RESUME_ALLOWED_ORIGINS'] = ','.join(record['allowed_origins'])
envfile = ROOT / 'web-env.json'
envfile.write_text(json.dumps(environment))
for kind, email in [('resume-worker', worker), ('web', web)]:
    args = ['run', 'deploy', 'job-hunt-' + kind, '--image', record['images'][kind], '--region', REGION, '--service-account', email,
            '--port=8080', '--cpu=1', '--memory=1Gi', '--max-instances=1', '--min-instances=0', '--timeout=900']
    if kind == 'web':
        args += ['--allow-unauthenticated', '--env-vars-file', str(envfile), '--set-secrets', f'DATABASE_URL=job-hunt-profile-database-url:1,JOB_HUNT_SERVICE_SECRET=job-hunt-profile-service-secret:1,NEON_AUTH_COOKIE_SECRET={secret}:{version}']
    else:
        args += ['--no-allow-unauthenticated', '--no-cpu-throttling', '--concurrency=1', '--set-env-vars=RESUME_GENERATION_ENABLED=false', '--set-secrets=DATABASE_URL=job-hunt-profile-database-url:1']
    cloud(*args)
    record[kind + '_url'] = cloud('run', 'services', 'describe', 'job-hunt-' + kind, '--region', REGION, '--format=value(status.url)').stdout.strip()
(ROOT / 'deployment.json').write_text(json.dumps(record, indent=2))
print(json.dumps({key: value for key, value in record.items() if key.endswith('_url')}))
