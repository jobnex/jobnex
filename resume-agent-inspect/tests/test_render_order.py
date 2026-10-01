from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from low_risk_agent.models import (  # noqa: E402
    DraftBullet,
    ExperienceDraft,
    ProjectDraft,
    ResumeDraft,
    SkillsCategory,
)
from low_risk_agent.render import render_resume  # noqa: E402
from low_risk_agent.source import extract_source  # noqa: E402

SKILLS_FIRST_RESUME = """Jane Doe
jane@example.com

Skills
Python, SQL

Projects
Grounded Search
- Built a search service from approved source records.

Experience
Acme Corp | Senior Engineer | Jan 2020 - Present
- Led API modernization, reducing latency by 30% across 20 services.

Education
B.S. Computer Science, State University, 2019
"""

EXPERIENCE_FIRST_RESUME = """Jane Doe
jane@example.com

Experience
Acme Corp | Senior Engineer | Jan 2020 - Present
- Led API modernization, reducing latency by 30% across 20 services.

Skills
Python, SQL

Projects
Grounded Search
- Built a search service from approved source records.

Education
B.S. Computer Science, State University, 2019
"""


def _draft(source):
    return ResumeDraft(
        summary=[],
        skills=[SkillsCategory(category="Languages", items=["Python", "SQL"])],
        experience=[
            ExperienceDraft(
                role_id=source.roles[0].group_id,
                title="Senior Engineer",
                bullets=[
                    DraftBullet(
                        text="Led API modernization.",
                        purpose="experience",
                        fact_ids=[],
                        ownership_level="lead",
                        metrics=[],
                    )
                ],
            )
        ],
        projects=[
            ProjectDraft(
                project_id=source.projects[0].group_id,
                bullets=[
                    DraftBullet(
                        text="Built a search service.",
                        purpose="design",
                        fact_ids=[],
                        ownership_level="contributor",
                        metrics=[],
                    )
                ],
            )
        ],
    )


class RenderOrderTests(unittest.TestCase):
    def test_source_section_order_is_captured(self):
        source = extract_source(SKILLS_FIRST_RESUME)
        self.assertEqual(
            ["skills", "projects", "experience", "education"], source.section_order
        )

    def test_render_follows_skills_first_source_order(self):
        source = extract_source(SKILLS_FIRST_RESUME)
        markdown = render_resume(_draft(source), source)
        for heading in ("## Skills", "## Projects", "## Experience", "## Education"):
            self.assertIn(heading, markdown)
        self.assertLess(
            markdown.index("## Skills"),
            markdown.index("## Projects"),
            "Skills came before Projects in the source; output must match",
        )
        self.assertLess(
            markdown.index("## Projects"),
            markdown.index("## Experience"),
            "Projects came before Experience in the source; output must match",
        )

    def test_render_follows_experience_first_source_order(self):
        source = extract_source(EXPERIENCE_FIRST_RESUME)
        markdown = render_resume(_draft(source), source)
        self.assertLess(markdown.index("## Experience"), markdown.index("## Skills"))
        self.assertLess(markdown.index("## Skills"), markdown.index("## Projects"))

    def test_falls_back_to_default_order_for_unrecognized_sections(self) -> None:
        # No recognized headings at all -> section_order is empty (and no
        # role/project groups exist to build a draft from either); render
        # must still produce output for whatever the draft does carry
        # (default order), never crash or drop a section for lack of an
        # explicit position.
        source = extract_source("Jane Doe\njane@example.com\nSome text.\nMore text.\n")
        self.assertEqual([], source.section_order)
        self.assertEqual([], source.roles)
        self.assertEqual([], source.projects)
        draft = ResumeDraft(
            summary=[],
            skills=[SkillsCategory(category="Languages", items=["Python", "SQL"])],
            experience=[],
            projects=[],
        )
        markdown = render_resume(draft, source)
        self.assertIn("## Skills", markdown)


if __name__ == "__main__":
    unittest.main()
