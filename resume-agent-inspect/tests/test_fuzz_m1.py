from __future__ import annotations

import sys
import unittest
from pathlib import Path

# Ensure tests root and src are on sys.path
root_dir = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root_dir / "src"))
sys.path.insert(0, str(root_dir / "tests"))

from fakes import JD, ScriptedLLM, ShortResumePipeline  # noqa: E402

from low_risk_agent.models import DraftBullet, RunRequest  # noqa: E402
from low_risk_agent.policy import _bullet_checks, _plain_lead  # noqa: E402
from low_risk_agent.projects import parse_catalog  # noqa: E402
from low_risk_agent.source import extract_source  # noqa: E402


class FuzzAndStressTests(unittest.TestCase):
    """Adversarial stress and boundary condition fuzzing for Milestone 1."""

    # -------------------------------------------------------------------------
    # 1. extract_source Boundary Conditions
    # -------------------------------------------------------------------------

    def test_extract_source_empty_and_whitespace_inputs(self) -> None:
        """Empty or whitespace-only inputs must handle safely without crashing."""
        for empty in ["", "   ", "\n\n\t  \n  ", "\r\n\r\n"]:
            with self.subTest(empty=repr(empty)):
                src = extract_source(empty)
                self.assertEqual(len(src.roles), 0)
                self.assertEqual(len(src.facts), 0)

    def test_extract_source_only_section_headers(self) -> None:
        """Resumes with only section headers must parse without crashing."""
        resume = """# Jane Doe
## Experience
## Education
## Skills
## Projects
"""
        source = extract_source(resume)
        self.assertIsNotNone(source)
        self.assertEqual(1, len(source.preamble_fact_ids))
        self.assertEqual(0, len(source.roles))
        self.assertEqual(0, len(source.projects))
        self.assertEqual(0, len(source.ambiguous_blocks))

    def test_extract_source_hundred_wrapped_continuation_lines(self) -> None:
        """A single bullet wrapped across 100 continuation lines must remain in 1 role."""
        lines = [
            "# Alice Engineer",
            "## Experience",
            "### BigCorp | Staff Infrastructure Engineer | 2020 - Present",
            "- Architected multi-region platform serving 10M users,",
        ]
        for i in range(1, 101):
            lines.append(f"  handling stream partition {i} with 99.{i % 99}% uptime,")

        resume = "\n".join(lines) + "\n"
        source = extract_source(resume)

        self.assertEqual(1, len(source.roles))
        self.assertEqual(0, len(source.ambiguous_blocks))
        responsibilities = [f for f in source.facts if f.kind == "responsibility"]
        self.assertEqual(101, len(responsibilities))

        for fact in source.facts:
            self.assertEqual(
                fact.source_span,
                resume[fact.span_start : fact.span_end],
                f"Span mismatch for {fact.fact_id}: {fact.source_span}",
            )

        metrics = [f for f in source.facts if f.kind == "metric"]
        self.assertGreaterEqual(len(metrics), 50)

    def test_extract_source_massive_resume(self) -> None:
        """Stress-test parser performance with 500+ lines and multiple roles/projects."""
        sections = ["# Senior Multi-Hyphenate", "## Experience"]
        for role_idx in range(10):
            d1 = f"Jan 201{role_idx % 10}"
            d2 = f"Dec 202{role_idx % 5}"
            sections.append(f"### Company {role_idx} | Senior Architect | {d1} \u2013 {d2}")
            for b_idx in range(15):
                pct = b_idx + 10
                cls = role_idx + 2
                sections.append(
                    f"\u25cf Spearheaded initiative {role_idx}_{b_idx}, "
                    f"reducing cost by {pct}% across {cls} clusters."
                )
                sections.append(
                    f"  optimized memory usage by {b_idx * 2 + 5}MB on edge nodes."
                )

        sections.append("## Projects")
        for proj_idx in range(10):
            sections.append(f"### OpenSource Platform {proj_idx}")
            for b_idx in range(5):
                sections.append(
                    f"\u25cf Built modular component {b_idx} using Go and Python "
                    "with 100% test coverage."
                )

        sections.append("## Skills")
        sections.append("\u25cf " + ", ".join([f"Skill_{i}" for i in range(50)]))

        resume = "\n".join(sections)
        source = extract_source(resume)

        self.assertEqual(10, len(source.roles))
        self.assertEqual(10, len(source.projects))
        self.assertEqual(0, len(source.ambiguous_blocks))
        self.assertGreaterEqual(len(source.facts), 500)

        for fact in source.facts:
            self.assertEqual(fact.source_span, resume[fact.span_start : fact.span_end])

    def test_extract_source_malformed_and_exotic_date_ranges(self) -> None:
        """Stress test en-dash and em-dash splitting across complex date expressions."""
        test_cases = [
            ("Company Alpha (2018\u20132020) | Lead Dev", "Company Alpha", "Lead Dev"),
            ("Beta Corp (Jan 2019 \u2014 Mar 2021) | Architect", "Beta Corp", "Architect"),
            (
                "Gamma Inc. \u2013 Staff Engineer \u2013 2020\u2013Present",
                "Gamma Inc.",
                "Staff Engineer",
            ),
            (
                "Delta Systems \u2014 Principal Scientist (2015 \u2014 2019)",
                "Delta Systems",
                "Principal Scientist",
            ),
            ("Epsilon Co [2021\u20132023] | Senior Consultant", "Epsilon Co", "Senior Consultant"),
            ("Zeta Org (March 2020\u2013Present) | Manager", "Zeta Org", "Manager"),
        ]

        for line_header, expected_emp, expected_title in test_cases:
            resume = f"# Bob Developer\n## Experience\n### {line_header}\n- Automated testing.\n"
            source = extract_source(resume)
            self.assertEqual(1, len(source.roles), f"Failed role count for {line_header}")
            self.assertEqual(0, len(source.ambiguous_blocks), f"Ambiguous block in {line_header}")

            employers = {f.source_span for f in source.facts if f.kind == "employer"}
            titles = {f.source_span for f in source.facts if f.kind == "title"}
            self.assertIn(expected_emp, employers, f"Employer mismatch in {line_header}")
            self.assertIn(expected_title, titles, f"Title mismatch in {line_header}")

            for fact in source.facts:
                self.assertEqual(fact.source_span, resume[fact.span_start : fact.span_end])

    def test_extract_source_all_unicode_bullet_variants(self) -> None:
        """Verify all supported bullet styles extract facts without error."""
        bullets = [
            "\u25cf",  # Black circle
            "\u2022",  # Bullet
            "\u2023",  # Triangular bullet
            "\u25aa",  # Black small square
            "\u25e6",  # White bullet
            "-",
            "*",
            "1.",
            "2)",
        ]

        for b in bullets:
            resume = f"""# Test User
## Experience
### Test Corp | Engineer | 2020 - 2021
{b} Delivered scalable microservices with 99.9% reliability.
## Projects
### Engine
{b} Developed core algorithms.
## Skills
{b} Python, Docker, Rust
"""
            source = extract_source(resume)
            self.assertEqual(1, len(source.roles), f"Failed for bullet {repr(b)}")
            self.assertEqual(1, len(source.projects), f"Failed for bullet {repr(b)}")
            self.assertEqual(0, len(source.ambiguous_blocks), f"Failed for bullet {repr(b)}")

            responsibilities = [f for f in source.facts if f.kind == "responsibility"]
            self.assertEqual(1, len(responsibilities), f"Failed for bullet {repr(b)}")
            self.assertEqual(
                "Delivered scalable microservices with 99.9% reliability.",
                responsibilities[0].source_span,
            )

            project_details = [f for f in source.facts if f.kind == "project_detail"]
            self.assertEqual(1, len(project_details), f"Failed for bullet {repr(b)}")
            self.assertEqual("Developed core algorithms.", project_details[0].source_span)

            skills = [f.source_span for f in source.facts if f.kind == "skill"]
            self.assertEqual(["Python", "Docker", "Rust"], skills)

    def test_extract_source_ambiguous_role_without_body_facts(self) -> None:
        """Header without body facts must trigger AmbiguousBlock with exact spans."""
        resume = """# Jane Doe
## Experience
### Orphan Corp | Director | 2020 - 2022
## Education
B.S. Engineering
"""
        source = extract_source(resume)
        self.assertEqual(1, len(source.roles))
        self.assertEqual(1, len(source.ambiguous_blocks))
        amb = source.ambiguous_blocks[0]
        self.assertEqual("Orphan Corp | Director | 2020 - 2022", amb.source_span)
        self.assertEqual(amb.source_span, resume[amb.span_start : amb.span_end])

    # -------------------------------------------------------------------------
    # 2. Project Catalog Parsing (parse_catalog)
    # -------------------------------------------------------------------------

    def test_parse_catalog_unicode_black_circle_bullets(self) -> None:
        """parse_catalog must parse U+25CF bullets, metrics, and categories."""
        catalog_md = """## Cloud Infrastructure
### High-Throughput Stream Pipeline
\u25cf Architected event processing engine in Rust and Python.
\u25cf Processed 500k events/sec with latency under 10ms.
\u25cf Reduced infrastructure cost by 40%.

## Machine Learning
### Embeddings Search Service
\u25cf Designed vector similarity search using FAISS.
\u25cf Scaled query throughput 3x across 8 GPU instances.
"""
        records = parse_catalog(catalog_md, document="test_catalog.md")
        self.assertEqual(2, len(records))

        p1 = records[0]
        self.assertEqual("High-Throughput Stream Pipeline", p1["title"])
        self.assertIn("Cloud Infrastructure", p1["categories"])
        self.assertEqual(1, p1["occurrences"])

        p1_details = [f for f in p1["facts"] if f.kind == "project_detail"]
        self.assertEqual(3, len(p1_details))
        self.assertEqual(
            "Architected event processing engine in Rust and Python.",
            p1_details[0].source_span,
        )
        self.assertEqual("lead", p1_details[0].ownership_level)

        p1_metrics = [f for f in p1["facts"] if f.kind == "metric"]
        metric_spans = {m.source_span for m in p1_metrics}
        self.assertIn("500k", metric_spans)
        self.assertIn("40%", metric_spans)

        for r in records:
            for fact in r["facts"]:
                self.assertEqual(
                    fact.source_span,
                    catalog_md[fact.span_start : fact.span_end],
                    f"Catalog span mismatch: {fact.source_span}",
                )

    def test_parse_catalog_empty_and_invalid_inputs(self) -> None:
        """parse_catalog on empty text or missing bullets must raise ValueError."""
        with self.assertRaises(ValueError):
            parse_catalog("")

        with self.assertRaises(ValueError):
            parse_catalog("## Section Only\n### Heading Without Bullets\n")

    # -------------------------------------------------------------------------
    # 3. Policy & Markdown Cleaning (clean_markdown & _plain_lead)
    # -------------------------------------------------------------------------

    def test_policy_plain_lead_strips_unicode_bullet(self) -> None:
        """_plain_lead must strip leading U+25CF bullets so verbs are exposed."""
        self.assertEqual(
            "Led team of 5 engineers.",
            _plain_lead("\u25cf Led team of 5 engineers."),
        )
        self.assertEqual(
            "Built high-scale service.",
            _plain_lead("  \u25cf Built high-scale service."),
        )
        self.assertEqual(
            "Spearheaded project.",
            _plain_lead("> \u25cf Spearheaded project."),
        )
        self.assertEqual(
            "Reduced latency 20%.",
            _plain_lead("## \u25cf **Reduced** latency 20%."),
        )

    def test_policy_bullet_checks_flags_markdown_bullets(self) -> None:
        """Draft bullets with markdown bullets like U+25CF must fail claim.markdown."""
        source = extract_source("""# User
## Experience
### Corp | Eng | 2020 - 2021
- Led development of analytics service.
""")
        fact_id = source.facts[2].fact_id

        invalid_bullet = DraftBullet(
            text="\u25cf Led development of analytics service.",
            purpose="experience",
            fact_ids=[fact_id],
            ownership_level="lead",
            metrics=[],
        )
        checks = _bullet_checks(
            invalid_bullet, "experience.0.bullets.0", source, allow_synthetic_metrics=False
        )
        markdown_check = next(c for c in checks if c.code == "claim.markdown")
        self.assertFalse(
            markdown_check.passed,
            "claim.markdown should fail on bullet marker \u25cf",
        )

        valid_bullet = DraftBullet(
            text="Led development of analytics service.",
            purpose="experience",
            fact_ids=[fact_id],
            ownership_level="lead",
            metrics=[],
        )
        checks_valid = _bullet_checks(
            valid_bullet, "experience.0.bullets.0", source, allow_synthetic_metrics=False
        )
        markdown_check_valid = next(c for c in checks_valid if c.code == "claim.markdown")
        self.assertTrue(markdown_check_valid.passed, "claim.markdown should pass on plain text")

    # -------------------------------------------------------------------------
    # 4. ResumeTailoringPipeline End-to-End with Fake Models
    # -------------------------------------------------------------------------

    def test_pipeline_end_to_end_with_black_circle_bullets_and_dates(self) -> None:
        """End-to-end pipeline execution on a resume using U+25CF bullets and date ranges."""
        resume = """Jane Developer
jane.dev@example.com

Experience
Tech Giant | Senior Systems Engineer | Jan 2020 \u2013 Present
\u25cf Led API modernization, reducing latency by 30% across 20 services.

Skills
Python, Rust, Distributed Systems

Projects
Fault-Tolerant Raft
\u25cf Built replicated state machine in Rust.
\u25cf Designed deterministic evidence links for each node.
\u25cf Improved reviewer traceability through stable consensus IDs.

Education
B.S. Computer Engineering, Tech Institute, 2019
"""
        req = RunRequest(
            original_resume=resume,
            job_description=JD,
            tenant_id="tenant-fuzz",
            allow_synthetic_metrics=True,
        )

        llm = ScriptedLLM()
        pipeline = ShortResumePipeline(llm=llm, cache_secret="f" * 32)
        result = pipeline.run(req)

        self.assertEqual("completed", result.status)
        self.assertTrue(result.resume_markdown)
        self.assertGreater(result.word_count, 50)
        self.assertIn("Jane Developer", result.resume_markdown)
        self.assertIn("Tech Giant", result.resume_markdown)

    def test_pipeline_wrapped_continuation_facts_accessible_to_pipeline(self) -> None:
        """Verify continuation lines produce valid responsibility facts accessible to tailoring."""
        resume = """Jane Developer
jane.dev@example.com

Experience
Tech Giant | Senior Systems Engineer | Jan 2020 \u2013 Present
\u25cf Spearheaded distributed service migration across 10 clusters,
  reducing latency by 45% and eliminating memory leaks.

Skills
Python, Rust, Distributed Systems

Projects
Cloud Mesh
\u25cf Built service mesh proxy in Rust.
\u25cf Designed telemetry collection for distributed traces.
\u25cf Verified zero packet drop under peak load.

Education
B.S. Computer Engineering, 2019
"""
        source = extract_source(resume)
        self.assertEqual(1, len(source.roles))
        self.assertEqual(0, len(source.ambiguous_blocks))

        responsibilities = [f for f in source.facts if f.kind == "responsibility"]
        self.assertEqual(2, len(responsibilities))
        self.assertEqual("lead", responsibilities[0].ownership_level)
        self.assertEqual(
            "reducing latency by 45% and eliminating memory leaks.",
            responsibilities[1].source_span,
        )

        metrics = [f for f in source.facts if f.kind == "metric"]
        metric_spans = {m.source_span for m in metrics}
        self.assertIn("10", metric_spans)
        self.assertIn("45%", metric_spans)


if __name__ == "__main__":
    unittest.main()
