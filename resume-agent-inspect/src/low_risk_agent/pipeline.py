from __future__ import annotations

from .batch import BatchPending

import os
import re
import secrets
import unicodedata
import uuid
from typing import Any, Literal

os.environ.setdefault("LANGGRAPH_STRICT_MSGPACK", "true")

from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph import END, START, StateGraph

from .cache import JdAnalysisCache, MemoryJdAnalysisCache, jd_cache_key
from .llm import OpenAICompatibleClient, StructuredLLM, ModelOutputError, ProviderRequestError
from .models import (
    CriticStrategy,
    FallbackFacts,
    GraphState,
    JobAnalysis,
    PipelineConfig,
    PipelineResult,
    ProjectChoice,
    RepairOutput,
    RequirementMapping,
    ResumeDraft,
    RunRequest,
    SemanticReview,
    SkillCategoryPlan,
    SkillsCategory,
    TokenUsage,
    ViolationSnapshot,
)
from .policy import (
    apply_repair,
    attach_metric_fact_ids,
    check,
    claim_evidence_pairs,
    claim_provenance,
    draft_uses_estimates,
    has_errors,
    lint_draft,
    make_repair_payload,
    rendered_protection_checks,
    validate_semantic_review,
    validate_strategy,
    violation_fingerprint,
)
from .projects import (
    parse_catalog,
    project_library_from_source,
    replace_projects,
    select_projects,
    shortlist,
)
from .prompts import (
    ADJACENCY_SYSTEM,
    CRAFT_SYSTEM,
    JD_ANALYSIS_REPAIR_SYSTEM,
    JD_ANALYSIS_SYSTEM,
    REPAIR_SYSTEM,
    SEMANTIC_REVIEW_SYSTEM,
    SOURCE_FALLBACK_SYSTEM,
)
from .render import (
    WORD_COUNT_TOLERANCE,
    count_resume_words,
    estimate_word_budget,
    render_resume,
)
from .source import extract_source, merge_fallback_facts, normalize_document, sha256_text, validate_source_groups


class PipelineFailure(RuntimeError):
    pass


def _skill_key(value: str) -> str:
    key = re.sub(r"\s+", " ", value).strip().casefold()
    return {
        "azure databricks": "databricks",
        "apache kafka": "kafka",
        "apache spark": "spark",
        "apache airflow": "airflow",
        "aws bedrock": "bedrock",
        "model context protocol": "mcp",
        "google cloud platform": "gcp",
        "google cloud": "gcp",
    }.get(key, key)


def _skill_keys(value: str) -> set[str]:
    """Recognize a group and its named members without losing its display text."""
    value = re.sub(r"\s+", " ", value).strip()
    parts = [value]
    if "(" in value:
        parts.append(value.split("(", 1)[0].strip())
        for group in re.findall(r"\(([^()]*)\)", value):
            parts.extend(part.strip() for part in re.split(r"[,;]", group))
    return {_skill_key(part) for part in parts if part}


def _experience_tools(source, requested_tools):
    """Promote exact tool mentions into facts usable by the skill planner."""
    core_tools = (
        "Snowflake",
        "BigQuery",
        "dbt",
        "Airflow",
        "Kafka",
        "Spark",
        "PySpark",
        "Databricks",
        "Snowpipe",
        "Dataplex",
        "PostgreSQL",
        "Redshift",
        "Docker",
        "Kubernetes",
        "Python",
        "SQL",
    )
    facts = list(source.facts)
    known = {f.source_span.casefold() for f in facts if f.kind in {"skill", "tool"}}
    for tool in dict.fromkeys([*core_tools, *requested_tools]):
        if not tool.strip() or tool.casefold() in known:
            continue
        for fact in source.facts:
            if fact.kind not in {"responsibility", "project_detail"}:
                continue
            match = re.search(r"(?<!\w)" + re.escape(tool) + r"(?!\w)", fact.source_span, re.I)
            if match:
                facts.append(
                    fact.model_copy(
                        update={
                            "fact_id": fact.fact_id + "_tool_" + sha256_text(tool.casefold())[:12],
                            "kind": "tool",
                            "source_span": match.group(),
                            "span_start": fact.span_start + match.start(),
                            "span_end": fact.span_start + match.end(),
                            "ownership_level": "none",
                            "protected": False,
                        }
                    )
                )
                known.add(tool.casefold())
                break
    return source.model_copy(update={"facts": facts})


