from __future__ import annotations

import hashlib
import hmac
import json
import threading
from collections.abc import Callable
from typing import Protocol

from .models import JobAnalysis, PipelineConfig
from .source import normalize_document

CACHE_TTL_DAYS = 30


def stable_json(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def jd_cache_key(job_description: str, secret: str, config: PipelineConfig) -> str:
    if len(secret) < 32:
        raise ValueError("JD_CACHE_HMAC_SECRET must contain at least 32 characters")
    envelope = {
        "job_description": normalize_document(job_description),
        "model": config.analyzer_model,
        "prompt_version": config.analyzer_prompt_version,
        "schema_version": config.schema_version,
        "analyzer_version": config.analyzer_version,
    }
    return hmac.new(secret.encode(), stable_json(envelope).encode(), hashlib.sha256).hexdigest()


class JdAnalysisCache(Protocol):
    def get_or_create(
        self, key: str, creator: Callable[[], JobAnalysis]
    ) -> tuple[JobAnalysis, bool]: ...


class MemoryJdAnalysisCache:
    """Exact, process-local cache used by tests and no-database runs."""

    def __init__(self) -> None:
        self._values: dict[str, dict[str, object]] = {}
        self._locks: dict[str, threading.Lock] = {}
        self._guard = threading.Lock()

    def get_or_create(
        self, key: str, creator: Callable[[], JobAnalysis]
    ) -> tuple[JobAnalysis, bool]:
        with self._guard:
            lock = self._locks.setdefault(key, threading.Lock())
        with lock:
            cached = self._values.get(key)
            if cached is not None:
                return JobAnalysis.model_validate(cached), True
            value = creator()
            self._values[key] = value.model_dump(mode="json")
            return value, False

    def snapshot(self) -> dict[str, dict[str, object]]:
        return json.loads(stable_json(self._values))


class PostgresJdAnalysisCache:
    """Thirty-day JD-only cache with a transaction-scoped single-flight lock."""

    def __init__(self, database_url: str, *, setup: bool = True) -> None:
        if not database_url:
            raise ValueError("database_url is required")
        self.database_url = database_url
        if setup:
            self.setup()

    def _connect(self):
        import psycopg

        return psycopg.connect(self.database_url)

    def setup(self) -> None:
        with self._connect() as connection, connection.cursor() as cursor:
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS jd_analysis_cache (
                    cache_key text PRIMARY KEY,
                    analysis jsonb NOT NULL,
                    created_at timestamptz NOT NULL DEFAULT now(),
                    expires_at timestamptz NOT NULL
                )
                """
            )
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS jd_analysis_cache_expires_idx "
                "ON jd_analysis_cache (expires_at)"
            )

    @staticmethod
    def _advisory_key(key: str) -> int:
        value = int(key[:16], 16)
        return value - 2**64 if value >= 2**63 else value

    def get_or_create(
        self, key: str, creator: Callable[[], JobAnalysis]
    ) -> tuple[JobAnalysis, bool]:
        from psycopg.types.json import Jsonb

        with self._connect() as connection, connection.cursor() as cursor:
            cursor.execute("SELECT pg_advisory_xact_lock(%s)", (self._advisory_key(key),))
            cursor.execute("DELETE FROM jd_analysis_cache WHERE expires_at <= now()")
            cursor.execute(
                "SELECT analysis FROM jd_analysis_cache "
                "WHERE cache_key = %s AND expires_at > now()",
                (key,),
            )
            row = cursor.fetchone()
            if row:
                return JobAnalysis.model_validate(row[0]), True
            value = creator()
            cursor.execute(
                """
                INSERT INTO jd_analysis_cache (cache_key, analysis, expires_at)
                VALUES (%s, %s, now() + make_interval(days => %s))
                ON CONFLICT (cache_key) DO UPDATE SET
                    analysis = EXCLUDED.analysis,
                    created_at = now(),
                    expires_at = EXCLUDED.expires_at
                """,
                (key, Jsonb(value.model_dump(mode="json")), CACHE_TTL_DAYS),
            )
            return value, False
