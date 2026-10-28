import unittest

from low_risk_agent.models import (
    CriticStrategy, DraftBullet, ExperienceDraft, FallbackFact, FallbackFacts, ResumeDraft,
)
from low_risk_agent.pipeline import ResumeTailoringPipeline
from low_risk_agent.policy import check, lint_draft, rendered_protection_checks
from low_risk_agent.render import render_resume
from low_risk_agent.source import extract_source, merge_fallback_facts


PARAGRAPHS = """# Test Candidate
## Experience
### AI Engineer
Alpha Labs
Sep 2024 – Present
Owned production agent services and implemented reliable recovery workflows.
Built regression checks for distributed service failures.
### AI Engineer
Beta Systems
Dec 2023 – Jun 2024
Developed GPU inference services and profiled CUDA execution paths.
Built model-serving endpoints with structured validation.
## Projects
### Safe Queue
Built task processing with transactional recovery.
"""


def draft_for(source):
    facts = {fact.fact_id: fact for fact in source.facts}
    return ResumeDraft(summary=[], projects=[], skills=[], experience=[
        ExperienceDraft(role_id=group.group_id, title="AI Engineer", bullets=[
            DraftBullet(text=facts[fact_id].source_span, purpose="experience",
                        fact_ids=[fact_id], ownership_level=facts[fact_id].ownership_level,
                        metrics=[])
            for fact_id in group.body_fact_ids
        ]) for group in source.roles
    ])


