"""ResumeDocumentV1: canonical JSON, exact source evidence, and closed edit validation.

This dependency-light module is also bundled in the profile service. The schema
is contracts/resume-document-v1.schema.json; schema parity is tested there.
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import re
from pathlib import Path
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

Nonempty = Annotated[str, Field(min_length=1)]
Hash = Annotated[str, Field(pattern=r"^[a-f0-9]{64}$")]


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class Source(Strict):
    fileSha256: Hash
    textSha256: Hash
    revision: Nonempty
    validatorVersion: Nonempty


class PersonalInfo(Strict):
    id: Nonempty
    name: Nonempty
    title: str
    email: str
    phone: str
    linkedin: str
    github: str
    location: str
    extraContacts: list[str]


class Block(Strict):
    id: Nonempty
    text: str
    evidenceIds: list[Nonempty]


class Skill(Strict):
    id: Nonempty
    category: str
    items: list[Block]


class Experience(Strict):
    id: Nonempty
    role: str
    company: str
    location: str
    duration: str
    bullets: list[Block]


class Project(Strict):
    id: Nonempty
    title: str
    technologies: list[str]
    duration: str
    bullets: list[Block]


class Education(Strict):
    id: Nonempty
    institution: str
    location: str
    degree: str
    duration: str
    details: list[Block]


class Additional(Strict):
    id: Nonempty
    title: str
    items: list[Block]


class Evidence(Strict):
    id: Nonempty
    fieldId: Nonempty
    sourceSpan: str
    spanStart: Annotated[int, Field(ge=0)]
    spanEnd: Annotated[int, Field(ge=0)]
    page: Annotated[int, Field(ge=1)] | None
    box: Annotated[list[Annotated[int, Field(ge=0)]], Field(min_length=4, max_length=4)] | None
    roleId: str | None
    origin: Literal["pdf", "user"]


class ResumeDocumentV1(Strict):
    schemaVersion: Literal["ResumeDocumentV1"]
    id: Nonempty
    revision: Annotated[int, Field(ge=1)]
    source: Source
    personalInfo: PersonalInfo
    summary: list[Block]
    skills: list[Skill]
    experience: list[Experience]
    projects: list[Project]
    education: list[Education]
    additionalSections: list[Additional]
    sectionOrder: list[Nonempty]
    evidence: list[Evidence]


def text_hash(text: str) -> str:
    """Match Python read_text and the worker's universal-newline input contract."""
    return hashlib.sha256(text.replace("\r\n", "\n").replace("\r", "\n").encode()).hexdigest()


