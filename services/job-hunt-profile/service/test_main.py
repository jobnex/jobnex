import hashlib
import hmac
import os
import time
import unittest
import json
import tempfile
from pathlib import Path
from docx import Document

from fastapi import HTTPException

from service.main import authenticated_user, convert, build_preferences, apply_overrides, health
from service.confirmation import pending_preferences


class AuthenticationTest(unittest.TestCase):
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
