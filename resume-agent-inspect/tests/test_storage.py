import io
import json
import tempfile
import unittest
from contextlib import nullcontext, redirect_stderr, redirect_stdout
from pathlib import Path
from unittest.mock import Mock, patch
from uuid import UUID

from low_risk_agent.cli import main
from low_risk_agent.models import PipelineResult
from low_risk_agent.source import normalize_document, sha256_text
from low_risk_agent.storage import ResumeStore

JOB = "Build secure APIs"
JOB_ID = "11111111-1111-4111-8111-111111111111"
RUN_ID = "22222222-2222-4222-8222-222222222222"


def result(status="completed"):
    return PipelineResult(
        status=status,
        resume_markdown="# Source-backed resume",
        source_hash="source",
        job_hash=sha256_text(normalize_document(JOB)),
        compliance_ledger=[],
        source_facts=[],
        claim_provenance=[],
        usage=[],
        revision_count=0,
        cache_hit=False,
        error="",
    )


class StorageTests(unittest.TestCase):
    def store(self, rows):
        cur = Mock()
        cur.__enter__ = Mock(return_value=cur)
        cur.__exit__ = Mock(return_value=False)
        cur.fetchone.side_effect = rows
        conn = Mock()
        conn.__enter__ = Mock(return_value=conn)
        conn.__exit__ = Mock(return_value=False)
        conn.cursor.return_value = cur
        store = ResumeStore("postgresql://fixture")
        store.connect = Mock(return_value=conn)
        return store, cur, conn

    def test_exact_markdown_and_audit_are_saved(self):
        r = result("needs_review")
        store, cur, _ = self.store([(JOB,), (2,)])
        saved = store.save(
            generation_id=RUN_ID, user_id="u", job_id=JOB_ID, base_resume_id=None, result=r
        )
        self.assertEqual(saved["version"], 2)
        params = cur.execute.call_args_list[1].args[1]
        self.assertEqual(params[5], r.resume_markdown)
        self.assertEqual(params[6].obj, r.model_dump(mode="json"))
        self.assertEqual(params[4], "needs_review")

    def test_job_change_prevents_insert(self):
        store, cur, conn = self.store([("different job",)])
        with self.assertRaisesRegex(ValueError, "Job changed"):
            store.save(
                generation_id=RUN_ID,
                user_id="u",
                job_id=JOB_ID,
                base_resume_id=None,
                result=result(),
            )
        self.assertEqual(cur.execute.call_count, 1)
        self.assertEqual(conn.__exit__.call_args.args[0], ValueError)

    def test_retry_reuses_identical_row(self):
        r = result()
        store, _, _ = self.store(
            [(JOB,), None, (4, "u", UUID(JOB_ID), None, r.model_dump(mode="json"))]
        )
        self.assertEqual(
            store.save(
                generation_id=RUN_ID, user_id="u", job_id=JOB_ID, base_resume_id=None, result=r
            )["version"],
            4,
        )

    def test_retry_cannot_claim_another_users_row(self):
        r = result()
        store, _, _ = self.store(
            [(JOB,), None, (4, "other", UUID(JOB_ID), None, r.model_dump(mode="json"))]
        )
        with self.assertRaisesRegex(ValueError, "different content or ownership"):
            store.save(
                generation_id=RUN_ID, user_id="u", job_id=JOB_ID, base_resume_id=None, result=r
            )

    def test_wrong_job_and_base_owner_are_rejected_before_generation(self):
        store, _, _ = self.store([("other",)])
        with self.assertRaisesRegex(ValueError, "does not match"):
            store.validate_context("u", JOB_ID, None, JOB)
        store, _, _ = self.store([(JOB,), None])
        with self.assertRaisesRegex(ValueError, "Base resume"):
            store.validate_context("u", JOB_ID, RUN_ID, JOB)

    def test_submission_requires_same_user_job_and_review(self):
        store, cur, _ = self.store([None])
        with self.assertRaisesRegex(ValueError, "mismatch"):
            store.select_for_application(user_id="u", application_id=JOB_ID, generation_id=RUN_ID)
        self.assertEqual(cur.execute.call_count, 1)

    def test_history_is_filtered_by_owner_and_role(self):
        store, cur, _ = self.store([])
        cur.fetchall.return_value = []
        self.assertEqual(store.history(user_id="u", job_id=JOB_ID), [])
        self.assertEqual(cur.execute.call_args.args[1], ("u", UUID(JOB_ID)))


