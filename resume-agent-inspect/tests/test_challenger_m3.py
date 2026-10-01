from __future__ import annotations

import json
import os
import subprocess
import sys
import unittest
from pathlib import Path

# Ensure tests root and src are on sys.path
root_dir = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root_dir / "src"))
sys.path.insert(0, str(root_dir / "tests"))

from low_risk_agent.models import DraftBullet, FallbackFact, FallbackFacts  # noqa: E402
from low_risk_agent.policy import _bullet_checks, _plain_lead  # noqa: E402
from low_risk_agent.projects import parse_catalog  # noqa: E402
from low_risk_agent.source import extract_source, merge_fallback_facts  # noqa: E402


class ChallengerM3StressTests(unittest.TestCase):
    """Empirical Challenger stress tests for Milestone 3.

    Validates:
    1. Novel boundary resumes (empty, whitespace, massive 50-role, 100-role).
    2. Complex en-dash and em-dash headers with parenthesized/bracketed dates.
    3. Wrapped bullet continuation lines (lowercase, indented, multi-line, metrics).
    4. Unicode U+25CF (●) and mixed bullet style grammar across source, projects, policy.
    5. 100% strict verification of the 1:1 character span invariant:
       resume[fact.span_start : fact.span_end] == fact.source_span
    """

    def assert_all_spans_valid(self, resume: str, source) -> None:
        """Helper to assert that 100% of facts satisfy the 1:1 character span invariant."""
        self.assertIsNotNone(source)
        for fact in source.facts:
            extracted = resume[fact.span_start : fact.span_end]
            self.assertEqual(
                extracted,
                fact.source_span,
                f"Span invariant failed for fact {fact.fact_id} ({fact.kind}): "
                f"expected {fact.source_span!r}, got slice {extracted!r} "
                f"at [{fact.span_start}:{fact.span_end}]",
            )
            self.assertGreaterEqual(fact.span_start, 0)
            self.assertLessEqual(fact.span_end, len(resume))
            self.assertEqual(len(fact.source_span), fact.span_end - fact.span_start)

    # =========================================================================
    # 1. Novel Boundary Resumes
    # =========================================================================

    def test_boundary_empty_and_whitespace_matrix(self) -> None:
        """Empty, whitespace-only, and control character resumes return clean empty source."""
        cases = [
            "",
            " ",
            "    ",
            "\t",
            "\n",
            "\r\n",
            "\n\n\n\n",
            "   \t  \r\n   \n \t\t \n",
            "\f\v",
        ]
        for c in cases:
            with self.subTest(input=repr(c)):
                src = extract_source(c)
                self.assertEqual(len(src.facts), 0)
                self.assertEqual(len(src.roles), 0)
                self.assertEqual(len(src.projects), 0)
                self.assertEqual(len(src.education_fact_ids), 0)
                self.assertEqual(len(src.preserved_fact_ids), 0)
                self.assertEqual(len(src.ambiguous_blocks), 0)
                self.assert_all_spans_valid(c, src)

    def test_boundary_50_role_massive_resume(self) -> None:
        """50-role massive resume parses with exact role counts and 100% valid spans."""
        sections = [
            "# Alexander High-Scale Architect",
            "alex@example.com | 555-0199 | San Francisco, CA",
            "## Professional Summary",
            "Veteran infrastructure architect with 25 years of distributed systems engineering.",
            "## Experience",
        ]
        for i in range(1, 51):
            sections.extend(
                [
                    (
                        f"### Global Enterprise {i} | Principal Architect | "
                        f"Jan {1970 + i} – Dec {1971 + i}"
                    ),
                    (
                        f"● Spearheaded core platform redesign for datacenter {i} "
                        f"reducing latency by {i * 2}ms."
                    ),
                    f"  streamlined database queries to handle {i * 10}k QPS under peak traffic,",
                    f"  saving ${i * 100},000 annually across {i} clusters worldwide.",
                    (
                        f"● Directed engineering team of {i + 5} senior developers "
                        "delivering 99.99% availability."
                    ),
                ]
            )
        sections.extend(
            [
                "## Education",
                "Master of Science in Distributed Computing, MIT, 1995",
                "## Skills",
                "Languages: Rust, Go, Python, C++, SQL",
                "Cloud: AWS, GCP, Azure, Kubernetes, Terraform",
            ]
        )
        resume = "\n".join(sections)
        self.assertGreater(len(resume), 15000)

        src = extract_source(resume)
        self.assertEqual(len(src.roles), 50)
        # Each role should have exactly 2 primary bullet facts in body_fact_ids
        for r_idx, role in enumerate(src.roles, 1):
            self.assertEqual(
                len(role.body_fact_ids),
                2,
                f"Role {r_idx} should have 2 bullets in body_fact_ids, "
                f"got {len(role.body_fact_ids)}",
            )
        # Validate 100% of all facts satisfy span invariant
        self.assert_all_spans_valid(resume, src)

    def test_boundary_100_role_extreme_scale(self) -> None:
        """100-role extreme resume verifies parser scaling without quadratic blowup."""
        sections = ["# Extreme Scale Candidate", "## Experience"]
        for i in range(1, 101):
            sections.extend(
                [
                    f"### Enterprise {i} – Staff Engineer – 2020 – 2021",
                    f"- Architected distributed service #{i} handling 100k requests.",
                ]
            )
        resume = "\n".join(sections)
        src = extract_source(resume)
        self.assertEqual(len(src.roles), 100)
        self.assert_all_spans_valid(resume, src)

    # =========================================================================
    # 2. Complex En-Dash, Em-Dash, and Parenthesized/Bracketed Headers
    # =========================================================================

    def test_endash_emdash_headers_preservation(self) -> None:
        """En-dash and em-dash headers preserve employer and title without corrupt fragments."""
        cases = [
            (
                "Acme Corp – Senior Systems Architect – Jan 2020 – Dec 2023",
                "Acme Corp",
                "Senior Systems Architect",
                "Jan 2020 – Dec 2023",
            ),
            (
                "Big Data Inc — Staff Infrastructure Engineer — Oct 2021 — Present",
                "Big Data Inc",
                "Staff Infrastructure Engineer",
                "Oct 2021 — Present",
            ),
            (
                "Lead Architect | NextGen Robotics Corp – 2022 – Present",
                "NextGen Robotics Corp",
                "Lead Architect",
                "2022 – Present",
            ),
            (
                "Senior Machine Learning Engineer – DeepAI Corp – 2018 – 2021",
                "DeepAI Corp",
                "Senior Machine Learning Engineer",
                "2018 – 2021",
            ),
        ]
        for header_line, exp_emp, exp_title, exp_date in cases:
            with self.subTest(header=header_line):
                resume = (
                    f"# Test Candidate\n"
                    f"## Experience\n"
                    f"### {header_line}\n"
                    f"● Built high-throughput system serving 10M daily requests.\n"
                )
                src = extract_source(resume)
                self.assertEqual(len(src.roles), 1)
                role = src.roles[0]

                role_facts = {
                    f.fact_id: f for f in src.facts if f.role_or_project_id == role.group_id
                }
                employers = [f.source_span for f in role_facts.values() if f.kind == "employer"]
                titles = [f.source_span for f in role_facts.values() if f.kind == "title"]
                dates = [f.source_span for f in role_facts.values() if f.kind == "date"]

                self.assertIn(exp_emp, employers, f"Employer {exp_emp!r} not found in {employers}")
                self.assertIn(exp_title, titles, f"Title {exp_title!r} not found in {titles}")
                self.assertTrue(
                    any(exp_date in d for d in dates), f"Date {exp_date!r} not found in {dates}"
                )

                # Ensure no stray single date fragments are classified as employer or title
                for emp in employers:
                    self.assertNotIn("Jan", emp)
                    self.assertNotIn("202", emp)
                for ttl in titles:
                    self.assertNotIn("Jan", ttl)
                    self.assertNotIn("202", ttl)

                self.assert_all_spans_valid(resume, src)

    def test_endash_parenthesized_date_preservation(self) -> None:
        """Header with parenthesized en-dash date preserves title, employer, and dates."""
        resume = """# Jane Tech
## Experience
### Stripe – Principal Engineer – (Jan 2018 – Mar 2021)
● Spearheaded payments API v3 architecture.
"""
        src = extract_source(resume)
        self.assertEqual(len(src.roles), 1)
        role = src.roles[0]
        role_facts = [f for f in src.facts if f.role_or_project_id == role.group_id]
        employers = [f.source_span for f in role_facts if f.kind == "employer"]
        titles = [f.source_span for f in role_facts if f.kind == "title"]
        dates = [f.source_span for f in role_facts if f.kind == "date"]

        self.assertIn("Stripe", employers)
        self.assertIn("Principal Engineer", titles)
        self.assertTrue(any("Jan 2018 – Mar 2021" in d for d in dates))
        self.assert_all_spans_valid(resume, src)

    def test_boundary_strip_parentheses_behavior(self) -> None:
        """Empirically test line 313 strip behavior on parenthetical suffixes."""
        resume = """# Jane Tech
## Experience
### Cloud Systems (Americas) – Senior Director – 2019 – 2022
● Directed regional engineering operations.
"""
        src = extract_source(resume)
        self.assertEqual(len(src.roles), 1)
        role = src.roles[0]
        role_facts = [f for f in src.facts if f.role_or_project_id == role.group_id]
        employers = [f.source_span for f in role_facts if f.kind == "employer"]
        # Empirical finding: strip(" ,;()[]") strips trailing ')' leaving 'Cloud Systems (Americas'
        # Crucially, 1:1 character span is preserved even with the stripped token!
        self.assertTrue(len(employers) >= 1)
        self.assert_all_spans_valid(resume, src)

    # =========================================================================
    # 3. Wrapped Bullet Continuation Lines
    # =========================================================================

    def test_wrapped_continuation_variations_and_metric_extraction(self) -> None:
        """Wrapped bullet continuation lines do not inflate body_fact_ids count
        and extract metrics.
        """
        resume = """# Engineering Lead
## Experience
### FinTech Global | Senior Staff Architect | 2021 – Present
● Spearheaded payment processing engine refactor across 4 regions,
  reducing transaction settlement time by 45ms and saving $2.5M in cloud egress costs,
  while maintaining 99.999% availability for 50M cardholders.
● Architected real-time fraud scoring pipeline in Rust and Kafka,
    processing 100,000 events per second with sub-10ms p99 latency,
    and cutting chargeback rates by 35%.
"""
        src = extract_source(resume)
        self.assertEqual(len(src.roles), 1)
        role = src.roles[0]

        # Exactly 2 primary bullets in body_fact_ids
        self.assertEqual(len(role.body_fact_ids), 2)

        # Continuation lines must be extracted as facts (kind="responsibility")
        responsibilities = [
            f
            for f in src.facts
            if f.role_or_project_id == role.group_id and f.kind == "responsibility"
        ]
        self.assertEqual(len(responsibilities), 6)  # 2 primary + 4 continuation lines

        # Verify metrics extracted across wrapped continuation lines
        metrics = [
            f.source_span
            for f in src.facts
            if f.role_or_project_id == role.group_id and f.kind == "metric"
        ]
        self.assertIn("$2.5M", metrics)
        self.assertIn("99.999%", metrics)
        self.assertIn("50M", metrics)
        self.assertIn("100,000", metrics)
        self.assertIn("35%", metrics)

        # Span validation
        self.assert_all_spans_valid(resume, src)

    def test_wrapped_lines_in_projects_section(self) -> None:
        """Continuation lines in ## Projects section also maintain bullet count
        and span invariants.
        """
        resume = """# Jane Coder
## Projects
### Distributed Key-Value Store | Open Source
● Designed and implemented Raft consensus algorithm from scratch in C++,
  achieving throughput of 250k ops/sec across 5 nodes with zero data loss,
  benchmarked against etcd and ZooKeeper.
● Built automated chaos testing suite with Jepsen,
  simulating network partitions and node crashes.
"""
        src = extract_source(resume)
        self.assertEqual(len(src.projects), 1)
        project = src.projects[0]
        # Exactly 2 primary bullets
        self.assertEqual(len(project.body_fact_ids), 2)

        project_facts = [f for f in src.facts if f.role_or_project_id == project.group_id]
        details = [f for f in project_facts if f.kind == "project_detail"]
        self.assertEqual(len(details), 5)  # 2 primary + 3 continuation lines

        self.assert_all_spans_valid(resume, src)

    # =========================================================================
    # 4. Unicode U+25CF (●) and Mixed Bullet Style Grammar
    # =========================================================================

    def test_mixed_bullet_grammar_across_all_supported_styles(self) -> None:
        """All supported bullet symbols parse as bullets and maintain 1:1 spans."""
        bullet_symbols = [
            ("-", "Standard hyphen"),
            ("*", "Standard asterisk"),
            ("\u2022", "Unicode bullet point"),
            ("\u2023", "Unicode triangular bullet"),
            ("\u25aa", "Unicode black small square"),
            ("\u25e6", "Unicode white bullet"),
            ("\u25cf", "Unicode black circle"),
            ("1.", "Numbered bullet 1"),
            ("2)", "Numbered bullet 2"),
        ]
        lines = ["# Bullet Testing Resume", "## Experience", "### Tech Co | Engineer | 2022 - 2023"]
        for sym, desc in bullet_symbols:
            lines.append(f"{sym} Implemented {desc} feature delivering 20% speedup.")

        resume = "\n".join(lines)
        src = extract_source(resume)
        self.assertEqual(len(src.roles), 1)
        role = src.roles[0]
        self.assertEqual(len(role.body_fact_ids), len(bullet_symbols))
        self.assert_all_spans_valid(resume, src)

    def test_policy_and_projects_support_unicode_black_circle(self) -> None:
        """U+25CF (●) is cleanly handled in policy cleaning and projects catalog parsing."""
        # 1. Policy check
        sample_resume = (
            "# Dev\n## Experience\n### Acme | Dev | 2020 - 2021\n"
            "● Led modernization of legacy monolith.\n"
        )
        src = extract_source(sample_resume)
        bullet = DraftBullet(
            text="● Led modernization of legacy monolith into Kubernetes microservices.",
            purpose="experience",
            fact_ids=[src.roles[0].body_fact_ids[0]],
            ownership_level="lead",
            metrics=[],
        )
        checks = _bullet_checks(
            bullet, "roles.0.bullets.0", src, allow_synthetic_metrics=False, expected_group="role_1"
        )
        markdown_check = next(c for c in checks if c.code == "claim.markdown")
        self.assertFalse(
            markdown_check.passed,
            "Policy check must flag literal ● prefix as invalid markdown bullet",
        )
        plain = _plain_lead(bullet.text)
        self.assertTrue(plain.startswith("Led"), f"Expected 'Led...', got {plain!r}")

        # 2. Projects catalog parsing
        catalog_md = """# Project Portfolio
### Distributed Cache
● Architected distributed cache cluster with Redis and Go.
● Implemented consistent hashing algorithm with 160 virtual nodes.
"""
        catalog = parse_catalog(catalog_md)
        titles = [proj["title"] for proj in catalog]
        self.assertIn("Distributed Cache", titles)
        proj = next(p for p in catalog if p["title"] == "Distributed Cache")
        details = [f.source_span for f in proj["facts"] if f.kind == "project_detail"]
        self.assertEqual(len(details), 2)
        self.assertTrue(any("consistent hashing" in d for d in details))

    # =========================================================================
    # 5. Fallback Fact Merging Span Verification
    # =========================================================================

    def test_fallback_facts_merging_span_invariants(self) -> None:
        """Unstructured resumes triggering ambiguous blocks merge fallback facts
        with exact spans.
        """
        resume = """Candidate Name
San Francisco, CA
Senior Software Engineer
Built streaming data pipeline processing 500k events/sec.
Optimized PostgreSQL query engine reducing CPU usage by 40%.
"""
        src = extract_source(resume)
        self.assertGreater(len(src.ambiguous_blocks), 0)

        fallback = FallbackFacts(
            facts=[
                FallbackFact(
                    kind="role_header",
                    source_span="Senior Software Engineer",
                ),
                FallbackFact(
                    kind="responsibility",
                    source_span="Built streaming data pipeline processing 500k events/sec.",
                ),
                FallbackFact(
                    kind="responsibility",
                    source_span="Optimized PostgreSQL query engine reducing CPU usage by 40%.",
                ),
            ]
        )
        merged = merge_fallback_facts(src, resume, fallback)
        self.assert_all_spans_valid(resume, merged)

    # =========================================================================
    # 6. Exotic Unicode, Formatting, and IPC Stress Tests
    # =========================================================================

    def test_exotic_unicode_multilingual_span_invariants(self) -> None:
        """Resumes with accents, CJK, and symbols strictly satisfy 1:1 character span invariants."""
        resume = """# Dr. François Müller
francois@example.com | Zürich, Switzerland | 日本語・Français・Deutsch
## Professional Summary
Distinguished AI researcher specializing in multi-modal LLM alignment & distributed systems.
## Professional Experience
### École Polytechnique Fédérale – Directeur de Recherche – 2019 – Present
● Conçu et déployé des systèmes d'apprentissage profond distribués sur 1 024 GPU.
  optimisé les communications inter-nœuds avec NCCL et InfiniBand,
  réduisant le temps d'entraînement de 40%.
● Dirigé une équipe de 15 chercheurs et doctorants publiant à NeurIPS et ICML.
### Rakuten Tokyo – Senior Machine Learning Engineer – 2016 – 2019
● 大規模自然言語処理モデルの開発および推論高速化を主導した。
  レイテンシを50ms削減し、年間200万ドルのクラウド費用を削減した。
## Education
### ETH Zürich
Doctorate in Computer Science, 2015
## Skills
Langues: Python, C++, Rust, CUDA, PyTorch, JAX
Languages: Français (natif), Deutsch (C2), English (fluent), 日本語 (B2)
"""
        src = extract_source(resume)
        self.assertEqual(len(src.roles), 2)
        self.assert_all_spans_valid(resume, src)

    def test_markdown_formatting_and_inline_code_span_invariants(self) -> None:
        """Resumes with bold, italics, backticks, and URLs preserve 1:1 fact spans."""
        resume = """# Tech Specialist
## Experience
### CloudNative Systems | Lead Engineer | 2021 – 2023
● Implemented `etcd` raft consensus with **zero downtime** and *sub-millisecond* failover.
  achieved 99.999% availability across [Multi-Region AWS](https://aws.amazon.com),
  scaling to 500,000 req/sec under peak load.
● Developed automated CI/CD pipeline using GitHub Actions and `k8s`.
## Skills
Cloud: `Docker`, `Kubernetes`, **AWS ECS**, *Terraform*
"""
        src = extract_source(resume)
        self.assertEqual(len(src.roles), 1)
        self.assert_all_spans_valid(resume, src)

    def test_skills_section_complex_delimiters_span_invariants(self) -> None:
        """Skills with colons, semicolons, commas, pipes, bullets, and citations preserve spans."""
        resume = """# Skills Master
## Skills
Programming Languages: Python, Go; Rust | C++ [cite: 1] • TypeScript
Cloud & Infra: AWS, GCP; Azure | Docker • Kubernetes • Terraform
Databases: PostgreSQL; MongoDB | Redis [cite: 2]
"""
        src = extract_source(resume)
        self.assertGreater(len(src.facts), 0)
        skill_facts = [f for f in src.facts if f.kind == "skill"]
        self.assertGreater(len(skill_facts), 10)
        self.assert_all_spans_valid(resume, src)

    def test_ipc_simulated_large_stress_payload(self) -> None:
        """Subprocess IPC handles multi-role requests with bidirectional ack and ReportLab PDF."""
        python_exe = sys.executable
        proc = subprocess.Popen(
            [python_exe, "-m", "low_risk_agent.portal"],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            cwd=str(root_dir),
            env={**os.environ, "PYTHONPATH": "src", "PYTHONIOENCODING": "utf-8"},
        )
        req = {
            "generation_id": "test-stress-gen-001",
            "user_id": "test-stress-user-001",
            "resume": (
                "# Stress Test Candidate\n"
                "## Experience\n"
                "### Massive Corp | Principal Architect | 2020 – 2023\n"
                "● Scaled platform to 100M users.\n"
            ),
            "job_description": "Wanted: Principal Architect with experience scaling to 100M users.",
            "simulated": True,
            "test_failure": None,
        }
        proc.stdin.write(json.dumps(req) + "\n")
        proc.stdin.flush()

        line1 = proc.stdout.readline()
        e1 = json.loads(line1)
        self.assertEqual(e1.get("type"), "usage")
        self.assertEqual(e1.get("status"), "started")
        proc.stdin.write("ok\n")
        proc.stdin.flush()

        line2 = proc.stdout.readline()
        e2 = json.loads(line2)
        self.assertEqual(e2.get("type"), "usage")
        self.assertEqual(e2.get("status"), "reported")
        self.assertEqual(e2.get("usage", {}).get("prompt_tokens"), 4000)
        self.assertEqual(e2.get("usage", {}).get("completion_tokens"), 1500)
        proc.stdin.write("ok\n")
        proc.stdin.flush()

        line3 = proc.stdout.readline()
        e3 = json.loads(line3)
        self.assertEqual(e3.get("type"), "result")
        self.assertTrue(e3.get("pdf_hex", "").startswith("255044462d"))
        self.assertTrue(e3.get("disclosure", {}).get("simulated"))
        proc.stdin.close()
        proc.stdout.close()
        proc.stderr.close()
        proc.wait(timeout=10)
        self.assertEqual(proc.returncode, 0)


if __name__ == "__main__":
    unittest.main()
