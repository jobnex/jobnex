"""Deploy allowlisted app and inspected builder without uploading local credentials."""
from pathlib import Path
import subprocess, json, shutil, tempfile
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parent
APP = ROOT.parent / 'incoming-my-app-3' / 'my-app'
PROJECT, REGION = 'job-scout-508222', 'us-east1'
def command(args, optional=False):
    result = subprocess.run(['rtk', 'proxy', *args], capture_output=True, text=True)
    if result.returncode and not optional:
        print(result.stderr[-4000:])
        raise SystemExit('Deployment command failed: ' + args[0])
    return result
def cloud(*args, optional=False):
    return command(['gcloud', *args, '--project', PROJECT, '--quiet'], optional)
values = json.loads(command(['node', '-e', 'process.stdout.write(JSON.stringify(require(process.argv[1]).config({path:process.argv[2],quiet:true}).parsed))', str(APP / 'node_modules/dotenv'), str(APP / '.env.local')]).stdout)
for key in ['NEON_AUTH_BASE_URL', 'NEON_AUTH_COOKIE_SECRET']:
    if not values.get(key): raise SystemExit('Missing ' + key)
context = ROOT / 'build-context'
context.mkdir(exist_ok=True)
if any(context.iterdir()): raise SystemExit('Build context already exists; inspect before rebuilding')
manifest = []
for folder in ['app', 'components', 'data', 'lib', 'store', 'types', 'public', 'cloud']:
    for source in (APP / folder).rglob('*'):
        if not source.is_file(): continue
        relative = source.relative_to(APP)
        if relative.as_posix() == 'data/resume-compile-payload.json': continue
        destination = context / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)
        manifest.append(relative.as_posix())
for name in ['package.json', 'package-lock.json', 'tsconfig.json', 'next-env.d.ts', 'next.config.ts', 'postcss.config.mjs', 'proxy.ts', 'scripts/resume-worker.ts']:
    source = APP / name
    if source.exists():
        destination = context / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)
        manifest.append(name)
builder = ROOT.parent / 'resume-agent-inspect'
for source in (builder / 'src').rglob('*.py'):
    destination = context / 'service/resume-agent' / source.relative_to(builder)
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)
    manifest.append(destination.relative_to(context).as_posix())
shutil.copy2(builder / 'requirements.txt', context / 'service/resume-agent/requirements.txt')
manifest.append('service/resume-agent/requirements.txt')
(context / '.gcloudignore').write_text('.git\nnode_modules\n.env*\n__pycache__\n')
(ROOT / 'manifest.json').write_text(json.dumps(sorted(manifest), indent=2))
tag = datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')
images = {kind: f'{REGION}-docker.pkg.dev/{PROJECT}/job-hunt/job-hunt-{kind}:{tag}' for kind in ['web', 'resume-worker']}
steps = []
for kind, dockerfile in [('web', 'web'), ('resume-worker', 'worker')]:
    steps.append({'name': 'gcr.io/cloud-builders/docker', 'args': ['build', '-f', f'cloud/Dockerfile.{dockerfile}', '-t', images[kind], '.']})
config = {'steps': steps, 'images': list(images.values()), 'timeout': '1800s', 'options': {'machineType': 'E2_HIGHCPU_8'}}
(context / 'cloudbuild.json').write_text(json.dumps(config))
build = cloud('builds', 'submit', str(context), '--config', str(context / 'cloudbuild.json'), '--async', '--format=json')
record = {'project': PROJECT, 'region': REGION, 'images': images, 'build': json.loads(build.stdout)['id'], 'enabled': False}
(ROOT / 'deployment.json').write_text(json.dumps(record, indent=2))
print('BUILD ' + record['build'])
