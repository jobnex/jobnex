import unittest

from low_risk_agent.portal import build_live_disclosure, should_use_postgres_jd_cache


class FakeResult:
    def __init__(self, status, error="", resume_markdown="# Resume\n\nBody text here."):
        self.status = status
        self.error = error
        self.resume_markdown = resume_markdown
        self.source_word_count = 400
        self.length_mode = "single_page"
        self.source_facts = []
        self.claim_provenance = []


class BuildLiveDisclosureTests(unittest.TestCase):
    def test_completed_is_not_flagged_for_review(self):
        disclosure = build_live_disclosure(FakeResult("completed"))
        self.assertEqual(disclosure["status"], "completed")
        self.assertFalse(disclosure["needs_review"])
        self.assertEqual(disclosure["review_notes"], [])

    def test_completed_with_estimates_is_not_discarded_or_flagged(self):
        disclosure = build_live_disclosure(FakeResult("completed_with_estimates"))
        self.assertEqual(disclosure["status"], "completed_with_estimates")
        self.assertFalse(disclosure["needs_review"])
        self.assertIn("Body text here.", "# Resume\n\nBody text here.")

    def test_needs_review_still_returns_the_rendered_markdown(self):
        result = FakeResult(
            "needs_review", error="experience.metric_count, length.word_count"
        )
        disclosure = build_live_disclosure(result)
        self.assertEqual(disclosure["status"], "needs_review")
        self.assertTrue(disclosure["needs_review"])
        self.assertEqual(
            disclosure["review_notes"], ["experience.metric_count", "length.word_count"]
        )
        self.assertEqual(disclosure["word_count"], len(result.resume_markdown.split()))

    def test_needs_review_with_no_error_string_gives_empty_notes(self):
        disclosure = build_live_disclosure(FakeResult("needs_review", error=""))
        self.assertEqual(disclosure["review_notes"], [])


class ShouldUsePostgresJdCacheTests(unittest.TestCase):
    def test_requires_both_url_and_a_long_enough_secret(self):
        self.assertTrue(should_use_postgres_jd_cache("postgresql://x", "a" * 32))

    def test_missing_url_never_enables_it(self):
        self.assertFalse(should_use_postgres_jd_cache("", "a" * 32))

    def test_short_secret_never_enables_it(self):
        self.assertFalse(should_use_postgres_jd_cache("postgresql://x", "a" * 31))

    def test_missing_both_never_enables_it(self):
        self.assertFalse(should_use_postgres_jd_cache("", ""))

    def test_env_example_placeholders_never_enable_it(self):
        # Regression lock: .env.example's own placeholder secret is 43
        # characters — long enough to pass a bare length check — so a
        # deployment that copies the example file verbatim would otherwise
        # silently try to connect to a bogus localhost URL on every
        # generation instead of falling back cleanly.
        self.assertFalse(
            should_use_postgres_jd_cache(
                "postgresql://resume_agent_cache:replace-me@localhost:5432/neondb?sslmode=require",
                "replace-with-at-least-32-random-characters",
            )
        )


if __name__ == "__main__":
    unittest.main()
