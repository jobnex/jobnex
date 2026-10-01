import unittest


class PackageExportsTests(unittest.TestCase):
    def test_public_exports_keep_their_identity(self):
        import low_risk_agent
        from low_risk_agent.models import PipelineConfig, PipelineResult, RunRequest
        from low_risk_agent.pipeline import ResumeTailoringPipeline

        for expected in (PipelineConfig, PipelineResult, RunRequest, ResumeTailoringPipeline):
            self.assertIs(getattr(low_risk_agent, expected.__name__), expected)
        with self.assertRaises(AttributeError):
            getattr(low_risk_agent, "missing_export")
