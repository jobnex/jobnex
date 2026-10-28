from __future__ import annotations

import os
from uuid import UUID

from .models import PipelineResult
from .source import normalize_document, sha256_text


class ResumeStore:
    """Trusted backend API: supply user_id from the authenticated session."""

    def __init__(self, database_url: str):
        if not database_url:
            raise ValueError("Resume result storage requires a database URL")
        self.database_url = database_url

    def connect(self):
        import psycopg

        try:
            return psycopg.connect(self.database_url, connect_timeout=10)
        except psycopg.Error as error:
            raise RuntimeError("Resume storage connection failed") from error

    def validate_context(self, user_id, job_id, base_resume_id, job_description):
        job_id = UUID(str(job_id))
        base_resume_id = UUID(str(base_resume_id)) if base_resume_id else None
        if not user_id or user_id != user_id.strip():
            raise ValueError("A nonempty user ID without surrounding whitespace is required")
        with self.connect() as conn, conn.cursor() as cur:
            cur.execute("SELECT job_description FROM public.jobs WHERE id = %s", (job_id,))
            row = cur.fetchone()
            if not row or normalize_document(row[0]) != normalize_document(job_description):
                raise ValueError("Job description does not match the selected database job")
            if base_resume_id:
                cur.execute(
                    "SELECT 1 FROM public.user_pref_resumes WHERE id=%s AND user_id=%s",
                    (base_resume_id, user_id),
                )
                if not cur.fetchone():
                    raise ValueError("Base resume not found for this user")

    def save(self, *, generation_id, user_id, job_id, base_resume_id, result: PipelineResult):
        from psycopg.types.json import Jsonb

        generation_id = UUID(str(generation_id))
        job_id = UUID(str(job_id))
        base_resume_id = UUID(str(base_resume_id)) if base_resume_id else None
        audit = result.model_dump(mode="json")
        with self.connect() as conn, conn.cursor() as cur:
            cur.execute(
                "SELECT pg_advisory_xact_lock(hashtextextended(%s,0))",
                (user_id + ":" + str(job_id),),
            )
            cur.execute("SELECT job_description FROM public.jobs WHERE id=%s FOR SHARE", (job_id,))
            job = cur.fetchone()
            if not job or sha256_text(normalize_document(job[0])) != result.job_hash:
                raise ValueError("Job changed during generation; output was not saved to the DB")
            cur.execute(
                """INSERT INTO public.resume_generations
                   (id,user_id,job_id,base_resume_id,version,status,resume_markdown,
                    audit_json,source_hash,job_hash)
                   VALUES (%s,%s,%s,%s,1,%s,%s,%s,%s,%s)
                   ON CONFLICT (id) DO NOTHING RETURNING version""",
                (
                    generation_id,
                    user_id,
                    job_id,
                    base_resume_id,
                    result.status,
                    result.resume_markdown,
                    Jsonb(audit),
                    result.source_hash,
                    result.job_hash,
                ),
            )
            inserted = cur.fetchone()
            if inserted:
                return {"id": str(generation_id), "version": inserted[0]}
            cur.execute(
                """SELECT version,user_id,job_id,base_resume_id,audit_json
                   FROM public.resume_generations WHERE id=%s""",
                (generation_id,),
            )
            existing = cur.fetchone()
            if not existing or existing[1:] != (user_id, job_id, base_resume_id, audit):
                raise ValueError("Generation ID already exists with different content or ownership")
            return {"id": str(generation_id), "version": existing[0]}

    def history(self, *, user_id, job_id):
        with self.connect() as conn, conn.cursor() as cur:
            cur.execute(
                """SELECT id,version,status,created_at FROM public.resume_generations
                   WHERE user_id=%s AND job_id=%s ORDER BY version DESC""",
                (user_id, UUID(str(job_id))),
            )
            return cur.fetchall()

    def select_for_application(self, *, user_id, application_id, generation_id):
        """Explicit selection only; does not mark applied or alter existing resume_id."""
        with self.connect() as conn, conn.cursor() as cur:
            cur.execute(
                """SELECT 1 FROM public.applications a JOIN public.resume_generations g
                   ON g.user_id=a.user_id AND g.job_id=a.job_id
                   WHERE a.id=%s AND a.user_id=%s AND g.id=%s
                   AND g.status IN ('completed','completed_with_estimates') FOR UPDATE OF a""",
                (UUID(str(application_id)), user_id, UUID(str(generation_id))),
            )
            if not cur.fetchone():
                raise ValueError("Application/generation mismatch or result needs review")
            cur.execute(
                """INSERT INTO public.resume_generation_submissions(application_id,generation_id)
                   VALUES (%s,%s) ON CONFLICT (application_id) DO UPDATE
                   SET generation_id=EXCLUDED.generation_id,selected_at=now()""",
                (UUID(str(application_id)), UUID(str(generation_id))),
            )


def results_database_url():
    return os.getenv("RESUME_RESULTS_DATABASE_URL") or os.getenv("DATABASE_URL", "")
