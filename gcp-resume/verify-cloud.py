from deploy_runtime import *
from urllib.request import Request, urlopen
from urllib.error import HTTPError

record = json.loads((ROOT / 'deployment.json').read_text())
enabled = record.get('enabled', False)
def request(url, method='GET', headers=None, data=None):
    try:
        with urlopen(Request(url, data=data, headers=headers or {}, method=method), timeout=60) as response:
            return response.status, response.read().decode()
    except HTTPError as error: return error.code, error.read().decode()
for kind in ['web', 'resume-worker']:
    service = json.loads(cloud('run', 'services', 'describe', 'job-hunt-' + kind, '--region', REGION, '--format=json').stdout)
    assert any(condition['type']=='Ready' and condition['status']=='True' for condition in service['status']['conditions'])
    environment = service['spec']['template']['spec']['containers'][0]['env']
    if record.get('credits_only_build'):
        assert service['spec']['template']['spec']['containers'][0]['image']==record['images'][kind]
        assert not {'DAILY_TOKEN_BUDGET','GENERATION_COST_LIMIT_USD'} & {item['name'] for item in environment}
    database = next(item for item in environment if item['name']=='DATABASE_URL')
    assert database['valueFrom']['secretKeyRef']['name']=='job-hunt-profile-database-url'
    if kind == 'web' and record.get('allowed_origins'):
        origins = next(item for item in environment if item['name']=='RESUME_ALLOWED_ORIGINS')
        assert origins['value'].split(',')==record['allowed_origins']
        assert service['spec']['template']['spec']['containers'][0]['image']==record['images']['web']
    if kind == 'resume-worker':
        assert service['spec']['template']['metadata']['annotations']['run.googleapis.com/cpu-throttling']=='false'
        if enabled:
            assert service['spec']['template']['metadata']['annotations']['autoscaling.knative.dev/minScale']=='1'
            provider = next(item for item in environment if item['name']=='OPENROUTER_API_KEY')
            assert provider['valueFrom']['secretKeyRef']=={'name':'job-hunt-openrouter-api-key','key':'1'}
        if record.get('langsmith'):
            tracing = {item['name']:item for item in environment}
            assert tracing['LANGSMITH_API_KEY']['valueFrom']['secretKeyRef']=={'name':'job-hunt-langsmith-api-key','key':'1'}
            assert tracing['RESUME_ENABLE_LANGSMITH']['value']=='1'
            assert tracing['LANGSMITH_PROJECT']['value']=='resume-builder-gcp'
            assert tracing['RESUME_LANGSMITH_ALLOW_CONTENT']['value']==('1' if record['langsmith']['allow_content'] else '0')
        token = cloud('auth', 'print-identity-token').stdout.strip()
        code, body = request(record[kind + '_url'] + '/health', headers={'Authorization':'Bearer ' + token})
        assert code==200 and json.loads(body)=={'status':'ok','enabled':enabled}
        assert request(record[kind + '_url'] + '/health')[0] in [401,403]
web = record['web_url']
code, body = request(web + '/api/health')
assert code==200 and json.loads(body)=={'status':'ok','generationEnabled':enabled}
assert request(web + '/api/resume-generations')[0]==401
assert request(web + '/api/resume-generations', 'POST', {'Origin':web,'Content-Type':'application/json'}, b'{}')[0]==401
assert request(web + '/api/auth/get-session')[0]==200
assert request(web + '/auth')[0]==200
print('CLOUD_DEPLOYMENT_VERIFIED')
