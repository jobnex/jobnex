import hashlib
import hmac
import os
import time
import unittest
import json
import tempfile
from pathlib import Path
from unittest.mock import MagicMock, patch
from docx import Document

from fastapi import HTTPException

from service.main import authenticated_user, convert, build_preferences, apply_overrides, health
from service.confirmation import pending_preferences
from service import main


class AuthenticationTest(unittest.TestCase):
    def test_preflight_parses_without_reading_or_writing_user_profile(self):
        details = {"text": "Python engineer", "header": {"name": "Synthetic Candidate"}}
        data = {"downloadUrl": "https://example.invalid", "fileName": "resume.docx",
                "objectKey": "user_pref_resumes/test/preflight.docx", "validateOnly": True}
        with tempfile.TemporaryDirectory() as folder:
            parsed = Path(folder) / "parsed.json"
            parsed.write_text(json.dumps(details), encoding="utf-8")
            opener = MagicMock()
            opener.open.return_value.__enter__.return_value.read.return_value = b"synthetic bytes"
            with patch.object(main.psycopg, "connect") as connect, patch.object(main, "read_profile") as read, patch.object(main, "convert", return_value=parsed), patch.object(main, "build_preferences", return_value={}), patch.object(main.urllib.request, "build_opener", return_value=opener):
                self.assertEqual(main.import_r2_resume("test", data), {"valid": True})
                connect.assert_not_called()
                read.assert_not_called()
                parsed.write_text(json.dumps({"text": ""}), encoding="utf-8")
                with self.assertRaises(HTTPException):
                    main.import_r2_resume("test", data)
                connect.assert_not_called()
                read.assert_not_called()

    def test_resume_content_mirrors_details_and_rejects_stale_upload(self):
        details = {"text": "Python engineer", "header": {"name": "Test é"}}
        current = {"preferences": {}, "resume_details": {}}
        state = {"key": "user_pref_resumes/test/current.docx"}
        conn = MagicMock()
        def execute(query, params=None):
            result = MagicMock()
            row = None
            if "SELECT file_key" in query:
                row = (state["key"],)
            elif "SELECT preferences,resume_details" in query:
                row = (current["preferences"], current["resume_details"])
            elif "SELECT r.id FROM user_pref_resumes" in query:
                row = ("active-base",)
            elif "UPDATE user_pref_resumes" in query:
                row = ("active-base",)
            result.fetchone.return_value = row
            return result
        conn.execute.side_effect = execute
        data = {"downloadUrl": "https://example.invalid", "fileName": "resume.docx",
                "objectKey": state["key"]}
        with tempfile.TemporaryDirectory() as directory:
            parsed = Path(directory) / "parsed.json"
            parsed.write_text(json.dumps(details), encoding="utf-8")
            opener = MagicMock()
            opener.open.return_value.__enter__.return_value.read.return_value = b"test resume"
            with patch.object(main.psycopg, "connect") as connect, \
                 patch.object(main, "read_profile", return_value=current), \
                 patch.object(main, "convert", return_value=parsed), \
                 patch.object(main, "build_preferences", return_value={}), \
                 patch.object(main, "apply_overrides", return_value={}), \
                 patch.object(main.urllib.request, "build_opener", return_value=opener), \
                 patch.dict(os.environ, {"DATABASE_URL": "test-only"}):
                connect.return_value.__enter__.return_value = conn
                main.import_r2_resume("test", data)
                calls = conn.execute.call_args_list
                saved_details = next(call.args[1][2].obj for call in calls if "INSERT INTO user_job_preferences" in call.args[0])
                mirror = next(call.args[1] for call in calls if "UPDATE user_pref_resumes" in call.args[0])
                self.assertEqual(mirror[0], saved_details["compiler_payload"]["markdown"])
                self.assertEqual(mirror[1].obj, saved_details)
                self.assertEqual(mirror[2], "test")
                self.assertIn("pg_advisory_xact_lock", calls[0].args[0])
                conn.reset_mock()
                state["key"] = "newer.docx"
                with self.assertRaises(HTTPException) as error:
                    main.import_r2_resume("test", data)
                self.assertEqual(error.exception.status_code, 409)
                self.assertFalse(any(call.args[0].lstrip().startswith(("INSERT", "UPDATE")) for call in conn.execute.call_args_list))
                with patch.object(main, "authenticated_user", return_value="test"):
                    current["resume_details"] = {"personalDetails": {"website": "https://example.dev/about"}}
                    conn.reset_mock()
                    main.save_profile(main.ProfileUpdate(resume_details={**details, "personalDetails": {"fullName": "New Name"}}))
                    mirror = next(call.args[1] for call in conn.execute.call_args_list if "UPDATE user_pref_resumes" in call.args[0])
                    self.assertEqual(mirror[0], mirror[1].obj["compiler_payload"]["markdown"])
                    self.assertEqual(mirror[2], "test")
                    self.assertIn("https://example.dev/about", mirror[0])
                    conn.reset_mock()
                    main.save_profile(main.ProfileUpdate(preferences={}))
                    self.assertFalse(any("UPDATE user_pref_resumes" in call.args[0] for call in conn.execute.call_args_list))
                    conn.reset_mock()
                    upload = MagicMock()
                    upload.filename = "resume.docx"
                    upload.file.read.return_value = b"test resume"
                    main.upload_resume(upload)
                    saved_details = next(call.args[1][2].obj for call in conn.execute.call_args_list if "INSERT INTO user_job_preferences" in call.args[0])
                    mirror = next(call.args[1][1].obj for call in conn.execute.call_args_list if "UPDATE user_pref_resumes" in call.args[0])
                    self.assertEqual(mirror, saved_details)

    def test_deleted_base_and_active_generation_block_source_edits_but_allow_preferences(self):
        current = {"preferences": {}, "resume_details": {"text": "Existing base"}}
        conn = MagicMock()
        state = {"active": False, "pending": False}
        def execute(query, params=None):
            result = MagicMock()
            row = None
            if "SELECT preferences,resume_details" in query:
                row = (current["preferences"], current["resume_details"])
            elif "SELECT r.id FROM user_pref_resumes" in query and state["active"]:
                row = ("active-base",)
            elif "SELECT id FROM resume_generation_requests" in query and state["pending"]:
                row = ("running-request",)
            result.fetchone.return_value = row
            return result
        conn.execute.side_effect = execute
        with patch.object(main.psycopg, "connect") as connect, patch.object(main, "authenticated_user", return_value="test"), \
             patch.object(main, "read_profile", return_value=current), patch.object(main, "build_preferences", return_value={}), \
             patch.object(main, "apply_overrides", return_value={}), patch.dict(os.environ, {"DATABASE_URL": "test-only"}):
            connect.return_value.__enter__.return_value = conn
            for active, pending in ((False, False), (True, True)):
                state.update(active=active, pending=pending)
                conn.reset_mock()
                with self.assertRaises(HTTPException) as error:
                    main.save_profile(main.ProfileUpdate(resume_details={"text": "Delayed old form"}))
                self.assertEqual(error.exception.status_code, 409)
                calls = conn.execute.call_args_list
                self.assertIn("pg_advisory_xact_lock", calls[0].args[0])
                self.assertFalse(any(call.args[0].lstrip().startswith(("INSERT", "UPDATE")) for call in calls))
                conn.reset_mock()
                self.assertEqual(main.save_profile(main.ProfileUpdate(preferences={})), current)
                self.assertFalse(any("UPDATE user_pref_resumes" in call.args[0] for call in conn.execute.call_args_list))
            conn.reset_mock()
            self.assertIsNone(main.save_resume_content(conn, "test", {"text": "Delayed old form"}))
            query = conn.execute.call_args.args[0]
            self.assertIn("p.active_resume_id=r.id", query)
            self.assertIn("r.is_primary=true", query)
            self.assertIn("r.file_key IS NOT NULL", query)
            self.assertEqual(conn.execute.call_count, 1)

    def test_confirmation_baseline_and_timestamp_survive_automated_updates(self):
        baseline = {"skills": ["SQL"]}
        existing = {"skills": ["SQL"], "isConfirmed": True, "confirmedAt": "2026-09-01", "lastConfirmedPreferences": baseline}
        result = pending_preferences(existing, {"skills": ["Python"], "isConfirmed": True, "confirmedAt": "bad", "lastConfirmedPreferences": {}, "cities": ["A", "B", "C", "D"]})
        self.assertFalse(result["isConfirmed"])
        self.assertEqual(result["confirmedAt"], existing["confirmedAt"])
        self.assertEqual(result["lastConfirmedPreferences"], baseline)
        self.assertEqual(result["cities"], ["A", "B", "C"])
        self.assertEqual(pending_preferences({"skills": ["SQL"], "lastConfirmedPreferences": None}, {"skills": ["Python"]})["lastConfirmedPreferences"], baseline)

    def test_signed_user_cannot_be_changed_or_replayed_later(self):
        timestamp = str(int(time.time()))
        signature = hmac.new(
            os.environ["JOB_HUNT_SERVICE_SECRET"].encode(),
            f"user-a:{timestamp}".encode(), hashlib.sha256,
        ).hexdigest()
        self.assertEqual(authenticated_user("user-a", timestamp, signature), "user-a")
        with self.assertRaises(HTTPException):
            authenticated_user("user-b", timestamp, signature)
        with self.assertRaises(HTTPException):
            authenticated_user("user-a", str(int(timestamp) - 120), signature)

    def test_resume_json_generates_preferences_and_validates_manual_fields(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "resume.docx"
            document = Document()
            for line in ("Jane Doe", "Software Engineer", "PROFESSIONAL SUMMARY", "4 years of experience",
                         "TECHNICAL SKILLS", "Python SQL Docker"):
                document.add_paragraph(line)
            document.save(source)
            details = json.loads(convert(source, Path(directory)).read_text(encoding="utf-8"))
            preferences = build_preferences(details["text"])
            self.assertEqual(preferences["experienceYears"], 4)
            self.assertEqual(preferences["seniority"], "Mid-level")
            self.assertIn("Software Engineer", preferences["domains"])
            self.assertIn("Python", preferences["skills"])
            self.assertEqual(apply_overrides(preferences, {"jobTypes": ["Full-time"]})["jobTypes"], ["Full-time"])
            with self.assertRaises(ValueError):
                apply_overrides(preferences, {"experienceYears": -1})
        self.assertEqual(health(), {"status": "ok"})


if __name__ == "__main__":
    unittest.main()
