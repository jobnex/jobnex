from __future__ import annotations

import hashlib
import re
from collections import Counter
from typing import Any

from .cache import stable_json
from .models import (
    ClaimProvenance,
    ComplianceCheck,
    CriticStrategy,
    DraftBullet,
    MetricAnnotation,
    RepairOutput,
    ResumeDraft,
    ResumeSource,
    SemanticReview,
)
from .source import METRIC, fact_map

WEAK_VERB = re.compile(
    r"^(?:assisted|helped|participated|responsible\s+for|supported|tasked\s+with|worked(?:\s+on|\s+with)?)\b",
    re.IGNORECASE,
)
OWNERSHIP_VERB = re.compile(
    r"\b(?:architected|(?<!self-)directed|headed|led|managed|owned|spearheaded|supervised)\b",
    re.IGNORECASE,
)
GENERIC_SKILL_CATEGORIES = {
    "cloud",
    "data",
    "data engineering",
    "databases",
    "devops",
    "frameworks",
    "infrastructure",
    "analytics & bi",
    "languages",
    "libraries",
    "methods",
    "platforms",
    "security",
    "technical",
    "tools",
    "tools & infrastructure",
}


def check(
    code: str,
    passed: bool,
    field_path: str,
    repair_message: str,
    *,
    evidence_ids: list[str] | None = None,
    severity: str = "error",
    waiver: str = "",
) -> ComplianceCheck:
    return ComplianceCheck(
        code=code,
        passed=passed,
        severity=severity,
        field_path=field_path,
        evidence_ids=evidence_ids or [],
        repair_message="" if passed else repair_message,
        waiver=waiver,
    )


def has_errors(checks: list[ComplianceCheck]) -> bool:
    return any(not item.passed and item.severity == "error" and not item.waiver for item in checks)


def attach_metric_fact_ids(draft: ResumeDraft, source: ResumeSource) -> ResumeDraft:
    """Make an already-validated source metric part of its bullet provenance."""
    facts = fact_map(source)

    def attach(bullet: DraftBullet, group_id: str = "") -> DraftBullet:
        def cited_metric(literal: str, body_id: str = ""):
            bodies = [facts[fid] for fid in bullet.fact_ids if fid in facts
                      and facts[fid].kind in {"responsibility", "project_detail", "other"}
                      and (not body_id or fid == body_id)]
            return next((fact for fact in facts.values()
                         if fact.kind == "metric" and fact.source_span == literal
                         and (not group_id or fact.role_or_project_id in {"", group_id})
                         and any(body.span_start <= fact.span_start
                                 and fact.span_end <= body.span_end
                                 and body.role_or_project_id == fact.role_or_project_id
                                 for body in bodies)), None)

        metrics = []
        literals = {match.group() for match in METRIC.finditer(bullet.text)}
        for metric in bullet.metrics:
            cited = facts.get(metric.fact_id)
            if (metric.origin == "source" and cited and cited.kind == "metric"
                    and metric.literal not in literals and cited.source_span in literals
                    and cited_metric(cited.source_span) == cited):
                metric = metric.model_copy(update={"literal": cited.source_span})
            if metric.origin == "source" and cited and cited.kind in {
                "responsibility", "project_detail", "other"
            }:
                exact = cited_metric(metric.literal, metric.fact_id)
                if exact:
                    metric = metric.model_copy(update={"fact_id": exact.fact_id})
            metrics.append(metric)
        annotated = {metric.literal for metric in metrics}
        for match in METRIC.finditer(bullet.text):
            literal = match.group()
            if literal not in annotated:
                exact = cited_metric(literal)
                if exact:
                    metrics.append(MetricAnnotation(literal=literal, origin="source",
                                                    fact_id=exact.fact_id))
                    annotated.add(literal)
        metric_ids = [
            metric.fact_id
            for metric in metrics
            if metric.origin == "source"
            and metric.fact_id in facts
            and facts[metric.fact_id].kind == "metric"
            and facts[metric.fact_id].source_span == metric.literal
            and (not group_id or facts[metric.fact_id].role_or_project_id in {"", group_id})
        ]
        fact_ids = list(dict.fromkeys([*bullet.fact_ids, *metric_ids]))
        return (
            bullet
            if fact_ids == bullet.fact_ids and metrics == bullet.metrics
            else bullet.model_copy(update={"fact_ids": fact_ids, "metrics": metrics})
        )

    return draft.model_copy(
        update={
            "summary": [attach(bullet) for bullet in draft.summary],
            "experience": [
                role.model_copy(
                    update={"bullets": [attach(bullet, role.role_id) for bullet in role.bullets]}
                )
                for role in draft.experience
            ],
            "projects": [
                project.model_copy(
                    update={
                        "bullets": [
                            attach(bullet, project.project_id) for bullet in project.bullets
                        ]
                    }
                )
                for project in draft.projects
            ],
        }
    )


