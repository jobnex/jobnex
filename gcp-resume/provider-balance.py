from deploy_runtime import *
from urllib.request import Request,urlopen
key=cloud('secrets','versions','access','1','--secret','job-hunt-openrouter-api-key').stdout.strip()
with urlopen(Request('https://openrouter.ai/api/v1/credits',headers={'Authorization':'Bearer '+key}),timeout=30) as response:
    value=json.load(response)['data']
    print(json.dumps({'total_credits':value.get('total_credits'),'total_usage':value.get('total_usage'),'available_usd':value['total_credits']-value['total_usage']}))
