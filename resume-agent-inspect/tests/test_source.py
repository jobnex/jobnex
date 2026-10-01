from __future__ import annotations

import unittest

from low_risk_agent.models import FallbackFact, FallbackFacts
from low_risk_agent.source import extract_source, merge_fallback_facts

MARKDOWN_RESUME = """# Jane Doe
jane@example.com

## Experience
### Acme Corp | Senior Engineer | Jan 2020 - Present
- Led API modernization across 20 services, reducing latency 30%.

## Skills
Python, SQL

## Projects
### Grounded Search
- Built evidence-linked retrieval.

## Education
B.S. Computer Science, State University, 2019
Coursework: Algorithms
"""


class SourceTests(unittest.TestCase):
    def test_horizontal_rules_do_not_create_empty_role_or_project_groups(self) -> None:
        resume = """# Jane Doe
## Experience
**Acme**
*Engineer* | 2024 - Present
* Built reliable APIs.
---
## Projects
**Grounded Search** | *Python* (2025)
* Built evidence-linked retrieval.
---
## Skills
* Python, SQL
"""

        source = extract_source(resume)

        self.assertFalse(source.ambiguous_blocks)
        self.assertEqual(1, len(source.roles))
        self.assertEqual(1, len(source.projects))

    def test_citations_after_markdown_headings_do_not_make_resume_unstructured(self) -> None:
        resume = """# Jane Doe[cite: 1]
## EXPERIENCE[cite: 1]
**Engineer** | Acme | 2024 - Present[cite: 1]
* Built reliable APIs.[cite: 1]
## PROJECTS[cite: 1]
**Grounded Search** | Python[cite: 1]
* Built evidence-linked retrieval.[cite: 1]
"""

        source = extract_source(resume)

        self.assertFalse(source.ambiguous_blocks)
        self.assertEqual(1, len(source.roles))
        self.assertEqual(1, len(source.projects))

    def test_skill_spans_strip_markdown_and_citation_artifacts(self) -> None:
        resume = """## TECHNICAL SKILLS[cite: 1]
* **Data Engineering:** Python, SQL, EMR[cite: 1]
"""

        source = extract_source(resume)

        self.assertEqual(
            ["Python", "SQL", "EMR"],
            [fact.source_span for fact in source.facts if fact.kind == "skill"],
        )
        self.assertEqual([], [fact.source_span for fact in source.facts if fact.kind == "metric"])

    def test_markdown_sections_and_protected_entities_use_exact_spans(self) -> None:
        source = extract_source(MARKDOWN_RESUME)

        self.assertEqual(1, len(source.roles))
        self.assertEqual(1, len(source.projects))
        self.assertFalse(source.ambiguous_blocks)
        kinds = {fact.kind for fact in source.facts}
        self.assertTrue({"employer", "title", "date", "coursework"} <= kinds)
        self.assertEqual(
            {"Acme Corp"},
            {fact.source_span for fact in source.facts if fact.kind == "employer"},
        )
        self.assertEqual(
            {"Senior Engineer"},
            {fact.source_span for fact in source.facts if fact.kind == "title"},
        )
        for fact in source.facts:
            self.assertEqual(
                fact.source_span,
                MARKDOWN_RESUME[fact.span_start : fact.span_end],
                fact,
            )

    def test_fallback_rejects_invention_and_derives_ownership_from_source(self) -> None:
        resume = """Jane Doe
Acme Corp | Engineer | 2020 - 2024
Built reliable APIs with Python.
Grounded Search
Built evidence-linked retrieval.
"""
        source = extract_source(resume)
        self.assertTrue(source.ambiguous_blocks)
        fallback = FallbackFacts(
            facts=[
                FallbackFact(
                    kind="role_header",
                    source_span="Acme Corp | Engineer | 2020 - 2024",
                ),
                FallbackFact(
                    kind="responsibility",
                    source_span="Built reliable APIs with Python.",
                ),
                FallbackFact(
                    kind="project_header",
                    source_span="Grounded Search",
                ),
                FallbackFact(
                    kind="project_detail",
                    source_span="Built evidence-linked retrieval.",
                ),
            ]
        )

        merged = merge_fallback_facts(source, resume, fallback)
        self.assertEqual(["role_1"], [group.group_id for group in merged.roles])
        self.assertEqual(["project_1"], [group.group_id for group in merged.projects])
        actions = [
            fact for fact in merged.facts if fact.kind in {"responsibility", "project_detail"}
        ]
        self.assertTrue(actions)
        self.assertTrue(all(fact.ownership_level == "contributor" for fact in actions))
        self.assertTrue(next(fact for fact in merged.facts if fact.kind == "role_header").protected)
        self.assertFalse(
            next(fact for fact in merged.facts if fact.kind == "responsibility").protected
        )

        invented = FallbackFacts(
            facts=[
                FallbackFact(
                    kind="skill",
                    source_span="Kubernetes",
                )
            ]
        )
        with self.assertRaisesRegex(ValueError, "verbatim"):
            merge_fallback_facts(source, resume, invented)

        partial = FallbackFacts(facts=[FallbackFact(kind="skill", source_span="Python")])
        with self.assertRaisesRegex(ValueError, "classify every"):
            merge_fallback_facts(source, resume, partial)

    def test_fallback_fact_repeated_across_ambiguous_blocks_resolves_deterministically(
        self,
    ) -> None:
        # "React" appears verbatim in both the role's own ambiguous block
        # and the project's -- a short, legitimately-repeated word. This
        # used to hard-fail the whole generation ("fallback fact span is
        # ambiguous") purely because it matched more than one block; a
        # non-structural fact doesn't need a unique position (nothing
        # downstream keys off of which occurrence it resolved to), so this
        # must now resolve instead of raising.
        resume = """Jane Doe
Acme Corp | Engineer | 2020 - 2024
Built reliable APIs with Python and React for internal tools.
Grounded Search
Built a React-based search frontend for evidence retrieval.
"""
        source = extract_source(resume)
        self.assertTrue(source.ambiguous_blocks)
        fallback = FallbackFacts(
            facts=[
                FallbackFact(kind="role_header", source_span="Acme Corp | Engineer | 2020 - 2024"),
                FallbackFact(
                    kind="responsibility",
                    source_span="Built reliable APIs with Python and React for internal tools.",
                ),
                FallbackFact(kind="skill", source_span="React"),
                FallbackFact(kind="project_header", source_span="Grounded Search"),
                FallbackFact(
                    kind="project_detail",
                    source_span="Built a React-based search frontend for evidence retrieval.",
                ),
            ]
        )
        merged = merge_fallback_facts(source, resume, fallback)
        react_facts = [f for f in merged.facts if f.source_span == "React"]
        self.assertEqual(1, len(react_facts))
        self.assertEqual(resume[react_facts[0].span_start : react_facts[0].span_end], "React")

    def test_fallback_structural_fact_covering_part_of_a_source_line_is_accepted(
        self,
    ) -> None:
        # A fallback model reasonably splitting one long unbulleted line
        # into two structural facts (e.g. an action clause and its
        # trailing detail) produces a fact whose span is a real, verbatim,
        # single-line substring -- not the entire line. This used to
        # hard-fail ("must cover one complete source line"); it is exactly
        # as grounded as a whole-line fact and must now be accepted.
        resume = """Jane Doe
Acme Corp | Engineer | 2020 - 2024
Built reliable APIs with Python and React for internal tools.
Grounded Search
Built evidence-linked retrieval.
"""
        source = extract_source(resume)
        self.assertTrue(source.ambiguous_blocks)
        fallback = FallbackFacts(
            facts=[
                FallbackFact(kind="role_header", source_span="Acme Corp | Engineer | 2020 - 2024"),
                FallbackFact(
                    kind="responsibility",
                    source_span="Built reliable APIs with Python and React",
                ),
                FallbackFact(kind="responsibility", source_span="for internal tools."),
                FallbackFact(kind="project_header", source_span="Grounded Search"),
                FallbackFact(kind="project_detail", source_span="Built evidence-linked retrieval."),
            ]
        )
        merged = merge_fallback_facts(source, resume, fallback)
        actions = [f.source_span for f in merged.facts if f.kind == "responsibility"]
        self.assertIn("Built reliable APIs with Python and React", actions)
        self.assertIn("for internal tools.", actions)

    def test_fallback_structural_fact_spanning_two_source_lines_is_accepted(self) -> None:
        # A fallback model reading genuinely unstructured prose naturally
        # merges content that was only split across physical lines by a
        # manual line break or PDF wrapping, not by any real sentence
        # boundary -- observed live, not hypothetical: this exact shape
        # (one fact merging two originally-separate lines) is what a real
        # run against a real no-bullet resume produced. It is still a
        # single, contiguous, fully verbatim substring of the block it
        # came from; only the line break inside it made it fail before.
        resume = """Jane Doe
Acme Corp | Engineer | 2020 - 2024
Built reliable APIs with Python
and React for internal tools.
Grounded Search
Built evidence-linked retrieval.
"""
        source = extract_source(resume)
        self.assertTrue(source.ambiguous_blocks)
        merged_text = "Built reliable APIs with Python\nand React for internal tools."
        fallback = FallbackFacts(
            facts=[
                FallbackFact(kind="role_header", source_span="Acme Corp | Engineer | 2020 - 2024"),
                FallbackFact(kind="responsibility", source_span=merged_text),
                FallbackFact(kind="project_header", source_span="Grounded Search"),
                FallbackFact(kind="project_detail", source_span="Built evidence-linked retrieval."),
            ]
        )
        merged = merge_fallback_facts(source, resume, fallback)
        actions = [f.source_span for f in merged.facts if f.kind == "responsibility"]
        self.assertIn(merged_text, actions)

    def test_fallback_groups_actions_by_source_order(self) -> None:
        resume = """Jane Doe
Acme Corp | Engineer
Built Acme APIs.
Beta Corp | Engineer
Built Beta APIs.
"""
        source = extract_source(resume)
        fallback = FallbackFacts(
            facts=[
                FallbackFact(kind="role_header", source_span="Acme Corp | Engineer"),
                FallbackFact(kind="responsibility", source_span="Built Acme APIs."),
                FallbackFact(kind="role_header", source_span="Beta Corp | Engineer"),
                FallbackFact(kind="responsibility", source_span="Built Beta APIs."),
            ]
        )

        merged = merge_fallback_facts(source, resume, fallback)
        groups = {group.group_id: group for group in merged.roles}
        facts = {fact.fact_id: fact for fact in merged.facts}
        grouped_spans = {
            facts[group.header_fact_ids[0]].source_span: facts[group.body_fact_ids[0]].source_span
            for group in groups.values()
        }
        self.assertEqual(
            {
                "Acme Corp | Engineer": "Built Acme APIs.",
                "Beta Corp | Engineer": "Built Beta APIs.",
            },
            grouped_spans,
        )

    def test_header_date_range_with_en_dash_preserves_employer_and_title(self) -> None:
        resume = """# Jane Doe
## Experience
### Senior Software Engineer | Acme Corp (2020\u20132022)
- Built reliable APIs.
### Beta Systems \u2013 Lead Architect (Jan 2021 \u2013 Dec 2023)
- Scaled distributed database clusters.
"""
        source = extract_source(resume)
        self.assertEqual(2, len(source.roles))
        self.assertFalse(source.ambiguous_blocks)
        employers = {fact.source_span for fact in source.facts if fact.kind == "employer"}
        titles = {fact.source_span for fact in source.facts if fact.kind == "title"}
        self.assertEqual({"Acme Corp", "Beta Systems"}, employers)
        self.assertEqual({"Senior Software Engineer", "Lead Architect"}, titles)
        for fact in source.facts:
            self.assertEqual(
                fact.source_span,
                resume[fact.span_start : fact.span_end],
                fact,
            )

    def test_wrapped_bullet_continuation_line_remains_in_parent_role(self) -> None:
        resume = """# Jane Doe
## Experience
### Acme Corp | Senior Engineer | 2020 - 2022
- Led API modernization across 20 services,
  reducing latency 30%.
- Automated CI/CD deployment pipelines.
"""
        source = extract_source(resume)
        self.assertEqual(1, len(source.roles))
        self.assertFalse(source.ambiguous_blocks)
        headers = [fact.source_span for fact in source.facts if fact.kind == "role_header"]
        self.assertEqual(["Acme Corp | Senior Engineer | 2020 - 2022"], headers)
        responsibilities = [fact for fact in source.facts if fact.kind == "responsibility"]
        self.assertEqual(3, len(responsibilities))
        self.assertEqual("reducing latency 30%.", responsibilities[1].source_span)
        metrics = [fact.source_span for fact in source.facts if fact.kind == "metric"]
        self.assertIn("30%", metrics)
        for fact in source.facts:
            self.assertEqual(
                fact.source_span,
                resume[fact.span_start : fact.span_end],
                fact,
            )

    def test_wrapped_bullet_continuation_starting_uppercase_stays_in_parent_project(
        self,
    ) -> None:
        # PDF text extraction re-flows a long bullet across two lines with
        # no indentation and no bullet marker on the wrapped line -- the
        # existing lowercase-start / indented-continuation heuristics both
        # miss it when the wrap happens to start with an acronym or proper
        # noun. Before this was handled, the second line was misread as
        # the header of a brand-new, bodyless project (ambiguous_blocks).
        resume = """# Jane Doe
## Projects
### LLM Platform | Python, PyTorch, GCP
- Scalable ML training and LLM inference platform: PyTorch, Hugging Face on
GCP Vertex AI; MLflow experiment tracking; 28% throughput gain.
"""
        source = extract_source(resume)
        self.assertEqual(1, len(source.projects))
        self.assertFalse(source.ambiguous_blocks)
        headers = [fact.source_span for fact in source.facts if fact.kind == "project_header"]
        self.assertEqual(["LLM Platform | Python, PyTorch, GCP"], headers)
        details = [fact.source_span for fact in source.facts if fact.kind == "project_detail"]
        self.assertEqual(2, len(details))
        self.assertTrue(details[1].startswith("GCP Vertex AI"))

    def test_unicode_black_circle_bullet_extracts_body_facts(self) -> None:
        resume = """# Jane Doe
## Experience
### Acme Corp | Senior Engineer | 2020 - 2022
\u25cf Spearheaded distributed database migration.
\u25cf Reduced query latencies by 50%.
## Projects
### Search Engine
\u25cf Built indexing service with Python.
## Skills
\u25cf Python, SQL \u25cf PostgreSQL
"""
        source = extract_source(resume)
        self.assertEqual(1, len(source.roles))
        self.assertEqual(1, len(source.projects))
        self.assertFalse(source.ambiguous_blocks)
        responsibilities = [fact for fact in source.facts if fact.kind == "responsibility"]
        self.assertEqual(2, len(responsibilities))
        self.assertEqual(
            "Spearheaded distributed database migration.",
            responsibilities[0].source_span,
        )
        self.assertEqual(
            "Reduced query latencies by 50%.",
            responsibilities[1].source_span,
        )
        project_details = [fact for fact in source.facts if fact.kind == "project_detail"]
        self.assertEqual(1, len(project_details))
        self.assertEqual(
            "Built indexing service with Python.",
            project_details[0].source_span,
        )
        skills = [fact.source_span for fact in source.facts if fact.kind == "skill"]
        self.assertEqual(["Python", "SQL", "PostgreSQL"], skills)
        for fact in source.facts:
            self.assertEqual(
                fact.source_span,
                resume[fact.span_start : fact.span_end],
                fact,
            )

    def test_en_dash_bullet_extracts_body_facts(self) -> None:
        # En dash (U+2013) is a common resume-template bullet character,
        # distinct from the hyphen-minus (U+002D) BULLET already matched.
        # Before this was added to BULLET's character class, every line
        # here was misclassified as its own role_header (no recognized
        # bullet -> not body), which starved the role/project of any
        # body_fact_ids and forced the ambiguous-block fallback path.
        resume = """# Jane Doe
## Experience
### Acme Corp | Senior Engineer | 2020 - 2022
– Spearheaded distributed database migration.
– Reduced query latencies by 50%.
## Projects
### Search Engine
– Built indexing service with Python.
"""
        source = extract_source(resume)
        self.assertEqual(1, len(source.roles))
        self.assertEqual(1, len(source.projects))
        self.assertFalse(source.ambiguous_blocks)
        responsibilities = [fact for fact in source.facts if fact.kind == "responsibility"]
        self.assertEqual(2, len(responsibilities))
        self.assertEqual(
            "Spearheaded distributed database migration.",
            responsibilities[0].source_span,
        )
        project_details = [fact for fact in source.facts if fact.kind == "project_detail"]
        self.assertEqual(1, len(project_details))

    def test_relevant_knowledge_areas_heading_is_recognized_as_skills(self) -> None:
        # A real resume used this exact heading for a trailing pipe-delimited
        # list of terms. Before it was added to SECTION_NAMES, the section
        # fell through to "other", and this specific resume's last project
        # bullet -- which happens to wrap across two PDF-extracted lines --
        # ended up merged with it into one leftover ambiguous_block.
        resume = """# Jane Doe
## Relevant Knowledge Areas
ML | Deep Learning | NLP | Statistical Modeling | A/B Testing
"""
        source = extract_source(resume)
        skills = [fact.source_span for fact in source.facts if fact.kind == "skill"]
        self.assertEqual(
            ["ML", "Deep Learning", "NLP", "Statistical Modeling", "A/B Testing"],
            skills,
        )
        self.assertFalse(source.ambiguous_blocks)

    def test_objective_heading_is_recognized_as_a_summary_section(self) -> None:
        resume = """# Jane Doe
## Objective
Seeking a backend role applying distributed-systems experience.

## Experience
### Acme Corp | Senior Engineer | Jan 2020 - Present
- Led API modernization across 20 services, reducing latency 30%.
"""
        self.assertTrue(extract_source(resume).has_summary)

    def test_career_objective_heading_is_recognized_as_a_summary_section(self) -> None:
        resume = """# Jane Doe
## Career Objective
Seeking a backend role applying distributed-systems experience.

## Experience
### Acme Corp | Senior Engineer | Jan 2020 - Present
- Led API modernization across 20 services, reducing latency 30%.
"""
        self.assertTrue(extract_source(resume).has_summary)

    def test_additional_information_and_volunteering_headings_are_preserved_not_ambiguous(
        self,
    ) -> None:
        resume = """# Jane Doe
## Experience
### Acme Corp | Senior Engineer | Jan 2020 - Present
- Led API modernization across 20 services, reducing latency 30%.

## Additional Information
Fluent in Spanish. Certified Scrum Master.

## Volunteering
### Food Bank | Weekend Coordinator
- Organized weekly volunteer shifts.
"""
        source = extract_source(resume)
        self.assertFalse(source.ambiguous_blocks)
        preserved = [
            fact.source_span
            for fact in source.facts
            if fact.kind == "other" and fact.protected
        ]
        self.assertIn("Fluent in Spanish. Certified Scrum Master.", preserved)
        self.assertIn(
            "Organized weekly volunteer shifts.".strip("- ").strip(),
            [span.lstrip("- ").strip() for span in preserved],
        )


if __name__ == "__main__":
    unittest.main()
