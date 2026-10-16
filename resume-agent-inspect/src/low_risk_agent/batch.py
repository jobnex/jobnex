"""Durable per-generation provider responses. Pending batches yield to the queue."""
from __future__ import annotations

import hashlib
import json
from urllib.parse import quote
from urllib.request import Request, urlopen

from .cache import stable_json


class BatchPending(Exception):
    """A persisted batch is still processing; no output or credit is settled."""


class DurableTransport:
    def __init__(self, database_url, generation_id, user_id, post):
        self.database_url = database_url
        self.generation_id = generation_id
        self.user_id = user_id
        self.post = post

    @staticmethod
    def get(endpoint, key, timeout):
        request = Request(endpoint, headers={"Authorization": f"Bearer {key}"})
        with urlopen(request, timeout=timeout) as response:
            return json.load(response)

    def __call__(self, endpoint, key, body, timeout):
        import psycopg
        from psycopg.types.json import Jsonb

        digest = hashlib.sha256(stable_json(body).encode()).hexdigest()
        with psycopg.connect(self.database_url, connect_timeout=10) as conn:
            # A generation's queue lease serializes execution; this lock also
            # protects a duplicate delivery reaching the same provider request.
            conn.execute("SELECT pg_advisory_xact_lock(hashtextextended(%s,0))",
                         (f"resume-model:{self.generation_id}:{digest}",))
            owned = conn.execute("SELECT 1 FROM resume_generation_requests WHERE id=%s AND user_id=%s",
                                 (self.generation_id, self.user_id)).fetchone()
            if not owned:
                raise ValueError("Generation request does not belong to this user")
            row = conn.execute("SELECT batch_id,response,created_at < now()-interval '48 hours' FROM resume_model_batches "
                               "WHERE request_id=%s AND body_hash=%s FOR UPDATE",
                               (self.generation_id, digest)).fetchone()
            if row and row[1] is not None:
                return row[1]
            if row and row[2]:
                raise ValueError("Batch exceeded the 48-hour recovery window")
            is_batch = body["model"].endswith(":batch")
            if not is_batch:
                response = self.post(endpoint, key, body, timeout)
                if response.get("error") or any(choice.get("error") for choice in response.get("choices", [])):
                    return response
                conn.execute("INSERT INTO resume_model_batches(request_id,body_hash,response,submitted) "
                             "VALUES(%s,%s,%s,true) ON CONFLICT(request_id,body_hash) "
                             "DO UPDATE SET response=excluded.response",
                             (self.generation_id, digest, Jsonb(response)))
                return response
            batch_endpoint = endpoint.removesuffix("/v1/chat/completions") + "/beta/batches"
            if not row:
                # Commit intent before submitting: a crash in the acknowledgement
                # window must not submit and bill a second batch automatically.
                conn.execute("INSERT INTO resume_model_batches(request_id,body_hash,submitted) VALUES(%s,%s,true)",
                             (self.generation_id, digest))
                conn.commit()
                batch_body = {**body, "model": body["model"].removesuffix(":batch")}
                created = self.post(batch_endpoint, key, {
                    "endpoint": "/v1/chat/completions", "model": batch_body["model"],
                    "requests": [{"custom_id": digest, "body": batch_body}],
                }, timeout)
                batch_id = created.get("id")
                if not isinstance(batch_id, str) or not batch_id:
                    raise ValueError("Batch submission returned no ID; acknowledgement needs review")
                conn.execute("UPDATE resume_model_batches SET batch_id=%s WHERE request_id=%s AND body_hash=%s",
                             (batch_id, self.generation_id, digest))
                conn.commit()
                raise BatchPending(batch_id)
            batch_id = row[0]
            if not batch_id:
                raise ValueError("Batch submission acknowledgement missing; do not resubmit automatically")
            batch = self.get(f"{batch_endpoint}/{quote(batch_id, safe='')}", key, timeout)
            status = batch.get("status")
            if status in {"validating", "in_progress", "finalizing", "queued", "processing"}:
                raise BatchPending(batch_id)
            if status != "completed":
                raise ValueError(f"Batch ended with status {status}")
            results = batch.get("results") or []
            result = next((item for item in results if item.get("custom_id") == digest), None)
            if not result or result.get("error"):
                raise ValueError("Batch returned no successful matching result")
            response = result.get("response") or {}
            if response.get("status_code") != 200 or not isinstance(response.get("body"), dict):
                raise ValueError("Batch result is not a successful chat completion")
            response = response["body"]
            conn.execute("UPDATE resume_model_batches SET response=%s WHERE request_id=%s AND body_hash=%s",
                         (Jsonb(response), self.generation_id, digest))
            return response
