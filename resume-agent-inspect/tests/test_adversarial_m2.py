"""Adversarial stress-testing suite for Milestone 2 IPC and PDF generation.

Empirically challenges:
1. IPC Protocol Resilience:
   - Unexpected stdin inputs instead of exact "ok\n"
   - Premature stdin closing / EOF handling at multiple lifecycle stages
   - Malformed and edge-case request JSON payloads
   - Pipelined and concurrent IPC requests
2. ReportLab PDF Byte Integrity:
   - Magic bytes, hex encoding roundtrip, and PDF structural elements
   - PDF reader parsing and text extraction
   - XML/HTML adversarial markup escaping
   - Unicode bullet, en-dash, em-dash, and symbol support
   - Rejection of empty documents
   - High-volume stress generation within backend 10MB bounds
3. Failure Mode Injections:
   - "ai" failure injection: telemetry emitted, failed event emitted, no result
   - "render" failure injection: telemetry emitted, failed event emitted, no result
   - "storage" failure mode: successful Python result (backend-handled)
   - Unknown failure keys: non-blocking degradation
"""

from __future__ import annotations

import concurrent.futures
import json
import os
import subprocess
import sys
import unittest
from pathlib import Path
from typing import Any

AGENT_DIR = Path(__file__).resolve().parent.parent
PYTHON_EXE = str(AGENT_DIR / ".venv" / "Scripts" / "python.exe")
if not Path(PYTHON_EXE).is_file():
    PYTHON_EXE = sys.executable


def get_portal_env() -> dict[str, str]:
    env = dict(os.environ)
    env["PYTHONPATH"] = str(AGENT_DIR / "src")
    env["PYTHONIOENCODING"] = "utf-8"
    env["RESUME_ENABLE_LANGSMITH"] = "0"
    env["LANGSMITH_TRACING"] = "false"
    env.pop("DATABASE_URL", None)
    env.pop("WORKER_DATABASE_URL", None)
    return env


def run_portal_stepwise(
    req: dict[str, Any],
    acks: list[str],
    timeout: float = 8.0,
) -> tuple[list[dict[str, Any]], dict[str, Any] | None, str, int]:
    """Runs portal.py interacting via stdin/stdout step-by-step."""
    proc = subprocess.Popen(
        [PYTHON_EXE, "-m", "low_risk_agent.portal"],
        cwd=str(AGENT_DIR),
        env=get_portal_env(),
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )

    usage_events: list[dict[str, Any]] = []
    final_event: dict[str, Any] | None = None

    try:
        proc.stdin.write(json.dumps(req) + "\n")
        proc.stdin.flush()

        ack_idx = 0
        while True:
            line = proc.stdout.readline()
            if not line:
                break
            msg = json.loads(line.strip())
            if msg.get("type") == "usage":
                usage_events.append(msg)
                if ack_idx < len(acks):
                    proc.stdin.write(acks[ack_idx])
                    proc.stdin.flush()
                    ack_idx += 1
                else:
                    # No more acks provided; close stdin to signal EOF
                    proc.stdin.close()
            elif msg.get("type") in ("result", "failed"):
                final_event = msg
                break

        stdout_rest, stderr_data = proc.communicate(timeout=timeout)
        if stdout_rest and not final_event:
            for line_text in stdout_rest.splitlines():
                if line_text.strip():
                    m = json.loads(line_text.strip())
                    if m.get("type") in ("result", "failed"):
                        final_event = m
    except Exception:
        proc.kill()
        raise

    return usage_events, final_event, stderr_data, proc.returncode


