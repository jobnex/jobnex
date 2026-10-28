"""Contact extraction and preservation without depending on document layout."""
import re
from urllib.parse import unquote

EMAIL = re.compile(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}")
PHONE = re.compile(r"(?<![\w])(?:\+\d{1,3}[\s.-]*)?\(?\d[\d\s().-]{5,}\d(?:\s*(?:ext\.?|x)\s*\d{1,6})?(?!\w)", re.I)
URL = re.compile(r"(?:https?://|www\.)[^\s<>|]+|(?:[\w-]+\.)+[A-Za-z]{2,}(?:/[^\s<>|]*)?", re.I)

def contact_key(value):
    value = value.strip()
    if re.fullmatch(r'\+?[\d\s().-]+',value) and 7<=len(re.sub(r'\D','',value))<=15:
        return 'phone:'+re.sub(r'\D','',value)
    if re.match(r'^(?:https?://|www\.)|^[\w-]+\.[A-Za-z]{2,}(?:/|$)', value, re.I) and '@' not in value:
        return re.sub(r'^(?:https?://)?(?:www\.)?', '', value, flags=re.I).rstrip('/').lower()
    return re.sub(r'\s+', ' ', value.lower())

def unique(values):
    seen = set()
    result = []
    for value in values:
        if not isinstance(value, str) or not value.strip(): continue
        value = value.strip()
        key = contact_key(value)
        if key not in seen:
            seen.add(key)
            result.append(value)
    return result

def extract_contacts(text, targets=()):
    emails = EMAIL.findall(text)
    phones = []
    links = []
    for line in text.splitlines():
        for match in PHONE.finditer(line):
            value = match.group().strip()
            base = re.split(r"\s*(?:ext\.?|x)\s*\d", value, flags=re.I)[0]
            digits = re.sub(r"\D", "", base)
            if not 7 <= len(digits) <= 15:
                continue
            # Date ranges and numeric measures are not contact numbers.
            if re.fullmatch(r"(?:19|20)\d{2}\s*[-./]\s*(?:19|20)\d{2}", base):
                continue
            if re.fullmatch(r"\d{1,4}[-./]\d{1,2}[-./]\d{1,4}", base):
                continue
            if line[match.end():].lstrip().startswith('%') or re.search(r"\b(?:salary|revenue|budget|employee id)\b", line, re.I):
                continue
            phones.append(value)
        email_spans = list(EMAIL.finditer(line))
        for match in URL.finditer(line):
            value = match.group().rstrip('.,;:)]}')
            if any(match.start() < email.end() and match.end() > email.start() for email in email_spans):
                continue
            if not re.match(r'^https?://', value, re.I) and re.search(r'\.(?:js|ts|py|jsx|tsx|sql|pdf|docx?)$', value, re.I):
                continue
            if value.lower() == 'asp.net': continue
            if re.fullmatch(r'(?:[BM]\.(?:Des|Arch|Tech|Sc|A|S)|Ph\.D)',value,re.I):continue
            if not re.match(r'^(?:https?://|www\.)',value,re.I) and re.search(r'\.[A-Z][a-z]+$',value):continue
            links.append(value)
    for target in targets:
        if not isinstance(target, str): continue
        if target.lower().startswith('mailto:'):
            emails.extend(EMAIL.findall(unquote(target[7:].split('?')[0])))
        elif target.lower().startswith('tel:'):
            phones.extend(extract_contacts(unquote(target[4:]))['phones'])
        elif re.match(r'^https?://', target, re.I):
            links.append(target)
    return {'emails': unique(emails), 'phones': unique(phones), 'links': unique(links)}

def contact_values(personal, header=None):
    header = header or {}
    values = []
    for key, aliases in [('email', ('emails',)), ('phoneNumber', ('phone','phones')), ('location', ()),
                         ('linkedin', ('linkedinUrl',)), ('github', ('githubUrl',)),
                         ('website', ('portfolio','portfolioUrl')), ('links', ())]:
        found = next((personal[name] for name in (key, *aliases) if name in personal), None)
        if found is None:
            found = next((header[name] for name in (key, *aliases) if name in header), None)
        values.extend(found if isinstance(found, list) else [found])
    # Preserve additional supplied contact fields instead of a fixed schema whitelist.
    known = {'name','fullName','title','email','emails','phoneNumber','phone','phones','location',
             'linkedin','linkedinUrl','github','githubUrl','website','portfolio','portfolioUrl','links'}
    for key, value in {**header, **personal}.items():
        if key not in known:
            values.extend(value if isinstance(value, list) else [value])
    # Additional email/phone values belong to the source when not explicitly edited.
    for singular, plural in [('email','emails'), ('phoneNumber','phones')]:
        owner = personal if plural in personal else header
        if personal.get(singular) != '':
            values.extend(owner.get(plural, [])[1:] if singular in personal else owner.get(plural, []))
    title_parts = {contact_key(part) for part in str(personal.get('title') or header.get('title') or '').split('|')}
    return [value for value in unique(values) if contact_key(value) not in title_parts]

def preserve_header(markdown, values):
    """Add missing contacts before the first section, preserving the document body."""
    parts = re.split(r'(?=^##\s)', markdown, maxsplit=1, flags=re.M)
    head = parts[0].rstrip()
    missing = [value for value in unique(values) if value not in head]
    if missing: head += '\n' + ' | '.join(missing)
    return head + ('\n\n' + parts[1] if len(parts) > 1 else '')