def validate_strategy(
    strategy: CriticStrategy, source: ResumeSource, requirement_ids: set[str]
) -> list[ComplianceCheck]:
    facts = fact_map(source)
    checks: list[ComplianceCheck] = []
    mapped_ids = [mapping.requirement_id for mapping in strategy.mappings]
    checks.append(
        check(
            "strategy.requirements",
            len(mapped_ids) == len(set(mapped_ids)) and set(mapped_ids) == requirement_ids,
            "critic_strategy.mappings",
            "Cover every JD requirement exactly once as supported, adjacent, or gap.",
        )
    )
    for index, mapping in enumerate(strategy.mappings):
        path = f"critic_strategy.mappings.{index}"
        checks.append(
            check(
                "strategy.fact_ids",
                (
                    not mapping.fact_ids
                    if mapping.disposition == "gap"
                    else bool(mapping.fact_ids) and set(mapping.fact_ids) <= facts.keys()
                ),
                path,
                "Use source fact IDs for supported/adjacent requirements; gaps have no fact IDs.",
                evidence_ids=mapping.fact_ids,
            )
        )

    normalized_skills = [item.casefold().strip() for item in strategy.verified_skill_allowlist]
    checks.append(
        check(
            "strategy.skill_duplicates",
            len(normalized_skills) == len(set(normalized_skills)),
            "critic_strategy.verified_skill_allowlist",
            "Remove duplicate verified skills.",
        )
    )
    source_skills = {fact.source_span for fact in source.facts if fact.kind in {"skill", "tool"}}
    for index, skill in enumerate(strategy.verified_skill_allowlist):
        checks.append(
            check(
                "strategy.skill_source",
                bool(skill) and skill in source_skills,
                f"critic_strategy.verified_skill_allowlist.{index}",
                "Remove skill or copy an exact skill fact.",
            )
        )
    allowlist = set(strategy.verified_skill_allowlist)
    planned = [item for group in strategy.skill_categories for item in group.items]
    normalized_planned = [item.casefold().strip() for item in planned]
    checks.append(
        check(
            "strategy.skill_categories",
            len(normalized_planned) == len(set(normalized_planned)) and set(planned) <= allowlist,
            "critic_strategy.skill_categories",
            "Use every planned item once and only from the verified allowlist.",
        )
    )
    seen_categories: set[str] = set()
    for index, group in enumerate(strategy.skill_categories):
        category = group.category.strip()
        normalized = category.casefold()
        valid = (
            bool(category)
            and category == group.category
            and normalized not in seen_categories
            and (
                normalized in GENERIC_SKILL_CATEGORIES
                or category in source_skills
                or category in source.skill_categories
            )
        )
        seen_categories.add(normalized)
        checks.append(
            check(
                "strategy.skill_category",
                valid,
                f"critic_strategy.skill_categories.{index}.category",
                "Use a unique neutral category or an exact source-backed skill name.",
            )
        )
    return checks


def _plain_lead(text: str) -> str:
    return re.sub(r"^[\s>#\-\u2022\u25cf]+", "", re.sub(r"[*_`~]", "", text))


