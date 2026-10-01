"""Small authorized writer call; never displays credentials or provider response text."""
from deploy_runtime import *
from urllib.request import Request, urlopen
from urllib.error import HTTPError
key = cloud('secrets','versions','access','1','--secret','job-hunt-openrouter-api-key').stdout.strip()
with urlopen(Request('https://openrouter.ai/api/v1/key',headers={'Authorization':'Bearer '+key}),timeout=30) as response:
    info=json.load(response)['data']
    print(json.dumps({name:info.get(name) for name in ['limit','limit_remaining','usage','is_free_tier']}))
body = {'model':'openai/gpt-5.6-terra','temperature':0,'max_tokens':4000,'messages':[{'role':'user','content':'Return exactly {"ok":true} as JSON.'}],'response_format':{'type':'json_object'},'reasoning':{'effort':'high','exclude':True}}
try:
    with urlopen(Request('https://openrouter.ai/api/v1/chat/completions',data=json.dumps(body).encode(),headers={'Authorization':'Bearer '+key,'Content-Type':'application/json'}),timeout=45) as response:
        result=json.load(response)
        print(json.dumps({'http_status':response.status,'usage':result.get('usage'),'error_code':result.get('error',{}).get('code')}))
except HTTPError as error:
    data=json.loads(error.read())
    problem=data.get('error',{})
    print(json.dumps({'http_status':error.code,'error_code':problem.get('code'),'message':str(problem.get('message',''))[:300]}))


