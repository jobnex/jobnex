import unittest
from unittest.mock import patch

from low_risk_agent.batch import BatchPending, DurableTransport


class Connection:
    def __init__(self, rows):
        self.rows = rows
        self.result = None

    def __enter__(self): return self
    def __exit__(self, *args): return False
    def commit(self): pass
    def fetchone(self): return self.result

    def execute(self, query, args=()):
        if "SELECT 1 FROM resume_generation_requests" in query:
            self.result = (1,)
        elif "SELECT batch_id,response" in query:
            self.result = self.rows.get(args)
        elif "INSERT INTO resume_model_batches" in query:
            self.rows[args[:2]] = (None, args[2].obj if len(args) > 2 else None, False)
        elif "SET batch_id" in query:
            self.rows[args[1:]] = (args[0], None, False)
        elif "SET response" in query:
            old = self.rows[args[1:]]
            self.rows[args[1:]] = (old[0], args[0].obj, False)
        return self


class BatchTests(unittest.TestCase):
    def test_default_writer_runs_synchronously_and_replays_response(self):
        from low_risk_agent.models import WRITER_MODEL
        self.assertEqual(WRITER_MODEL, "google/gemini-3.8-flash")
        rows, posts = {}, []
        response = {"choices": [{"message": {"content": "{}"}}]}
        def post(endpoint, key, payload, timeout):
            posts.append((endpoint, payload))
            return response
        body = {"model": WRITER_MODEL, "messages": []}
        with patch("psycopg.connect", side_effect=lambda *a, **k: Connection(rows)):
            for _ in range(2):
                transport = DurableTransport("database", "generation", "user", post)
                self.assertEqual(transport("https://openrouter.ai/api/v1/chat/completions", "key", body, 30), response)
        self.assertEqual(len(posts), 1)
        self.assertEqual(posts[0][0], "https://openrouter.ai/api/v1/chat/completions")

    def test_restart_reuses_batch_and_completed_response(self):
        rows, posts = {}, []
        body = {"model": "openai/gpt-6.1-sol:batch", "max_tokens": 100, "messages": []}
        def post(endpoint, key, payload, timeout):
            posts.append((endpoint, payload))
            return {"id": "batch-test"}
        make = lambda: DurableTransport("database", "generation", "user", post)
        with patch("psycopg.connect", side_effect=lambda *a, **k: Connection(rows)):
            with self.assertRaises(BatchPending):
                make()("https://openrouter.ai/api/v1/chat/completions", "secret", body, 30)
            digest = next(iter(rows))[1]
            response = {"choices": [{"message": {"content": "{}"}}], "usage": {"prompt_tokens": 100, "completion_tokens": 10, "cost": 0.001}}
            with patch.object(DurableTransport, "get", return_value={"status": "in_progress"}):
                with self.assertRaises(BatchPending):
                    make()("https://openrouter.ai/api/v1/chat/completions", "secret", body, 30)
            with patch.object(DurableTransport, "get", return_value={"status": "completed", "results": [
                {"custom_id": digest, "response": {"status_code": 200, "body": response}}]}):
                self.assertEqual(make()("https://openrouter.ai/api/v1/chat/completions", "secret", body, 30), response)
            with patch.object(DurableTransport, "get", side_effect=AssertionError("already cached")):
                self.assertEqual(make()("https://openrouter.ai/api/v1/chat/completions", "secret", body, 30), response)
        self.assertEqual(len(posts), 1)
        self.assertEqual(posts[0][0], "https://openrouter.ai/api/beta/batches")
        self.assertEqual(posts[0][1]["model"], "openai/gpt-6.1-sol")

    def test_uncertain_submission_never_resubmits(self):
        rows = {}
        def lost_ack(*args): raise TimeoutError("lost acknowledgement")
        body = {"model": "openai/gpt-6.1-sol:batch"}
        with patch("psycopg.connect", side_effect=lambda *a, **k: Connection(rows)):
            transport = DurableTransport("database", "generation", "user", lost_ack)
            with self.assertRaises(TimeoutError): transport("https://openrouter.ai/api/v1/chat/completions", "key", body, 30)
            with self.assertRaisesRegex(ValueError, "acknowledgement missing"):
                transport("https://openrouter.ai/api/v1/chat/completions", "key", body, 30)


if __name__ == "__main__": unittest.main()
