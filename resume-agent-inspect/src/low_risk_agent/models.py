from __future__ import annotations

from typing import Any, Literal, TypedDict

from pydantic import BaseModel, ConfigDict, Field

ANALYZER_MODEL = "google/gemini-3.8-flash"
WRITER_MODEL = "openai/gpt-5.6-terra"
REVIEW_MODEL = "google/gemini-3.8-flash"

TerminalStatus = Literal["completed", "completed_with_estimates", "needs_review", "failed"]
OwnershipLevel = Literal["none", "contributor", "lead"]
FactOrigin = Literal["source", "synthetic_estimate"]
FactKind = Literal[
    "identity",
    "employer",
    "title",
    "date",
    "role_header",
    "responsibility",
    "project_header",
    "project_detail",
    "skill",
    "tool",
    "architecture",
    "domain",
    "education",
    "coursework",
    "metric",
    "other",
]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class FrozenModel(StrictModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class RunRequest(FrozenModel):
    original_resume: str = Field(min_length=1)
    job_description: str = Field(min_length=1)
    tenant_id: str = Field(min_length=1)
    # None = inherit from the base résumé (does it have a Summary/Profile
    # section today?); an explicit True/False overrides that inheritance.
    include_summary: bool | None = None
    allow_synthetic_metrics: bool = False
    project_library: str = ""
    project_library_name: str = ""


class SourceFact(FrozenModel):
    fact_id: str
    kind: FactKind
    source_span: str
    span_start: int = Field(ge=0)
    span_end: int = Field(gt=0)
    role_or_project_id: str
    ownership_level: OwnershipLevel
    origin: Literal["source"] = "source"
    protected: bool = False
    source_document: str = "resume"


class SourceGroup(FrozenModel):
    group_id: str
    header_fact_ids: list[str]
    body_fact_ids: list[str]


class AmbiguousBlock(FrozenModel):
    source_span: str
    span_start: int = Field(ge=0)
    span_end: int = Field(gt=0)


class ResumeSource(FrozenModel):
    original_hash: str
    normalized_hash: str
    facts: list[SourceFact]
    protected_fact_ids: list[str]
    preamble_fact_ids: list[str]
    roles: list[SourceGroup]
    projects: list[SourceGroup]
    education_fact_ids: list[str]
    preserved_fact_ids: list[str]
    ambiguous_blocks: list[AmbiguousBlock]
    skill_categories: dict[str, list[str]] = Field(default_factory=dict)
    # Did the base résumé have its own Summary/Profile section? Content isn't
    # preserved (the tailored summary is always regenerated from evidence),
    # only presence — this drives include_summary inheritance.
    has_summary: bool = False
    # First-occurrence order of the base résumé's own recognized top-level
    # sections (values from SECTION_NAMES, e.g. ["experience", "summary",
    # "projects", ...]) — drives render_resume()'s output order instead of a
    # fixed constant order. Empty when no headings were recognized at all.
    section_order: list[str] = Field(default_factory=list)


class FallbackFact(StrictModel):
    kind: FactKind
    source_span: str = Field(description="Exact verbatim substring from the supplied resume block")


class FallbackFacts(StrictModel):
    facts: list[FallbackFact]


class JobRequirement(StrictModel):
    requirement_id: str
    text: str
    evidence_span: str = Field(description="Exact verbatim substring from the job description")
    priority: Literal["must", "preferred", "context"]


class JobAnalysis(StrictModel):
    requirements: list[JobRequirement]
    ats_terms: list[str]
    traps: list[str]
    requested_tools: list[str]


class RequirementMapping(StrictModel):
    requirement_id: str
    fact_ids: list[str]
    safe_adjacent_phrasing: list[str]
    disposition: Literal["supported", "adjacent", "gap"] = "supported"


class SkillCategoryPlan(StrictModel):
    category: str
    items: list[str]


class ProjectChoice(StrictModel):
    project_id: str
    requirement_ids: list[str]
    reason: str


class CriticStrategy(StrictModel):
    mappings: list[RequirementMapping]
    verified_skill_allowlist: list[str]
    unsupported_gaps: list[str]
    skill_categories: list[SkillCategoryPlan]
    selected_projects: list[ProjectChoice] = Field(default_factory=list)


class MetricAnnotation(StrictModel):
    literal: str
    origin: FactOrigin
    fact_id: str


BulletPurpose = Literal["summary", "experience", "objective", "design", "outcome"]


class DraftBullet(StrictModel):
    text: str
    purpose: BulletPurpose
    fact_ids: list[str]
    ownership_level: OwnershipLevel
    metrics: list[MetricAnnotation]


class ExperienceDraft(StrictModel):
    role_id: str
    title: str = ""
    bullets: list[DraftBullet]


class ProjectDraft(StrictModel):
    project_id: str
    title: str = ""
    bullets: list[DraftBullet]


class SkillsCategory(StrictModel):
    category: str
    items: list[str]


class OmittedRole(StrictModel):
    role_id: str
    reason: str = Field(min_length=1)


class ResumeDraft(StrictModel):
    summary: list[DraftBullet]
    experience: list[ExperienceDraft]
    projects: list[ProjectDraft]
    skills: list[SkillsCategory]
    # Self-reported justification for any role missing from `experience`
    # relative to the source résumé (see experience.role_omission_bound in
    # policy.py — at most one, never the most recent). Optional and
    # non-blocking: absence of a matching entry is flagged (see
    # experience.role_omission_reason in policy.py) but never fails
    # generation on its own, since the repair loop has no dedicated path
    # for patching just this field.
    omitted_roles: list[OmittedRole] = Field(default_factory=list)


class ComplianceCheck(StrictModel):
    code: str
    passed: bool
    severity: Literal["error", "warning", "info"]
    field_path: str
    evidence_ids: list[str]
    repair_message: str
    waiver: str


class SemanticReview(StrictModel):
    checks: list[ComplianceCheck]


class BulletReplacement(StrictModel):
    field_path: str
    bullet: DraftBullet


class RepairOutput(StrictModel):
    bullet_replacements: list[BulletReplacement]
    role_replacements: list[ExperienceDraft]
    project_replacements: list[ProjectDraft]
    skills_replacement: list[SkillsCategory]


class TokenUsage(FrozenModel):
    stage: str
    model: str
    input_tokens: int = Field(ge=0)
    output_tokens: int = Field(ge=0)
    cache_read_tokens: int = Field(ge=0)
    cache_write_tokens: int = Field(ge=0)
    estimated_cost_usd: float = Field(ge=0)
    provider_cost_usd: float | None = Field(default=None, ge=0)
    request_id: str


class ClaimProvenance(FrozenModel):
    field_path: str
    text: str
    fact_ids: list[str]
    metrics: list[MetricAnnotation]


class ViolationSnapshot(FrozenModel):
    fingerprint: str
    error_count: int = Field(ge=1)


class PipelineConfig(FrozenModel):
    # Single-page mode target — unchanged default. A base résumé that is
    # itself already this size or smaller keeps targeting this exact range.
    # A longer base résumé gets a proportional, wider target instead (see
    # render.estimate_word_budget) rather than being compressed to fit here.
    min_resume_words: int = Field(default=525, ge=0)
    max_resume_words: int = Field(default=650, ge=1)
    analyzer_model: str = ANALYZER_MODEL
    writer_model: str = WRITER_MODEL
    review_model: str = REVIEW_MODEL
    analyzer_prompt_version: str = "jd-analysis-v6"
    schema_version: str = "resume-state-v3"
    analyzer_version: str = "analyzer-v2"
    max_repairs: int = Field(default=2, ge=0, le=2)
    transient_retries: int = Field(default=1, ge=0, le=3)
    timeout_seconds: float = Field(default=45.0, gt=0)


class PipelineResult(FrozenModel):
    word_count: int = 0
    # Observability only — what the base résumé's own word count was and
    # which length mode that selected. Does not affect pipeline behavior.
    source_word_count: int = 0
    length_mode: Literal["single_page", "multi_page"] = "single_page"
    status: TerminalStatus
    resume_markdown: str
    source_hash: str
    job_hash: str
    compliance_ledger: list[ComplianceCheck]
    source_facts: list[SourceFact]
    claim_provenance: list[ClaimProvenance]
    usage: list[TokenUsage]
    revision_count: int
    cache_hit: bool
    error: str
    project_selection: dict[str, Any] = Field(default_factory=dict)


class GraphState(TypedDict, total=False):
    request: RunRequest
    source: ResumeSource
    resume_hash: str
    job_hash: str
    # Computed once in prepare_source from the base résumé's own length;
    # craft()/lint() read these instead of the static config defaults.
    min_resume_words: int
    max_resume_words: int
    source_word_count: int
    length_mode: Literal["single_page", "multi_page"]
    # Resolved include_summary decision (request override, else source.has_summary).
    effective_include_summary: bool
    job_analysis: JobAnalysis
    cache_hit: bool
    critic_strategy: CriticStrategy
    strategy_checks: list[ComplianceCheck]
    draft: ResumeDraft
    lint_checks: list[ComplianceCheck]
    compliance_ledger: list[ComplianceCheck]
    repair_payload: dict[str, Any]
    revision_count: int
    violation_history: list[ViolationSnapshot]
    terminal_status: TerminalStatus
    resume_markdown: str
    usage: list[TokenUsage]
    project_selection: dict[str, Any]