def _key(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def _blocks(document):
    for block in document["summary"]:
        yield block, None
    for section, field in (
        ("skills", "items"),
        ("experience", "bullets"),
        ("projects", "bullets"),
        ("education", "details"),
        ("additionalSections", "items"),
    ):
        for group in document[section]:
            for block in group[field]:
                yield block, group["id"] if section in {"experience", "projects"} else None


def _fields(document):
    """All non-block display fields, including protected empty values."""
    personal = document["personalInfo"]
    for key, value in personal.items():
        if key != "id":
            yield personal["id"] + "." + key, value, None
    for section, excluded in (
        ("skills", {"id", "items"}),
        ("experience", {"id", "bullets"}),
        ("projects", {"id", "bullets"}),
        ("education", {"id", "details"}),
        ("additionalSections", {"id", "items"}),
    ):
        for group in document[section]:
            for key, value in group.items():
                if key not in excluded:
                    yield (
                        group["id"] + "." + key,
                        value,
                        group["id"] if section in {"experience", "projects"} else None,
                    )


def validate_document(document: dict) -> dict:
    """Validate schema and referential invariants; return an independent JSON value."""
    result = ResumeDocumentV1.model_validate(document).model_dump(mode="json")
    # Reject nonfinite numbers, even in values a future schema might add.
    json.dumps(result, allow_nan=False)
    ids = [result["personalInfo"]["id"]]
    for section in ("skills", "experience", "projects", "education", "additionalSections"):
        ids.extend(group["id"] for group in result[section])
    ids.extend(block["id"] for block, _ in _blocks(result))
    if len(ids) != len(set(ids)):
        raise ValueError("Document IDs must be unique")
    fields = {field: role for field, _, role in _fields(result)}
    scalar_fields = set(fields)
    fields.update({block["id"]: role for block, role in _blocks(result)})
    evidence = {item["id"]: item for item in result["evidence"]}
    if len(evidence) != len(result["evidence"]):
        raise ValueError("Evidence IDs must be unique")
    for item in evidence.values():
        if item["fieldId"] not in fields:
            raise ValueError("Evidence references a missing field")
        owner = fields[item["fieldId"]]
        if (owner is not None and item["roleId"] != owner) or (
            item["fieldId"] in scalar_fields and owner is None and item["roleId"] is not None
        ):
            raise ValueError("Evidence must reference its own field and role")
        if item["spanEnd"] - item["spanStart"] != len(item["sourceSpan"]) or not item["sourceSpan"]:
            raise ValueError("Evidence offsets must describe the exact nonempty source span")
        if (item["page"] is None) != (item["box"] is None):
            raise ValueError("Page and box must both be present or absent")
        if item["box"] and (item["box"][0] >= item["box"][2] or item["box"][1] >= item["box"][3]):
            raise ValueError("Evidence box must have positive dimensions")
    for block, _ in _blocks(result):
        if not block["evidenceIds"] or len(set(block["evidenceIds"])) != len(block["evidenceIds"]):
            raise ValueError("Every display block needs unique evidence references")
        if any(
            eid not in evidence or evidence[eid]["fieldId"] != block["id"]
            for eid in block["evidenceIds"]
        ):
            raise ValueError("Block evidence is missing or belongs to another field")
    for field, value, _ in _fields(result):
        if value and not any(item["fieldId"] == field for item in evidence.values()):
            raise ValueError("Missing evidence for display field " + field)
    available = {
        key for key in ("summary", "skills", "experience", "projects", "education") if result[key]
    }
    available.update(group["id"] for group in result["additionalSections"])
    if (
        len(result["sectionOrder"]) != len(set(result["sectionOrder"]))
        or set(result["sectionOrder"]) != available
    ):
        raise ValueError("Section order must contain every present section exactly once")
    return result


def document_hash(document: dict) -> str:
    value = validate_document(document)
    payload = json.dumps(
        value, sort_keys=True, ensure_ascii=False, separators=(",", ":"), allow_nan=False
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _matches(text, value, start=0, end=None):
    # Match whitespace only; punctuation and source glyphs are never invented.
    pattern = r"\s+".join(re.escape(part) for part in value.split())
    if value and value[0].isalnum():
        pattern = r"(?<!\w)" + pattern
    if value and value[-1].isalnum():
        pattern += r"(?!\w)"
    return list(re.finditer(pattern, text[start:end])) if pattern else []


def source_document(details: dict, file_sha256: str, source_revision: str, pages=None) -> dict:
    """Construct directly from parsed fields and original extracted text, never Markdown.

    pages contains {number, text, start, words:[{start,end,box}]} records. Offsets
    in words are page-local. When supplied, every evidence span must have geometry.
    """
    text = details.get("text", "").replace("\r\n", "\n").replace("\r", "\n")
    if not text:
        raise ValueError("Original extracted text is required")
    pages = pages if pages is not None else details.get("pages", [])
    document = {
        "schemaVersion": "ResumeDocumentV1",
        "id": "source-" + source_revision,
        "revision": 1,
        "source": {
            "fileSha256": file_sha256,
            "textSha256": text_hash(text),
            "revision": source_revision,
            "validatorVersion": "single-column-v1",
        },
        "personalInfo": {},
        "summary": [],
        "skills": [],
        "experience": [],
        "projects": [],
        "education": [],
        "additionalSections": [],
        "sectionOrder": [],
        "evidence": [],
    }

    def attach(field, value, role=None, start=0, end=None):
        if not value:
            return []
        hits = _matches(text, value, start, end)
        if len(hits) != 1:
            raise ValueError("Ambiguous or missing source field: " + field)
        match = hits[0]
        begin, finish = start + match.start(), start + match.end()
        page_number = box = None
        if pages:
            page_start = 0
            for page in pages:
                offset = page.get("start", page_start)
                limit = offset + len(page["text"])
                if offset <= begin and finish <= limit:
                    words = [
                        w
                        for w in page.get("words", [])
                        if w["start"] < finish - offset and w["end"] > begin - offset
                    ]
                    if words:
                        if any(
                            not text[pos].isspace()
                            and not any(w["start"] <= pos - offset < w["end"] for w in words)
                            for pos in range(begin, finish)
                        ):
                            raise ValueError("Incomplete PDF geometry for " + field)
                        page_number = page["number"]
                        box = [
                            min(w["box"][0] for w in words),
                            min(w["box"][1] for w in words),
                            max(w["box"][2] for w in words),
                            max(w["box"][3] for w in words),
                        ]
                    break
                page_start = limit + 2
            if box is None:
                raise ValueError("Missing PDF geometry for " + field)
        eid = "e-" + field
        document["evidence"].append(
            {
                "id": eid,
                "fieldId": field,
                "sourceSpan": text[begin:finish],
                "spanStart": begin,
                "spanEnd": finish,
                "page": page_number,
                "box": box,
                "roleId": role,
                "origin": "pdf",
            }
        )
        return [eid]

    def block(field, value, role=None, start=0, end=None):
        return {
            "id": field,
            "text": _key(value),
            "evidenceIds": attach(field, value, role, start, end),
        }

    header = details.get("header") or {}
    personal = details.get("personalDetails") or {}
    links = personal.get("links", header.get("links", []))
    linkedin = next((link for link in links if "linkedin.com/" in link.lower()), "")
    github = next((link for link in links if "github.com/" in link.lower()), "")
    info = {
        "id": "personal",
        "name": personal.get("fullName") or header.get("name", ""),
        "title": personal.get("title") or header.get("title", ""),
        "email": personal.get("email") or header.get("email", ""),
        "phone": personal.get("phoneNumber") or header.get("phone", ""),
        "linkedin": linkedin,
        "github": github,
        "location": personal.get("location") or header.get("location", ""),
        "extraContacts": list(
            dict.fromkeys(
                [
                    *header.get("additional_contacts", []),
                    *(link for link in links if link not in {linkedin, github}),
                    *(
                        value
                        for value in header.get("emails", [])
                        if value != (personal.get("email") or header.get("email"))
                    ),
                    *(
                        value
                        for value in header.get("phones", [])
                        if value != (personal.get("phoneNumber") or header.get("phone"))
                    ),
                ]
            )
        ),
    }
    # Contact link targets without visible text cannot carry exact-span evidence.
    # Reject rather than claim a target was extracted from the visible PDF text.
    document["personalInfo"] = info
    header_end = len(text)
    section_values = [
        details.get(key)
        for key in (
            "summary",
            "skills",
            "experience_text",
            "projects",
            "education",
            "certifications",
            "awards",
            "publications",
            "volunteering",
            "languages",
            "interests",
            "achievements",
            "training",
            "research",
            "leadership",
            "additional_information",
            "mentoring",
            "community",
        )
    ]
    section_values.extend(details.get("other_sections", {}).values())
    for raw in section_values:
        if isinstance(raw, str) and raw.strip():
            hits = _matches(text, raw)
            if hits:
                header_end = min(header_end, hits[0].start())
    for key, value in info.items():
        if key != "id":
            if isinstance(value, list):
                for i, item in enumerate(value):
                    attach("personal." + key, item, end=header_end)
                    document["evidence"][-1]["id"] += "-" + str(i)
            else:
                attach("personal." + key, value, end=header_end)

    # Source section windows prevent the same sentence in another role/section
    # from being accepted as evidence for this field.
    def window(raw):
        hits = _matches(text, raw)
        if len(hits) != 1:
            raise ValueError("Section is missing or ambiguous")
        return hits[0].start(), hits[0].end()

    summary = details.get("summary", "")
    if summary:
        begin, finish = window(summary)
        document["summary"] = [block("summary-1", summary, start=begin, end=finish)]
    raw_skills = details.get("skills", "")
    if raw_skills:
        begin, finish = window(raw_skills)
        # Reuse the existing atomic skill parser: commas inside parentheses do
        # not split display blocks, and original category ownership stays intact.
        groups = _skill_categories(raw_skills)
        cursor = begin
        for i, (category, items) in enumerate(groups.items(), 1):
            sid = "skills-" + str(i)
            entry = {"id": sid, "category": category, "items": []}
            if category:
                hits = _matches(text, category, cursor, finish)
                if not hits:
                    raise ValueError("Missing skill category")
                cat_start = cursor + hits[0].start()
                attach(
                    sid + ".category",
                    category,
                    start=cat_start,
                    end=cat_start + len(hits[0].group()),
                )
            for j, item in enumerate(items, 1):
                hits = _matches(text, item, cursor, finish)
                if not hits:
                    raise ValueError("Missing skill display block")
                left = cursor + hits[0].start()
                right = cursor + hits[0].end()
                entry["items"].append(block(sid + "-" + str(j), item, start=left, end=right))
                cursor = right
            document["skills"].append(entry)

    roles = details.get("experience", [])
    if isinstance(roles, str):
        raise ValueError("Employment structure is ambiguous")
    if roles:
        begin, finish = window(details.get("experience_text", ""))
        anchors = []
        cursor = begin
        for role in roles:
            company, title = role.get("company", ""), role.get("title", "")
            if not company or not title or not role.get("bullets"):
                raise ValueError("Employment role/company association is incomplete")
            companies = _matches(text, company, cursor, finish)
            titles = _matches(text, title, cursor, finish)
            pairs = [
                (cursor + c.start(), cursor + t.start())
                for c in companies
                for t in titles
                if abs(c.start() - t.start()) < 300
                and "\n- "
                not in text[cursor + min(c.start(), t.start()) : cursor + max(c.start(), t.start())]
            ]
            if not pairs:
                raise ValueError("Employment role/company association is ambiguous")
            left, right = min(pairs, key=lambda pair: min(pair))
            anchors.append(min(left, right))
            cursor = max(left + len(company), right + len(title))
        for i, role in enumerate(roles):
            sid = "role-" + str(i + 1)
            start = anchors[i]
            end = anchors[i + 1] if i + 1 < len(roles) else finish
            first = _matches(text, role["bullets"][0], start, end)
            if not first:
                raise ValueError("Employment bullets are ambiguous")
            header_end = start + first[0].start()
            entry = {
                "id": sid,
                "company": role["company"],
                "role": role["title"],
                "location": role.get("location", ""),
                "duration": role.get("dates", ""),
                "bullets": [],
            }
            for key in ("company", "role", "location", "duration"):
                attach(sid + "." + key, entry[key], sid, start, header_end)
            cursor = header_end
            for j, value in enumerate(role["bullets"], 1):
                hits = _matches(text, value, cursor, end)
                if not hits:
                    raise ValueError("Missing role bullet")
                left = cursor + hits[0].start()
                right = cursor + hits[0].end()
                entry["bullets"].append(block(sid + "-bullet-" + str(j), value, sid, left, right))
                cursor = right
            document["experience"].append(entry)

    # Project headings are structural source text; do not infer dates or stacks.
    raw_projects = details.get("projects", "")
    if raw_projects and re.match(r"^\s*[•●◦*\-]\s+", raw_projects):
        begin, finish = window(raw_projects)
        starts = list(re.finditer(r"(?m)^[ \t]*[•●◦*\-]\s+", raw_projects))
        for i, marker in enumerate(starts):
            end = starts[i + 1].start() if i + 1 < len(starts) else len(raw_projects)
            paragraph = raw_projects[marker.end() : end].strip()
            depth = 0
            colon = None
            for j, char in enumerate(paragraph):
                depth += char == "("
                depth -= char == ")"
                if char == ":" and depth == 0:
                    colon = j
                    break
            if colon is None:
                raise ValueError("Inline project title/body association is ambiguous")
            title = paragraph[:colon].strip()
            description = paragraph[colon + 1 :].strip()
            hits = _matches(text, paragraph, begin, finish)
            if len(hits) != 1 or not title or not description:
                raise ValueError("Inline project evidence is ambiguous")
            left = begin + hits[0].start()
            right = begin + hits[0].end()
            sid = "project-" + str(i + 1)
            entry = {
                "id": sid,
                "title": _key(title),
                "technologies": [],
                "duration": "",
                "bullets": [],
            }
            attach(sid + ".title", title, sid, left, left + colon)
            body_start = left + paragraph.index(description, colon + 1)
            cuts = [
                body_start,
                *[p["start"] for p in pages if body_start < p.get("start", 0) < right],
                right,
            ]
            for j, (a, b) in enumerate(zip(cuts, cuts[1:]), 1):
                value = text[a:b].strip()
                if value:
                    a += len(text[a:b]) - len(text[a:b].lstrip())
                    entry["bullets"].append(
                        block(sid + "-bullet-" + str(j), value, sid, a, a + len(value))
                    )
            document["projects"].append(entry)
        raw_projects = ""
    if raw_projects:
        begin, finish = window(raw_projects)
        current = None
        cursor = begin
        separated = False
        records = []
        for raw in raw_projects.splitlines():
            value = raw.strip()
            if not value:
                separated = True
                continue
            hits = _matches(text, value, cursor, finish)
            if not hits:
                raise ValueError("Missing project text")
            left = cursor + hits[0].start()
            right = cursor + hits[0].end()
            cursor = right
            marker = re.match(r"^[•●◦*\-]\s*", value)
            if marker and current is None:
                raise ValueError("Project has no associated title")
            elif marker:
                current["bullets"].append([left + marker.end(), right])
            elif current is None or (separated and current["bullets"]):
                current = {"start": left, "end": right, "bullets": []}
                records.append(current)
            elif current["bullets"]:
                if (
                    len(value.split()) <= 8
                    and value[0].isupper()
                    and not re.search(r"[.!?]$", value)
                ):
                    raise ValueError("Project title or bullet continuation is ambiguous")
                current["bullets"][-1][1] = right
            elif len(value.split()) >= 8 or re.search(r"[.!?]$", value):
                current["bullets"].append([left, right])
            else:
                current["end"] = right
            separated = False
        for i, record in enumerate(records, 1):
            if not record["bullets"]:
                raise ValueError("Project associations are ambiguous")
            sid = "project-" + str(i)
            title = text[record["start"] : record["end"]]
            entry = {
                "id": sid,
                "title": _key(title),
                "technologies": [],
                "duration": "",
                "bullets": [],
            }
            attach(sid + ".title", title, sid, record["start"], record["end"])
            for j, (left, right) in enumerate(record["bullets"], 1):
                entry["bullets"].append(
                    block(sid + "-bullet-" + str(j), text[left:right], sid, left, right)
                )
            document["projects"].append(entry)

    education = details.get("educationHistory", [])
    raw_education = details.get("education", "")
    if raw_education and not education:
        raise ValueError("Education structure is ambiguous")
    if education:
        begin, finish = window(raw_education)
        cursor = begin
        for i, item in enumerate(education, 1):
            sid = "education-" + str(i)
            entry = {
                "id": sid,
                "institution": item.get("college", ""),
                "degree": item.get("degree", ""),
                "location": item.get("location", ""),
                "duration": item.get("dates", ""),
                "details": [],
            }
            if not entry["institution"] or not entry["degree"]:
                raise ValueError("Education institution/degree association is incomplete")
            # Preserve the exact detected date string, never join/invent dates.
            for key in ("institution", "degree", "location", "duration"):
                attach(sid + "." + key, entry[key], start=cursor, end=finish)
            evidence = [
                e
                for e in document["evidence"]
                if e["fieldId"].startswith(sid + ".") or e["fieldId"].startswith(sid + "-")
            ]
            # Preserve remaining literal source fragments instead of flattening
            # separate coursework/grade rows into an invented contiguous span.
            next_start = finish
            if i < len(education):
                next_item = education[i]
                candidates = [
                    cursor + m.start()
                    for name in ("college", "degree")
                    for m in _matches(text, next_item.get(name, ""), cursor, finish)
                ]
                if candidates:
                    next_start = min(candidates)
            removed = [(e["spanStart"], e["spanEnd"]) for e in evidence]
            for row in re.finditer(r"[^\n]+", text[cursor:next_start]):
                segments = [(cursor + row.start(), cursor + row.end())]
                for left, right in removed:
                    segments = [
                        part
                        for a, b in segments
                        for part in ((a, min(b, left)), (max(a, right), b))
                        if part[0] < part[1]
                    ]
                for left, right in segments:
                    raw = text[left:right]
                    value = re.sub(r"^[\s•●◦*|]+|[\s|]+$", "", raw)
                    if not value or not re.search(r"\w", value):
                        continue
                    offset = left + raw.find(value)
                    entry["details"].append(
                        block(
                            sid + "-detail-" + str(len(entry["details"]) + 1),
                            value,
                            start=offset,
                            end=offset + len(value),
                        )
                    )
            cursor = next_start
            document["education"].append(entry)
    extras = {
        key: value
        for key, value in details.items()
        if key
        in {
            "certifications",
            "awards",
            "publications",
            "volunteering",
            "languages",
            "interests",
            "achievements",
            "training",
            "research",
            "leadership",
            "additional_information",
            "mentoring",
            "community",
        }
        and value
    }
    extras.update(details.get("other_sections", {}))
    for i, (title, value) in enumerate(extras.items(), 1):
        sid = "additional-" + str(i)
        begin, finish = window(value)
        # The original heading itself is source-backed.
        heading = re.search(r"[^\n]+$", text[:begin].rstrip())
        if not heading:
            raise ValueError("Additional section heading is ambiguous")
        visible = heading.group().strip()
        left = heading.start() + len(heading.group()) - len(heading.group().lstrip())
        attach(sid + ".title", visible, start=left, end=left + len(visible))
        document["additionalSections"].append(
            {
                "id": sid,
                "title": visible,
                "items": [block(sid + "-1", value, start=begin, end=finish)],
            }
        )
    positions = {}
    for key in ("summary", "skills", "experience", "projects", "education"):
        if not document[key]:
            continue
        group_ids = {g["id"] for g in document[key]}
        block_ids = {
            b["id"]
            for b, _ in _blocks(
                {
                    **document,
                    **{
                        other: []
                        for other in (
                            "summary",
                            "skills",
                            "experience",
                            "projects",
                            "education",
                            "additionalSections",
                        )
                        if other != key
                    },
                }
            )
        }
        positions[key] = min(
            e["spanStart"]
            for e in document["evidence"]
            if e["fieldId"] in block_ids or e["fieldId"].split(".")[0] in group_ids
        )
    for group in document["additionalSections"]:
        positions[group["id"]] = min(
            e["spanStart"] for e in document["evidence"] if e["fieldId"] == group["id"] + ".title"
        )
    document["sectionOrder"] = sorted(positions, key=positions.get)
    return validate_document(document)


def _skill_categories(raw):
    """Atomic comma splitting, shared by the dependency-free import bundle."""
    result = {}
    categories = list(re.finditer(r"(?m)^\s*([^:\n]{1,80})\s*:\s*", raw))
    sections = []
    if not categories:
        sections = [("", raw)]
    else:
        if raw[: categories[0].start()].strip():
            raise ValueError("Unassociated skills before category")
        for n, match in enumerate(categories):
            sections.append(
                (
                    match[1].strip(),
                    raw[
                        match.end() : categories[n + 1].start()
                        if n + 1 < len(categories)
                        else len(raw)
                    ],
                )
            )
    for category, line in sections:
        result.setdefault(category, [])
        depth = 0
        start = 0
        for i, char in enumerate(line + ","):
            depth += char == "("
            depth -= char == ")"
            if depth < 0:
                raise ValueError("Unbalanced skill grouping")
            if char in ",;" and depth == 0:
                if line[start:i].strip():
                    result[category].append(line[start:i].strip())
                start = i + 1
        if depth:
            raise ValueError("Unbalanced skill grouping")
    return result


def document_markdown(document: dict) -> str:
    value = validate_document(document)
    p = value["personalInfo"]
    lines = ["# " + p["name"]]
    if p["title"]:
        lines.append(p["title"])
    contacts = [p[k] for k in ("email", "phone", "linkedin", "github", "location") if p[k]] + p[
        "extraContacts"
    ]
    if contacts:
        lines.append(" | ".join(contacts))
    extras = {group["id"]: group for group in value["additionalSections"]}
    for section in value["sectionOrder"]:
        lines.append("")
        if section in extras:
            group = extras[section]
            lines.extend(["## " + group["title"], *(b["text"] for b in group["items"])])
        elif section == "summary":
            lines.extend(["## Professional Summary", *("- " + b["text"] for b in value[section])])
        elif section == "skills":
            lines.extend(
                [
                    "## Skills",
                    *(
                        g["category"] + " : " + ", ".join(b["text"] for b in g["items"])
                        for g in value[section]
                    ),
                ]
            )
        elif section == "experience":
            lines.append("## Experience")
            for group in value[section]:
                lines.append(
                    "### "
                    + " | ".join(
                        group[k] for k in ("role", "company", "duration", "location") if group[k]
                    )
                )
                lines.extend("- " + b["text"] for b in group["bullets"])
        elif section == "projects":
            lines.append("## Projects")
            for group in value[section]:
                lines.append("### " + group["title"])
                if group["technologies"]:
                    lines.append(", ".join(group["technologies"]))
                if group["duration"]:
                    lines.append(group["duration"])
                lines.extend("- " + b["text"] for b in group["bullets"])
        elif section == "education":
            lines.append("## Education")
            for group in value[section]:
                lines.append(
                    " | ".join(
                        group[k]
                        for k in ("institution", "degree", "duration", "location")
                        if group[k]
                    )
                )
                lines.extend(b["text"] for b in group["details"])
    return "\n".join(lines).strip() + "\n"


def source_from_document(document, original_text):
    """Adapt canonical evidence to the existing generator without Markdown parsing."""
    from .models import ResumeSource, SourceFact, SourceGroup

    original_text = original_text.replace("\r\n", "\n").replace("\r", "\n")
    value = validate_document(document)
    if value["source"]["textSha256"] != text_hash(original_text):
        raise ValueError("Canonical source text hash does not match original resume")
    for e in value["evidence"]:
        if original_text[e["spanStart"] : e["spanEnd"]] != e["sourceSpan"]:
            raise ValueError("Canonical source evidence does not match original text")
        if e["origin"] != "pdf" or e["page"] is None or e["box"] is None:
            raise ValueError("Canonical PDF source evidence requires page geometry")
    for field, supplied, _ in _fields(value):
        for display in supplied if isinstance(supplied, list) else [supplied]:
            if display and not any(
                e["fieldId"] == field and _key(e["sourceSpan"]) == _key(display)
                for e in value["evidence"]
            ):
                raise ValueError("Canonical source field is not supported by its exact evidence")
    for block, _ in _blocks(value):
        if not any(
            e["id"] in block["evidenceIds"] and _key(e["sourceSpan"]) == _key(block["text"])
            for e in value["evidence"]
        ):
            raise ValueError("Canonical source block is not supported by its exact evidence")
    facts = []
    protected = []
    preamble = []
    education = []
    preserved = []
    blocks = {b["id"]: b for b, _ in _blocks(value)}
    for e in value["evidence"]:
        field = e["fieldId"]
        prefix, _, suffix = field.partition(".")
        kind = "other"
        is_protected = False
        if prefix == value["personalInfo"]["id"]:
            kind = "identity"
            is_protected = True
            preamble.append(e["id"])
        elif prefix in {g["id"] for g in value["experience"]}:
            kind = {
                "role": "title",
                "company": "employer",
                "duration": "date",
                "location": "role_header",
            }[suffix]
            is_protected = True
        elif prefix in {g["id"] for g in value["projects"]}:
            kind = "project_header"
            is_protected = True
        elif prefix in {g["id"] for g in value["education"]}:
            kind = "education"
            is_protected = True
            education.append(e["id"])
        elif prefix in {g["id"] for g in value["skills"]}:
            kind = "other"
        elif field in blocks:
            if e["roleId"] in {g["id"] for g in value["experience"]}:
                kind = "responsibility"
            elif e["roleId"] in {g["id"] for g in value["projects"]}:
                kind = "project_detail"
            elif any(field in {b["id"] for b in g["items"]} for g in value["skills"]):
                kind = "skill"
            elif any(field in {b["id"] for b in g["details"]} for g in value["education"]):
                kind = "education"
                is_protected = True
                education.append(e["id"])
            elif any(field in {b["id"] for b in g["items"]} for g in value["additionalSections"]):
                preserved.append(e["id"])
                is_protected = True
        if is_protected:
            protected.append(e["id"])
        facts.append(
            SourceFact(
                fact_id=e["id"],
                kind=kind,
                source_span=e["sourceSpan"],
                span_start=e["spanStart"],
                span_end=e["spanEnd"],
                role_or_project_id=e["roleId"] or "",
                ownership_level="lead"
                if re.search(r"\b(?:led|owned|architected)\b", e["sourceSpan"], re.I)
                else "contributor"
                if kind in {"responsibility", "project_detail"}
                else "none",
                protected=is_protected,
            )
        )
        if kind in {"responsibility", "project_detail", "other"}:
            from .source import _metrics

            for i, match in enumerate(_metrics(e["sourceSpan"]), 1):
                facts.append(
                    SourceFact(
                        fact_id=e["id"] + "-metric-" + str(i),
                        kind="metric",
                        source_span=match.group(),
                        span_start=e["spanStart"] + match.start(),
                        span_end=e["spanStart"] + match.end(),
                        role_or_project_id=e["roleId"] or "",
                        ownership_level="none",
                    )
                )

    def groups(section, body):
        return [
            SourceGroup(
                group_id=g["id"],
                header_fact_ids=[
                    e["id"]
                    for e in value["evidence"]
                    if e["roleId"] == g["id"] and e["fieldId"].startswith(g["id"] + ".")
                ],
                body_fact_ids=[eid for b in g[body] for eid in b["evidenceIds"]],
            )
            for g in value[section]
        ]

    evidence_by_id = {e["id"]: e for e in value["evidence"]}
    return ResumeSource(
        original_hash=text_hash(original_text),
        normalized_hash=text_hash(_key(original_text)),
        facts=facts,
        protected_fact_ids=protected,
        preamble_fact_ids=preamble,
        roles=groups("experience", "bullets"),
        projects=groups("projects", "bullets"),
        education_fact_ids=education,
        preserved_fact_ids=preserved,
        ambiguous_blocks=[],
        skill_categories={
            g["category"] or "Technical": [
                evidence_by_id[b["evidenceIds"][0]]["sourceSpan"] for b in g["items"]
            ]
            for g in value["skills"]
        },
        has_summary=bool(value["summary"]),
        section_order=[
            s if s in {"summary", "skills", "experience", "projects", "education"} else "preserved"
            for s in value["sectionOrder"]
        ],
    )


def generated_document(draft, source, source_document=None) -> dict:
    """Copy protected source values and attach the writer's existing fact citations."""
    if source_document is None:
        raise ValueError("Certified generation requires a canonical source document")
    original = validate_document(source_document)
    result = copy.deepcopy(original)
    result["id"] = "generated-" + original["source"]["revision"]
    facts = {fact.fact_id: fact for fact in source.facts}
    result["summary"] = []
    result["experience"] = []
    result["projects"] = []
    result["skills"] = []
    # Retain only evidence for copied fields, then add generated blocks below.
    keep = {field for field, _, _ in _fields(result)} | {b["id"] for b, _ in _blocks(result)}
    result["evidence"] = [e for e in result["evidence"] if e["fieldId"] in keep]
    source_evidence = original["evidence"]

    def citations(field, fact_ids, role=None):
        ids = []
        for i, fid in enumerate(dict.fromkeys(fact_ids)):
            if fid not in facts:
                raise ValueError("Unknown generated evidence: " + fid)
            fact = facts[fid]
            if fact.source_document != "resume":
                raise ValueError("External project evidence is not part of the validated import")
            if role and fact.role_or_project_id != role:
                raise ValueError("Generated claim cites another role")
            matches = [
                e
                for e in source_evidence
                if e["spanStart"] <= fact.span_start
                and fact.span_end <= e["spanEnd"]
                and e["roleId"] == (fact.role_or_project_id or None)
            ]
            if not matches:
                raise ValueError("Generated evidence has no validated source geometry")
            # A derived tool/metric has exact fact offsets but no independent
            # PDF box in the canonical schema. Cite its containing original
            # evidence span and box together, retaining the source role.
            e = copy.deepcopy(matches[0])
            e.update(id="e-" + field + "-" + str(i), fieldId=field)
            result["evidence"].append(e)
            ids.append(e["id"])
        if not ids:
            raise ValueError("Generated field has no source evidence")
        return ids

    def bullet(field, item, role=None):
        return {
            "id": field,
            "text": item.text,
            "evidenceIds": citations(field, item.fact_ids, role),
        }

    result["summary"] = [bullet("summary-" + str(i), b) for i, b in enumerate(draft.summary, 1)]
    for section, id_attr in (("experience", "role_id"), ("projects", "project_id")):
        groups = {g["id"]: g for g in original[section]}
        for group in getattr(draft, section):
            sid = getattr(group, id_attr)
            if sid not in groups:
                raise ValueError("Generated role/project is not in the validated source")
            entry = copy.deepcopy(groups[sid])
            entry["bullets"] = []
            for e in source_evidence:
                if e["fieldId"].startswith(sid + "."):
                    result["evidence"].append(copy.deepcopy(e))
            entry["bullets"] = [
                bullet(sid + "-bullet-" + str(i), b, sid) for i, b in enumerate(group.bullets, 1)
            ]
            result[section].append(entry)
    planned = [(group.category, group.items) for group in draft.skills]
    if len(original["skills"]) == 1 and not original["skills"][0]["category"]:
        planned = [
            ("", list(dict.fromkeys(item for group in draft.skills for item in group.items)))
        ]
    for category, items in planned:
        originals = [
            g for g in original["skills"] if g["category"].casefold() == category.casefold()
        ]
        if len(originals) != 1:
            raise ValueError("Generated skills category lacks source ownership")
        prior = originals[0]
        sid = prior["id"]
        entry = {"id": sid, "category": prior["category"], "items": []}
        result["evidence"].extend(
            copy.deepcopy(e) for e in source_evidence if e["fieldId"] == sid + ".category"
        )
        for j, item in enumerate(items, 1):
            existing = next(
                (b for b in prior["items"] if _key(b["text"]).casefold() == _key(item).casefold()),
                None,
            )
            if existing:
                entry["items"].append(copy.deepcopy(existing))
                result["evidence"].extend(
                    copy.deepcopy(e) for e in source_evidence if e["id"] in existing["evidenceIds"]
                )
            else:
                ids = [
                    f.fact_id
                    for f in source.facts
                    if f.kind in {"skill", "tool"}
                    and _key(f.source_span).casefold() == _key(item).casefold()
                ]
                field = sid + "-added-" + str(j)
                entry["items"].append(
                    {"id": field, "text": item, "evidenceIds": citations(field, ids[:1])}
                )
        result["skills"].append(entry)
    present = {
        key for key in ("summary", "skills", "experience", "projects", "education") if result[key]
    } | {g["id"] for g in result["additionalSections"]}
    result["sectionOrder"] = [s for s in original["sectionOrder"] if s in present]
    result["sectionOrder"].extend(
        s
        for s in ("summary", "skills", "experience", "projects", "education")
        if s in present and s not in result["sectionOrder"]
    )
    return validate_document(result)


def validate_edited_document(document: dict, source_document: dict, audit: dict) -> list[dict]:
    """No mutation or model calls. Unknown wording requires explicit semantic review.

    audit is server-owned persisted generation output. Exact already-reviewed
    claims and exact source-backed edits pass; uncertain factual edits block.
    """
    issues = []

    def issue(code, message, field=""):
        issues.append({"code": code, "message": message, "fieldId": field})

    try:
        value = validate_document(document)
        source = validate_document(source_document)
    except (ValueError, TypeError) as error:
        issue("document.schema", str(error))
        return issues
    baseline = audit.get("resume_document")
    if not isinstance(baseline, dict):
        issue("audit.missing", "A trusted generated document audit is required.")
        return issues
    try:
        baseline = validate_document(baseline)
    except ValueError:
        issue("audit.invalid", "The stored generation audit is invalid.")
        return issues
    if audit.get("status") not in {"completed", "completed_with_estimates"}:
        issue("audit.failed", "Generation did not pass required validation.")
    checks = audit.get("compliance_ledger")
    if not isinstance(checks, list) or not checks:
        issue("audit.missing_checks", "Required factual validation is missing.")
    elif any(not c.get("passed") and c.get("severity") == "error" for c in checks):
        issue("audit.failed_checks", "A required validation check failed; review cannot waive it.")
    if value["source"] != source["source"] or baseline["source"] != source["source"]:
        issue("source.changed", "Source identity and hashes must match the validated import.")
    if audit.get("source_document") != source:
        issue("audit.source", "The generation audit is not bound to this source document.")
    if value["id"] != baseline["id"]:
        issue("document.identity", "Document identity must stay stable.")
    if {k: v for k, v in value["personalInfo"].items() if k != "title"} != {
        k: v for k, v in source["personalInfo"].items() if k != "title"
    }:
        issue(
            "protected.identity",
            "Personal information must match the validated source.",
            source["personalInfo"]["id"],
        )

    def title_check(field, text):
        if not text.strip() or not any(
            e["fieldId"] == field and _matches(e["sourceSpan"], text) for e in source["evidence"]
        ):
            issue(
                "claim.uncertain",
                "Edited title needs explicit support from the same source title field.",
                field,
            )

    if value["personalInfo"]["title"] != source["personalInfo"]["title"]:
        title_check(value["personalInfo"]["id"] + ".title", value["personalInfo"]["title"])
    for section, body in (
        ("experience", "bullets"),
        ("projects", "bullets"),
        ("education", "details"),
        ("additionalSections", "items"),
        ("skills", "items"),
    ):
        originals = {g["id"]: g for g in source[section]}
        prior = {g["id"]: g for g in baseline[section]}
        if [g["id"] for g in value[section]] != [g["id"] for g in baseline[section]]:
            issue("document.ids", "Section IDs/order must stay stable during edits.", section)
        for group in value[section]:
            original = originals.get(group["id"])
            editable = (
                "role" if section == "experience" else "title" if section == "projects" else None
            )
            excluded = {body, editable}
            if not original or {k: v for k, v in group.items() if k not in excluded} != {
                k: v for k, v in original.items() if k not in excluded
            }:
                issue("protected.field", "Protected source fields cannot change.", group["id"])
            if editable and original and group[editable] != original[editable]:
                title_check(group["id"] + "." + editable, group[editable])
            if group["id"] in prior and [b["id"] for b in group[body]] != [
                b["id"] for b in prior[group["id"]][body]
            ]:
                issue("document.ids", "Block IDs/order must stay stable during edits.", group["id"])
    if [b["id"] for b in value["summary"]] != [b["id"] for b in baseline["summary"]]:
        issue("document.ids", "Summary IDs must stay stable.", "summary")
    source_ev = source["evidence"]
    previous = {b["id"]: b for b, _ in _blocks(baseline)}
    prior_ev = {e["id"]: e for e in baseline["evidence"]}
    for e in value["evidence"]:
        prior = prior_ev.get(e["id"])
        if prior != e:
            issue(
                "evidence.changed", "Evidence cannot be changed by a document edit.", e["fieldId"]
            )
        if not any(
            s["spanStart"] == e["spanStart"]
            and e["spanEnd"] == s["spanEnd"]
            and s["sourceSpan"] == e["sourceSpan"]
            and s["page"] == e["page"]
            and s["box"] == e["box"]
            and s["roleId"] == e["roleId"]
            for s in source_ev
        ):
            issue(
                "evidence.untrusted", "Evidence is not bound to the validated source.", e["fieldId"]
            )
    ev = {e["id"]: e for e in value["evidence"]}
    for block, role in _blocks(value):
        prior = previous.get(block["id"])
        if (
            prior
            and block["evidenceIds"] == prior["evidenceIds"]
            and _key(block["text"]) == _key(prior["text"])
        ):
            continue
        spans = [ev[eid]["sourceSpan"] for eid in block["evidenceIds"]]
        if not block["text"].strip() or not any(
            _key(block["text"]) == _key(span) for span in spans
        ):
            issue(
                "claim.uncertain",
                "Changed wording needs factual review against its cited source before publication.",
                block["id"],
            )
    return issues


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Validate a canonical edit without model calls or charging."
    )
    parser.add_argument("--validate-document-file", required=True, type=Path)
    parser.add_argument("--source-document", required=True, type=Path)
    parser.add_argument("--audit", required=True, type=Path)
    args = parser.parse_args(argv)
    try:
        issues = validate_edited_document(
            json.loads(args.validate_document_file.read_text(encoding="utf-8-sig")),
            json.loads(args.source_document.read_text(encoding="utf-8-sig")),
            json.loads(args.audit.read_text(encoding="utf-8-sig")),
        )
    except (OSError, ValueError, TypeError) as error:
        issues = [{"code": "document.input", "message": str(error), "fieldId": ""}]
    print(json.dumps({"valid": not issues, "issues": issues}, ensure_ascii=False, sort_keys=True))
    return 1 if issues else 0


if __name__ == "__main__":
    raise SystemExit(main())