def _bullet_checks(
    bullet: DraftBullet,
    path: str,
    source: ResumeSource,
    allow_synthetic_metrics: bool,
    expected_group: str = "",
) -> list[ComplianceCheck]:
    facts = fact_map(source)
    known = bool(bullet.fact_ids) and set(bullet.fact_ids) <= facts.keys()
    group_ok = known and (
        not expected_group
        or (
            any(facts[fact_id].role_or_project_id == expected_group for fact_id in bullet.fact_ids)
            and all(
                facts[fact_id].role_or_project_id in {"", expected_group}
                for fact_id in bullet.fact_ids
            )
        )
    )
    checks = [
        check(
            "claim.text",
            bool(bullet.text.strip()),
            path,
            "Return non-empty claim text.",
            evidence_ids=bullet.fact_ids,
        ),
        check(
            "claim.evidence",
            known and group_ok,
            path,
            "Cite only known facts from this role or project plus global source facts.",
            evidence_ids=bullet.fact_ids,
        ),
    ]
    lead = _plain_lead(bullet.text)
    checks.append(
        check(
            "claim.weak_verb",
            WEAK_VERB.match(lead) is None,
            path,
            "Replace weak opening verb with a specific source-supported action.",
            evidence_ids=bullet.fact_ids,
        )
    )
    lead_evidence = known and any(
        facts[fact_id].ownership_level == "lead" for fact_id in bullet.fact_ids
    )
    checks.append(
        check(
            "claim.ownership_level",
            known
            and max(
                ("none", "contributor", "lead").index(facts[fact_id].ownership_level)
                for fact_id in bullet.fact_ids
            )
            >= ("none", "contributor", "lead").index(bullet.ownership_level),
            path,
            "Lower declared ownership or cite evidence with matching ownership.",
            evidence_ids=bullet.fact_ids,
        )
    )
    checks.append(
        check(
            "claim.ownership",
            OWNERSHIP_VERB.search(lead) is None or lead_evidence,
            path,
            "Remove leadership verb or cite lead-level ownership evidence.",
            evidence_ids=bullet.fact_ids,
        )
    )
    clean_markdown = "\n" not in bullet.text and not re.match(
        r"^\s*(?:[-*#>\u2022\u25cf]|\d+[.)])\s", bullet.text
    )
    checks.append(
        check(
            "claim.markdown",
            clean_markdown,
            path,
            "Return plain single-line bullet text without a list marker or heading.",
            evidence_ids=bullet.fact_ids,
        )
    )

    numeric_literals = [match.group() for match in METRIC.finditer(bullet.text)]
    annotations = [metric.literal for metric in bullet.metrics]
    checks.append(
        check(
            "metric.annotations",
            Counter(numeric_literals) == Counter(annotations),
            path,
            "Annotate every numeric literal exactly once and do not annotate absent literals.",
            evidence_ids=bullet.fact_ids,
        )
    )
    for index, metric in enumerate(bullet.metrics):
        metric_path = f"{path}.metrics.{index}"
        if metric.origin == "synthetic_estimate":
            passed = allow_synthetic_metrics and not metric.fact_id
            message = (
                "Remove estimate or enable estimates; synthetic estimates use an empty fact_id."
            )
        else:
            passed = (
                bool(metric.fact_id)
                and metric.fact_id in facts
                and metric.fact_id in bullet.fact_ids
                and facts[metric.fact_id].kind == "metric"
                and metric.literal == facts[metric.fact_id].source_span
            )
            message = "Cite a source fact containing this exact numeric literal."
        checks.append(
            check(
                "metric.provenance",
                passed,
                metric_path,
                message,
                evidence_ids=[metric.fact_id] if metric.fact_id else [],
            )
        )
    return checks


