import re

def markdown_from(details, edited=False):
    def text(value): return value.strip() if isinstance(value, str) else ""
    original = text(details.get("compiler_payload", {}).get("markdown"))
    if original and not edited: return original
    if not original and not edited and text(details.get("text")): return "# Resume\n\n" + text(details["text"])
    parts = re.split(r"^##\s+", original, flags=re.M)
    extra = [part for part in parts[1:] if not re.match(r"^(education|experience|professional experience|work experience)\s*\n", part, re.I)]
    personal = (details.get("personalDetails") if "personalDetails" in details else details.get("header")) or {}
    name = text(personal.get("fullName") or personal.get("name"))
    lines = ["# " + name] if name else []
    contact = [text(personal.get(key)) for key in ("email", "phoneNumber", "location")]
    if not contact[1]: contact[1] = text(personal.get("phone"))
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
            lines.extend([" | ".join(filter(None, [text(entry.get(key)) for key in ("college", "degree", "field")])), " – ".join(filter(None, [text(entry.get(key)) for key in ("startDate", "endDate")]))])
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
            dates = text(entry.get("dates")) or " – ".join(filter(None, [text(entry.get(key)) for key in ("startDate", "endDate")]))
            lines.append(" | ".join(filter(None, [text(entry.get("company")), dates])))
            if text(entry.get("jobDescription")): lines.append(text(entry["jobDescription"]))
            else: lines.extend("- " + text(bullet) for bullet in entry.get("bullets", []) if text(bullet))
            if text(entry.get("responsibilities")): lines.append(text(entry["responsibilities"]))
    lines.extend("\n## " + part.strip() for part in extra)
    rendered = "\n".join(lines).strip()
    return rendered or ("# Resume\n\n" + text(details.get("text")) if text(details.get("text")) else "")

def normalize(details, edited=False):
    return {**details, "compiler_payload": {**details.get("compiler_payload", {}), "markdown": markdown_from(details, edited)}}
