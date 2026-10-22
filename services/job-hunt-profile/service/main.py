"""Job Hunt profile API. Run from the app directory with uvicorn service.main:app."""

import hashlib
import hmac
import json
import os
import sys
import tempfile
import time
import urllib.request
import urllib.parse
import re
from pathlib import Path

import psycopg
from fastapi import FastAPI, File, Header, HTTPException, UploadFile, Request
from pydantic import BaseModel
from psycopg.types.json import Jsonb
from dotenv import load_dotenv
from service.confirmation import pending_preferences, PENDING_UPDATE
from service.resume_content import normalize, markdown_from
from service.contacts import contact_values
from service.document_structure import form_details

sys.path.insert(0, os.environ.get("RESUME_SCRIPTS_DIR") or str(Path(__file__).resolve().parents[1]))
from scripts.resume_json_to_preferences import apply_overrides, build_preferences
from scripts.resume_to_json import convert

load_dotenv(Path(__file__).resolve().parents[1] / ".env.local")

app = FastAPI(title="Job Hunt profile API")
MAX_RESUME_BYTES = 10 * 1024 * 1024


@app.get("/health")
def health():
    return {"status": "ok", "resumeLayoutContractVersion": 1}


class ProfileUpdate(BaseModel):
    preferences: dict | None = None
    resume_details: dict | None = None


