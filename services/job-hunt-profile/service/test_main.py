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
    def test_resume_content_mirrors_details_and_rejects_stale_upload(self):
        details = {"text": "Python engineer", "header": {"name": "Test é"}}
        current = {"preferences": {}, "resume_details": {}}
        conn = MagicMock()
        conn.execute.return_value.fetchone.return_value = ("user_pref_resumes/test/current.docx",)
        data = {"downloadUrl": "https://example.invalid", "fileName": "resume.docx",
                "objectKey": "user_pref_resumes/test/current.docx"}
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
                saved_details = calls[-3].args[1][2].obj
                self.assertEqual(calls[-2].args[1][0], saved_details["compiler_payload"]["markdown"])
                self.assertEqual(calls[-2].args[1][1].obj, saved_details)
                self.assertEqual(calls[-2].args[1][2], "test")
                conn.reset_mock()
                conn.execute.return_value.fetchone.return_value = ("newer.docx",)
                with self.assertRaises(HTTPException) as error:
                    main.import_r2_resume("test", data)
                self.assertEqual(error.exception.status_code, 409)
                self.assertEqual(conn.execute.call_count, 1)
                with patch.object(main, "authenticated_user", return_value="test"):
                    conn.reset_mock()
                    main.save_profile(main.ProfileUpdate(resume_details=details))
                    mirror = conn.execute.call_args_list[-2].args[1]
                    self.assertEqual(mirror[0], mirror[1].obj["compiler_payload"]["markdown"])
                    self.assertEqual(mirror[2], "test")
                    conn.reset_mock()
                    main.save_profile(main.ProfileUpdate(preferences={}))
                    self.assertEqual(conn.execute.call_count, 1)
                    conn.reset_mock()
                    upload = MagicMock()
                    upload.filename = "resume.docx"
                    upload.file.read.return_value = b"test resume"
                    main.upload_resume(upload)
                    self.assertEqual(conn.execute.call_args_list[-2].args[1][1].obj,
                                     conn.execute.call_args_list[-3].args[1][2].obj)

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
