"""Print ATS links from employer career pages supplied on the command line."""
import re
import sys
from html import unescape

import httpx

with httpx.Client(follow_redirects=True, timeout=25) as client:
    for url in sys.argv[1:]:
        try:
            response = client.get(url)
            print(url, response.status_code, str(response.url))
            for match in sorted(set(re.findall(r'[^\s<>"\x27]*(?:greenhouse|lever\.co|ashbyhq|myworkdayjobs|smartrecruiters|eightfold|kula\.ai|workable)[^\s<>"\x27]*', response.text))):
                print(unescape(match)[:400])
        except Exception as error:
            print(type(error).__name__, str(error)[:180])