def authenticated_user(user_id: str, timestamp: str, signature: str) -> str:
    secret = os.environ.get("JOB_HUNT_SERVICE_SECRET", "")
    if not secret or not user_id or not timestamp or not signature:
        raise HTTPException(401, "Unauthorized")
    try:
        if abs(time.time() - int(timestamp)) > 60:
            raise ValueError("Expired request")
    except ValueError:
        raise HTTPException(401, "Unauthorized") from None
    expected = hmac.new(secret.encode(), f"{user_id}:{timestamp}".encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(signature, expected):
        raise HTTPException(401, "Unauthorized")
    return user_id


def read_profile(user_id: str) -> dict:
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        row = conn.execute(
            "SELECT preferences, resume_details FROM user_job_preferences WHERE user_id = %s",
            (user_id,),
        ).fetchone()
    return {"preferences": row[0], "resume_details": row[1]} if row else {"preferences": {}, "resume_details": {}}


def save_resume_content(conn, user_id: str, details: dict):
    # A detached historical row is retained for audits, never made active by an autosave.
    return conn.execute(
        """UPDATE user_pref_resumes r SET content=%s, parsed_data=%s, updated_at=now()
           FROM user_job_preferences p
           WHERE r.user_id=%s AND p.user_id=r.user_id AND p.active_resume_id=r.id
             AND r.is_primary=true AND r.file_key IS NOT NULL RETURNING r.id""",
        (markdown_from(details), Jsonb(details), user_id),
    ).fetchone()


@app.get("/profile")
def get_profile(
    x_user_id: str = Header(default=""), x_timestamp: str = Header(default=""), x_signature: str = Header(default="")
):
    return read_profile(authenticated_user(x_user_id, x_timestamp, x_signature))


@app.patch("/profile")
def save_profile(
    update: ProfileUpdate,
    x_user_id: str = Header(default=""), x_timestamp: str = Header(default=""), x_signature: str = Header(default=""),
):
    user_id = authenticated_user(x_user_id, x_timestamp, x_signature)
    if update.preferences is None and update.resume_details is None:
        raise HTTPException(400, "Nothing to save")
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        conn.execute("SELECT pg_advisory_xact_lock(hashtextextended(%s,0))", (user_id,))
        row = conn.execute(
            "SELECT preferences,resume_details FROM user_job_preferences WHERE user_id=%s FOR UPDATE",
            (user_id,),
        ).fetchone()
        preferences, details = (row[0] or {}, row[1] or {}) if row else ({}, {})
        if update.resume_details is not None:
            active = conn.execute(
                """SELECT r.id FROM user_pref_resumes r JOIN user_job_preferences p
                   ON p.user_id=r.user_id AND p.active_resume_id=r.id
                   WHERE r.user_id=%s AND r.is_primary=true AND r.file_key IS NOT NULL FOR UPDATE OF r,p""",
                (user_id,),
            ).fetchone()
            if not active:
                raise HTTPException(409, "Upload an active resume before saving resume details")
            pending = conn.execute(
                "SELECT id FROM resume_generation_requests WHERE user_id=%s AND status IN ('queued','running') LIMIT 1",
                (user_id,),
            ).fetchone()
            if pending:
                raise HTTPException(409, "Wait for resume generation to finish before changing the base resume")
        if update.preferences is not None:
            try:
                preferences = apply_overrides(build_preferences(details.get("text") or "Resume"), update.preferences)
            except (ValueError, KeyError) as error:
                raise HTTPException(400, str(error)) from error
        if update.resume_details is not None:
            merged = details | update.resume_details
            if isinstance(update.resume_details.get('personalDetails'), dict):
                merged['personalDetails'] = (details.get('personalDetails') or {}) | update.resume_details['personalDetails']
            details = normalize(merged, edited=True)
        conn.execute(
            f"""INSERT INTO user_job_preferences
               (user_id, preferences, resume_details, preferences_created_at, preferences_updated_at,
                resume_details_created_at, resume_details_updated_at)
               VALUES (%s, %s, %s, CASE WHEN %s THEN now() END, CASE WHEN %s THEN now() END,
                       CASE WHEN %s THEN now() END, CASE WHEN %s THEN now() END)
               ON CONFLICT (user_id) DO UPDATE SET
                 preferences = {PENDING_UPDATE}, resume_details = EXCLUDED.resume_details,
                 preferences_updated_at = CASE WHEN %s THEN now() ELSE user_job_preferences.preferences_updated_at END,
                 resume_details_updated_at = CASE WHEN %s THEN now() ELSE user_job_preferences.resume_details_updated_at END,
                 updated_at = now()""",
            (user_id, Jsonb(pending_preferences({}, preferences)), Jsonb(details), update.preferences is not None,
             update.preferences is not None, update.resume_details is not None,
             update.resume_details is not None, update.preferences is not None, update.resume_details is not None),
        )
        if update.resume_details is not None:
            save_resume_content(conn, user_id, details)
    return read_profile(user_id)


@app.post("/profile/resume")
def upload_resume(
    file: UploadFile = File(...),
    x_user_id: str = Header(default=""), x_timestamp: str = Header(default=""), x_signature: str = Header(default=""),
):
    authenticated_user(x_user_id, x_timestamp, x_signature)
    from service.layout_policy import validate_pdf
    # Preview only. Activation is owned by the application's confirmed-import transaction.
    return validate_pdf(file.file.read(MAX_RESUME_BYTES + 1), file.filename or "")


@app.post("/profile/resume-from-r2")
async def resume_from_r2(request: Request):
    body = await request.body()
    if len(body) > 8192:
        raise HTTPException(413, "Request too large")
    user = request.headers.get("x-user-id", "")
    timestamp = request.headers.get("x-timestamp", "")
    secret = os.environ.get("JOB_HUNT_SERVICE_SECRET", "")
    signed = f"{user}:{timestamp}:{hashlib.sha256(body).hexdigest()}"
    expected = hmac.new(secret.encode(), signed.encode(), hashlib.sha256).hexdigest()
    try:
        if not secret or not user or abs(time.time() - int(timestamp)) > 60:
            raise ValueError()
    except ValueError:
        raise HTTPException(401, "Unauthorized") from None
    if not hmac.compare_digest(request.headers.get("x-signature", ""), expected):
        raise HTTPException(401, "Unauthorized")
    data = json.loads(body)
    key = data.get("objectKey", "")
    url = urllib.parse.urlparse(data.get("downloadUrl", ""))
    if not (key.startswith(f"resume_imports/{user}/") or key.startswith(f"user_pref_resumes/{user}/")) or url.scheme != "https" or not (url.hostname or "").endswith(".r2.cloudflarestorage.com"):
        raise HTTPException(400, "Invalid source")
    # Run blocking parser and DB work outside the async event loop.
    from starlette.concurrency import run_in_threadpool
    return await run_in_threadpool(import_r2_resume, user, data)


def import_r2_resume(user: str, data: dict):
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *args, **kwargs): return None
    with urllib.request.build_opener(NoRedirect).open(data["downloadUrl"], timeout=20) as response:
        contents = response.read(MAX_RESUME_BYTES + 1)
    if len(contents) > MAX_RESUME_BYTES:
        from service.layout_policy import rejected
        return rejected("FILE_TOO_LARGE", "PDFs must be 10 MB or smaller.")
    from service.layout_policy import validate_pdf
    return validate_pdf(contents, data.get("fileName", ""))