def _preserve_skill_categories(categories, source):
    """Keep source categories, restore omitted ones, and deduplicate across categories."""
    originals = source.skill_categories
    owners = {}
    spellings = {}
    for name, items in originals.items():
        for item in items:
            for key in _skill_keys(item):
                owners.setdefault(key, name.casefold())
            spellings.setdefault(_skill_key(item), item)
    planned = {}
    names = {name.casefold(): name for name in originals}
    for group in categories:
        name = group.category.casefold()
        names.setdefault(name, group.category)
        for item in group.items:
            key = _skill_key(item)
            target = owners.get(key, name)
            planned.setdefault(target, []).append(spellings.get(key, item))
    seen = set()
    result = []
    for name, display in names.items():
        items = [*originals.get(display, []), *planned.get(name, [])]
        unique = []
        for item in items:
            key = _skill_key(item)
            keys = _skill_keys(item)
            if not keys <= seen:
                unique.append(item)
                seen.update(keys)
        # Keep the category even if its only original skills were duplicated elsewhere.
        if unique or display in originals:
            result.append(SkillCategoryPlan(category=display, items=unique))
    return result


class ResumeTailoringPipeline:
    def __init__(
        self,
        config: PipelineConfig | None = None,
        *,
        llm: StructuredLLM | None = None,
        jd_cache: JdAnalysisCache | None = None,
        cache_secret: str | None = None,
        checkpointer: Any | None = None,
    ) -> None:
        self.config = config or PipelineConfig()
        self.llm = llm or OpenAICompatibleClient(self.config)
        self.jd_cache = jd_cache or MemoryJdAnalysisCache()
        self.cache_secret = cache_secret or secrets.token_hex(32)
        self.graph = self._build_graph(checkpointer or InMemorySaver())

    @staticmethod
    def _append_usage(state: GraphState, usage: TokenUsage | None) -> list[TokenUsage]:
        return [*state.get("usage", []), *([usage] if usage else [])]

    def prepare_source(self, state: GraphState) -> dict[str, Any]:
        request = state["request"]
        source = extract_source(request.original_resume)
        usage = state.get("usage", [])
        if source.ambiguous_blocks:
            fallback, record = self.llm.complete(
                stage="prepare_source_fallback",
                model=self.config.analyzer_model,
                output_type=FallbackFacts,
                system=SOURCE_FALLBACK_SYSTEM,
                payload={
                    "blocks": [block.model_dump(mode="json") for block in source.ambiguous_blocks]
                },
                max_tokens=2500,
            )
            source = merge_fallback_facts(source, request.original_resume, fallback)
            usage = [*usage, record]
        validate_source_groups(source)
        normalized_job = normalize_document(request.job_description)
        source_word_count = count_resume_words(request.original_resume)
        length_mode, min_words, max_words = estimate_word_budget(source_word_count, self.config)
        effective_include_summary = (
            request.include_summary
            if request.include_summary is not None
            else source.has_summary
        )
        return {
            "source": source,
            "resume_hash": source.original_hash,
            "job_hash": sha256_text(normalized_job),
            "revision_count": 0,
            "violation_history": [],
            "usage": usage,
            "source_word_count": source_word_count,
            "length_mode": length_mode,
            "min_resume_words": min_words,
            "max_resume_words": max_words,
            "effective_include_summary": effective_include_summary,
        }

    @staticmethod
    def _evidence_key(value: str) -> str:
        value = unicodedata.normalize("NFKD", value).casefold()
        return re.sub(r"[^\w]+", "", value)

    @staticmethod
    def _validate_job_analysis(analysis: JobAnalysis, normalized_job: str) -> JobAnalysis:
        requirement_ids = [item.requirement_id for item in analysis.requirements]
        if not requirement_ids or len(requirement_ids) != len(set(requirement_ids)):
            raise PipelineFailure("JD analysis requires unique, non-empty requirement IDs")
        normalized_key = ResumeTailoringPipeline._evidence_key(normalized_job)
        for requirement in analysis.requirements:
            if not requirement.evidence_span or (
                requirement.evidence_span not in normalized_job
                and ResumeTailoringPipeline._evidence_key(requirement.evidence_span)
                not in normalized_key
            ):
                raise PipelineFailure(
                    f"JD analysis evidence is not verbatim: {requirement.requirement_id}"
                )
        folded = normalized_job.casefold()

        def grounded_terms(terms: list[str]) -> list[str]:
            return [term for term in terms if term.strip() and term.casefold() in folded]

        return analysis.model_copy(
            update={
                "ats_terms": grounded_terms(analysis.ats_terms),
                "requested_tools": grounded_terms(analysis.requested_tools),
            }
        )

    def analyze_jd(self, state: GraphState) -> dict[str, Any]:
        request = state["request"]
        normalized_job = normalize_document(request.job_description)
        key = jd_cache_key(normalized_job, self.cache_secret, self.config)
        created_usage: list[TokenUsage] = []

        def create() -> JobAnalysis:
            analysis, usage = self.llm.complete(
                stage="analyze_jd",
                model=self.config.analyzer_model,
                output_type=JobAnalysis,
                system=JD_ANALYSIS_SYSTEM,
                payload={"job_description": normalized_job},
                max_tokens=3000,
            )
            try:
                analysis = self._validate_job_analysis(analysis, normalized_job)
            except PipelineFailure as error:
                repaired, repair_usage = self.llm.complete(
                    stage="analyze_jd_repair",
                    model=self.config.analyzer_model,
                    output_type=JobAnalysis,
                    system=JD_ANALYSIS_REPAIR_SYSTEM,
                    payload={
                        "job_description": normalized_job,
                        "invalid_analysis": analysis.model_dump(mode="json"),
                        "validation_error": str(error),
                    },
                    max_tokens=3000,
                )
                analysis = self._validate_job_analysis(repaired, normalized_job)
                created_usage.extend((usage, repair_usage))
            else:
                created_usage.append(usage)
            return analysis

        analysis, hit = self.jd_cache.get_or_create(key, create)
        analysis = self._validate_job_analysis(analysis, normalized_job)
        return {
            "job_analysis": analysis,
            "cache_hit": hit,
            "usage": [*state.get("usage", []), *created_usage],
        }

    @staticmethod
    def _recover_strategy(
        strategy: CriticStrategy, source, requirement_names: dict[str, str]
    ) -> CriticStrategy:
        fact_ids = {fact.fact_id for fact in source.facts}
        valid_mappings: list[RequirementMapping] = []
        seen_requirements: set[str] = set()
        dropped_requirements: list[str] = []
        for mapping in strategy.mappings:
            if (
                mapping.requirement_id not in requirement_names
                or mapping.requirement_id in seen_requirements
            ):
                continue
            seen_requirements.add(mapping.requirement_id)
            if mapping.fact_ids and set(mapping.fact_ids) <= fact_ids:
                valid_mappings.append(
                    mapping.model_copy(
                        update={
                            "disposition": (
                                mapping.disposition if mapping.disposition != "gap" else "supported"
                            )
                        }
                    )
                )
            else:
                valid_mappings.append(
                    RequirementMapping(
                        requirement_id=mapping.requirement_id,
                        fact_ids=[],
                        safe_adjacent_phrasing=[],
                        disposition="gap",
                    )
                )
                dropped_requirements.append(requirement_names[mapping.requirement_id])
        for requirement_id, requirement_name in requirement_names.items():
            if requirement_id not in seen_requirements:
                valid_mappings.append(
                    RequirementMapping(
                        requirement_id=requirement_id,
                        fact_ids=[],
                        safe_adjacent_phrasing=[],
                        disposition="gap",
                    )
                )
                dropped_requirements.append(requirement_name)

        source_skills = {
            fact.source_span for fact in source.facts if fact.kind in {"skill", "tool"}
        }
        skills = [skill for skill in strategy.verified_skill_allowlist if skill in source_skills]
        skills = list(dict.fromkeys(skills))
        allowed_categories = {
            "data engineering",
            "analytics & bi",
            "tools & infrastructure",
        }
        allowed_categories.update(name.casefold() for name in source.skill_categories)
        categories: list[SkillCategoryPlan] = []
        used_skills: set[str] = set()
        for group in strategy.skill_categories:
            items = [item for item in group.items if item in skills and item not in used_skills]
            if group.category.casefold() in allowed_categories and items:
                categories.append(SkillCategoryPlan(category=group.category, items=items))
                used_skills.update(items)
        remaining_skills = [skill for skill in skills if skill not in used_skills]
        if remaining_skills:
            data_category = next(
                (
                    index
                    for index, group in enumerate(categories)
                    if group.category == "Data Engineering"
                ),
                None,
            )
            if data_category is None:
                categories.append(
                    SkillCategoryPlan(category="Data Engineering", items=remaining_skills)
                )
            else:
                group = categories[data_category]
                categories[data_category] = group.model_copy(
                    update={"items": [*group.items, *remaining_skills]}
                )
        categories = _preserve_skill_categories(categories, source)
        skills = [item for group in categories for item in group.items]
        gaps = list(dict.fromkeys([*strategy.unsupported_gaps, *dropped_requirements]))
        return strategy.model_copy(
            update={
                "mappings": valid_mappings,
                "verified_skill_allowlist": skills,
                "unsupported_gaps": gaps,
                "skill_categories": categories,
            }
        )

    def map_adjacency(self, state: GraphState) -> dict[str, Any]:
        request = state["request"]
        source = state["source"]
        candidates = []
        selection = {}
        # An explicitly supplied project_library (a genuine external catalog)
        # always activates selection, regardless of count — that's a
        # deliberate caller choice. Otherwise, self-source one from the
        # résumé's own already-extracted projects, but only when there are
        # more of them than select_projects() could ever keep anyway (its
        # LLM path validates at most 3; its deterministic fallback caps at
        # 2). Below that, every source project already fits without needing
        # JD-relevance narrowing, and running the selector anyway risks its
        # fallback silently dropping one for zero benefit — confirmed: it
        # does, when the model's own selected_projects choice is invalid or
        # absent. Either way the candidates are the user's own projects,
        # never invented.
        auto_source_library = len(source.projects) > 3
        project_library = request.project_library or (
            project_library_from_source(source) if auto_source_library else ""
        )
        library_name = request.project_library_name or (
            "project_library" if request.project_library else "resume_projects"
        )
        if project_library:
            records = parse_catalog(project_library, library_name)
            candidates = shortlist(
                records, state["job_analysis"], job_description=request.job_description
            )
            source = replace_projects(source, candidates, state["job_analysis"])
            selection = {
                "library_hash": sha256_text(project_library),
                "library_name": library_name,
                "unique_projects": len(records),
                "duplicate_titles_removed": sum(r["occurrences"] - 1 for r in records),
                "candidates": [
                    {
                        "project_id": r["project_id"],
                        "title": r["title"],
                        "shortlist_score": r["score"],
                        "lexical_matches": r["matches"],
                        "matched_tools": r["matched_tools"],
                        "matched_terms": r["matched_terms"],
                        "role_match": r["role_match"],
                    }
                    for r in candidates
                ],
            }
        source = _experience_tools(source, state["job_analysis"].requested_tools)
        strategy, usage = self.llm.complete(
            stage="map_adjacency",
            model=self.config.writer_model,
            output_type=CriticStrategy,
            system=ADJACENCY_SYSTEM,
            payload={
                "job_analysis": state["job_analysis"].model_dump(mode="json"),
                "resume_facts": [fact.model_dump(mode="json") for fact in source.facts],
                "project_candidates": selection.get("candidates", []),
                "base_skill_categories": source.skill_categories,
            },
            max_tokens=4000,
            effort="medium",
        )
        if candidates:
            selected, decisions, selector = select_projects(
                strategy, candidates, state["job_analysis"], source
            )
            source = replace_projects(source, selected, state["job_analysis"])
            valid_facts = {f.fact_id for f in source.facts}
            strategy = strategy.model_copy(
                update={
                    "selected_projects": [ProjectChoice.model_validate(d) for d in decisions],
                    "mappings": [
                        m.model_copy(
                            update={
                                "fact_ids": [i for i in m.fact_ids if i in valid_facts],
                                "safe_adjacent_phrasing": (
                                    m.safe_adjacent_phrasing
                                    if set(m.fact_ids) <= valid_facts
                                    else []
                                ),
                            }
                        )
                        for m in strategy.mappings
                    ],
                }
            )
            selection.update({"selected": decisions, "selector": selector})
        # Also accept the mapper's tool discoveries when their exact names occur in evidence.
        source = _experience_tools(
            source, [*state["job_analysis"].requested_tools, *strategy.verified_skill_allowlist]
        )
        strategy = strategy.model_copy(
            update={
                "verified_skill_allowlist": list(
                    dict.fromkeys(
                        [
                            *strategy.verified_skill_allowlist,
                            *(f.source_span for f in source.facts if f.kind == "tool"),
                        ]
                    )
                ),
            }
        )
        strategy = self._recover_strategy(
            strategy,
            source,
            {item.requirement_id: item.text for item in state["job_analysis"].requirements},
        )
        return {
            "source": source,
            "project_selection": selection,
            "critic_strategy": strategy,
            "usage": self._append_usage(state, usage),
        }

    def validate_strategy_node(self, state: GraphState) -> dict[str, Any]:
        requirement_ids = {item.requirement_id for item in state["job_analysis"].requirements}
        checks = validate_strategy(state["critic_strategy"], state["source"], requirement_ids)
        return {"strategy_checks": checks}

    def craft(self, state: GraphState) -> dict[str, Any]:
        if has_errors(state.get("strategy_checks", [])):
            return {
                "draft": ResumeDraft(summary=[], experience=[], projects=[], skills=[]),
            }
        request = state["request"]
        draft, usage = self.llm.complete(
            stage="fit_length" if "draft" in state else "craft",
            model=self.config.writer_model,
            output_type=ResumeDraft,
            system=CRAFT_SYSTEM,
            payload={
                "job_analysis": state["job_analysis"].model_dump(mode="json"),
                "critic_strategy": state["critic_strategy"].model_dump(mode="json"),
                "resume_facts": [fact.model_dump(mode="json") for fact in state["source"].facts],
                "roles": [group.model_dump(mode="json") for group in state["source"].roles],
                # Each role's own bullet count in the base résumé -- CRAFT_SYSTEM
                # uses it as a reference point (not a hard target) so a role
                # that legitimately had 2 bullets doesn't get inflated to 6,
                # and one that had 6 doesn't get flattened to 1, independent
                # of what the model can already infer by counting each role's
                # own body_fact_ids in the "roles" payload above -- naming it
                # explicitly is more reliable than expecting that under
                # everything else CRAFT_SYSTEM already asks of one call.
                "role_bullet_counts": {
                    group.group_id: len(group.body_fact_ids) for group in state["source"].roles
                },
                "projects": [group.model_dump(mode="json") for group in state["source"].projects],
                "allow_synthetic_metrics": request.allow_synthetic_metrics,
                "include_summary": state["effective_include_summary"],
                "word_budget": {
                    "minimum": state.get("min_resume_words", self.config.min_resume_words),
                    "maximum": state.get("max_resume_words", self.config.max_resume_words),
                },
                "previous_draft": state["draft"].model_dump(mode="json")
                if "draft" in state
                else None,
                "previous_word_count": count_resume_words(
                    render_resume(state["draft"], state["source"])
                )
                if "draft" in state
                else None,
                "revision_errors": [
                    c.model_dump(mode="json")
                    for c in state.get("compliance_ledger", [])
                    if not c.passed and c.severity == "error"
                ],
            },
            max_tokens=9000,
            effort="medium",
        )
        draft = self._apply_preferences(draft, state)
        if state["effective_include_summary"] and not draft.summary:
            raise PipelineFailure("Requested professional summary was missing from the model draft")
        draft = attach_metric_fact_ids(draft, state["source"])
        return {"draft": draft, "usage": self._append_usage(state, usage)}

    @staticmethod
    def _apply_preferences(draft: ResumeDraft, state: GraphState) -> ResumeDraft:
        return draft.model_copy(
            update={
                "summary": draft.summary if state["effective_include_summary"] else [],
                "skills": [
                    SkillsCategory(category=group.category, items=group.items)
                    for group in state["critic_strategy"].skill_categories
                ],
            }
        )

    def lint(self, state: GraphState) -> dict[str, Any]:
        checks = lint_draft(
            state["draft"],
            state["source"],
            state["critic_strategy"],
            state["request"].allow_synthetic_metrics,
        )
        words = count_resume_words(render_resume(state["draft"], state["source"]))
        min_words = state.get("min_resume_words", self.config.min_resume_words)
        max_words = state.get("max_resume_words", self.config.max_resume_words)
        checks.append(
            check(
                "length.word_count",
                min_words - WORD_COUNT_TOLERANCE <= words <= max_words + WORD_COUNT_TOLERANCE,
                "resume_length",
                f"Rendered resume has {words} words; target {min_words}-{max_words} "
                f"(derived from the base résumé's own {state.get('source_word_count', '?')}-word "
                "length). Prioritize relevant experience, use 2-3 project bullets; preserve company "
                "names, dates, coursework, skills and summary choice. Expand with supplied evidence "
                "only; never pad or invent content.",
            )
        )
        if state.get("fit_length_failure"):
            checks.append(check("length.fit_unavailable", False, "resume_length",
                "Length fitting failed; the earlier draft was retained and requires review."))
        return {"lint_checks": checks}

    def semantic_review(self, state: GraphState) -> dict[str, Any]:
        lint_checks = state["lint_checks"]
        usage = state.get("usage", [])
        if has_errors(lint_checks):
            review_checks = lint_checks
        else:
            pairs = claim_evidence_pairs(state["draft"], state["source"])
            review, record = self.llm.complete(
                stage="semantic_review",
                model=self.config.review_model,
                output_type=SemanticReview,
                system=SEMANTIC_REVIEW_SYSTEM,
                payload={"claim_evidence_pairs": pairs},
                max_tokens=3000,
                effort="low",
            )
            review_checks = [
                *lint_checks,
                *validate_semantic_review(review, pairs, state["source"]),
            ]
            usage = [*usage, record]
            missing = {c.field_path for c in review_checks if c.code == "review.missing_claim"}
            if missing:
                # One bounded coverage retry; keep every genuine failure from the first review.
                try:
                    coverage, record = self.llm.complete(
                        stage="semantic_review_coverage", model=self.config.review_model,
                        output_type=SemanticReview, system=SEMANTIC_REVIEW_SYSTEM,
                        payload={"claim_evidence_pairs": [p for p in pairs if p["field_path"] in missing]},
                        max_tokens=4000, effort="low",
                    )
                except (ModelOutputError, ProviderRequestError) as error:
                    coverage, record = SemanticReview(checks=[]), getattr(error, "usage", None)
                review = review.model_copy(update={"checks": [*review.checks, *coverage.checks]})
                review_checks = [*lint_checks, *validate_semantic_review(review, pairs, state["source"])]
                usage = [*usage, *([record] if record is not None else [])]
        ledger = [*state.get("strategy_checks", []), *review_checks]
        history = state.get("violation_history", [])
        repair_payload: dict[str, Any] = {}
        if has_errors(ledger):
            error_count = sum(
                not item.passed and item.severity == "error" and not item.waiver for item in ledger
            )
            history = [
                *history,
                ViolationSnapshot(
                    fingerprint=violation_fingerprint(ledger), error_count=error_count,
                    phase="deterministic" if has_errors(lint_checks) else "semantic",
                ),
            ]
            repair_payload = make_repair_payload(
                state["draft"],
                state["source"],
                state["critic_strategy"],
                ledger,
                state["request"].allow_synthetic_metrics,
            )
        return {
            "compliance_ledger": ledger,
            "violation_history": history,
            "repair_payload": repair_payload,
            "usage": usage,
        }

    def route_review(self, state: GraphState) -> Literal["repair", "render", "needs_review"]:
        if not has_errors(state["compliance_ledger"]):
            return "render"
        if has_errors(state.get("strategy_checks", [])):
            return "needs_review"
        history = state["violation_history"]
        if state["revision_count"] >= self.config.max_repairs:
            # Reserve one targeted correction for the first semantic review after
            # deterministic repairs/length fitting. Never extend a stalled phase.
            first_semantic = (history[-1].phase == "semantic"
                              and sum(s.phase == "semantic" for s in history) == 1)
            if not (self.config.max_repairs > 0 and first_semantic
                    and state["revision_count"] == self.config.max_repairs):
                return "needs_review"
        if all(
            c.code == "length.word_count"
            for c in state["compliance_ledger"]
            if not c.passed and c.severity == "error" and not c.waiver
        ):
            return "repair"
        if len(history) >= 2 and history[-1].phase == history[-2].phase:
            current, previous = history[-1], history[-2]
            repeated = current.fingerprint in {item.fingerprint for item in history[:-1]
                                               if item.phase == current.phase}
            if repeated or current.error_count >= previous.error_count:
                return "needs_review"
        return "repair"

    def repair(self, state: GraphState) -> dict[str, Any]:
        failures = [c for c in state["compliance_ledger"]
                    if not c.passed and c.severity == "error" and not c.waiver]
        if failures and all(c.code == "length.word_count" for c in failures):
            try:
                result = self.craft(state)
            except (ModelOutputError, ProviderRequestError) as error:
                # Retain the earlier schema-valid draft; never replace it with partial JSON.
                usage = getattr(error, "usage", None)
                return {"draft": state["draft"], "revision_count": self.config.max_repairs,
                    "fit_length_failure": error.__class__.__name__,
                    "usage": [*state.get("usage", []), *([usage] if usage is not None else [])]}
            return {**result, "revision_count": state["revision_count"] + 1}
        repair, usage = self.llm.complete(
            stage="repair",
            model=self.config.writer_model,
            output_type=RepairOutput,
            system=REPAIR_SYSTEM,
            payload={
                **state["repair_payload"],
                "include_summary": state["effective_include_summary"],
            },
            max_tokens=4500,
            effort="low",
        )
        failing_paths = {
            item.field_path
            for item in state["compliance_ledger"]
            if not item.passed and item.severity == "error" and not item.waiver
        }
        try:
            draft = apply_repair(state["draft"], repair, failing_paths)
        except ValueError:
            draft = state["draft"]
        draft = self._apply_preferences(draft, state)
        draft = attach_metric_fact_ids(draft, state["source"])
        return {
            "draft": draft,
            "revision_count": state["revision_count"] + 1,
            "usage": self._append_usage(state, usage),
        }

    def render(self, state: GraphState) -> dict[str, Any]:
        markdown = render_resume(state["draft"], state["source"])
        protection = rendered_protection_checks(markdown, state["source"], state["draft"])
        if has_errors(protection):
            raise PipelineFailure("deterministic renderer lost a protected source value")
        status = "completed_with_estimates" if draft_uses_estimates(state["draft"]) else "completed"
        return {
            "resume_markdown": markdown,
            "compliance_ledger": [*state["compliance_ledger"], *protection],
            "terminal_status": status,
        }

    def needs_review(self, state: GraphState) -> dict[str, Any]:
        markdown = render_resume(state["draft"], state["source"])
        protection = rendered_protection_checks(markdown, state["source"], state["draft"])
        ledger = [*state["compliance_ledger"], *protection]
        # Factual failures must not become exportable, billable review output.
        reviewable = {"length.word_count", "length.fit_unavailable", "experience.bullet_count", "project.bullet_count", "projects.bullet_count",
                      "projects.purpose_order", "skills.category_count", "experience.metric_count",
                      "projects.metric_count"}
        unsafe = any(not item.passed and item.severity == "error" and not item.waiver
                     and item.code not in reviewable for item in ledger)
        return {
            "resume_markdown": "" if unsafe else markdown,
            "compliance_ledger": ledger,
            "terminal_status": "failed" if unsafe else "needs_review",
        }

    def _build_graph(self, checkpointer: Any):
        builder = StateGraph(GraphState)
        builder.add_node("prepare_source", self.prepare_source)
        builder.add_node("analyze_jd", self.analyze_jd)
        builder.add_node("map_adjacency", self.map_adjacency)
        builder.add_node("validate_strategy", self.validate_strategy_node)
        builder.add_node("craft", self.craft)
        builder.add_node("lint", self.lint)
        builder.add_node("semantic_review", self.semantic_review)
        builder.add_node("repair", self.repair)
        builder.add_node("render", self.render)
        builder.add_node("needs_review", self.needs_review)
        builder.add_edge(START, "prepare_source")
        builder.add_edge("prepare_source", "analyze_jd")
        builder.add_edge("analyze_jd", "map_adjacency")
        builder.add_edge("map_adjacency", "validate_strategy")
        builder.add_edge("validate_strategy", "craft")
        builder.add_edge("craft", "lint")
        builder.add_edge("lint", "semantic_review")
        builder.add_conditional_edges("semantic_review", self.route_review)
        builder.add_edge("repair", "lint")
        builder.add_edge("render", END)
        builder.add_edge("needs_review", END)
        return builder.compile(checkpointer=checkpointer)

    def run(self, request: RunRequest, *, thread_id: str | None = None) -> PipelineResult:
        thread_id = thread_id or uuid.uuid4().hex
        try:
            state = self.graph.invoke(
                {"request": request, "usage": []},
                {"configurable": {"thread_id": thread_id}},
            )
            failures = [
                item.code
                for item in state.get("compliance_ledger", [])
                if not item.passed and item.severity == "error" and not item.waiver
            ]
            return PipelineResult(
                word_count=count_resume_words(state["resume_markdown"]),
                source_word_count=state.get("source_word_count", 0),
                length_mode=state.get("length_mode", "single_page"),
                status=state["terminal_status"],
                resume_markdown=state["resume_markdown"],
                source_hash=state["resume_hash"],
                job_hash=state["job_hash"],
                compliance_ledger=state.get("compliance_ledger", []),
                source_facts=state["source"].facts,
                claim_provenance=claim_provenance(state["draft"], state["source"]),
                usage=state.get("usage", []),
                revision_count=state.get("revision_count", 0),
                cache_hit=state.get("cache_hit", False),
                project_selection=state.get("project_selection", {}),
                error=", ".join(sorted(set(failures)))
                if state["terminal_status"] in {"needs_review", "failed"}
                else "",
            )
        except BatchPending:
            raise
        except Exception as error:
            return PipelineResult(
                status="failed",
                resume_markdown="",
                source_hash=sha256_text(request.original_resume),
                job_hash=sha256_text(normalize_document(request.job_description)),
                compliance_ledger=[],
                source_facts=[],
                claim_provenance=[],
                usage=[],
                revision_count=0,
                cache_hit=False,
                error=f"{error.__class__.__name__}: {error}",
            )
