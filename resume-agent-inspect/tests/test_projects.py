from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from fakes import JD, RESUME, ScriptedLLM  # noqa: E402
from fakes import ShortResumePipeline as ResumeTailoringPipeline  # noqa: E402

from low_risk_agent.models import (  # noqa: E402
    CriticStrategy,
    JobAnalysis,
    JobRequirement,
    ProjectChoice,
    RequirementMapping,
    RunRequest,
)
from low_risk_agent.projects import (  # noqa: E402
    parse_catalog,
    project_library_from_source,
    replace_projects,
    select_projects,
    shortlist,
)
from low_risk_agent.source import extract_source  # noqa: E402

FOUR_PROJECT_RESUME = """Jane Doe
jane@example.com

Experience
Acme Corp | Senior Engineer | Jan 2020 - Present
- Led API modernization, reducing latency by 30% across 20 services.

Skills
Python, SQL, AWS, Pinecone

Projects
AWS Catalog
- Built AWS Glue catalog tables for discoverable S3 records.
- Designed Python ingestion with validation.

Search API
- Built a searchable document collection.
- Designed a Python API for search.

Retrieval Chatbot
- Built a chatbot using embeddings and Pinecone.
- Designed retrieval augmented generation with an LLM.

Internal Tooling
- Built an internal dashboard for support engineers.
- Designed role-based access controls.

Education
B.S. Computer Science, State University, 2019
Coursework: Algorithms
"""

CATALOG = """# Projects Library
## Data Engineer
### 1. AWS Catalog
- Built AWS Glue catalog tables for discoverable S3 records.
- Designed Python ingestion with validation.
- Improved dataset discovery and reliability.
### 2. Search API
- Built a searchable document collection.
- Designed a Python API for search.
- Improved document retrieval for users.
## AI Engineer
### 1. Retrieval Chatbot
- Built a chatbot using embeddings and Pinecone.
- Designed retrieval augmented generation with an LLM.
- Improved answer relevance using evaluation queries.
## Cloud Engineer
### 1. AWS Catalog
- Built a conflicting duplicate with 99% improvement.
"""


def analysis(*requirements: str) -> JobAnalysis:
    return JobAnalysis(
        requirements=[
            JobRequirement(
                requirement_id=f"R{i}",
                text=text,
                evidence_span=text,
                priority="must",
            )
            for i, text in enumerate(requirements, 1)
        ],
        ats_terms=list(requirements),
        requested_tools=list(requirements),
        traps=[],
    )


def empty_strategy() -> CriticStrategy:
    return CriticStrategy(
        mappings=[],
        verified_skill_allowlist=[],
        unsupported_gaps=[],
        skill_categories=[],
    )


