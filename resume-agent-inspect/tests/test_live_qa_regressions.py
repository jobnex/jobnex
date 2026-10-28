import unittest

from low_risk_agent.models import (
    CriticStrategy, DraftBullet, ExperienceDraft, MetricAnnotation, RepairOutput,
    ResumeDraft, RunRequest, SemanticReview, ViolationSnapshot,
)
from low_risk_agent.pipeline import ResumeTailoringPipeline
from low_risk_agent.policy import OWNERSHIP_VERB, attach_metric_fact_ids, check
from low_risk_agent.render import render_resume
from low_risk_agent.source import METRIC, extract_source
from fakes import ScriptedLLM


class LiveQARegressions(unittest.TestCase):
    def test_first_semantic_failure_gets_one_reserved_repair_after_length(self):
        pipeline = ResumeTailoringPipeline(llm=ScriptedLLM())
        state = {"compliance_ledger": [check("domain", False, "summary.0", "repair")],
                 "revision_count": 2, "violation_history": [
                     ViolationSnapshot(fingerprint="length", error_count=1),
                     ViolationSnapshot(fingerprint="semantic", error_count=2, phase="semantic")]}
        self.assertEqual("repair", pipeline.route_review(state))
        state["revision_count"] = 3
        self.assertEqual("needs_review", pipeline.route_review(state))
        state["revision_count"] = 2
        state["violation_history"].append(ViolationSnapshot(fingerprint="semantic", error_count=2,
                                                          phase="semantic"))
        self.assertEqual("needs_review", pipeline.route_review(state))

    def test_partial_semantic_review_retries_missing_claims_and_keeps_failures(self):
        source = extract_source("## Experience\nEngineer | Alpha\n- Built APIs.\n")
        body = next(f for f in source.facts if f.kind == "responsibility")
        bullet = DraftBullet(text="Built APIs.", purpose="summary", fact_ids=[body.fact_id],
                            ownership_level="contributor", metrics=[])
        for coverage_pass in (True, False):
            def coverage(payload):
                self.assertEqual(["summary.1"], [p["field_path"] for p in payload["claim_evidence_pairs"]])
                return SemanticReview(checks=[check("grounded", True, "summary.1", "",
                    evidence_ids=[body.fact_id])] if coverage_pass else [])
            llm = ScriptedLLM({
                "semantic_review": lambda _: SemanticReview(checks=[check("domain", False,
                    "summary.0", "Remove unsupported domain", evidence_ids=[body.fact_id])]),
                "semantic_review_coverage": coverage,
            })
            state = {"draft": ResumeDraft(summary=[bullet, bullet], experience=[], projects=[], skills=[]),
                     "source": source, "lint_checks": [], "strategy_checks": [],
                     "request": RunRequest(original_resume="source", job_description="job", tenant_id="test"),
                     "critic_strategy": CriticStrategy(mappings=[], verified_skill_allowlist=[],
                         unsupported_gaps=[], skill_categories=[])}
            result = ResumeTailoringPipeline(llm=llm).semantic_review(state)
            errors = [c for c in result["compliance_ledger"] if not c.passed]
            self.assertTrue(any(c.code == "domain" for c in errors))
            self.assertEqual(not coverage_pass, any(c.code == "review.missing_claim" for c in errors))
            self.assertEqual(1, llm.counts["semantic_review_coverage"])

    def test_numeric_units_do_not_consume_words_or_drop_glued_percentages(self):
        self.assertEqual(["25%", "20", "100ms"],
                         [m.group() for m in METRIC.finditer("25%and 20 scenarios at 100ms latency")])

    def test_glued_unicode_bullets_keep_three_projects_and_verbatim_facts(self):
        resume = """# Avery Doe
## Projects
Search PlatformPython | FastAPI | Redis
| Docker
•Designed a search service with match-
ing and retrieval.
•Built reliable endpoints.
AgentWorkflowInfrastructurePython|FastAPI|LangGraph
•Built an agent service.
Data Pipeline Python | Kafka | SQL
•Developed ingestion jobs.
"""
        source = extract_source(resume)
        self.assertEqual(3, len(source.projects))
        self.assertEqual([2, 1, 1], [len(p.body_fact_ids) for p in source.projects])
        self.assertFalse(source.ambiguous_blocks)
        actions = [f for f in source.facts if f.kind == "project_detail"]
        self.assertEqual("contributor", actions[0].ownership_level)
        self.assertFalse(any("•" in f.source_span for f in source.facts))
        for fact in source.facts:
            self.assertEqual(fact.source_span, resume[fact.span_start:fact.span_end])

    def test_wrapped_skills_render_complete_words_and_keep_exact_evidence(self):
        resume = """# Avery Doe
## Skills
Backend: Python, Dis-
tributed Systems, REST APIs
Data: SQL, Data
Pipelines
DevOps: Docker, Mon-
itoring
"""
        source = extract_source(resume)
        self.assertEqual(3, len(source.skill_categories))
        self.assertEqual(["SQL", "Data\nPipelines"], source.skill_categories["Data"])
        from low_risk_agent.models import SkillsCategory
        draft = ResumeDraft(summary=[], experience=[], projects=[], skills=[
            SkillsCategory(category=name, items=items)
            for name, items in source.skill_categories.items()
        ])
        markdown = render_resume(draft, source)
        self.assertIn("Distributed Systems", markdown)
        self.assertIn("Data Pipelines", markdown)
        self.assertIn("Monitoring", markdown)
        for fact in source.facts:
            self.assertEqual(fact.source_span, resume[fact.span_start:fact.span_end])

    def test_self_directed_is_not_leadership_but_co_led_still_is(self):
        self.assertIsNone(OWNERSHIP_VERB.search("Collaborative, self-directed engineer."))
        self.assertIsNotNone(OWNERSHIP_VERB.search("Co-led migration."))
        self.assertIsNotNone(OWNERSHIP_VERB.search("Self-led migration."))
        self.assertIsNotNone(OWNERSHIP_VERB.search("Successfully architected systems."))

    def test_metrics_recover_only_from_cited_body_in_same_group(self):
        resume = """# Avery Doe
## Experience
Engineer | Alpha | 2024 - Present
- Built evaluationcovering20+ scenarios and reduced latency 25%.
Engineer | Beta | 2020 - 2024
- Reduced latency 40%.
"""
        source = extract_source(resume)
        body = next(f for f in source.facts if f.kind == "responsibility")
        self.assertIn("20+", [f.source_span for f in source.facts if f.kind == "metric"])
        bullet = DraftBullet(text="Built evaluation across 20+ scenarios, reducing latency 25%.",
            purpose="experience", fact_ids=[body.fact_id], ownership_level="contributor",
            metrics=[MetricAnnotation(literal="25%", origin="source", fact_id=body.fact_id)])
        draft = ResumeDraft(summary=[], projects=[], skills=[], experience=[
            ExperienceDraft(role_id="role_1", bullets=[bullet])])
        updated = attach_metric_fact_ids(draft, source).experience[0].bullets[0]
        self.assertEqual({"20+", "25%"}, {m.literal for m in updated.metrics})
        facts = {f.fact_id: f for f in source.facts}
        self.assertTrue(all(facts[m.fact_id].kind == "metric" for m in updated.metrics))
        bad = bullet.model_copy(update={"text": "Built APIs with 40% improvement.", "metrics": []})
        bad_draft = draft.model_copy(update={"experience": [ExperienceDraft(role_id="role_1", bullets=[bad])]})
        self.assertEqual([], attach_metric_fact_ids(bad_draft, source).experience[0].bullets[0].metrics)

    def test_content_errors_are_repaired_before_length_recraft(self):
        llm = ScriptedLLM({"repair": lambda _: RepairOutput(
            bullet_replacements=[], role_replacements=[], project_replacements=[], skills_replacement=[])})
        pipeline = ResumeTailoringPipeline(llm=llm)
        draft = ResumeDraft(summary=[], experience=[], projects=[], skills=[])
        state = {"draft": draft, "source": extract_source(""), "revision_count": 0,
                 "compliance_ledger": [check("length.word_count", False, "resume_length", "fit"),
                                       check("claim.ownership", False, "summary.0", "repair")],
                 "repair_payload": {}, "effective_include_summary": True,
                 "critic_strategy": CriticStrategy(mappings=[], verified_skill_allowlist=[],
                                                  unsupported_gaps=[], skill_categories=[])}
        pipeline.repair(state)
        self.assertEqual(1, llm.counts["repair"])
        self.assertEqual(0, llm.counts["fit_length"])


if __name__ == "__main__":
    unittest.main()
