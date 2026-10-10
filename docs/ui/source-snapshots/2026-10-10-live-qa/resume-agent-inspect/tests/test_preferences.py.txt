import unittest
from unittest.mock import patch

from fakes import JD, RESUME, ScriptedLLM
from fakes import ShortResumePipeline as ResumeTailoringPipeline

from low_risk_agent.cli import main
from low_risk_agent.models import RunRequest, SkillCategoryPlan
from low_risk_agent.pipeline import _preserve_skill_categories
from low_risk_agent.source import extract_source

BASE = RESUME.replace(
    "Python, SQL",
    "Data Engineering: Python, SQL, Azure Databricks\n"
    "Analytics & BI: Tableau, Power BI\n"
    "Tools & Infrastructure: Docker, Git",
)


class PreferenceTests(unittest.TestCase):
    def test_omitted_category_restored_and_aliases_not_repeated(self):
        source = extract_source(BASE)
        plan = _preserve_skill_categories(
            [
                SkillCategoryPlan(category="Data Engineering", items=["Python", "Databricks"]),
                SkillCategoryPlan(
                    category="Tools & Infrastructure",
                    items=["Azure Databricks", "Docker", "docker"],
                ),
            ],
            source,
        )
        self.assertEqual([p.category for p in plan], list(source.skill_categories))
        self.assertEqual(plan[0].items, ["Python", "SQL", "Azure Databricks"])
        self.assertEqual(plan[1].items, ["Tableau", "Power BI"])
        self.assertEqual(plan[2].items, ["Docker", "Git"])

    def test_summary_choice_reaches_writer_and_output(self):
        for include in (True, False):
            with self.subTest(include=include):
                llm = ScriptedLLM()
                result = ResumeTailoringPipeline(llm=llm).run(
                    RunRequest(
                        original_resume=BASE,
                        job_description=JD,
                        tenant_id="test",
                        include_summary=include,
                    )
                )
                self.assertEqual(result.status, "completed", result.error)
                self.assertEqual("## Professional Summary" in result.resume_markdown, include)
                for name in extract_source(BASE).skill_categories:
                    self.assertIn(name + " : ", result.resume_markdown)
                call = next(c for c in llm.calls if c["stage"] == "craft")
                self.assertEqual(call["payload"]["include_summary"], include)

    def test_summary_inherited_from_base_resume_when_not_specified(self):
        with_summary = "# Jane Doe\n\n## Professional Summary\n\nExperienced engineer.\n\n" + BASE
        without_summary = BASE
        cases = [(with_summary, True), (without_summary, False)]
        for resume, expect_summary in cases:
            with self.subTest(expect_summary=expect_summary):
                self.assertEqual(extract_source(resume).has_summary, expect_summary)
                llm = ScriptedLLM()
                result = ResumeTailoringPipeline(llm=llm).run(
                    RunRequest(
                        original_resume=resume,
                        job_description=JD,
                        tenant_id="test",
                        # No include_summary at all: must inherit from the source.
                    )
                )
                self.assertEqual(result.status, "completed", result.error)
                self.assertEqual(
                    "## Professional Summary" in result.resume_markdown, expect_summary
                )

    def test_explicit_include_summary_overrides_inheritance(self):
        # BASE has no Summary section of its own; an explicit True still wins.
        self.assertFalse(extract_source(BASE).has_summary)
        llm = ScriptedLLM()
        result = ResumeTailoringPipeline(llm=llm).run(
            RunRequest(
                original_resume=BASE, job_description=JD, tenant_id="test", include_summary=True
            )
        )
        self.assertEqual(result.status, "completed", result.error)
        self.assertIn("## Professional Summary", result.resume_markdown)

    def test_noninteractive_cli_requires_summary_choice_before_work(self):
        with patch("low_risk_agent.cli.sys.stdin.isatty", return_value=False):
            self.assertEqual(
                main(
                    [
                        "--resume",
                        "unused.md",
                        "--jd",
                        "unused.txt",
                        "--tenant-id",
                        "test",
                        "--out",
                        "unused-output.md",
                    ]
                ),
                1,
            )


if __name__ == "__main__":
    unittest.main()