class CliStorageTests(unittest.TestCase):
    def run_cli(self, persist=False, save_error=False):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "resume.md").write_text("# Original", encoding="utf-8")
            (root / "jd.txt").write_text(JOB, encoding="utf-8")
            out = root / "output.md"
            args = [
                "--resume",
                str(root / "resume.md"),
                "--jd",
                str(root / "jd.txt"),
                "--out",
                str(out),
                "--tenant-id",
                "u",
                "--summary",
                "no",
                "--memory-cache",
                "--checkpoint-db",
                str(root / "checkpoints.sqlite"),
            ]
            if persist:
                args += ["--job-id", JOB_ID, "--generation-id", RUN_ID]
            output = io.StringIO()
            store = Mock()
            store.save.return_value = {"id": RUN_ID, "version": 1}
            if save_error:
                store.save.side_effect = RuntimeError("sensitive connection detail")
            with (
                patch.dict(
                    "os.environ",
                    {
                        "OPENROUTER_API_KEY": "fixture",
                        "RESUME_RESULTS_DATABASE_URL": "postgresql://fixture",
                    },
                    clear=True,
                ),
                patch("low_risk_agent.cli.configure_langsmith_env"),
                patch(
                    "low_risk_agent.cli.SqliteSaver.from_conn_string",
                    return_value=nullcontext(Mock()),
                ),
                patch("low_risk_agent.cli.ResumeTailoringPipeline"),
                patch("low_risk_agent.cli._run_pipeline", return_value=result()),
                patch("low_risk_agent.storage.ResumeStore", return_value=store),
                redirect_stdout(output),
                redirect_stderr(io.StringIO()),
            ):
                code = main(args)
            self.assertEqual(out.read_text(encoding="utf-8"), result().resume_markdown)
            self.assertEqual(
                json.loads(out.with_suffix(".audit.json").read_text())["status"], "completed"
            )
            return code, json.loads(output.getvalue()), store

    def test_existing_command_still_only_saves_files(self):
        code, payload, store = self.run_cli()
        self.assertEqual(code, 0)
        self.assertNotIn("database_saved", payload)
        store.save.assert_not_called()

    def test_storage_opt_in_saves_files_and_database(self):
        code, payload, store = self.run_cli(persist=True)
        self.assertEqual(code, 0)
        self.assertTrue(payload["database_saved"])
        self.assertEqual(payload["generation_id"], RUN_ID)
        store.validate_context.assert_called_once()
        self.assertEqual(store.save.call_args.kwargs["result"], result())

    def test_db_failure_preserves_files_returns_failure_without_secret(self):
        code, payload, _ = self.run_cli(persist=True, save_error=True)
        self.assertEqual(code, 1)
        self.assertFalse(payload["database_saved"])
        self.assertEqual(payload["generation_id"], RUN_ID)
        self.assertEqual(payload["database_error"], "RuntimeError")
        self.assertNotIn("sensitive", json.dumps(payload))


class PortalStorageTests(unittest.TestCase):
    def test_simulated_result_retains_pdf_and_adds_labelled_markdown(self):
        from low_risk_agent.portal import main as portal_main

        request = {"simulated": True, "resume": "# Original", "generation_id": RUN_ID}
        output = io.StringIO()
        with (
            patch("sys.stdin", io.StringIO(json.dumps(request) + "\nok\nok\n")),
            redirect_stdout(output),
        ):
            portal_main()
        payload = json.loads(output.getvalue().splitlines()[-1])
        self.assertEqual(payload["type"], "result")
        self.assertTrue(bytes.fromhex(payload["pdf_hex"]).startswith(b"%PDF-"))
        self.assertIn("# Original", payload["resume_markdown"])
        self.assertEqual(payload["audit_json"], {"simulated": True})

    def test_simulated_results_cannot_be_stored_as_factual(self):
        from low_risk_agent.portal import main as portal_main

        output = io.StringIO()
        with (
            patch(
                "sys.stdin", io.StringIO(json.dumps({"simulated": True, "persist_results": True}))
            ),
            redirect_stdout(output),
        ):
            portal_main()
        self.assertEqual(json.loads(output.getvalue())["type"], "failed")


class RetryCommandTests(unittest.TestCase):
    def test_existing_audit_saves_without_model_call(self):
        from low_risk_agent.save_cli import main as save_main

        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / "audit.json"
            p.write_text(result().model_dump_json(), encoding="utf-8")
            store = Mock()
            store.save.return_value = {"id": RUN_ID, "version": 1}
            with (
                patch("low_risk_agent.save_cli.ResumeStore", return_value=store),
                redirect_stdout(io.StringIO()),
            ):
                code = save_main(
                    [
                        "--audit",
                        str(p),
                        "--user-id",
                        "u",
                        "--job-id",
                        JOB_ID,
                        "--generation-id",
                        RUN_ID,
                    ]
                )
            self.assertEqual(code, 0)
            self.assertEqual(store.save.call_args.kwargs["result"], result())


if __name__ == "__main__":
    unittest.main()
