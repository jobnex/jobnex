"""Local project catalog shortlist; the existing mapper makes the final choice."""

from __future__ import annotations

import math
import re
from collections import Counter

from .models import CriticStrategy, JobAnalysis, ResumeSource, SourceFact, SourceGroup
from .source import _metrics, _ownership, fact_map, normalize_document, sha256_text

STOPWORDS = set(
    [
        "a",
        "an",
        "and",
        "are",
        "as",
        "at",
        "be",
        "build",
        "built",
        "by",
        "can",
        "create",
        "created",
        "data",
        "design",
        "designed",
        "develop",
        "developed",
        "engineer",
        "engineering",
        "for",
        "from",
        "have",
        "implement",
        "implemented",
        "in",
        "including",
        "into",
        "is",
        "it",
        "of",
        "on",
        "or",
        "project",
        "projects",
        "scalable",
        "system",
        "systems",
        "that",
        "the",
        "their",
        "this",
        "to",
        "using",
        "used",
        "with",
        "work",
        "will",
        "experience",
        "knowledge",
        "support",
        "through",
        "across",
        "ensure",
        "enabled",
        "enabling",
    ]
)


def terms(text: str) -> set[str]:
    return {
        word.casefold().rstrip(".")
        for word in re.findall(r"[A-Za-z][A-Za-z0-9+#.]*", text)
        if word.casefold().rstrip(".") not in STOPWORDS
    }


def parse_catalog(text: str, document: str = "project_library") -> list[dict]:
    """Parse ### titles and bullets with original-file offsets.

    Repeated titles are one project. Keep the first version to avoid blending metrics
    from variants. Role headings are tags, not separate projects.
    """
    records: dict[str, dict] = {}
    category = ""
    current = None
    for line in re.finditer(r"[^\n]+", text):
        raw = line.group().rstrip("\r")
        role = re.fullmatch(r"##\s+(.+)", raw)
        heading = re.fullmatch(r"###\s+(?:\d+[.)]\s+)?(.+)", raw)
        if role:
            category = role[1].strip()
            current = None
        elif heading:
            title = heading[1].strip()
            key = normalize_document(title).casefold()
            if key in records:
                records[key]["occurrences"] += 1
                if category not in records[key]["categories"]:
                    records[key]["categories"].append(category)
                current = None
                continue
            project_id = "catalog_" + sha256_text(key)[:16]
            start = line.start() + heading.start(1)
            fact = SourceFact(
                fact_id=project_id + "_header",
                kind="project_header",
                source_span=title,
                span_start=start,
                span_end=start + len(title),
                role_or_project_id=project_id,
                ownership_level="none",
                source_document=document,
            )
            current = {
                "project_id": project_id,
                "title": title,
                "categories": [category],
                "occurrences": 1,
                "facts": [fact],
            }
            records[key] = current
        elif current is not None:
            bullet = re.match(r"\s*[-*•\u25cf]\s+(.+)", raw)
            if not bullet:
                continue
            value = bullet[1].rstrip()
            start = line.start() + bullet.start(1)
            fact_id = current["project_id"] + f"_f{len(current['facts'])}"
            current["facts"].append(
                SourceFact(
                    fact_id=fact_id,
                    kind="project_detail",
                    source_span=value,
                    span_start=start,
                    span_end=start + len(value),
                    role_or_project_id=current["project_id"],
                    ownership_level=_ownership(value),
                    source_document=document,
                )
            )
            for index, metric in enumerate(_metrics(value)):
                current["facts"].append(
                    SourceFact(
                        fact_id=fact_id + f"_m{index}",
                        kind="metric",
                        source_span=metric.group(),
                        span_start=start + metric.start(),
                        span_end=start + metric.end(),
                        role_or_project_id=current["project_id"],
                        ownership_level="none",
                        source_document=document,
                    )
                )
    result = [r for r in records.values() if any(f.kind == "project_detail" for f in r["facts"])]
    if not result:
        raise ValueError("Project library needs ### project headings followed by - bullet evidence")
    return result


