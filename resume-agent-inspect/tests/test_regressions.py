from __future__ import annotations

import unittest

from low_risk_agent.models import (
    BulletReplacement,
    ComplianceCheck,
    CriticStrategy,
    DraftBullet,
    ExperienceDraft,
    MetricAnnotation,
    RepairOutput,
    ResumeDraft,
    SemanticReview,
    SkillCategoryPlan,
)
from low_risk_agent.policy import (
    apply_repair,
    claim_evidence_pairs,
    lint_draft,
    validate_semantic_review,
    validate_strategy,
)
from low_risk_agent.source import extract_source

RESUME = """Jane Doe

Experience
Acme Corp | Engineer | 2023 - Present
- Built reliable APIs in 2023.

Skills
Python
"""


class RegressionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.source = extract_source(RESUME)
        self.role = self.source.roles[0]
        self.action = next(fact for fact in self.source.facts if fact.kind == "responsibility")
        self.metric = next(fact for fact in self.source.facts if fact.kind == "metric")
        self.skill = next(fact for fact in self.source.facts if fact.kind == "skill")
        self.strategy = CriticStrategy(
            mappings=[],
            verified_skill_allowlist=["Python"],
            unsupported_gaps=[],
            skill_categories=[],
        )

    def lint_for(self, bullet: DraftBullet):
        draft = ResumeDraft(
            summary=[],
            experience=[ExperienceDraft(role_id=self.role.group_id, bullets=[bullet])],
            projects=[],
            skills=[],
        )
        return lint_draft(draft, self.source, self.strategy, True)

    def test_metric_provenance_rejects_numeric_substrings(self) -> None:
        bullet = DraftBullet(
            text="Built reliable APIs for 20 services.",
            purpose="experience",
            fact_ids=[self.action.fact_id, self.metric.fact_id],
            ownership_level="contributor",
            metrics=[MetricAnnotation(literal="20", origin="source", fact_id=self.metric.fact_id)],
        )

        provenance = [item for item in self.lint_for(bullet) if item.code == "metric.provenance"]
        self.assertEqual(1, len(provenance))
        self.assertFalse(provenance[0].passed)

    def test_declared_ownership_cannot_exceed_cited_evidence(self) -> None:
        bullet = DraftBullet(
            text="Built reliable APIs.",
            purpose="experience",
            fact_ids=[self.action.fact_id],
            ownership_level="lead",
            metrics=[],
        )

        ownership = [item for item in self.lint_for(bullet) if item.code == "claim.ownership_level"]
        self.assertEqual(1, len(ownership))
        self.assertFalse(ownership[0].passed)

    def test_leadership_verbs_cannot_hide_behind_modifiers(self) -> None:
        for text in ("Successfully led reliable APIs.", "Co-led reliable APIs."):
            with self.subTest(text=text):
                bullet = DraftBullet(
                    text=text,
                    purpose="experience",
                    fact_ids=[self.action.fact_id],
                    ownership_level="contributor",
                    metrics=[],
                )
                ownership = [
                    item for item in self.lint_for(bullet) if item.code == "claim.ownership"
                ]
                self.assertEqual(1, len(ownership))
                self.assertFalse(ownership[0].passed)

    def test_skills_require_exact_skill_facts_and_safe_categories(self) -> None:
        source = extract_source(
            """Jane Doe

Experience
Acme Corp | Marketer | 2020 - Present
- Built go-to-market programs.
"""
        )
        strategy = CriticStrategy(
            mappings=[],
            verified_skill_allowlist=["Go"],
            unsupported_gaps=[],
            skill_categories=[SkillCategoryPlan(category="Robotics & Autonomy", items=["Go"])],
        )

        checks = validate_strategy(strategy, source, set())
        self.assertTrue(
            any(item.code == "strategy.skill_source" and not item.passed for item in checks)
        )
        self.assertTrue(
            any(item.code == "strategy.skill_category" and not item.passed for item in checks)
        )

    def test_targeted_repair_cannot_change_passing_bullets(self) -> None:
        first = DraftBullet(
            text="Built reliable APIs.",
            purpose="experience",
            fact_ids=[self.action.fact_id],
            ownership_level="contributor",
            metrics=[],
        )
        second = first.model_copy(update={"text": "Built deployment checks."})
        draft = ResumeDraft(
            summary=[],
            experience=[ExperienceDraft(role_id=self.role.group_id, bullets=[first, second])],
            projects=[],
            skills=[],
        )
        changed_passing = second.model_copy(update={"text": "Rewrote passing content."})
        repair = RepairOutput(
            bullet_replacements=[
                BulletReplacement(
                    field_path=f"experience.{self.role.group_id}.bullets.1",
                    bullet=changed_passing,
                )
            ],
            role_replacements=[],
            project_replacements=[],
            skills_replacement=[],
        )

        with self.assertRaisesRegex(ValueError, "passing bullet"):
            apply_repair(
                draft,
                repair,
                {f"experience.{self.role.group_id}.bullets.0"},
            )

    def test_reviewer_cannot_waive_failure_or_cite_unsupplied_fact(self) -> None:
        bullet = DraftBullet(
            text="Built reliable APIs.",
            purpose="summary",
            fact_ids=[self.action.fact_id],
            ownership_level="contributor",
            metrics=[],
        )
        draft = ResumeDraft(summary=[bullet], experience=[], projects=[], skills=[])
        pairs = claim_evidence_pairs(draft, self.source)
        waived = SemanticReview(
            checks=[
                ComplianceCheck(
                    code="semantic.unsupported",
                    passed=False,
                    severity="warning",
                    field_path="summary.0",
                    evidence_ids=[self.action.fact_id],
                    repair_message="Remove unsupported claim.",
                    waiver="reviewer waiver",
                )
            ]
        )
        sanitized = validate_semantic_review(waived, pairs, self.source)
        self.assertEqual("error", sanitized[0].severity)
        self.assertEqual("", sanitized[0].waiver)

        unrelated = SemanticReview(
            checks=[
                ComplianceCheck(
                    code="semantic.support",
                    passed=True,
                    severity="info",
                    field_path="summary.0",
                    evidence_ids=[self.skill.fact_id],
                    repair_message="",
                    waiver="",
                )
            ]
        )
        checked = validate_semantic_review(unrelated, pairs, self.source)
        self.assertTrue(
            any(item.code == "review.invalid_reference" and not item.passed for item in checked)
        )


if __name__ == "__main__":
    unittest.main()
