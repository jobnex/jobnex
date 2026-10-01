from __future__ import annotations

import json
import os
import re
import tempfile
from pathlib import Path

from .models import PipelineConfig, PipelineResult, ResumeDraft, ResumeSource
from .source import fact_map


def _display(value: str) -> str:
    return re.sub(r"\s*\[cite:\s*\d+\]", "", value, flags=re.IGNORECASE).strip()


def count_resume_words(markdown: str) -> int:
    """Count visible whitespace-separated words, excluding Markdown and link destinations."""
    text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", markdown)
    return sum(bool(re.search(r"\w", token)) for token in text.split())


# Multi-page band width around the base résumé's own word count: wide enough
# to give the writer/repair loop room to work, not a pixel-perfect target.
_MULTI_PAGE_BAND = 0.12

# Below this, a proportional ±12% band would itself be too narrow to write a
# coherent résumé in (e.g. a 60-word source -> [53,67]) -- so a very short
# source instead gets a fixed floor, same shape as the existing single_page
# floor below just sized for a much shorter document.
_SHORT_RESUME_FLOOR_WORDS = 250
_SHORT_RESUME_MIN, _SHORT_RESUME_MAX = 200, 300

# Enforcement slack around the word-count target: craft() still aims for the
# tighter min/max band, but a near-miss inside this margin doesn't trigger a
# full repair cycle by itself. Keeps a 5-word overshoot from costing a
# multi-thousand-token retry over a target that was already a soft estimate.
WORD_COUNT_TOLERANCE = 15


def estimate_word_budget(source_word_count: int, config: PipelineConfig) -> tuple[str, int, int]:
    """Derive a length target from the base résumé's own word count.

    A base résumé already inside the single-page target band keeps that
    exact target (unchanged low-risk behavior). A shorter source gets a
    proportional band scaled down instead of being padded up to the
    single-page floor regardless of how little content it actually has. A
    longer base résumé gets a target proportional to ITS OWN word count
    instead of being compressed into the same window, or capped at some
    new fixed number — "approximately the same amount of content", not a
    new ceiling. Returns (length_mode, minimum, maximum).
    """
    if config.min_resume_words <= source_word_count <= config.max_resume_words:
        return "single_page", config.min_resume_words, config.max_resume_words
    if source_word_count < config.min_resume_words:
        if source_word_count <= _SHORT_RESUME_FLOOR_WORDS:
            return "single_page", _SHORT_RESUME_MIN, _SHORT_RESUME_MAX
        minimum = round(source_word_count * (1 - _MULTI_PAGE_BAND))
        maximum = round(source_word_count * (1 + _MULTI_PAGE_BAND))
        return "single_page", minimum, maximum
    minimum = max(config.min_resume_words, round(source_word_count * (1 - _MULTI_PAGE_BAND)))
    maximum = round(source_word_count * (1 + _MULTI_PAGE_BAND))
    return "multi_page", minimum, maximum


def _group_value(group, facts, kind: str) -> str:
    return next(
        (
            _display(fact.source_span)
            for fact in facts.values()
            if fact.role_or_project_id == group.group_id and fact.kind == kind
        ),
        "",
    )


# Fallback order when a section is missing from source.section_order (e.g.
# resumes with zero recognized headings, or content added by a repair pass
# that has no heading of its own to have been ordered by).
_DEFAULT_SECTION_ORDER = ("summary", "skills", "experience", "projects", "education", "preserved")


def render_resume(draft: ResumeDraft, source: ResumeSource) -> str:
    facts = fact_map(source)
    lines: list[str] = []
    preamble = [_display(facts[fact_id].source_span) for fact_id in source.preamble_fact_ids]
    if preamble:
        lines.extend([f"# {preamble[0]}", *preamble[1:]])

    sections: dict[str, list[str]] = {}

    if draft.summary:
        sections["summary"] = [
            "## Professional Summary",
            "",
            *(f"- {bullet.text}" for bullet in draft.summary),
        ]

    if draft.skills:
        sections["skills"] = [
            "## Skills",
            "",
            *(
                f"{category.category} : {', '.join(category.items)}"
                for category in draft.skills
            ),
        ]

    if draft.experience:
        groups = {group.group_id: group for group in source.roles}
        block = ["## Experience", ""]
        for index, role in enumerate(draft.experience, 1):
            group = groups.get(role.role_id)
            if group is None:
                continue
            if role.title.strip():
                employer = _group_value(group, facts, "employer")
                date = _group_value(group, facts, "date")
                if employer:
                    header = " | ".join(
                        part for part in (role.title.strip(), employer, date) if part
                    )
                else:
                    # Preserve all original header text when employer extraction is uncertain.
                    header = " | ".join(
                        _display(facts[fact_id].source_span) for fact_id in group.header_fact_ids
                    )
            else:
                header = " | ".join(
                    _display(facts[fact_id].source_span) for fact_id in group.header_fact_ids
                )
            block.append(f"### {header or f'Experience {index}'}")
            block.extend(f"- {bullet.text}" for bullet in role.bullets)
            block.append("")
        sections["experience"] = block

    if draft.projects:
        groups = {group.group_id: group for group in source.projects}
        block = ["## Projects", ""]
        for index, project in enumerate(draft.projects, 1):
            group = groups.get(project.project_id)
            if group is None:
                continue
            title = project.title.strip()
            if not title:
                title = (
                    _display(facts[group.header_fact_ids[0]].source_span)
                    if group.header_fact_ids
                    else ""
                )
            block.append(f"### {title or f'Project {index}'}")
            block.extend(f"- {bullet.text}" for bullet in project.bullets)
            block.append("")
        sections["projects"] = block

    if source.education_fact_ids:
        sections["education"] = [
            "## Education",
            "",
            *(_display(facts[fact_id].source_span) for fact_id in source.education_fact_ids),
        ]

    if source.preserved_fact_ids:
        sections["preserved"] = [
            "## Additional Information",
            "",
            *(facts[fact_id].source_span for fact_id in source.preserved_fact_ids),
        ]

    # Source-driven order first, then anything present but never seen as a
    # heading in the base résumé (degenerate/fallback-parsed resumes), in
    # the original fixed order — never drops a section, only reorders.
    order = [category for category in source.section_order if category in sections]
    order += [
        category
        for category in _DEFAULT_SECTION_ORDER
        if category in sections and category not in order
    ]

    for category in order:
        block = list(sections[category])
        while block and not block[-1].strip():
            block.pop()
        if lines:
            lines.append("")
        lines.extend(block)

    return "\n".join(lines).strip() + "\n"


def _atomic_write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary: str | None = None
    try:
        with tempfile.NamedTemporaryFile(
            "w", encoding="utf-8", dir=path.parent, prefix=f".{path.name}.", delete=False
        ) as handle:
            temporary = handle.name
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    finally:
        if temporary:
            Path(temporary).unlink(missing_ok=True)


def write_result(path: Path, result: PipelineResult) -> Path:
    if path.suffix.casefold() != ".md":
        raise ValueError("output path must end in .md")
    _atomic_write(path, result.resume_markdown)
    audit_path = path.with_suffix(".audit.json")
    _atomic_write(
        audit_path,
        json.dumps(result.model_dump(mode="json"), ensure_ascii=False, indent=2, sort_keys=True)
        + "\n",
    )
    return audit_path