def lint_draft(
    draft: ResumeDraft,
    source: ResumeSource,
    strategy: CriticStrategy,
    allow_synthetic_metrics: bool,
) -> list[ComplianceCheck]:
    checks: list[ComplianceCheck] = []
    rendered_fact_ids = set(source.protected_fact_ids)
    for index, bullet in enumerate(draft.summary):
        checks.extend(_bullet_checks(bullet, f"summary.{index}", source, allow_synthetic_metrics))
        rendered_fact_ids.update(bullet.fact_ids)

    expected_roles = {group.group_id for group in source.roles}
    actual_roles = [role.role_id for role in draft.experience]
    checks.append(
        check(
            "experience.roles",
            bool(actual_roles)
            and len(actual_roles) == len(set(actual_roles))
            and set(actual_roles) <= expected_roles,
            "experience",
            "Return at least one source role with no duplicates and no unknown roles.",
        )
    )
    omitted_roles = [
        group.group_id for group in source.roles if group.group_id not in set(actual_roles)
    ]
    most_recent_role_id = source.roles[0].group_id if source.roles else None
    checks.append(
        check(
            "experience.role_omission_bound",
            len(omitted_roles) <= 1 and most_recent_role_id not in omitted_roles,
            "experience",
            "Omit at most one role per revision, and never the most recent one — condense "
            "bullets across every role before dropping one at all.",
        )
    )
    if omitted_roles:
        # Auditable, non-blocking: a role can legitimately be dropped (see
        # the bound above), but it must never be silent. This is the only
        # record of which role and why — resume-lab has no UI for it yet,
        # same as project_selection's reasoning (see hard-count-low-resume.md).
        reasons = {item.role_id: item.reason.strip() for item in draft.omitted_roles}
        detail = ", ".join(
            f"{role_id} ({reasons[role_id]})" if reasons.get(role_id) else role_id
            for role_id in omitted_roles
        )
        checks.append(
            check(
                "experience.role_omitted",
                False,
                "experience",
                f"Omitted role(s) not present in the rendered resume: {detail}.",
                severity="info",
            )
        )
        missing_reasons = [role_id for role_id in omitted_roles if not reasons.get(role_id)]
        if missing_reasons:
            # Non-blocking (see ResumeDraft.omitted_roles — the repair loop
            # has no dedicated path to patch just this field). Surfaced
            # separately from role_omitted above so "omitted, unexplained"
            # is distinguishable from "omitted, with a stated reason" at a
            # glance, without needing to parse the combined message.
            checks.append(
                check(
                    "experience.role_omission_reason",
                    False,
                    "experience",
                    "Every omitted role needs a matching entry in omitted_roles explaining why "
                    f"it was dropped; missing for: {', '.join(missing_reasons)}.",
                    severity="warning",
                )
            )
    for role in draft.experience:
        checks.append(
            check(
                "experience.bullet_count",
                1 <= len(role.bullets) <= 6,
                f"experience.{role.role_id}",
                "Return 1-6 bullets for this role.",
            )
        )
        for index, bullet in enumerate(role.bullets):
            checks.extend(
                _bullet_checks(
                    bullet,
                    f"experience.{role.role_id}.bullets.{index}",
                    source,
                    allow_synthetic_metrics,
                    role.role_id,
                )
            )
            rendered_fact_ids.update(bullet.fact_ids)
        metric_count = sum(
            not re.fullmatch(r"(?:19|20)\d{2}", metric.literal.strip())
            for bullet in role.bullets
            for metric in bullet.metrics
        )
        # Without synthetic estimates, the model may only cite metrics that
        # exist verbatim in the source résumé (see metric.provenance above).
        # A role with fewer than 2 genuine metrics in the source can never
        # satisfy a flat "2-3" requirement without inventing numbers, so the
        # target scales down to what the source actually offers — including
        # zero when the source has none (qualitative roles like PM, analyst,
        # or design).  When synthetic estimates are allowed, the model can
        # fill the gap itself, so the original fixed band still applies.
        if allow_synthetic_metrics:
            metric_floor, metric_ceiling = 2, 3
        else:
            available_metrics = sum(
                1
                for fact in source.facts
                if fact.kind == "metric"
                and fact.role_or_project_id == role.role_id
                and not re.fullmatch(r"(?:19|20)\d{2}", fact.source_span.strip())
            )
            metric_floor = min(2, available_metrics)
            # Source-backed outcomes need no arbitrary three-metric cap.
            # Per-metric provenance and claim checks still reject invented numbers.
            metric_ceiling = max(metric_floor, available_metrics)
        checks.append(
            check(
                "experience.metric_count",
                metric_floor <= metric_count <= metric_ceiling,
                f"experience.{role.role_id}",
                f"Use {metric_floor}-{metric_ceiling} numeric metrics across this role's "
                "bullets (scaled to how many the source résumé actually provides).",
            )
        )

    expected_projects = {group.group_id for group in source.projects}
    actual_projects = [project.project_id for project in draft.projects]
    checks.append(
        check(
            "projects.ids",
            len(actual_projects) == len(set(actual_projects))
            and set(actual_projects) <= expected_projects,
            "projects",
            "Return unique source projects with no unknown project IDs.",
        )
    )
    omitted_projects = [
        group.group_id for group in source.projects if group.group_id not in set(actual_projects)
    ]
    if omitted_projects:
        # Library selection already narrows source.projects before crafting.
        # The writer must retain those projects as independent entries.
        checks.append(
            check(
                "projects.omitted",
                False,
                "projects",
                f"Omitted project(s) not present in the rendered resume: "
                f"{', '.join(omitted_projects)}. Condense project bullets instead of dropping projects.",
                severity="error",
            )
        )
    for project in draft.projects:
        checks.append(
            check(
                "project.bullet_count",
                1 <= len(project.bullets) <= 4,
                f"projects.{project.project_id}",
                "Return 1-4 bullets per project. Prioritize space for relevant experience.",
            )
        )
        for index, bullet in enumerate(project.bullets):
            checks.extend(
                _bullet_checks(
                    bullet,
                    f"projects.{project.project_id}.bullets.{index}",
                    source,
                    allow_synthetic_metrics,
                    project.project_id,
                )
            )
            rendered_fact_ids.update(bullet.fact_ids)

    allowlist = set(strategy.verified_skill_allowlist)
    seen_categories: set[str] = set()
    seen_items: set[str] = set()
    for index, category in enumerate(draft.skills):
        category_key = category.category.casefold().strip()
        category_ok = (
            bool(category_key)
            and ":" not in category.category
            and category_key not in seen_categories
        )
        seen_categories.add(category_key)
        checks.append(
            check(
                "skills.category",
                category_ok and bool(category.items),
                f"skills.{index}",
                "Use a unique non-empty category name without a colon.",
            )
        )
        for item_index, item in enumerate(category.items):
            key = item.casefold().strip()
            item_ok = (
                item in allowlist and key not in seen_items and "," not in item and ":" not in item
            )
            seen_items.add(key)
            rendered_fact_ids.update(
                fact.fact_id
                for fact in source.facts
                if fact.kind in {"skill", "tool"} and fact.source_span == item
            )
            checks.append(
                check(
                    "skills.item",
                    item_ok,
                    f"skills.{index}.items.{item_index}",
                    "Use a unique verified skill without comma or colon characters.",
                )
            )
    expected_layout = [(group.category, group.items) for group in strategy.skill_categories]
    actual_layout = [(group.category, group.items) for group in draft.skills]
    checks.append(
        check(
            "skills.layout",
            actual_layout == expected_layout,
            "skills",
            "Use the validated skill categories and exact source-backed items.",
        )
    )
    for mapping in strategy.mappings:
        if mapping.disposition == "gap":
            continue
        checks.append(
            check(
                "strategy.coverage",
                bool(set(mapping.fact_ids) & rendered_fact_ids),
                f"coverage.{mapping.requirement_id}",
                "Surface this supported or adjacent JD requirement in summary, experience, "
                "project, or skills.",
                evidence_ids=mapping.fact_ids,
            )
        )
    return checks


