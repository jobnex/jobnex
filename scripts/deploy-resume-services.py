"""Deploy verified images with managed Cloud Run traffic distribution; no Redis/Celery/Nginx required."""
import json, os, secrets, subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROJECT = "job-scout-508222"
REGION = "us-east1"
SECRET = "resume-pdf-compiler-secret"
def cloud(*args):
    return subprocess.run(["rtk", "proxy", "gcloud", *args, "--project", PROJECT], capture_output=True, text=True, check=True).stdout.strip()

env = ROOT / ".env.local"
values = {}
for line in env.read_text(encoding="utf-8").splitlines():
    if "=" in line and not line.startswith("#"):
        key, value = line.split("=", 1); values[key] = value.strip().strip('"')
token = values.get("RESUME_COMPILER_SECRET") or secrets.token_urlsafe(48)
scratch = ROOT / "scratch/compiler-secret.txt"
scratch.write_text(token, encoding="utf-8")
try:
    exists = subprocess.run(["rtk","proxy","gcloud","secrets","describe",SECRET,"--project",PROJECT],capture_output=True).returncode == 0
    if not exists: cloud("secrets","create",SECRET,"--replication-policy","automatic","--data-file",str(scratch))
    elif not values.get("RESUME_COMPILER_SECRET"): raise RuntimeError("Existing compiler secret requires private synchronization before deploy")
finally: scratch.unlink(missing_ok=True)
number = cloud("projects","describe",PROJECT,"--format=value(projectNumber)")
account = number + "-compute@developer.gserviceaccount.com"
cloud("secrets","add-iam-policy-binding",SECRET,"--member","serviceAccount:"+account,"--role","roles/secretmanager.secretAccessor","--quiet")
cloud("run","deploy","resume-pdf-compiler","--region",REGION,"--image",f"{REGION}-docker.pkg.dev/{PROJECT}/job-hunt/resume-pdf-compiler:app4-r2-20261001",
      "--service-account",account,"--allow-unauthenticated","--cpu","2","--memory","1Gi","--concurrency","4","--max","3","--min","0","--timeout","90",
      "--set-env-vars","PDF_CONCURRENCY=4","--set-secrets",f"RESUME_COMPILER_SECRET={SECRET}:1","--quiet")
url = cloud("run","services","describe","resume-pdf-compiler","--region",REGION,"--format=value(status.url)")
values["RESUME_COMPILER_URL"] = url; values["RESUME_COMPILER_SECRET"] = token
lines = env.read_text(encoding="utf-8").splitlines()
for key in ("RESUME_COMPILER_URL", "RESUME_COMPILER_SECRET"):
    lines = [line for line in lines if not line.startswith(key+"=")]
    lines.append(key+"="+values[key])
env.write_text("\n".join(lines)+"\n",encoding="utf-8")
cloud("run","deploy","job-hunt-profile","--region",REGION,"--image",f"{REGION}-docker.pkg.dev/{PROJECT}/job-hunt/job-hunt-profile:confirmation-20261001",
      "--concurrency","4","--max","3","--min","0","--memory","1Gi","--quiet")
(ROOT/"scratch/service-deployment.json").write_text(json.dumps({"project":PROJECT,"region":REGION,"compilerUrl":url,"compilerConcurrency":4,"profileConcurrency":4,"maxInstances":3},indent=2),encoding="utf-8")
print("RESUME SERVICES DEPLOYED")