class TestAdversarialIPCResilience(unittest.TestCase):
    """Stress tests for IPC protocol resilience."""

    def test_ipc_unexpected_ack_tokens(self) -> None:
        """Adversarial stdin responses instead of exact 'ok' must trigger failure without hang."""
        bad_acks = [
            "nok\n",
            "NO\n",
            "OK\n",
            "   \n",
            "\n",
            "{\"status\": \"ok\"}\n",
            "x" * 1000 + "\n",
            "ok\x00corrupt\n",
        ]

        req = {
            "generation_id": "00000000-0000-0000-0000-000000000001",
            "user_id": "00000000-0000-0000-0000-000000000002",
            "resume": "# Candidate\nSoftware Engineer",
            "job_description": "Job description",
            "simulated": True,
            "test_failure": None,
        }

        for bad_ack in bad_acks:
            with self.subTest(bad_ack=bad_ack.strip()):
                usage, final, stderr, code = run_portal_stepwise(req, [bad_ack])
                self.assertEqual(code, 0)
                self.assertIsNotNone(final, f"Expected final event for bad ack {bad_ack!r}")
                self.assertEqual(
                    final.get("type"),
                    "failed",
                    f"Expected type='failed' for bad ack {bad_ack!r}, got: {final}",
                )
                self.assertIn("usage persistence was not acknowledged", final.get("code", ""))

    def test_ipc_premature_stdin_closure_immediate(self) -> None:
        """Closing stdin before sending any request causes immediate clean exit."""
        proc = subprocess.Popen(
            [PYTHON_EXE, "-m", "low_risk_agent.portal"],
            cwd=str(AGENT_DIR),
            env=get_portal_env(),
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        proc.stdin.close()
        stdout, stderr = proc.communicate(timeout=5.0)
        self.assertEqual(proc.returncode, 0)
        self.assertEqual(stdout.strip(), "")

    def test_ipc_premature_stdin_closure_after_first_event(self) -> None:
        """Closing stdin immediately after 'started' event triggers failure event and exit."""
        req = {
            "generation_id": "00000000-0000-0000-0000-000000000001",
            "user_id": "00000000-0000-0000-0000-000000000002",
            "resume": "# Candidate",
            "job_description": "Job",
            "simulated": True,
            "test_failure": None,
        }
        # Provide zero acks: EOF immediately on first usage readline()
        usage, final, stderr, code = run_portal_stepwise(req, [])
        self.assertEqual(code, 0)
        self.assertEqual(len(usage), 1)
        self.assertEqual(usage[0]["status"], "started")
        self.assertIsNotNone(final)
        self.assertEqual(final["type"], "failed")
        self.assertIn("usage persistence was not acknowledged", final["code"])

    def test_ipc_premature_stdin_closure_after_reported_event(self) -> None:
        """Closing stdin after 'reported' event triggers failure event and exit."""
        req = {
            "generation_id": "00000000-0000-0000-0000-000000000001",
            "user_id": "00000000-0000-0000-0000-000000000002",
            "resume": "# Candidate",
            "job_description": "Job",
            "simulated": True,
            "test_failure": None,
        }
        # Provide 1 ack: second usage readline() gets EOF
        usage, final, stderr, code = run_portal_stepwise(req, ["ok\n"])
        self.assertEqual(code, 0)
        self.assertEqual(len(usage), 2)
        self.assertIsNotNone(final)
        self.assertEqual(final["type"], "failed")
        self.assertIn("usage persistence was not acknowledged", final["code"])

    def test_ipc_malformed_json_request_crashes_unhandled(self) -> None:
        """Verify malformed JSON on stdin is caught and emits structured failure."""
        proc = subprocess.Popen(
            [PYTHON_EXE, "-m", "low_risk_agent.portal"],
            cwd=str(AGENT_DIR),
            env=get_portal_env(),
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        stdout, stderr = proc.communicate(input="NOT_A_JSON_OBJECT\n", timeout=5.0)
        self.assertEqual(proc.returncode, 0)
        resp = json.loads(stdout.strip())
        self.assertEqual(resp["type"], "failed")
        self.assertTrue("Expecting value" in resp["code"] or "JSONDecodeError" in resp["code"])

    def test_ipc_pipelined_stdin(self) -> None:
        """Sending the request and all 'ok' acknowledgements in a single buffered write works."""
        req = json.dumps({
            "generation_id": "00000000-0000-0000-0000-000000000001",
            "user_id": "00000000-0000-0000-0000-000000000002",
            "resume": "# Pipelined Candidate\nSoftware Engineer",
            "job_description": "Job",
            "simulated": True,
            "test_failure": None,
        })
        pipelined_input = f"{req}\nok\nok\n"

        proc = subprocess.Popen(
            [PYTHON_EXE, "-m", "low_risk_agent.portal"],
            cwd=str(AGENT_DIR),
            env=get_portal_env(),
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        stdout, stderr = proc.communicate(input=pipelined_input, timeout=8.0)
        self.assertEqual(proc.returncode, 0)
        lines = [json.loads(s) for s in stdout.splitlines() if s.strip()]
        self.assertEqual(len(lines), 3)
        self.assertEqual(lines[0]["status"], "started")
        self.assertEqual(lines[1]["status"], "reported")
        self.assertEqual(lines[2]["type"], "result")

    def test_ipc_concurrent_processes(self) -> None:
        """Running 10 concurrent portal.py processes simultaneously succeeds without contention."""
        def run_one(i: int) -> dict[str, Any]:
            req = json.dumps({
                "generation_id": f"00000000-0000-0000-0000-{i:012d}",
                "user_id": f"00000000-0000-0000-0001-{i:012d}",
                "resume": f"# Candidate {i}\nWorker in concurrency test",
                "job_description": f"Role {i}",
                "simulated": True,
                "test_failure": None,
            })
            p_input = f"{req}\nok\nok\n"
            proc = subprocess.Popen(
                [PYTHON_EXE, "-m", "low_risk_agent.portal"],
                cwd=str(AGENT_DIR),
                env=get_portal_env(),
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
            )
            stdout, stderr = proc.communicate(input=p_input, timeout=25.0)
            lines = [json.loads(s) for s in stdout.splitlines() if s.strip()]
            return {"index": i, "exit_code": proc.returncode, "lines": lines}

        with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
            results = list(executor.map(run_one, range(10)))

        for r in results:
            self.assertEqual(r["exit_code"], 0)
            self.assertEqual(len(r["lines"]), 3)
            self.assertEqual(r["lines"][-1]["type"], "result")
            self.assertTrue(r["lines"][-1]["pdf_hex"].startswith("255044462d"))


class TestAdversarialReportLabPDF(unittest.TestCase):
    """Stress tests for ReportLab PDF generation and byte integrity."""

    def test_pdf_magic_bytes_and_eof(self) -> None:
        """ReportLab PDF begins with %PDF- and ends with %%EOF."""
        from low_risk_agent.portal import render_pdf
        pdf = render_pdf("# Simple Resume\nLine 1\nLine 2")
        self.assertTrue(pdf.startswith(b"%PDF-"))
        self.assertTrue(pdf.rstrip().endswith(b"%%EOF") or b"%%EOF" in pdf[-64:])

    def test_pdf_binary_hex_roundtrip(self) -> None:
        """Hex encoding of PDF matches bytes.fromhex roundtrip perfectly."""
        from low_risk_agent.portal import render_pdf
        pdf = render_pdf("# Resume\nTesting hex roundtrip.")
        hex_str = pdf.hex()
        self.assertEqual(len(hex_str), 2 * len(pdf))
        self.assertTrue(hex_str.startswith("255044462d"))
        decoded = bytes.fromhex(hex_str)
        self.assertEqual(decoded, pdf)

    def test_pdf_xml_adversarial_escaping(self) -> None:
        """Adversarial HTML/XML tags and symbols do not break ReportLab parser."""
        from low_risk_agent.portal import render_pdf
        adversarial_md = (
            "# XSS & Markup Candidate <script>alert(1)</script>\n\n"
            "Built <div id=\"main\"> & <span class='bold'>apps</span>\n"
            "Used <invalid-tag with unclosed brackets\n"
            "Quotes: \"double\" and 'single' and &amp; &lt; &gt;\n"
            "Math: 5 < 10 and 10 > 5 and a & b\n"
        )
        pdf = render_pdf(adversarial_md)
        self.assertTrue(pdf.startswith(b"%PDF-"))
        self.assertGreater(len(pdf), 1000)

    def test_pdf_unicode_bullets_and_dashes(self) -> None:
        """Unicode bullet ● (U+25CF), en-dash (–), and em-dash (—) render cleanly."""
        from low_risk_agent.portal import render_pdf
        md = (
            "# Unicode Candidate\n\n"
            "### TechCorp | Staff Engineer | Jan 2020 – Present\n"
            "● Designed distributed ingestion pipeline — zero packet loss.\n"
            "● Scaled Kubernetes cluster 300% (2018 — 2020).\n"
        )
        pdf = render_pdf(md)
        self.assertTrue(pdf.startswith(b"%PDF-"))
        self.assertGreater(len(pdf), 1000)

    def test_pdf_empty_document_rejection(self) -> None:
        """render_pdf raises ValueError on empty string."""
        from low_risk_agent.portal import render_pdf
        with self.assertRaises(ValueError) as ctx:
            render_pdf("")
        self.assertIn("empty resume", str(ctx.exception))

    def test_pdf_whitespace_spacers_behavior(self) -> None:
        """Empirical behavior: whitespace lines produce Spacers without crashing."""
        from low_risk_agent.portal import render_pdf
        pdf = render_pdf("   \n\n  \t \n")
        self.assertTrue(pdf.startswith(b"%PDF-"))
        self.assertGreater(len(pdf), 500)

    def test_pdf_large_document_bounds(self) -> None:
        """Large resume (1,000 lines) compresses and generates within backend bounds."""
        from low_risk_agent.portal import render_pdf
        lines = ["# Large Resume Benchmark"]
        for i in range(1000):
            lines.append(f"● Bullet point {i}: Accomplished significant milestone with metrics.")
        md = "\n".join(lines)
        pdf = render_pdf(md)
        self.assertTrue(pdf.startswith(b"%PDF-"))
        # Must not exceed backend 10MB limit (tailor.rs MAX_UPLOAD_BYTES)
        self.assertLess(len(pdf), 10 * 1024 * 1024)
        self.assertGreater(len(pdf), 10000)


class TestAdversarialFailureInjections(unittest.TestCase):
    """Stress tests for failure injection paths."""

    def test_ai_failure_injection(self) -> None:
        """test_failure='ai' emits telemetry then reports failed event with test_ai_failure."""
        req = {
            "generation_id": "00000000-0000-0000-0000-000000000099",
            "user_id": "00000000-0000-0000-0000-000000000099",
            "resume": "# Candidate",
            "job_description": "Job",
            "simulated": True,
            "test_failure": "ai",
        }
        usage, final, stderr, code = run_portal_stepwise(req, ["ok\n", "ok\n"])
        self.assertEqual(code, 0)
        self.assertEqual(len(usage), 2)
        self.assertEqual(usage[0]["status"], "started")
        self.assertEqual(usage[1]["status"], "reported")
        self.assertIsNotNone(final)
        self.assertEqual(final["type"], "failed")
        self.assertEqual(final["code"], "test_ai_failure")

    def test_render_failure_injection(self) -> None:
        """test_failure='render' emits telemetry then reports failed event with render failure."""
        req = {
            "generation_id": "00000000-0000-0000-0000-000000000098",
            "user_id": "00000000-0000-0000-0000-000000000098",
            "resume": "# Candidate",
            "job_description": "Job",
            "simulated": True,
            "test_failure": "render",
        }
        usage, final, stderr, code = run_portal_stepwise(req, ["ok\n", "ok\n"])
        self.assertEqual(code, 0)
        self.assertEqual(len(usage), 2)
        self.assertEqual(usage[0]["status"], "started")
        self.assertEqual(usage[1]["status"], "reported")
        self.assertIsNotNone(final)
        self.assertEqual(final["type"], "failed")
        self.assertEqual(final["code"], "test_render_failure")

    def test_storage_failure_mode(self) -> None:
        """test_failure='storage' completes in Python (backend handles storage fail)."""
        req = {
            "generation_id": "00000000-0000-0000-0000-000000000097",
            "user_id": "00000000-0000-0000-0000-000000000097",
            "resume": "# Candidate",
            "job_description": "Job",
            "simulated": True,
            "test_failure": "storage",
        }
        usage, final, stderr, code = run_portal_stepwise(req, ["ok\n", "ok\n"])
        self.assertEqual(code, 0)
        self.assertEqual(len(usage), 2)
        self.assertIsNotNone(final)
        self.assertEqual(final["type"], "result")
        self.assertTrue(final["pdf_hex"].startswith("255044462d"))

    def test_unknown_failure_key_ignored(self) -> None:
        """test_failure with an unexpected key produces a standard result without crash."""
        req = {
            "generation_id": "00000000-0000-0000-0000-000000000096",
            "user_id": "00000000-0000-0000-0000-000000000096",
            "resume": "# Candidate",
            "job_description": "Job",
            "simulated": True,
            "test_failure": "nonexistent_mode",
        }
        usage, final, stderr, code = run_portal_stepwise(req, ["ok\n", "ok\n"])
        self.assertEqual(code, 0)
        self.assertIsNotNone(final)
        self.assertEqual(final["type"], "result")


if __name__ == "__main__":
    unittest.main()