def _iter_claims(draft: ResumeDraft):
    for index, bullet in enumerate(draft.summary):
        yield f"summary.{index}", bullet
    for role in draft.experience:
        for index, bullet in enumerate(role.bullets):
            yield f"experience.{role.role_id}.bullets.{index}", bullet
    for project in draft.projects:
        for index, bullet in enumerate(project.bullets):
            yield f"projects.{project.project_id}.bullets.{index}", bullet


def _bullet_field_path(path: str) -> str:
    match = re.match(
        r"^(summary\.\d+|experience\..+?\.bullets\.\d+|projects\..+?\.bullets\.\d+)(?:\.|$)",
        path,
    )
    return match.group(1) if match else ""


def claim_evidence_pairs(draft: ResumeDraft, source: ResumeSource) -> list[dict[str, Any]]:
    facts = fact_map(source)
    pairs: list[dict[str, Any]] = []

    def add(path: str, bullet: DraftBullet) -> None:
        pairs.append(
            {
                "field_path": path,
                "claim": bullet.model_dump(mode="json"),
                "evidence": [
                    facts[fact_id].model_dump(mode="json")
                    for fact_id in bullet.fact_ids
                    if fact_id in facts
                ],
            }
        )

    for path, bullet in _iter_claims(draft):
        add(path, bullet)
    return pairs