class RoleIdentityRegressions(unittest.TestCase):
    def test_explicit_headings_and_paragraphs_keep_employers_dates_and_bullets(self):
        source = extract_source(PARAGRAPHS)
        self.assertEqual(2, len(source.roles))
        self.assertEqual([2, 2], [len(group.body_fact_ids) for group in source.roles])
        self.assertFalse(source.ambiguous_blocks)
        for index, company in enumerate(["Alpha Labs", "Beta Systems"]):
            self.assertEqual([company], [f.source_span for f in source.facts
                if f.kind == "employer" and f.role_or_project_id == source.roles[index].group_id])
        for fact in source.facts:
            self.assertEqual(fact.source_span, PARAGRAPHS[fact.span_start:fact.span_end])
        rendered = render_resume(draft_for(source), source)
        self.assertIn("### AI Engineer | Alpha Labs | Sep 2024 – Present", rendered)
        self.assertIn("### AI Engineer | Beta Systems | Dec 2023 – Jun 2024", rendered)
        self.assertNotIn("### ###", rendered)

    def test_explicit_next_role_is_not_a_wrapped_bullet(self):
        source = extract_source("""## Experience
### Engineer | Alpha Labs
- Built APIs using
### Engineer
Beta Systems
- Developed GPU services.
""")
        self.assertEqual(2, len(source.roles))
        self.assertEqual([1, 1], [len(group.body_fact_ids) for group in source.roles])

    def test_conflicting_employers_are_rejected_before_writing(self):
        from low_risk_agent.source import validate_source_groups
        source = extract_source(PARAGRAPHS)
        validate_source_groups(source)
        corrupt = source.model_copy(update={"facts": [
            fact.model_copy(update={"role_or_project_id": source.roles[0].group_id})
            if fact.kind == "employer" else fact for fact in source.facts
        ]})
        with self.assertRaisesRegex(ValueError, "conflicting employers"):
            validate_source_groups(corrupt)

    def test_plain_headers_with_paragraph_responsibilities_keep_two_jobs(self):
        source = extract_source(PARAGRAPHS.replace("### AI Engineer", "AI Engineer"))
        self.assertEqual(2, len(source.roles))
        self.assertEqual([2, 2], [len(group.body_fact_ids) for group in source.roles])

    def test_fallback_metadata_cannot_stay_attached_to_an_older_header(self):
        text = """## Experience
### Engineer | Alpha Labs
Built reliable APIs.
### Engineer | Beta Systems
Developed GPU services.
"""
        source = extract_source(text)
        # Exercise the fallback adapter even when deterministic extraction is enough.
        from low_risk_agent.models import AmbiguousBlock
        source = source.model_copy(update={"ambiguous_blocks": [AmbiguousBlock(
            source_span=text, span_start=0, span_end=len(text))]})
        fallback = FallbackFacts(facts=[
            FallbackFact(kind=kind, source_span=span)
            for kind, span in [
                ("role_header", "### Engineer | Alpha Labs"), ("employer", "Alpha Labs"),
                ("responsibility", "Built reliable APIs."),
                ("role_header", "### Engineer | Beta Systems"), ("employer", "Beta Systems"),
                ("responsibility", "Developed GPU services."),
            ]
        ])
        merged = merge_fallback_facts(source, text, fallback)
        self.assertEqual(2, len(merged.roles))
        employers = {f.source_span: f.role_or_project_id for f in merged.facts if f.kind == "employer"}
        self.assertEqual(merged.roles[0].group_id, employers["Alpha Labs"])
        self.assertEqual(merged.roles[1].group_id, employers["Beta Systems"])

    def test_ambiguous_repeated_structural_span_must_not_pick_the_first_job(self):
        text = "Candidate\nEngineer\nAlpha\nBuilt APIs.\nEngineer\nBeta\nBuilt GPUs.\n"
        source = extract_source(text)
        with self.assertRaisesRegex(ValueError, "structural span is ambiguous"):
            merge_fallback_facts(source, text, FallbackFacts(facts=[
                FallbackFact(kind="role_header", source_span="Engineer"),
            ]))

    def test_rendered_employers_must_stay_in_their_own_role_header(self):
        text = "## Experience\n### Engineer | Alpha Labs\n- Built APIs.\n### Engineer | Beta Systems\n- Built GPUs.\n"
        source = extract_source(text)
        draft = draft_for(source)
        rendered = render_resume(draft, source)
        swapped = rendered.replace("Alpha Labs", "PLACEHOLDER").replace("Beta Systems", "Alpha Labs").replace("PLACEHOLDER", "Beta Systems")
        self.assertTrue(all(c.passed for c in rendered_protection_checks(rendered, source, draft)))
        self.assertTrue(any(not c.passed for c in rendered_protection_checks(swapped, source, draft)))

    def test_cross_company_evidence_is_rejected_after_paragraph_extraction(self):
        source = extract_source(PARAGRAPHS)
        self.assertEqual(2, len(source.roles))
        draft = draft_for(source)
        wrong = draft.experience[0].model_copy(update={"bullets": draft.experience[1].bullets})
        draft = draft.model_copy(update={"experience": [wrong, draft.experience[1]]})
        strategy = CriticStrategy(mappings=[], verified_skill_allowlist=[], unsupported_gaps=[], skill_categories=[])
        failures = lint_draft(draft, source, strategy, allow_synthetic_metrics=False)
        self.assertTrue(any(c.code == "claim.evidence" and not c.passed for c in failures))

    def test_review_draft_with_factual_failure_is_not_publishable(self):
        source = extract_source("## Experience\n### Engineer | Alpha\n- Built APIs.\n")
        draft = draft_for(source)
        pipeline = ResumeTailoringPipeline()
        state = {"source": source, "draft": draft, "compliance_ledger": [
            check("claim.evidence", False, "experience.role_1.bullets.0", "Repair attribution.")],
        }
        output = pipeline.needs_review(state)
        self.assertEqual("failed", output["terminal_status"])
        self.assertEqual("", output["resume_markdown"])
        state["compliance_ledger"] = [check("length.word_count", False, "resume_length", "Shorten.")]
        reviewable = pipeline.needs_review(state)
        self.assertEqual("needs_review", reviewable["terminal_status"])
        self.assertTrue(reviewable["resume_markdown"])


if __name__ == '__main__':
    unittest.main()
