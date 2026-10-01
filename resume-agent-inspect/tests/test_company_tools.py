import unittest

from fakes import JD, RESUME, ScriptedLLM
from fakes import ShortResumePipeline as ResumeTailoringPipeline

from low_risk_agent.models import ExperienceDraft, ResumeDraft, RunRequest
from low_risk_agent.render import render_resume
from low_risk_agent.source import extract_source


class CompanyToolTests(unittest.TestCase):
    def test_bold_company_and_italic_title_survive_retitle(self):
        for header in (
            "**Circle**\n*Data Engineer* | Jan 2026 - Present",
            "**Circle** | Data Engineer | Jan 2026 - Present",
            "**Data Engineer** | Circle | Jan 2026 - Present",
            "Circle\nData Engineer | Jan 2026 - Present",
        ):
            with self.subTest(header=header):
                source = extract_source(
                    "# Person\n## Experience\n" + header + "\n- Built pipelines."
                )
                role = source.roles[0]
                employers = [f.source_span for f in source.facts if f.kind == "employer"]
                self.assertTrue(any("Circle" in e for e in employers), employers)
                draft = ResumeDraft(
                    summary=[],
                    projects=[],
                    skills=[],
                    experience=[
                        ExperienceDraft(
                            role_id=role.group_id, title="Cloud Data Engineer", bullets=[]
                        ),
                    ],
                )
                markdown = render_resume(draft, source)
                self.assertIn("Circle", markdown)
                self.assertIn("Jan 2026 - Present", markdown)

    def test_work_tools_reach_skills_even_when_mapper_omits_them(self):
        resume = RESUME.replace(
            "Led API modernization,",
            "Led Snowflake, BigQuery, dbt and RabbitMQ API modernization,",
        )
        # Core work tools are retained even when absent from the JD and the old Skills list.
        llm = ScriptedLLM()
        result = ResumeTailoringPipeline(llm=llm).run(
            RunRequest(
                original_resume=resume,
                job_description=JD,
                tenant_id="test",
            )
        )
        self.assertEqual("completed", result.status, result.error)
        skills = result.resume_markdown.split("## Skills", 1)[1].split("## Experience", 1)[0]
        for name in ("Snowflake", "BigQuery", "dbt"):
            self.assertIn(name, skills)
            fact = next(
                f for f in result.source_facts if f.kind == "tool" and f.source_span == name
            )
            self.assertEqual(resume[fact.span_start : fact.span_end], name)
        self.assertNotIn("RabbitMQ", skills)  # Neither requested nor selected by the mapper.


if __name__ == "__main__":
    unittest.main()