def validate_semantic_review(
    review: SemanticReview, pairs: list[dict[str, Any]], source: ResumeSource
) -> list[ComplianceCheck]:
    expected = {pair["field_path"] for pair in pairs}
    known_facts = fact_map(source).keys()
    pair_evidence = {
        pair["field_path"]: {fact["fact_id"] for fact in pair["evidence"]} for pair in pairs
    }
    checks: list[ComplianceCheck] = []
    reviewed: set[str] = set()
    for item in review.checks:
        if (
            item.field_path not in expected
            or not set(item.evidence_ids) <= known_facts
            or not set(item.evidence_ids) <= pair_evidence.get(item.field_path, set())
        ):
            checks.append(
                check(
                    "review.invalid_reference",
                    False,
                    item.field_path,
                    "Review only supplied claim paths and evidence IDs.",
                    evidence_ids=item.evidence_ids,
                )
            )
            continue
        reviewed.add(item.field_path)
        checks.append(
            item.model_copy(
                update={
                    "severity": "error" if not item.passed else item.severity,
                    "waiver": "",
                }
            )
        )
    for missing in sorted(expected - reviewed):
        checks.append(
            check(
                "review.missing_claim",
                False,
                missing,
                "Review this claim against its supplied evidence.",
            )
        )
    return checks


def violation_fingerprint(checks: list[ComplianceCheck]) -> str:
    failures = [
        {
            "code": item.code,
            "field_path": item.field_path,
            "evidence_ids": sorted(item.evidence_ids),
        }
        for item in checks
        if not item.passed and item.severity == "error" and not item.waiver
    ]
    return hashlib.sha256(stable_json(sorted(failures, key=stable_json)).encode()).hexdigest()


def make_repair_payload(
    draft: ResumeDraft,
    source: ResumeSource,
    strategy: CriticStrategy,
    checks: list[ComplianceCheck],
    allow_synthetic_metrics: bool,
) -> dict[str, Any]:
    failures = [
        item for item in checks if not item.passed and item.severity == "error" and not item.waiver
    ]
    paths = {item.field_path for item in failures}
    global_experience = "experience" in paths
    global_projects = "projects" in paths
    role_ids = {
        role.role_id
        for role in draft.experience
        if global_experience or f"experience.{role.role_id}" in paths
    }
    project_ids = {
        project.project_id
        for project in draft.projects
        if global_projects or f"projects.{project.project_id}" in paths
    }
    claims = dict(_iter_claims(draft))
    bullet_paths = {_bullet_field_path(path) for path in paths} - {""}
    bullet_paths = {
        path
        for path in bullet_paths
        if not (
            path.startswith("experience.")
            and (
                global_experience
                or path.split(".bullets.", 1)[0].removeprefix("experience.") in role_ids
            )
        )
        and not (
            path.startswith("projects.")
            and (
                global_projects
                or path.split(".bullets.", 1)[0].removeprefix("projects.") in project_ids
            )
        )
    }
    fragments: dict[str, Any] = {}
    if bullet_paths:
        fragments["bullets"] = [
            {
                "field_path": path,
                "bullet": claims[path].model_dump(mode="json"),
            }
            for path in sorted(bullet_paths)
            if path in claims
        ]
    if role_ids or global_experience:
        fragments["experience"] = [
            role.model_dump(mode="json") for role in draft.experience if role.role_id in role_ids
        ]
    if project_ids or global_projects:
        fragments["projects"] = [
            project.model_dump(mode="json")
            for project in draft.projects
            if project.project_id in project_ids
        ]
    if any(path.startswith("skills") for path in paths):
        fragments["skills"] = [item.model_dump(mode="json") for item in draft.skills]
    evidence_ids = {fact_id for item in failures for fact_id in item.evidence_ids}
    for path in bullet_paths:
        if path in claims:
            evidence_ids.update(claims[path].fact_ids)
    for role in draft.experience:
        if role.role_id in role_ids:
            evidence_ids.update(fact_id for bullet in role.bullets for fact_id in bullet.fact_ids)
    for project in draft.projects:
        if project.project_id in project_ids:
            evidence_ids.update(
                fact_id for bullet in project.bullets for fact_id in bullet.fact_ids
            )
    relevant_role_ids = {
        path.split(".bullets.", 1)[0].removeprefix("experience.")
        for path in bullet_paths
        if path.startswith("experience.")
    } | role_ids
    if global_experience:
        relevant_role_ids.update(group.group_id for group in source.roles)
    relevant_project_ids = {
        path.split(".bullets.", 1)[0].removeprefix("projects.")
        for path in bullet_paths
        if path.startswith("projects.")
    } | project_ids
    if global_projects:
        relevant_project_ids.update(group.group_id for group in source.projects)
    evidence_ids.update(
        fact.fact_id
        for fact in source.facts
        if fact.role_or_project_id in relevant_role_ids | relevant_project_ids
    )
    if "skills" in fragments:
        evidence_ids.update(fact.fact_id for fact in source.facts if fact.kind in {"skill", "tool"})
    evidence = [
        fact.model_dump(mode="json") for fact in source.facts if fact.fact_id in evidence_ids
    ]
    payload = {
        "allow_synthetic_metrics": allow_synthetic_metrics,
        "failing_fragments": fragments,
        "evidence": evidence,
        "errors": [item.model_dump(mode="json") for item in failures],
    }
    if "skills" in fragments:
        payload["skill_plan"] = [
            group.model_dump(mode="json") for group in strategy.skill_categories
        ]
    return payload


