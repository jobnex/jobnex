from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from low_risk_agent.models import (  # noqa: E402
    CriticStrategy,
    DraftBullet,
    ExperienceDraft,
    MetricAnnotation,
    OmittedRole,
    ProjectDraft,
    RequirementMapping,
    ResumeDraft,
    SkillCategoryPlan,
    SkillsCategory,
)
from low_risk_agent.pipeline import ResumeTailoringPipeline  # noqa: E402
from low_risk_agent.policy import (  # noqa: E402
    check,
    draft_uses_estimates,
    has_errors,
    lint_draft,
    rendered_protection_checks,
    validate_strategy,
)
from low_risk_agent.render import render_resume  # noqa: E402
from low_risk_agent.source import extract_source  # noqa: E402

SOURCE_TEXT = """Avery O'Neil
avery@example.com

Experience
ACME & Co. — Senior Engineer
Jan 2020–Mar 2024
- Led migration across 3 teams, reducing latency 25%.
- Built deployment checks with Python.

Projects
Risk-Safe Agent — 2024
- Built Python guardrails for resume tailoring.

Skills
Python, SQL

Education
B.S. Computer Science — State U, 2019
Coursework: Distributed Systems
"""


class PolicyTests(unittest.TestCase):
    def setUp(self) -> None:
        self.source = extract_source(SOURCE_TEXT)
        self.role = self.source.roles[0]
        self.project = self.source.projects[0]
        self.lead_fact = next(
            fact
            for fact in self.source.facts
            if fact.kind == "responsibility" and fact.source_span.startswith("Led ")
        )
        self.contributor_fact = next(
            fact
            for fact in self.source.facts
            if fact.kind == "responsibility" and fact.source_span.startswith("Built ")
        )
        self.project_fact = next(
            fact for fact in self.source.facts if fact.kind == "project_detail"
        )
        self.metric_facts = {
            fact.source_span: fact for fact in self.source.facts if fact.kind == "metric"
        }
        self.strategy = CriticStrategy(
            mappings=[],
            verified_skill_allowlist=["Python", "SQL"],
            unsupported_gaps=[],
            skill_categories=[SkillCategoryPlan(category="Languages", items=["Python", "SQL"])],
        )
        role_bullet = DraftBullet(
            text="Led migration across 3 teams, reducing latency 25%.",
            purpose="experience",
            fact_ids=[
                self.lead_fact.fact_id,
                self.metric_facts["3"].fact_id,
                self.metric_facts["25%"].fact_id,
            ],
            ownership_level="lead",
            metrics=[
                MetricAnnotation(
                    literal="3", origin="source", fact_id=self.metric_facts["3"].fact_id
                ),
                MetricAnnotation(
                    literal="25%", origin="source", fact_id=self.metric_facts["25%"].fact_id
                ),
            ],
        )
        project_bullets = [
            DraftBullet(
                text=text,
                purpose=purpose,
                fact_ids=[self.project_fact.fact_id],
                ownership_level="contributor",
                metrics=[],
            )
            for purpose, text in (
                ("objective", "Built evidence-linked guardrails."),
                ("design", "Designed deterministic policy checks."),
                ("outcome", "Improved grounded resume output."),
            )
        ]
        self.draft = ResumeDraft(
            summary=[],
            experience=[ExperienceDraft(role_id=self.role.group_id, bullets=[role_bullet])],
            projects=[ProjectDraft(project_id=self.project.group_id, bullets=project_bullets)],
            skills=[SkillsCategory(category="Languages", items=["Python", "SQL"])],
        )

    def policy_check(self, checks, code: str, path_prefix: str = ""):
        matches = [
            item for item in checks if item.code == code and item.field_path.startswith(path_prefix)
        ]
        self.assertEqual(1, len(matches), (code, path_prefix, checks))
        return matches[0]

    def draft_with_role_bullet(self, bullet: DraftBullet) -> ResumeDraft:
        role = ExperienceDraft(role_id=self.role.group_id, bullets=[bullet])
        return self.draft.model_copy(update={"experience": [role]})

    def synthetic_metric_draft(self, count: int, *, fact_id: str = "") -> ResumeDraft:
        literals = ["10%", "20%", "30%", "40%"][:count]
        text = "Built controls" + (f" with {', '.join(literals)}" if literals else "") + "."
        bullet = DraftBullet(
            text=text,
            purpose="experience",
            fact_ids=[self.contributor_fact.fact_id],
            ownership_level="contributor",
            metrics=[
                MetricAnnotation(
                    literal=literal,
                    origin="synthetic_estimate",
                    fact_id=fact_id,
                )
                for literal in literals
            ],
        )
        return self.draft_with_role_bullet(bullet)

    def test_protected_spans_round_trip_exactly_through_renderer(self) -> None:
        protected = {
            fact.fact_id: fact
            for fact in self.source.facts
            if fact.fact_id in self.source.protected_fact_ids
        }
        self.assertTrue(protected)
        for fact in protected.values():
            self.assertEqual(fact.source_span, SOURCE_TEXT[fact.span_start : fact.span_end])

        markdown = render_resume(self.draft, self.source)
        for fact in protected.values():
            self.assertIn(fact.source_span, markdown)
        self.assertTrue(rendered_protection_checks(markdown, self.source)[0].passed)

        altered = markdown.replace("Avery O'Neil", "Avery O’Neil", 1)
        failure = rendered_protection_checks(altered, self.source)[0]
        self.assertFalse(failure.passed)
        self.assertIn(next(iter(self.source.preamble_fact_ids)), failure.evidence_ids)

    def test_unknown_requirement_and_fact_ids_fail(self) -> None:
        strategy = self.strategy.model_copy(
            update={
                "mappings": [
                    RequirementMapping(
                        requirement_id="R_UNKNOWN",
                        fact_ids=[self.lead_fact.fact_id],
                        safe_adjacent_phrasing=[],
                    ),
                    RequirementMapping(
                        requirement_id="R1",
                        fact_ids=["F9999"],
                        safe_adjacent_phrasing=[],
                    ),
                ]
            }
        )
        checks = validate_strategy(strategy, self.source, {"R1"})
        self.assertFalse(self.policy_check(checks, "strategy.requirements").passed)
        unknown_fact = [
            item
            for item in checks
            if item.code == "strategy.fact_ids" and item.evidence_ids == ["F9999"]
        ]
        self.assertEqual(1, len(unknown_fact))
        self.assertFalse(unknown_fact[0].passed)

        bullet = DraftBullet(
            text="Built deployment checks.",
            purpose="experience",
            fact_ids=["F9999"],
            ownership_level="contributor",
            metrics=[],
        )
        lint = lint_draft(self.draft_with_role_bullet(bullet), self.source, self.strategy, False)
        self.assertFalse(self.policy_check(lint, "claim.evidence", "experience.").passed)

    def test_skill_allowlist_duplicates_and_exact_rendered_grammar(self) -> None:
        valid = validate_strategy(self.strategy, self.source, set())
        self.assertTrue(all(item.passed for item in valid), valid)
        markdown = render_resume(self.draft, self.source)
        self.assertIn("\nLanguages : Python, SQL\n", markdown)
        skill_checks = [
            item
            for item in lint_draft(self.draft, self.source, self.strategy, False)
            if item.code.startswith("skills.")
        ]
        self.assertTrue(all(item.passed for item in skill_checks), skill_checks)

        duplicate = self.strategy.model_copy(
            update={"verified_skill_allowlist": ["Python", " python "]}
        )
        self.assertFalse(
            self.policy_check(
                validate_strategy(duplicate, self.source, set()),
                "strategy.skill_duplicates",
            ).passed
        )

        unverified = self.strategy.model_copy(
            update={"verified_skill_allowlist": ["Python", "Rust"]}
        )
        source_checks = [
            item
            for item in validate_strategy(unverified, self.source, set())
            if item.code == "strategy.skill_source"
        ]
        self.assertEqual([True, False], [item.passed for item in source_checks])

        bad_plan = self.strategy.model_copy(
            update={
                "skill_categories": [
                    SkillCategoryPlan(category="Languages", items=["Python", "python", "Rust"])
                ]
            }
        )
        self.assertFalse(
            self.policy_check(
                validate_strategy(bad_plan, self.source, set()),
                "strategy.skill_categories",
            ).passed
        )

        bad_draft = self.draft.model_copy(
            update={
                "skills": [
                    SkillsCategory(category="Languages:", items=["Python", "Rust"]),
                    SkillsCategory(category="languages:", items=[" python ", "SQL: Advanced"]),
                ]
            }
        )
        bad_checks = lint_draft(bad_draft, self.source, self.strategy, False)
        self.assertEqual(
            2,
            sum(not item.passed for item in bad_checks if item.code == "skills.category"),
        )
        self.assertEqual(
            3,
            sum(not item.passed for item in bad_checks if item.code == "skills.item"),
        )

    def test_weak_verbs_fail_with_casing_markdown_and_punctuation(self) -> None:
        weak_openings = (
            "ASSISTED with release automation.",
            "**Helped** with release automation.",
            "_Participated_ in release testing.",
            "`Supported` production releases.",
            "Responsible for: release automation.",
            "Tasked with, release automation.",
        )
        for text in weak_openings:
            with self.subTest(text=text):
                bullet = DraftBullet(
                    text=text,
                    purpose="experience",
                    fact_ids=[self.contributor_fact.fact_id],
                    ownership_level="contributor",
                    metrics=[],
                )
                checks = lint_draft(
                    self.draft_with_role_bullet(bullet),
                    self.source,
                    self.strategy,
                    False,
                )
                self.assertFalse(self.policy_check(checks, "claim.weak_verb", "experience.").passed)

        strong = DraftBullet(
            text="Built release automation.",
            purpose="experience",
            fact_ids=[self.contributor_fact.fact_id],
            ownership_level="contributor",
            metrics=[],
        )
        checks = lint_draft(self.draft_with_role_bullet(strong), self.source, self.strategy, False)
        self.assertTrue(self.policy_check(checks, "claim.weak_verb", "experience.").passed)

    def test_ownership_verbs_require_lead_evidence(self) -> None:
        verbs = (
            "Architected",
            "Directed",
            "Headed",
            "Led",
            "Managed",
            "Owned",
            "Spearheaded",
            "Supervised",
        )
        for verb in verbs:
            with self.subTest(verb=verb):
                bullet = DraftBullet(
                    text=f"{verb} platform migration.",
                    purpose="experience",
                    fact_ids=[self.contributor_fact.fact_id],
                    ownership_level="lead",
                    metrics=[],
                )
                checks = lint_draft(
                    self.draft_with_role_bullet(bullet),
                    self.source,
                    self.strategy,
                    False,
                )
                self.assertFalse(self.policy_check(checks, "claim.ownership", "experience.").passed)

        supported = DraftBullet(
            text="LED platform migration.",
            purpose="experience",
            fact_ids=[self.lead_fact.fact_id],
            ownership_level="none",
            metrics=[],
        )
        checks = lint_draft(
            self.draft_with_role_bullet(supported), self.source, self.strategy, False
        )
        self.assertTrue(self.policy_check(checks, "claim.ownership", "experience.").passed)

    def test_project_bullet_count_allows_one_to_four_in_any_order(self) -> None:
        # Project bullet count/order used to be a rigid fixed shape
        # (2-or-3, objective/design/outcome sequence only). It now scales
        # to genuine evidence: 1-4 bullets, any purpose order.
        valid = lint_draft(self.draft, self.source, self.strategy, False)
        self.assertTrue(self.policy_check(valid, "project.bullet_count", "projects.").passed)
        bullets = self.draft.projects[0].bullets
        valid_sets = (
            bullets[:2],
            [*bullets, bullets[-1]],
            [bullets[1], bullets[0], bullets[2]],
        )
        for reordered in valid_sets:
            with self.subTest(purposes=[item.purpose for item in reordered]):
                project = ProjectDraft.model_construct(
                    project_id=self.project.group_id, bullets=reordered
                )
                draft = self.draft.model_copy(update={"projects": [project]})
                checks = lint_draft(draft, self.source, self.strategy, False)
                self.assertTrue(
                    self.policy_check(checks, "project.bullet_count", "projects.").passed
                )
        for invalid in ([], [*bullets, bullets[-1], bullets[-1]]):
            with self.subTest(purposes=[item.purpose for item in invalid]):
                project = ProjectDraft.model_construct(
                    project_id=self.project.group_id, bullets=invalid
                )
                draft = self.draft.model_copy(update={"projects": [project]})
                checks = lint_draft(draft, self.source, self.strategy, False)
                self.assertFalse(
                    self.policy_check(checks, "project.bullet_count", "projects.").passed
                )

    def _two_role_source_and_draft(self):
        text = (
            "Avery O'Neil\navery@example.com\n\n"
            "Experience\n"
            "ACME & Co. — Senior Engineer\n"
            "Jan 2023–Present\n"
            "- Led migration across 3 teams, reducing latency 25%.\n"
            "Beta Inc. — Engineer\n"
            "Jan 2019–Dec 2022\n"
            "- Built internal tooling for support engineers.\n"
        )
        source = extract_source(text)
        recent_role, older_role = source.roles[0], source.roles[1]
        strategy = CriticStrategy(
            mappings=[], verified_skill_allowlist=[], unsupported_gaps=[], skill_categories=[]
        )

        def bullet_for(role, text):
            fact = next(
                f
                for f in source.facts
                if f.kind == "responsibility" and f.role_or_project_id == role.group_id
            )
            return DraftBullet(
                text=text,
                purpose="experience",
                fact_ids=[fact.fact_id],
                ownership_level="lead",
                metrics=[],
            )

        return source, strategy, recent_role, older_role, bullet_for

    def test_omitting_the_older_role_passes_the_omission_bound(self) -> None:
        source, strategy, recent_role, older_role, bullet_for = self._two_role_source_and_draft()
        draft = ResumeDraft(
            summary=[],
            experience=[
                ExperienceDraft(
                    role_id=recent_role.group_id,
                    bullets=[bullet_for(recent_role, "Led migration across 3 teams.")],
                )
            ],
            projects=[],
            skills=[],
        )
        checks = lint_draft(draft, source, strategy, False)
        self.assertTrue(
            self.policy_check(checks, "experience.role_omission_bound", "experience").passed
        )
        omitted = self.policy_check(checks, "experience.role_omitted", "experience")
        self.assertFalse(omitted.passed)
        self.assertIn(older_role.group_id, omitted.repair_message)
        # No reason was supplied in omitted_roles: flagged, non-blocking.
        missing_reason = self.policy_check(
            checks, "experience.role_omission_reason", "experience"
        )
        self.assertFalse(missing_reason.passed)
        self.assertEqual("warning", missing_reason.severity)

    def test_omitted_role_with_a_stated_reason_does_not_warn_and_is_surfaced(self) -> None:
        source, strategy, recent_role, older_role, bullet_for = self._two_role_source_and_draft()
        draft = ResumeDraft(
            summary=[],
            experience=[
                ExperienceDraft(
                    role_id=recent_role.group_id,
                    bullets=[bullet_for(recent_role, "Led migration across 3 teams.")],
                )
            ],
            projects=[],
            skills=[],
            omitted_roles=[
                OmittedRole(
                    role_id=older_role.group_id,
                    reason="Oldest, least JD-relevant role; needed to fit word_budget.",
                )
            ],
        )
        checks = lint_draft(draft, source, strategy, False)
        self.assertFalse(any(c.code == "experience.role_omission_reason" for c in checks))
        omitted = self.policy_check(checks, "experience.role_omitted", "experience")
        self.assertIn("Oldest, least JD-relevant role", omitted.repair_message)

    def test_omitting_the_most_recent_role_fails_the_omission_bound(self) -> None:
        source, strategy, recent_role, older_role, bullet_for = self._two_role_source_and_draft()
        draft = ResumeDraft(
            summary=[],
            experience=[
                ExperienceDraft(
                    role_id=older_role.group_id,
                    bullets=[bullet_for(older_role, "Built internal tooling.")],
                )
            ],
            projects=[],
            skills=[],
        )
        checks = lint_draft(draft, source, strategy, False)
        self.assertFalse(
            self.policy_check(checks, "experience.role_omission_bound", "experience").passed
        )

    def test_no_omission_check_fires_when_every_role_is_kept(self) -> None:
        source, strategy, recent_role, older_role, bullet_for = self._two_role_source_and_draft()
        draft = ResumeDraft(
            summary=[],
            experience=[
                ExperienceDraft(
                    role_id=recent_role.group_id,
                    bullets=[bullet_for(recent_role, "Led migration across 3 teams.")],
                ),
                ExperienceDraft(
                    role_id=older_role.group_id,
                    bullets=[bullet_for(older_role, "Built internal tooling.")],
                ),
            ],
            projects=[],
            skills=[],
        )
        checks = lint_draft(draft, source, strategy, False)
        self.assertTrue(
            self.policy_check(checks, "experience.role_omission_bound", "experience").passed
        )
        self.assertFalse(any(c.code == "experience.role_omitted" for c in checks))
        self.assertFalse(any(c.code == "experience.role_omission_reason" for c in checks))

    def test_each_role_requires_two_or_three_metrics(self) -> None:
        for count, expected in ((0, False), (1, False), (2, True), (3, True), (4, False)):
            with self.subTest(count=count):
                checks = lint_draft(
                    self.synthetic_metric_draft(count),
                    self.source,
                    self.strategy,
                    True,
                )
                self.assertEqual(
                    expected,
                    self.policy_check(checks, "experience.metric_count", "experience.").passed,
                )

    def test_metric_count_scales_down_when_source_role_has_no_metrics(self) -> None:
        qualitative_source_text = (
            "Avery O'Neil\navery@example.com\n\n"
            "Experience\n"
            "ACME & Co. — Senior Engineer\n"
            "Jan 2020–Mar 2024\n"
            "- Led qualitative research interviews with stakeholders.\n"
            "- Coordinated cross-team design reviews.\n"
        )
        source = extract_source(qualitative_source_text)
        role = source.roles[0]
        lead_fact = next(
            fact
            for fact in source.facts
            if fact.kind == "responsibility" and fact.source_span.startswith("Led ")
        )
        bullet = DraftBullet(
            text="Led qualitative research interviews with stakeholders.",
            purpose="experience",
            fact_ids=[lead_fact.fact_id],
            ownership_level="lead",
            metrics=[],
        )
        draft = ResumeDraft(
            summary=[],
            experience=[ExperienceDraft(role_id=role.group_id, bullets=[bullet])],
            projects=[],
            skills=[SkillsCategory(category="Languages", items=["Python"])],
        )
        strategy = CriticStrategy(
            mappings=[],
            verified_skill_allowlist=["Python"],
            unsupported_gaps=[],
            skill_categories=[SkillCategoryPlan(category="Languages", items=["Python"])],
        )
        checks = lint_draft(draft, source, strategy, False)
        self.assertTrue(
            self.policy_check(checks, "experience.metric_count", "experience.").passed,
            "a role with zero genuine source metrics must not be forced to cite 2-3",
        )

    def test_metric_count_floor_still_enforced_when_source_has_enough_metrics(self) -> None:
        checks = lint_draft(
            self.synthetic_metric_draft(1, fact_id=self.metric_facts["3"].fact_id),
            self.source,
            self.strategy,
            False,
        )
        self.assertFalse(
            self.policy_check(checks, "experience.metric_count", "experience.").passed,
            "the role has 2 genuine source metrics available, so citing only 1 must still fail",
        )

    def test_metric_provenance_requires_source_or_opted_in_empty_id(self) -> None:
        source_checks = [
            item
            for item in lint_draft(self.draft, self.source, self.strategy, False)
            if item.code == "metric.provenance"
        ]
        self.assertEqual(2, len(source_checks))
        self.assertTrue(all(item.passed for item in source_checks), source_checks)

        synthetic = self.synthetic_metric_draft(2)
        opted_in = [
            item
            for item in lint_draft(synthetic, self.source, self.strategy, True)
            if item.code == "metric.provenance"
        ]
        opted_out = [
            item
            for item in lint_draft(synthetic, self.source, self.strategy, False)
            if item.code == "metric.provenance"
        ]
        self.assertTrue(all(item.passed for item in opted_in), opted_in)
        self.assertTrue(all(not item.passed for item in opted_out), opted_out)

        forged_synthetic = self.synthetic_metric_draft(2, fact_id=self.contributor_fact.fact_id)
        forged_checks = [
            item
            for item in lint_draft(forged_synthetic, self.source, self.strategy, True)
            if item.code == "metric.provenance"
        ]
        self.assertTrue(all(not item.passed for item in forged_checks), forged_checks)

        unsupported_source = DraftBullet(
            text="Built controls improving output 99%.",
            purpose="experience",
            fact_ids=[self.contributor_fact.fact_id],
            ownership_level="contributor",
            metrics=[
                MetricAnnotation(
                    literal="99%",
                    origin="source",
                    fact_id=self.contributor_fact.fact_id,
                )
            ],
        )
        unsupported_checks = [
            item
            for item in lint_draft(
                self.draft_with_role_bullet(unsupported_source),
                self.source,
                self.strategy,
                False,
            )
            if item.code == "metric.provenance"
        ]
        self.assertEqual(1, len(unsupported_checks))
        self.assertFalse(unsupported_checks[0].passed)

    def test_estimate_and_error_helpers_drive_terminal_status(self) -> None:
        self.assertFalse(draft_uses_estimates(self.draft))
        synthetic = self.synthetic_metric_draft(2)
        self.assertTrue(draft_uses_estimates(synthetic))

        completed = ResumeTailoringPipeline.render(
            None,
            {"draft": self.draft, "source": self.source, "compliance_ledger": []},
        )
        completed_with_estimates = ResumeTailoringPipeline.render(
            None,
            {"draft": synthetic, "source": self.source, "compliance_ledger": []},
        )
        self.assertEqual("completed", completed["terminal_status"])
        self.assertEqual(
            "completed_with_estimates",
            completed_with_estimates["terminal_status"],
        )

        passed = check("test", True, "field", "repair")
        failed = check("test", False, "field", "repair")
        warning = check("test", False, "field", "repair", severity="warning")
        waived = check("test", False, "field", "repair", waiver="accepted")
        self.assertEqual("", passed.repair_message)
        self.assertEqual("repair", failed.repair_message)
        self.assertFalse(has_errors([passed, warning, waived]))
        self.assertTrue(has_errors([failed]))


if __name__ == "__main__":
    unittest.main()
