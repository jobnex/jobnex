from __future__ import annotations

import hashlib
import hmac
import json
import threading
import unittest
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import Mock, patch

from low_risk_agent.cache import (
    MemoryJdAnalysisCache,
    PostgresJdAnalysisCache,
    jd_cache_key,
)
from low_risk_agent.models import JobAnalysis, JobRequirement, PipelineConfig

SECRET = "cache-test-secret-" + "x" * 32
RAW_JD = "RAW-JD-9cfca3: Build secure payment APIs"
CANDIDATE = "CANDIDATE-PRIVATE-2aae11: Ada Example"


def analysis() -> JobAnalysis:
    return JobAnalysis(
        requirements=[
            JobRequirement(
                requirement_id="R1",
                text="Build APIs",
                evidence_span="Build secure payment APIs",
                priority="must",
            )
        ],
        ats_terms=["Python"],
        traps=[],
        requested_tools=[],
    )


class FakeCursor:
    def __init__(self, row: tuple[dict[str, object]] | None = None) -> None:
        self.row = row
        self.calls: list[tuple[str, tuple[object, ...] | None]] = []

    def __enter__(self) -> FakeCursor:
        return self

    def __exit__(self, *args: object) -> None:
        return None

    def execute(self, sql: str, params: tuple[object, ...] | None = None) -> None:
        self.calls.append((" ".join(sql.split()), params))

    def fetchone(self) -> tuple[dict[str, object]] | None:
        return self.row


class FakeConnection:
    def __init__(self, cursor: FakeCursor) -> None:
        self._cursor = cursor

    def __enter__(self) -> FakeConnection:
        return self

    def __exit__(self, *args: object) -> None:
        return None

    def cursor(self) -> FakeCursor:
        return self._cursor