def apply_repair(draft: ResumeDraft, repair: RepairOutput, failing_paths: set[str]) -> ResumeDraft:
    skills_allowed = any(path.startswith("skills") for path in failing_paths)
    global_experience = "experience" in failing_paths
    global_projects = "projects" in failing_paths
    role_allowed = {
        role.role_id for role in draft.experience if f"experience.{role.role_id}" in failing_paths
    }
    project_allowed = {
        project.project_id
        for project in draft.projects
        if f"projects.{project.project_id}" in failing_paths
    }
    if repair.skills_replacement and not skills_allowed:
        raise ValueError("repair attempted to change passing skills")
    if not global_experience and any(
        role.role_id not in role_allowed for role in repair.role_replacements
    ):
        raise ValueError("repair attempted to replace a passing or unknown role")
    if not global_projects and any(
        project.project_id not in project_allowed for project in repair.project_replacements
    ):
        raise ValueError("repair attempted to replace a passing or unknown project")

    allowed_bullets = {_bullet_field_path(path) for path in failing_paths} - {""}
    replacement_paths = [item.field_path for item in repair.bullet_replacements]
    if len(replacement_paths) != len(set(replacement_paths)):
        raise ValueError("repair returned duplicate bullet paths")

    summary = list(draft.summary)
    roles = list(draft.experience)
    projects = list(draft.projects)
    role_indexes = {role.role_id: index for index, role in enumerate(roles)}
    project_indexes = {project.project_id: index for index, project in enumerate(projects)}
    for replacement in repair.bullet_replacements:
        path = replacement.field_path
        if path != _bullet_field_path(path) or path not in allowed_bullets:
            raise ValueError("repair attempted to change a passing bullet")
        if path.startswith("summary."):
            index = int(path.removeprefix("summary."))
            if index >= len(summary):
                raise ValueError("repair referenced an unknown summary bullet")
            summary[index] = replacement.bullet
        elif path.startswith("experience."):
            group, raw_index = path.removeprefix("experience.").rsplit(".bullets.", 1)
            if group not in role_indexes:
                raise ValueError("repair referenced an unknown role")
            role_index = role_indexes[group]
            bullets = list(roles[role_index].bullets)
            index = int(raw_index)
            if index >= len(bullets):
                raise ValueError("repair referenced an unknown role bullet")
            bullets[index] = replacement.bullet
            roles[role_index] = roles[role_index].model_copy(update={"bullets": bullets})
        else:
            group, raw_index = path.removeprefix("projects.").rsplit(".bullets.", 1)
            if group not in project_indexes:
                raise ValueError("repair referenced an unknown project")
            project_index = project_indexes[group]
            bullets = list(projects[project_index].bullets)
            index = int(raw_index)
            if index >= len(bullets):
                raise ValueError("repair referenced an unknown project bullet")
            bullets[index] = replacement.bullet
            projects[project_index] = projects[project_index].model_copy(
                update={"bullets": bullets}
            )

    role_map = {role.role_id: role for role in roles}
    role_map.update({role.role_id: role for role in repair.role_replacements})
    project_map = {project.project_id: project for project in projects}
    project_map.update({project.project_id: project for project in repair.project_replacements})
    return draft.model_copy(
        update={
            "summary": summary,
            "experience": (
                repair.role_replacements
                if global_experience
                else [role_map[role.role_id] for role in roles]
            ),
            "projects": (
                repair.project_replacements
                if global_projects
                else [project_map[project.project_id] for project in projects]
            ),
            "skills": repair.skills_replacement if skills_allowed else draft.skills,
        }
    )