def project_library_from_source(source: ResumeSource) -> str:
    """Re-serialize the résumé's own already-extracted projects into the
    `### title` + `- bullet` catalog format parse_catalog() expects.

    No new project, no external data source: this is exactly the projects
    already on the base résumé, reshaped so the JD-relevance shortlist/
    select machinery below can run against them instead of sitting dormant
    for lack of a supplied project_library. If the caller DOES supply a
    real external library, that value is used instead and this is never
    called (see map_adjacency).
    """
    facts = fact_map(source)
    lines: list[str] = []
    has_body = False
    for group in source.projects:
        body = [facts[fact_id] for fact_id in group.body_fact_ids if fact_id in facts]
        if not body:
            continue
        has_body = True
        title = (
            facts[group.header_fact_ids[0]].source_span if group.header_fact_ids else group.group_id
        )
        lines.append(f"### {title}")
        lines.extend(f"- {fact.source_span}" for fact in body)
    return "\n".join(lines) if has_body else ""


def shortlist(
    records: list[dict], analysis: JobAnalysis, limit: int = 6, job_description: str = ""
) -> list[dict]:
    def normalized_words(value):
        value = value.casefold()
        value = re.sub(r"\b([a-z]{5,})ing\b", r"\1", value)
        return re.sub(r"\b([a-z]{3,})s\b", r"\1", value)

    role_context = normalized_words(
        job_description or " ".join(r.text for r in analysis.requirements)
    )
    vocab = [terms(r["title"] + " " + " ".join(f.source_span for f in r["facts"])) for r in records]
    frequency = Counter(word for words in vocab for word in words)
    weights = {
        word: 1 + math.log((1 + len(records)) / (1 + count)) for word, count in frequency.items()
    }
    requirements = [(r, terms(r.text + " " + r.evidence_span)) for r in analysis.requirements]
    ranked = []
    for record, words in zip(records, vocab, strict=True):
        evidence = normalized_words(
            normalize_document(" ".join(f.source_span for f in record["facts"]))
        )
        role_match = any(
            re.search(r"(?<!\w)" + re.escape(normalized_words(c)) + r"(?!\w)", role_context)
            for c in record["categories"]
            if c.strip()
        )

        def matching_phrases(phrases, evidence):
            return [
                p
                for p in dict.fromkeys(phrases)
                if p.strip()
                and re.search(
                    r"(?<!\w)" + re.escape(normalized_words(normalize_document(p))) + r"(?!\w)",
                    evidence,
                    re.I,
                )
            ]

        matched_tools = matching_phrases(analysis.requested_tools, evidence)
        matched_terms = matching_phrases(analysis.ats_terms, evidence)
        features = {
            "tool:" + t.casefold(): (0.5 if t.casefold() in {"aws", "azure", "gcp"} else 2.0)
            for t in matched_tools
        }
        features.update({"term:" + t.casefold(): 3.0 for t in matched_terms})
        scores = {}
        for requirement, wanted in requirements:
            overlap = wanted & words
            score = sum(weights.get(w, 1) for w in overlap) / max(
                sum(weights.get(w, 1) for w in wanted), 1
            )
            if score:
                scores[requirement.requirement_id] = (
                    score * {"must": 3, "preferred": 2, "context": 1}[requirement.priority]
                )
        ranked.append(
            {
                **record,
                "score": round(sum(scores.values()) + sum(features.values()), 4),
                "matches": scores,
                "features": features,
                "matched_tools": matched_tools,
                "matched_terms": matched_terms,
                "role_match": role_match,
            }
        )
    # Lexical ranks are hints, not ATS scores or proof of semantic coverage.
    chosen = []
    covered = set()
    while ranked and len(chosen) < limit:
        best = max(
            ranked,
            key=lambda r: (
                4 * r["role_match"]
                + 0.25 * r["score"]
                + sum(v for k, v in r["features"].items() if k not in covered),
                r["score"],
                r["project_id"],
            ),
        )
        ranked.remove(best)
        chosen.append(best)
        covered.update(best["features"])
    return chosen