class CacheTests(unittest.TestCase):
    def test_jd_key_normalizes_and_uses_hmac_sha256(self) -> None:
        config = PipelineConfig()
        spaced = " Build   secure payment APIs\r\n\r\n  Python "
        normalized = "Build secure payment APIs Python"

        key = jd_cache_key(spaced, SECRET, config)
        envelope = {
            "job_description": normalized,
            "model": config.analyzer_model,
            "prompt_version": config.analyzer_prompt_version,
            "schema_version": config.schema_version,
            "analyzer_version": config.analyzer_version,
        }
        payload = json.dumps(
            envelope, ensure_ascii=False, sort_keys=True, separators=(",", ":")
        ).encode()
        expected = hmac.new(SECRET.encode(), payload, hashlib.sha256).hexdigest()

        self.assertEqual(key, expected)
        self.assertEqual(key, jd_cache_key(normalized, SECRET, config))
        self.assertRegex(key, r"^[0-9a-f]{64}$")
        with self.assertRaisesRegex(ValueError, "at least 32"):
            jd_cache_key(normalized, "too-short", config)

    def test_jd_key_invalidates_on_analysis_versions(self) -> None:
        config = PipelineConfig()
        baseline = jd_cache_key(RAW_JD, SECRET, config)
        changes = {
            "analyzer_model": "next-model",
            "analyzer_prompt_version": "jd-analysis-v2",
            "schema_version": "resume-state-v2",
            "analyzer_version": "analyzer-v3",
        }

        for field, value in changes.items():
            with self.subTest(field=field):
                changed = config.model_copy(update={field: value})
                self.assertNotEqual(baseline, jd_cache_key(RAW_JD, SECRET, changed))
        self.assertNotEqual(baseline, jd_cache_key(RAW_JD, SECRET + "!", config))

    def test_memory_cache_contains_no_raw_jd_or_candidate_data(self) -> None:
        cache = MemoryJdAnalysisCache()
        key = jd_cache_key(RAW_JD, SECRET, PipelineConfig())

        def creator() -> JobAnalysis:
            self.assertTrue(CANDIDATE)
            return analysis()

        cache.get_or_create(key, creator)
        persisted = json.dumps(cache.snapshot(), sort_keys=True)

        self.assertNotIn(RAW_JD, key)
        self.assertNotIn(RAW_JD, persisted)
        self.assertNotIn(CANDIDATE, persisted)
        self.assertEqual(list(cache.snapshot()), [key])

    def test_memory_cache_coalesces_concurrent_identical_requests(self) -> None:
        cache = MemoryJdAnalysisCache()
        expected = analysis()
        workers = 8
        start = threading.Barrier(workers + 1)
        creator_entered = threading.Event()
        release_creator = threading.Event()
        calls_lock = threading.Lock()
        creator_calls = 0

        def creator() -> JobAnalysis:
            nonlocal creator_calls
            with calls_lock:
                creator_calls += 1
            creator_entered.set()
            if not release_creator.wait(5):
                raise TimeoutError("test did not release creator")
            return expected

        def fetch() -> tuple[JobAnalysis, bool]:
            start.wait(5)
            return cache.get_or_create("same-key", creator)

        with ThreadPoolExecutor(max_workers=workers) as pool:
            futures = [pool.submit(fetch) for _ in range(workers)]
            start.wait(5)
            try:
                self.assertTrue(creator_entered.wait(5))
            finally:
                release_creator.set()
            results = [future.result(timeout=5) for future in futures]

        self.assertEqual(creator_calls, 1)
        self.assertEqual([hit for _, hit in results].count(False), 1)
        self.assertEqual([hit for _, hit in results].count(True), workers - 1)
        self.assertTrue(all(value == expected for value, _ in results))

    def test_postgres_cache_hit_locks_then_reads_without_creating(self) -> None:
        expected = analysis()
        cursor = FakeCursor((expected.model_dump(mode="json"),))
        cache = PostgresJdAnalysisCache("postgresql://test", setup=False)
        creator = Mock()

        with patch.object(cache, "_connect", return_value=FakeConnection(cursor)):
            value, hit = cache.get_or_create("a" * 64, creator)

        self.assertTrue(hit)
        self.assertEqual(value, expected)
        creator.assert_not_called()
        self.assertEqual(len(cursor.calls), 3)
        self.assertIn("SELECT pg_advisory_xact_lock", cursor.calls[0][0])
        self.assertEqual(cursor.calls[0][1], (cache._advisory_key("a" * 64),))
        self.assertIn("DELETE FROM jd_analysis_cache", cursor.calls[1][0])
        self.assertIn("expires_at <= now()", cursor.calls[1][0])
        self.assertIn("expires_at > now()", cursor.calls[2][0])
        self.assertEqual(cursor.calls[2][1], ("a" * 64,))

    def test_postgres_cache_miss_upserts_with_ttl_and_no_sensitive_input(self) -> None:
        cursor = FakeCursor()
        cache = PostgresJdAnalysisCache("postgresql://test", setup=False)
        key = jd_cache_key(RAW_JD, SECRET, PipelineConfig())
        creator = Mock(return_value=analysis())

        with patch.object(cache, "_connect", return_value=FakeConnection(cursor)):
            value, hit = cache.get_or_create(key, creator)

        self.assertFalse(hit)
        self.assertEqual(value, analysis())
        creator.assert_called_once_with()
        self.assertEqual(len(cursor.calls), 4)
        insert_sql, insert_params = cursor.calls[3]
        self.assertIn("INSERT INTO jd_analysis_cache", insert_sql)
        self.assertIn("ON CONFLICT (cache_key) DO UPDATE", insert_sql)
        self.assertEqual(insert_params[0], key)
        self.assertEqual(insert_params[1].obj, analysis().model_dump(mode="json"))
        self.assertEqual(insert_params[2], 30)
        database_input = repr(cursor.calls)
        self.assertNotIn(RAW_JD, database_input)
        self.assertNotIn(CANDIDATE, database_input)

    def test_postgres_setup_creates_table_and_expiry_index(self) -> None:
        cursor = FakeCursor()
        cache = PostgresJdAnalysisCache("postgresql://test", setup=False)

        with patch.object(cache, "_connect", return_value=FakeConnection(cursor)):
            cache.setup()

        self.assertEqual(len(cursor.calls), 2)
        self.assertIn("CREATE TABLE IF NOT EXISTS jd_analysis_cache", cursor.calls[0][0])
        self.assertIn("expires_at timestamptz NOT NULL", cursor.calls[0][0])
        self.assertIn("CREATE INDEX IF NOT EXISTS", cursor.calls[1][0])
        self.assertIn("(expires_at)", cursor.calls[1][0])


if __name__ == "__main__":
    unittest.main()
