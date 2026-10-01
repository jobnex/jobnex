from urllib.request import urlopen
import json
with urlopen('https://openrouter.ai/api/v1/models', timeout=30) as response:
    models = json.load(response)['data']
for name in ['google/gemini-3.8-flash','openai/gpt-5.6-terra']:
    found = next((model for model in models if model['id']==name),None)
    print(json.dumps({'model':name,'available':bool(found),'pricing':found.get('pricing') if found else None}))
print(json.dumps([model['id'] for model in models if model['id'].startswith('openai/gpt-')][:18]))