def replace_projects(
    source: ResumeSource, records: list[dict], analysis: JobAnalysis
) -> ResumeSource:
    old_ids = {group.group_id for group in source.projects}
    facts = [f for f in source.facts if f.role_or_project_id not in old_ids]
    groups = []
    for record in records:
        project_facts = list(record["facts"])
        # Exact JD-requested tool spans let selected projects enrich Skills too.
        for tool in dict.fromkeys(analysis.requested_tools):
            if not tool.strip():
                continue
            for fact in record["facts"]:
                match = re.search(r"(?<!\w)" + re.escape(tool) + r"(?!\w)", fact.source_span, re.I)
                if fact.kind == "project_detail" and match:
                    project_facts.append(
                        fact.model_copy(
                            update={
                                "fact_id": record["project_id"] + "_tool_" + sha256_text(tool)[:12],
                                "kind": "tool",
                                "source_span": match.group(),
                                "span_start": fact.span_start + match.start(),
                                "span_end": fact.span_start + match.end(),
                                "ownership_level": "none",
                            }
                        )
                    )
                    break
        facts.extend(project_facts)
        groups.append(
            SourceGroup(
                group_id=record["project_id"],
                header_fact_ids=[f.fact_id for f in project_facts if f.kind == "project_header"],
                body_fact_ids=[f.fact_id for f in project_facts if f.kind == "project_detail"],
            )
        )
    remaining = {f.fact_id for f in facts}
    return source.model_copy(
        update={
            "facts": facts,
            "projects": groups,
            "protected_fact_ids": [i for i in source.protected_fact_ids if i in remaining],
        }
    )


def select_projects(
    strategy: CriticStrategy, candidates: list[dict], analysis: JobAnalysis, source: ResumeSource
):
    by_id = {r["project_id"]: r for r in candidates}
    choices = strategy.selected_projects
    ids = [c.project_id for c in choices]
    known_requirements = {r.requirement_id for r in analysis.requirements}
    valid = (
        1 <= len(ids) <= 3
        and len(ids) == len(set(ids))
        and set(ids) <= by_id.keys()
        and all(c.reason.strip() and set(c.requirement_ids) <= known_requirements for c in choices)
    )
    covered = set()
    if valid:
        for index, choice in enumerate(choices):
            fact_ids = {
                f.fact_id for f in source.facts if f.role_or_project_id == choice.project_id
            }
            supported = {
                m.requirement_id
                for m in strategy.mappings
                if m.disposition != "gap" and fact_ids.intersection(m.fact_ids)
            }
            declared = set(choice.requirement_ids)
            if not declared or not declared <= supported or not declared - covered:
                valid = False
                break
            if index == 2:
                important = {
                    r.requirement_id for r in analysis.requirements if r.priority != "context"
                }
                if not (declared - covered) & important:
                    valid = False
                    break
            covered.update(declared)
    if valid:
        return [by_id[i] for i in ids], [c.model_dump() for c in choices], "model"
    # A bounded fallback avoids another paid call and is explicit in the audit.
    selected = []
    covered = set()
    for candidate in candidates:
        if set(candidate["matches"]) - covered:
            selected.append(candidate)
            covered.update(candidate["matches"])
        if len(selected) == 2:
            break
    if not selected and candidates:
        # Every candidate scored zero lexical overlap against this JD --
        # rare, but real (a base resume whose project vocabulary shares
        # nothing with this particular JD's wording). Left as-is, the
        # coverage-driven loop above selects nothing, and replace_projects()
        # called with an empty list deletes every project the source resume
        # had. Losing every real project because none happened to score a
        # keyword match is a worse outcome than keeping shortlist()'s own
        # best-ranked candidate even without a scored match -- shortlist()
        # already orders candidates best-first on its own weighted terms;
        # this only stops that ranking from producing zero projects.
        selected = [candidates[0]]
    decisions = [
        {
            "project_id": r["project_id"],
            "requirement_ids": list(r["matches"]),
            "reason": "Local shortlist fallback: mapper selection was missing or invalid.",
        }
        for r in selected
    ]
    return selected, decisions, "local_fallback"
