import unittest

from fakes import JD, RESUME, ScriptedLLM

from low_risk_agent.models import (
    CriticStrategy,
    DraftBullet,
    PipelineConfig,
    ProjectDraft,
    ResumeDraft,
    RunRequest,
)
from low_risk_agent.pipeline import ResumeTailoringPipeline
from low_risk_agent.policy import lint_draft
from low_risk_agent.render import count_resume_words, estimate_word_budget, render_resume
from low_risk_agent.source import extract_source


class LengthBudgetTests(unittest.TestCase):
    def test_visible_words_exclude_markers_and_link_destinations(self):
        self.assertEqual(
            count_resume_words(
                "# Jane Doe\n- [Git Hub](https://example.com/a-long-url) | Python : SQL"
            ),
            6,
        )

    def test_unmet_length_ends_after_two_corrections(self):
        llm = ScriptedLLM()
        result = ResumeTailoringPipeline(llm=llm).run(
            RunRequest(
                original_resume=RESUME,
                job_description=JD,
                tenant_id="test",
            )
        )
        self.assertEqual(result.status, "needs_review", result.error)
        self.assertIn("length.word_count", result.error)
        self.assertEqual(result.revision_count, 2)
        self.assertEqual(llm.counts["fit_length"], 2)
        self.assertEqual(result.word_count, count_resume_words(result.resume_markdown))

    def test_length_correction_accepts_both_boundaries(self):
        _, band_min, band_max = estimate_word_budget(count_resume_words(RESUME), PipelineConfig())
        for target in (band_min, band_max):
            with self.subTest(target=target):

                def fitted(payload, target=target):
                    draft = ScriptedLLM._draft(payload)
                    count = count_resume_words(render_resume(draft, extract_source(RESUME)))
                    # Controlled filler belongs only to this transport fixture, not generation.
                    bullet = draft.summary[0].model_copy(
                        update={
                            "text": draft.summary[0].text + " Python" * (target - count),
                        }
                    )
                    return draft.model_copy(update={"summary": [bullet]})

                llm = ScriptedLLM({"fit_length": fitted})
                result = ResumeTailoringPipeline(llm=llm).run(
                    RunRequest(
                        original_resume=RESUME,
                        job_description=JD,
                        tenant_id="test",
                        # RESUME has no Summary section of its own, so this
                        # would otherwise inherit include_summary=False and
                        # the padded summary bullet below would never render.
                        include_summary=True,
                    )
                )
                self.assertEqual(result.status, "completed", result.error)
                self.assertEqual(result.word_count, target)
                self.assertEqual(result.revision_count, 1)

    def test_word_count_within_tolerance_skips_repair(self):
        config = PipelineConfig()
        _, band_min, band_max = estimate_word_budget(count_resume_words(RESUME), config)
        for target in (band_min - 10, band_max + 10):
            with self.subTest(target=target):

                def near_target(payload, target=target):
                    draft = ScriptedLLM._draft(payload)
                    count = count_resume_words(render_resume(draft, extract_source(RESUME)))
                    bullet = draft.summary[0].model_copy(
                        update={
                            "text": draft.summary[0].text + " Python" * (target - count),
                        }
                    )
                    return draft.model_copy(update={"summary": [bullet]})

                llm = ScriptedLLM({"craft": near_target})
                result = ResumeTailoringPipeline(llm=llm).run(
                    RunRequest(
                        original_resume=RESUME,
                        job_description=JD,
                        tenant_id="test",
                        include_summary=True,
                    )
                )
                self.assertEqual(result.status, "completed", result.error)
                self.assertEqual(
                    result.revision_count,
                    0,
                    "a near-miss within WORD_COUNT_TOLERANCE must not trigger a repair cycle",
                )

    def test_one_to_four_project_bullets_in_any_order(self):
        # Project bullet count scales to genuine evidence (1-4, any purpose
        # order) rather than a fixed 2-or-3 shape — only empty or 5+ fails.
        source = extract_source(RESUME)
        strategy = CriticStrategy(
            mappings=[], verified_skill_allowlist=[], unsupported_gaps=[], skill_categories=[]
        )
        for purposes, valid in (
            (["design"], True),
            (["objective", "design"], True),
            (["design", "outcome"], True),
            (["objective", "design", "outcome"], True),
            (["outcome", "objective", "design", "outcome"], True),
            ([], False),
            (["objective", "design", "outcome", "outcome", "design"], False),
        ):
            draft = ResumeDraft(
                summary=[],
                experience=[],
                skills=[],
                projects=[
                    ProjectDraft(
                        project_id=source.projects[0].group_id,
                        bullets=[
                            DraftBullet(
                                text="Built a service.",
                                purpose=p,
                                fact_ids=[],
                                ownership_level="contributor",
                                metrics=[],
                            )
                            for p in purposes
                        ],
                    )
                ],
            )
            checks = lint_draft(draft, source, strategy, False)
            self.assertEqual(
                next(c for c in checks if c.code == "project.bullet_count").passed,
                valid,
                purposes,
            )

    def test_word_budget_unchanged_for_source_already_in_single_page_band(self):
        config = PipelineConfig()
        for words in (config.min_resume_words, config.max_resume_words, 600):
            with self.subTest(words=words):
                mode, minimum, maximum = estimate_word_budget(words, config)
                self.assertEqual(mode, "single_page")
                self.assertEqual((minimum, maximum), (config.min_resume_words, config.max_resume_words))

    def test_word_budget_scales_down_for_a_short_source_instead_of_padding(self):
        # Forcing a 350-word source up to the 525-650 floor means writing
        # ~200 words of content the source never had -- fabrication, which
        # is exactly what this pipeline is designed to never do. A short
        # source now gets its own proportional band instead.
        config = PipelineConfig()
        mode, minimum, maximum = estimate_word_budget(350, config)
        self.assertEqual(mode, "single_page")
        self.assertEqual((minimum, maximum), (308, 392))
        self.assertLess(maximum, config.min_resume_words)

    def test_word_budget_uses_a_fixed_floor_for_a_very_short_source(self):
        # Below the floor, a proportional +-12% band is itself too narrow
        # to write a coherent resume in (e.g. 60 words -> [53,67]), so a
        # fixed small floor applies instead, same shape as the existing
        # single-page floor just sized for a much shorter document.
        config = PipelineConfig()
        for words in (0, 1, 60, 250):
            with self.subTest(words=words):
                mode, minimum, maximum = estimate_word_budget(words, config)
                self.assertEqual(mode, "single_page")
                self.assertEqual((minimum, maximum), (200, 300))

    def test_word_budget_scales_proportionally_for_longer_source(self):
        config = PipelineConfig()
        mode, minimum, maximum = estimate_word_budget(1800, config)
        self.assertEqual(mode, "multi_page")
        # A wide, symmetric-ish band around the source's own count, not a
        # fixed ceiling like 800/1000/1200 and not compressed back to 525-650.
        self.assertLess(minimum, 1800)
        self.assertGreater(maximum, 1800)
        self.assertGreaterEqual(minimum, config.min_resume_words)
        self.assertGreater(maximum, config.max_resume_words)
        # A much longer source should get a proportionally wider target, not
        # the same absolute band reused regardless of scale.
        _, minimum2, maximum2 = estimate_word_budget(3600, config)
        self.assertGreater(maximum2 - minimum2, maximum - minimum)

    def test_prepare_source_selects_multi_page_for_a_long_base_resume(self):
        long_resume = RESUME + "\n" + "\n".join(f"- Extra bullet {i} with detail." for i in range(200))
        pipeline = ResumeTailoringPipeline(llm=ScriptedLLM())
        state = pipeline.prepare_source(
            {"request": RunRequest(original_resume=long_resume, job_description=JD, tenant_id="test")}
        )
        self.assertEqual(state["length_mode"], "multi_page")
        self.assertGreater(state["source_word_count"], pipeline.config.max_resume_words)
        self.assertGreater(state["max_resume_words"], pipeline.config.max_resume_words)

    def test_prepare_source_keeps_single_page_for_the_shared_fixture(self):
        pipeline = ResumeTailoringPipeline(llm=ScriptedLLM())
        state = pipeline.prepare_source(
            {"request": RunRequest(original_resume=RESUME, job_description=JD, tenant_id="test")}
        )
        self.assertEqual(state["length_mode"], "single_page")
        # RESUME (the shared fixture) is only 58 words -- well under the
        # single-page floor -- so it now gets the short-resume band, not
        # the full 525-650 single-page floor unrelated resumes get.
        self.assertEqual(
            (state["min_resume_words"], state["max_resume_words"]),
            estimate_word_budget(count_resume_words(RESUME), pipeline.config)[1:],
        )


if __name__ == "__main__":
    unittest.main()
