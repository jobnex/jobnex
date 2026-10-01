from pathlib import Path
import subprocess, json, tempfile
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
