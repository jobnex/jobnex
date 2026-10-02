param(
    [Parameter(Mandatory=$true)][string]$Image,
    [switch]$Bootstrap
)
$ErrorActionPreference = 'Stop'
$project = 'job-scout-508222'
$region = 'us-central1'
$runtime = "experience-enricher@$project.iam.gserviceaccount.com"
$scheduler = "experience-scheduler@$project.iam.gserviceaccount.com"
function Invoke-Cloud {
    param([string[]]$CloudArgs)
    & rtk proxy gcloud @CloudArgs --project=$project --quiet
    if ($LASTEXITCODE -ne 0) { throw 'GCP command failed' }
}
# Accounts and the secret grant are created once before this script is run.
$arguments = @('run','jobs','deploy','experience-enricher',"--region=$region",
    "--image=$Image","--service-account=$runtime",'--set-secrets=DATABASE_URL=experience-enricher-database-url:1',
    '--set-env-vars=BATCH_SIZE=250,MAX_RUN_SECONDS=1200','--tasks=1','--parallelism=1',
    '--cpu=1','--memory=512Mi','--task-timeout=1800s','--max-retries=1')
if ($Bootstrap) { $arguments += '--args=--migrate' }
Invoke-Cloud $arguments
Invoke-Cloud @('run','jobs','add-iam-policy-binding','experience-enricher',"--region=$region",
    "--member=serviceAccount:$scheduler",'--role=roles/run.invoker')
if ($Bootstrap) {
    Invoke-Cloud @('run','jobs','execute','experience-enricher',"--region=$region",'--wait')
    Invoke-Cloud @('run','jobs','update','experience-enricher',"--region=$region",'--args=')
}
$uri = "https://run.googleapis.com/v2/projects/$project/locations/$region/jobs/experience-enricher:run"
$previousErrorAction = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
$existing = & rtk proxy gcloud scheduler jobs describe experience-enricher-every-30m --location=$region --project=$project --format=json 2>$null
$probeCode = $LASTEXITCODE
$ErrorActionPreference = $previousErrorAction
if ($probeCode -eq 0) { $action = 'update' } else { $action = 'create' }
Invoke-Cloud @('scheduler','jobs',$action,'http','experience-enricher-every-30m',"--location=$region",
    '--schedule=10,40 * * * *','--time-zone=Etc/UTC',"--uri=$uri",'--http-method=POST',
    '--message-body={}','--headers=Content-Type=application/json',
    "--oauth-service-account-email=$scheduler",'--attempt-deadline=180s','--max-retry-attempts=0')
