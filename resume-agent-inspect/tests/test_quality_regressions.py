import unittest

from low_risk_agent.models import CriticStrategy, DraftBullet, ExperienceDraft, ResumeDraft, SkillCategoryPlan, PipelineConfig
from low_risk_agent.pipeline import _preserve_skill_categories
from low_risk_agent.policy import attach_metric_fact_ids, lint_draft
from low_risk_agent.render import estimate_word_budget
from low_risk_agent.source import extract_source


class QualityRegressions(unittest.TestCase):
    def test_grouped_skills_preserve_spans_and_do_not_repeat_promoted_tools(self):
        text = '# Example Person\n## Skills\nCloud: AWS (SageMaker, Bedrock), Azure\nAI: Multi-Agent Systems (MCP, AutoGen)\nData: Apache Spark (PySpark), SQL\n'
        source = extract_source(text)
        self.assertIn('AWS (SageMaker, Bedrock)', source.skill_categories['Cloud'])
        for fact in source.facts:
            self.assertEqual(fact.source_span, text[fact.span_start:fact.span_end])
        categories = _preserve_skill_categories([SkillCategoryPlan(category='Data Engineering', items=['AWS', 'AWS Bedrock', 'PySpark', 'Spark', 'MCP', 'Model Context Protocol'])], source)
        self.assertEqual([c.category for c in categories], ['Cloud', 'AI', 'Data'])
        self.assertEqual(categories[0].items, ['AWS (SageMaker, Bedrock)', 'Azure'])

    def test_many_genuine_metrics_pass_but_fabricated_metrics_fail(self):
        text = '# Example Person\n## Experience\n### Acme | Engineer | Jan 2020 - Present\n' + ''.join(f'- Improved service {i} latency by {i * 10}%.\n' for i in range(1, 5))
        source = extract_source(text)
        bullets = [DraftBullet(text=f.source_span, purpose='experience', fact_ids=[f.fact_id], ownership_level='contributor', metrics=[]) for f in source.facts if f.kind == 'responsibility']
        draft = ResumeDraft(summary=[], experience=[ExperienceDraft(role_id=source.roles[0].group_id, bullets=bullets)], skills=[], projects=[])
        strategy = CriticStrategy(mappings=[], verified_skill_allowlist=[], unsupported_gaps=[], skill_categories=[])
        draft = attach_metric_fact_ids(draft, source)
        checks = lint_draft(draft, source, strategy, False)
        self.assertTrue(next(c for c in checks if c.code == 'experience.metric_count').passed)
        self.assertTrue(all(c.passed for c in checks if c.code == 'metric.provenance'))
        bad = draft.model_copy(deep=True)
        bad.experience[0].bullets[0].text += ' Saved 999%.'
        checks = lint_draft(attach_metric_fact_ids(bad, source), source, strategy, False)
        self.assertTrue(any(not c.passed for c in checks if c.code in {'metric.provenance', 'metric.annotations'}))

    def test_long_source_can_be_condensed_but_not_collapsed(self):
        mode, minimum, maximum = estimate_word_budget(938, PipelineConfig())
        self.assertEqual(mode, 'multi_page')
        self.assertLessEqual(minimum, 773)
        self.assertGreaterEqual(minimum, 700)
        self.assertGreaterEqual(maximum, 938)
        self.assertLess(400, minimum)
