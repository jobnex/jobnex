import re
from service.contacts import contact_values, extract_contacts, preserve_header, unique

def markdown_from(details, edited=False):
    def text(value): return value.strip() if isinstance(value, str) else ""
    original = text(details.get("compiler_payload", {}).get("markdown"))
    header = details.get('header') or {}
    personal = (details.get('personalDetails') if 'personalDetails' in details else header) or {}
    if not edited:
        recovered = extract_contacts(text(details.get('text'))) if not details.get('compiler_payload', {}).get('contactsEdited') else {'emails': [], 'phones': [], 'links': []}
        # Recover previously skipped fields from the stored original text.
        header = {**header, **{key: unique([*header.get(key, []), *value]) for key,value in recovered.items() if value}}
        values = contact_values(personal, header)
        values.extend(value for key in ('emails','phones','links') for value in recovered[key])
        if original: return preserve_header(original, values)
    if not original and not edited and text(details.get("text")): return "# Resume\n\n" + text(details["text"])
    parts = re.split(r"^##\s+", original, flags=re.M)
    extra = [part for part in parts[1:] if not re.match(r"^(education|experience|professional experience|work experience)\s*\n", part, re.I)]
    name = text(personal.get("fullName") or personal.get("name"))
    lines = ["# " + name] if name else []
    title = text(personal.get('title') or header.get('title'))
    if title: lines.append('**'+title+'**')
    contact = contact_values(personal, header)
    if any(contact): lines.append(" | ".join(filter(None, contact)))
    if not original or len(parts) == 1:
        for title, field in [("Professional Summary", "summary"), ("Skills & Technologies", "skills"), ("Projects", "projects"), ("Certifications", "certifications"), ("Awards", "awards"), ("Publications", "publications"), ("Volunteering", "volunteering"), ("Languages", "languages"), ("Training", "training"), ("Research", "research"), ("Leadership", "leadership"), ("Achievements", "achievements"), ("Additional Information", "additional_information")]:
            value = details.get(field)
            content = ", ".join(filter(None, map(text, value))) if isinstance(value, list) else text(value)
            if content: lines.extend(["", "## " + title, content])
    education = details.get("educationHistory") or []
    if education:
        lines.extend(["", "## Education"])
        for entry in education:
            qualification=' '.join(filter(None,[text(entry.get('degree')),text(entry.get('field'))]))
            dates=' – '.join(filter(None,[text(entry.get('startDate')),text(entry.get('endDate'))])) or text(entry.get('dates'))
            lines.extend(['**'+text(entry.get('college'))+'** —',
                          ' | '.join(filter(None,['*'+qualification+'*' if qualification else '',dates]))])
            if text(entry.get('details')):lines.append(text(entry['details']))
    elif "educationHistory" not in details and text(details.get("education")):
        lines.extend(["", "## Education", text(details["education"])])
    experience = details.get("experienceHistory", details.get("experience", [])) or []
    if "experienceHistory" not in details and text(details.get("experience_text") or (experience if isinstance(experience,str) else "")):
        lines.extend(["", "## Experience", text(details.get("experience_text") or experience)])
    elif isinstance(experience, list) and experience:
        lines.extend(["", "## Experience"])
        for entry in experience:
            role = text(entry.get("role") or entry.get("title"))
            if role: lines.append("### " + role)
            dates = " – ".join(filter(None, [text(entry.get(key)) for key in ("startDate", "endDate")])) or text(entry.get("dates"))
            company=text(entry.get('company'))
            lines.append(" | ".join(filter(None, ['**'+company+'**' if company else '', dates])))
            if text(entry.get("jobDescription")): lines.append(text(entry["jobDescription"]))
            else: lines.extend("- " + text(bullet) for bullet in entry.get("bullets", []) if text(bullet))
            if text(entry.get("responsibilities")): lines.append(text(entry["responsibilities"]))
    lines.extend("\n## " + part.strip() for part in extra)
    if not original:
        lines.extend("\n## " + str(title) + "\n" + str(body) for title,body in details.get('other_sections',{}).items())
    rendered = "\n".join(lines).strip()
    return rendered or ("# Resume\n\n" + text(details.get("text")) if text(details.get("text")) else "")

def normalize(details, edited=False):
    return {**details, "compiler_payload": {**details.get("compiler_payload", {}), **({'contactsEdited': True} if edited else {}), "markdown": markdown_from(details, edited)}}