class ProjectTests(unittest.TestCase):
    def test_catalog_deduplicates_and_keeps_original_file_provenance(self):
        records = parse_catalog(CATALOG, "catalog.md")
        self.assertEqual(3, len(records))
        self.assertEqual(2, records[0]["occurrences"])
        self.assertEqual(["Data Engineer", "Cloud Engineer"], records[0]["categories"])
        for record in records:
            for fact in record["facts"]:
                self.assertEqual(CATALOG[fact.span_start : fact.span_end], fact.source_span)
                self.assertEqual("catalog.md", fact.source_document)
                self.assertNotIn("99%", fact.source_span)
        with self.assertRaises(ValueError):
            parse_catalog("# No project entries")

    def test_shortlist_changes_with_jd_and_is_bounded(self):
        records = parse_catalog(CATALOG)
        self.assertEqual("AWS Catalog", shortlist(records, analysis("AWS Glue"), 1)[0]["title"])
        self.assertEqual(
            "Retrieval Chatbot", shortlist(records, analysis("Pinecone embeddings"), 1)[0]["title"]
        )

    def test_invalid_or_redundant_model_choices_use_distinct_local_fallback(self):
        jd = analysis("AWS Glue", "API", "Pinecone")
        candidates = shortlist(parse_catalog(CATALOG), jd)
        source = replace_projects(extract_source(RESUME), candidates, jd)
        invalid = empty_strategy().model_copy(
            update={
                "selected_projects": [
                    ProjectChoice(
                        project_id="invented",
                        requirement_ids=["R1"],
                        reason="Invalid ID",
                    )
                ]
            }
        )
        chosen, decisions, selector = select_projects(invalid, candidates, jd, source)
        self.assertEqual("local_fallback", selector)
        self.assertEqual(2, len(chosen))
        self.assertNotIn("invented", [r["project_id"] for r in chosen])
        self.assertTrue(set(decisions[1]["requirement_ids"]) - set(decisions[0]["requirement_ids"]))
        only_one_match = shortlist(parse_catalog(CATALOG), analysis("AWS Glue"))
        chosen, _, _ = select_projects(
            empty_strategy(), only_one_match, analysis("AWS Glue"), source
        )
        self.assertEqual(1, len(chosen))

    def test_fallback_keeps_best_ranked_project_when_none_score_a_match(self):
        # A JD whose wording shares nothing with any candidate's project
        # text (matches == {} for every candidate) used to make the
        # coverage-driven fallback loop select nothing at all, which
        # deletes every project the source resume had via
        # replace_projects(source, [], ...). One real project kept is
        # better than a resume with no projects section at all.
        jd = analysis("Legal Compliance Auditing")
        candidates = shortlist(parse_catalog(CATALOG), jd)
        source = replace_projects(extract_source(RESUME), candidates, jd)
        invalid = empty_strategy().model_copy(
            update={
                "selected_projects": [
                    ProjectChoice(
                        project_id="invented",
                        requirement_ids=[],
                        reason="Invalid ID",
                    )
                ]
            }
        )
        chosen, decisions, selector = select_projects(invalid, candidates, jd, source)
        self.assertEqual("local_fallback", selector)
        self.assertEqual(1, len(chosen))
        self.assertEqual(candidates[0]["project_id"], chosen[0]["project_id"])
        self.assertEqual(1, len(decisions))

    def test_pipeline_selects_catalog_projects_in_existing_mapper_call(self):
        jd = analysis("AWS Glue", "API")

        def mapper(payload):
            facts = payload["resume_facts"]
            wanted = {"AWS Catalog": "R1", "Search API": "R2"}
            choices, mappings = [], []
            for candidate in payload["project_candidates"]:
                if candidate["title"] not in wanted:
                    continue
                requirement_id = wanted[candidate["title"]]
                fact = next(
                    f
                    for f in facts
                    if f["kind"] == "project_detail"
                    and f["role_or_project_id"] == candidate["project_id"]
                )
                choices.append(
                    ProjectChoice(
                        project_id=candidate["project_id"],
                        requirement_ids=[requirement_id],
                        reason="Provides a distinct platform capability",
                    )
                )
                mappings.append(
                    RequirementMapping(
                        requirement_id=requirement_id,
                        fact_ids=[fact["fact_id"]],
                        safe_adjacent_phrasing=[],
                    )
                )
            return empty_strategy().model_copy(
                update={
                    "mappings": mappings,
                    "selected_projects": choices,
                }
            )

        llm = ScriptedLLM({"analyze_jd": lambda _: jd, "map_adjacency": mapper})
        result = ResumeTailoringPipeline(llm=llm).run(
            RunRequest(
                original_resume=RESUME,
                job_description="AWS Glue and API",
                tenant_id="test",
                project_library=CATALOG,
                project_library_name="catalog.md",
            )
        )
        self.assertEqual("completed", result.status, result.error)
        self.assertEqual("model", result.project_selection["selector"])
        self.assertEqual(2, len(result.project_selection["selected"]))
        self.assertIn("### AWS Catalog", result.resume_markdown)
        self.assertIn("### Search API", result.resume_markdown)
        self.assertNotIn("Retrieval Chatbot", result.resume_markdown)
        self.assertNotIn("### Grounded Search", result.resume_markdown)
        self.assertIn("Coursework: Algorithms", result.resume_markdown)
        self.assertIn("Acme Corp", result.resume_markdown)
        self.assertEqual(1, llm.counts["map_adjacency"])
        self.assertEqual(
            {"analyze_jd", "map_adjacency", "craft", "semantic_review"}, set(llm.counts)
        )
        self.assertTrue(all("Pinecone" not in f.source_span for f in result.source_facts))
        tool = next(
            f for f in result.source_facts if f.kind == "tool" and f.source_span == "AWS Glue"
        )
        self.assertEqual(CATALOG[tool.span_start : tool.span_end], tool.source_span)

    def test_project_library_from_source_round_trips_through_parse_catalog(self):
        source = extract_source(FOUR_PROJECT_RESUME)
        library_text = project_library_from_source(source)
        records = parse_catalog(library_text, "resume_projects")
        self.assertEqual(
            {"AWS Catalog", "Search API", "Retrieval Chatbot", "Internal Tooling"},
            {r["title"] for r in records},
        )
        for record in records:
            for fact in record["facts"]:
                self.assertEqual(
                    library_text[fact.span_start : fact.span_end], fact.source_span
                )

    def test_project_library_from_source_is_empty_with_no_projects(self):
        source = extract_source("Jane Doe\njane@example.com\n\nSkills\nPython\n")
        self.assertEqual("", project_library_from_source(source))

    def test_more_than_three_source_projects_auto_activates_jd_relevance_selection(self):
        # No project_library supplied at all — this is the self-sourced path.
        jd = analysis("AWS Glue", "API")

        def mapper(payload):
            facts = payload["resume_facts"]
            wanted = {"AWS Catalog": "R1", "Search API": "R2"}
            choices, mappings = [], []
            for candidate in payload["project_candidates"]:
                if candidate["title"] not in wanted:
                    continue
                requirement_id = wanted[candidate["title"]]
                fact = next(
                    f
                    for f in facts
                    if f["kind"] == "project_detail"
                    and f["role_or_project_id"] == candidate["project_id"]
                )
                choices.append(
                    ProjectChoice(
                        project_id=candidate["project_id"],
                        requirement_ids=[requirement_id],
                        reason="Provides a distinct platform capability",
                    )
                )
                mappings.append(
                    RequirementMapping(
                        requirement_id=requirement_id,
                        fact_ids=[fact["fact_id"]],
                        safe_adjacent_phrasing=[],
                    )
                )
            return empty_strategy().model_copy(
                update={"mappings": mappings, "selected_projects": choices}
            )

        llm = ScriptedLLM({"analyze_jd": lambda _: jd, "map_adjacency": mapper})
        result = ResumeTailoringPipeline(llm=llm).run(
            RunRequest(
                original_resume=FOUR_PROJECT_RESUME,
                job_description="AWS Glue and API",
                tenant_id="test",
                # project_library intentionally omitted.
            )
        )
        self.assertEqual("completed", result.status, result.error)
        self.assertEqual("model", result.project_selection["selector"])
        self.assertEqual("resume_projects", result.project_selection["library_name"])
        self.assertIn("### AWS Catalog", result.resume_markdown)
        self.assertIn("### Search API", result.resume_markdown)
        self.assertNotIn("Retrieval Chatbot", result.resume_markdown)
        self.assertNotIn("Internal Tooling", result.resume_markdown)

    def test_three_or_fewer_source_projects_never_auto_activate_selection(self):
        # Regression lock: activating the selector unconditionally once broke
        # exactly this case. A one-project resume, run through ScriptedLLM's
        # default handler (which does not populate selected_projects), had
        # its one and only project silently dropped by select_projects()'s
        # local fallback.
        llm = ScriptedLLM()
        result = ResumeTailoringPipeline(llm=llm).run(
            RunRequest(original_resume=RESUME, job_description=JD, tenant_id="test")
        )
        self.assertEqual("completed", result.status, result.error)
        self.assertEqual({}, result.project_selection)
        self.assertIn("### Grounded Search", result.resume_markdown)

    def test_explicit_project_library_still_wins_over_self_sourced(self):
        jd = analysis("Pinecone embeddings")
        llm = ScriptedLLM({"analyze_jd": lambda _: jd})
        result = ResumeTailoringPipeline(llm=llm).run(
            RunRequest(
                original_resume=RESUME,
                job_description="Pinecone embeddings",
                tenant_id="test",
                project_library=CATALOG,
                project_library_name="catalog.md",
            )
        )
        self.assertEqual("completed", result.status, result.error)
        self.assertEqual("catalog.md", result.project_selection["library_name"])
        self.assertNotIn("### Grounded Search", result.resume_markdown)

    def test_third_project_requires_new_important_evidence(self):
        jd = analysis("AWS Glue", "API", "Pinecone")
        candidates = shortlist(parse_catalog(CATALOG), jd)
        source = replace_projects(extract_source(RESUME), candidates, jd)
        strategy = empty_strategy()
        for index, candidate in enumerate(candidates, 1):
            fact = next(f for f in candidate["facts"] if f.kind == "project_detail")
            strategy.selected_projects.append(
                ProjectChoice(
                    project_id=candidate["project_id"],
                    requirement_ids=[f"R{index}"],
                    reason="Covers a distinct required capability",
                )
            )
            strategy.mappings.append(
                RequirementMapping(
                    requirement_id=f"R{index}",
                    fact_ids=[fact.fact_id],
                    safe_adjacent_phrasing=[],
                )
            )
        selected, _, selector = select_projects(strategy, candidates, jd, source)
        self.assertEqual("model", selector)
        self.assertEqual(3, len(selected))
        jd.requirements[2].priority = "context"
        _, _, selector = select_projects(strategy, candidates, jd, source)
        self.assertEqual("local_fallback", selector)

    def test_role_and_catalog_phrases_prevent_generic_overlap_from_dominating(self):
        text = (
            CATALOG
            + """
## Sports Analyst
### Generic Report
- Built scalable systems for business stakeholders with data and platforms.
- Designed engineering frameworks and metadata management services.
- Improved reliability and engineering practices across teams.
"""
        )
        jd = analysis("data engineering metadata management frameworks", "AWS Glue cataloging")
        jd.requested_tools = ["AWS", "Glue"]
        jd.ats_terms = ["cataloging", "metadata management"]
        candidates = shortlist(parse_catalog(text), jd, 1, "Data Engineer")
        self.assertEqual("AWS Catalog", candidates[0]["title"])


if __name__ == "__main__":
    unittest.main()