def claim_provenance(draft: ResumeDraft, source: ResumeSource) -> list[ClaimProvenance]:
    claims: list[ClaimProvenance] = []

    def add(path: str, bullet: DraftBullet) -> None:
        claims.append(
            ClaimProvenance(
                field_path=path,
                text=bullet.text,
                fact_ids=bullet.fact_ids,
                metrics=bullet.metrics,
            )
        )

    for path, bullet in _iter_claims(draft):
        add(path, bullet)
    skill_fact_ids: dict[str, str] = {}
    for fact in source.facts:
        if fact.kind in {"skill", "tool"}:
            skill_fact_ids.setdefault(fact.source_span, fact.fact_id)
    for category_index, category in enumerate(draft.skills):
        for item_index, item in enumerate(category.items):
            claims.append(
                ClaimProvenance(
                    field_path=f"skills.{category_index}.items.{item_index}",
                    text=item,
                    fact_ids=[skill_fact_ids[item]] if item in skill_fact_ids else [],
                    metrics=[],
                )
            )
    return claims


def rendered_protection_checks(
    markdown: str,
    source: ResumeSource,
    draft: ResumeDraft | None = None,
) -> list[ComplianceCheck]:
    facts = fact_map(source)
    # When role/project subsetting is active, only check protected facts
    # from groups that are actually included in the draft. Identity,
    # education, and coursework facts are always checked because those
    # sections are always rendered.
    if draft is not None:
        rendered_group_ids = (
            {role.role_id for role in draft.experience}
            | {project.project_id for project in draft.projects}
        )
        protected_ids = [
            fact_id
            for fact_id in source.protected_fact_ids
            if facts[fact_id].role_or_project_id in rendered_group_ids
            or facts[fact_id].role_or_project_id == ""
        ]
    else:
        protected_ids = source.protected_fact_ids
    missing = [
        fact_id
        for fact_id in protected_ids
        if facts[fact_id].kind in {"identity", "employer", "date", "education", "coursework"}
        and re.sub(r"\s*\[cite:\s*\d+\]", "", facts[fact_id].source_span, flags=re.IGNORECASE)
        not in markdown
    ]
    checks = [
        check(
            "render.protected_entities",
            not missing,
            "resume_markdown",
            "Render every protected source value verbatim.",
            evidence_ids=missing,
        )
    ]
    if draft is not None:
        experience = re.search(r"^## Experience\s*\n(.*?)(?=^## |\Z)", markdown, re.M | re.S)
        headers = re.findall(r"^### (.+)$", experience.group(1), re.M) if experience else []
        groups = {group.group_id for group in source.roles}
        roles = [role for role in draft.experience if role.role_id in groups]
        misplaced = []
        for index, role in enumerate(roles):
            header = headers[index] if index < len(headers) else ""
            misplaced.extend(fact.fact_id for fact in source.facts
                if fact.role_or_project_id == role.role_id and fact.kind in {"employer", "date"}
                and re.sub(r"\s*\[cite:\s*\d+\]", "", fact.source_span, flags=re.I) not in header)
        checks.append(check("render.role_entities", not misplaced and len(headers) == len(roles),
                            "experience", "Keep each employer and date in its own role header.",
                            evidence_ids=misplaced))
    return checks


def draft_uses_estimates(draft: ResumeDraft) -> bool:
    return any(
        metric.origin == "synthetic_estimate"
        for _, bullet in _iter_claims(draft)
        for metric in bullet.metrics
    )
