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

sys.path.insert(0, os.environ.get("RESUME_SCRIPTS_DIR") or str(Path(__file__).resolve().parents[1]))
from scripts.resume_json_to_preferences import apply_overrides, build_preferences
from scripts.resume_to_json import convert

load_dotenv(Path(__file__).resolve().parents[1] / ".env.local")

app = FastAPI(title="Job Hunt profile API")
MAX_RESUME_BYTES = 10 * 1024 * 1024


@app.get("/health")
def health():
    return {"status": "ok"}


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
    row = conn.execute(
        "UPDATE user_pref_resumes SET content=%s, parsed_data=%s, updated_at=now() WHERE user_id=%s RETURNING id",
        (markdown_from(details), Jsonb(details), user_id),
    ).fetchone()
    if row:
        conn.execute("UPDATE user_job_preferences SET active_resume_id=%s WHERE user_id=%s", (row[0], user_id))


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
    current = read_profile(user_id)
    preferences = current["preferences"]
    details = current["resume_details"]
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
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
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
    user_id = authenticated_user(x_user_id, x_timestamp, x_signature)
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in {".pdf", ".docx"}:
        raise HTTPException(400, "Upload a PDF or DOCX resume")
    contents = file.file.read(MAX_RESUME_BYTES + 1)
    if len(contents) > MAX_RESUME_BYTES:
        raise HTTPException(413, "Resume exceeds 10 MB")
    with tempfile.TemporaryDirectory() as directory:
        source = Path(directory) / f"resume{suffix}"
        source.write_bytes(contents)
        try:
            details = json.loads(convert(source, Path(directory)).read_text(encoding="utf-8"))
            inferred = build_preferences(details["text"])
        except Exception as error:
            raise HTTPException(400, f"Could not read resume: {error}") from error
    details["source_file"] = Path(file.filename or "resume").name
    details = normalize(details)
    current = read_profile(user_id)
    inferred["resumeFileName"] = details["source_file"]
    inferred["resumeUploaded"] = True
    preferences = inferred | {key: current["preferences"][key] for key in
                              ("jobTypes", "salaryMin", "salaryMax", "selectedTemplateId", "includeSummarySections", "autofillFromResume")
                              if key in current["preferences"]}
    preferences["resumeFileName"] = details["source_file"]
    preferences["resumeUploaded"] = True
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        conn.execute(
            f"""INSERT INTO user_job_preferences
               (user_id, preferences, resume_details, preferences_created_at, preferences_updated_at,
                resume_details_created_at, resume_details_updated_at)
               VALUES (%s, %s, %s, now(), now(), now(), now())
               ON CONFLICT (user_id) DO UPDATE SET preferences = {PENDING_UPDATE},
                 resume_details = EXCLUDED.resume_details, preferences_updated_at = now(),
                 resume_details_updated_at = now(), updated_at = now()""",
            (user_id, Jsonb(pending_preferences({}, preferences)), Jsonb(details)),
        )
        save_resume_content(conn, user_id, details)
    return read_profile(user_id)


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
    if not key.startswith(f"user_pref_resumes/{user}/") or url.scheme != "https" or not (url.hostname or "").endswith(".r2.cloudflarestorage.com"):
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
        raise HTTPException(413, "Resume exceeds 10 MB")
    suffix = Path(data["fileName"]).suffix.lower()
    if suffix not in {".pdf", ".docx"}: raise HTTPException(400, "Upload a PDF or DOCX")
    with tempfile.TemporaryDirectory() as folder:
        source = Path(folder) / ("resume" + suffix)
        source.write_bytes(contents)
        try:
            details = json.loads(convert(source, Path(folder)).read_text(encoding="utf-8"))
            inferred = build_preferences(details["text"])
        except Exception:
            raise HTTPException(400, "Could not extract text from resume") from None
    current = read_profile(user)
    preferences = current["preferences"] | inferred
    for key in ("jobTypes", "salaryMin", "salaryMax", "selectedTemplateId", "includeSummarySections", "autofillFromResume"):
        if key in current["preferences"]: preferences[key] = current["preferences"][key]
    preferences["resumeFileName"] = Path(data["fileName"]).name
    preferences["resumeUploaded"] = True
    details["source_file"] = preferences["resumeFileName"]
    result = {"preferences": preferences, "resume_details": details}
    header = details.get("header", {})
    details["personalDetails"] = {"fullName": header.get("name", ""), "email": header.get("email", ""),
        "phoneNumber": header.get("phone", ""), "location": header.get('location',''),
        "links": header.get('links', []), 'emails': header.get('emails', []), 'phones': header.get('phones', [])}
    details["educationHistory"] = [{"id": "1", "college": details["education"], "degree": "", "field": "",
        "startDate": "", "endDate": "", "grade": "", "maxGrade": "", "gradeType": "CGPA"}] if details.get("education") else []
    entries = details.get("experience", [])
    details["experienceHistory"] = [{"id": str(index + 1), "company": entry.get("company", ""), "role": entry.get("title", ""),
        "startDate": "", "endDate": "", "jobDescription": "\n".join(entry.get("bullets", [])), "skills": [], "domains": [], "responsibilities": ""}
        for index, entry in enumerate(entries if isinstance(entries, list) else [])]
    preferences["resumeFileKey"] = data["objectKey"]
    lines = ["# " + header.get("name", ""), *(['**'+header['title']+'**'] if header.get('title') else []), " | ".join(contact_values(details['personalDetails'], header)), ""]
    for title, field in [("Professional Summary", "summary"), ("Education", "education"), ("Skills & Technologies", "skills")]:
        value = details.get(field)
        if isinstance(value, str) and value.strip(): lines.extend(["## " + title, value, ""])
    if isinstance(entries, list) and entries:
        lines.append("## Experience")
        for entry in entries:
            lines.extend(["### " + entry.get("title", ""), "**" + entry.get("company", "") + "** | " + entry.get("dates", "")])
            lines.extend("- " + item for item in entry.get("bullets", []))
    for field in ("projects", "certifications", "awards", "publications", "volunteering", "languages", "training", "research", "leadership", "achievements", "additional_information"):
        value = details.get(field)
        if isinstance(value, str) and value.strip(): lines.extend(["", "## " + field.replace("_", " ").title(), value])
    details["compiler_payload"] = {"markdown": "\n".join(lines), "templateId": preferences.get("selectedTemplateId", "mit-capd")}
    details = normalize(details)
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        # Ignore a stale extraction if the user already uploaded a newer resume.
        active = conn.execute("SELECT file_key FROM user_pref_resumes WHERE user_id=%s FOR UPDATE", (user,)).fetchone()
        if not active or active[0] != data["objectKey"]:
            raise HTTPException(409, "Resume replaced during extraction; retry latest upload")
        conn.execute(f"""INSERT INTO user_job_preferences(user_id,preferences,resume_details,active_resume_id,resume_details_created_at,resume_details_updated_at)
            VALUES(%s,%s,%s,(SELECT id FROM user_pref_resumes WHERE user_id=%s),now(),now())
            ON CONFLICT(user_id) DO UPDATE SET preferences={PENDING_UPDATE},resume_details=EXCLUDED.resume_details,
            active_resume_id=EXCLUDED.active_resume_id,resume_details_created_at=COALESCE(user_job_preferences.resume_details_created_at,now()),resume_details_updated_at=now(),updated_at=now()""",
            (user, Jsonb(pending_preferences({}, preferences)), Jsonb(details), user))
        save_resume_content(conn, user, details)
    return read_profile(user)
