"""Exercise actual PDF admission and canonical evidence without a database."""

import copy
import io
import unittest
from pathlib import Path

from reportlab.pdfgen import canvas

from service.layout_policy import validate_pdf
from service.resume_document import source_document


def pdf(lines):
    output = io.BytesIO()
    doc = canvas.Canvas(output)
    for i, line in enumerate(lines):
        doc.drawString(40, 800 - i * 18, line)
    doc.save()
    return output.getvalue()


class CanonicalDocumentTests(unittest.TestCase):
    def test_stacked_role_company_and_optional_location_keep_their_associations(self):
        from service.document_structure import experience_entries

        for metadata, expected_location in [
            ("Software Engineer\nAcme Systems\nNew York, NY", "New York, NY"),
            ("Software Engineer\nAcme Systems", ""),
        ]:
            rows = experience_entries(
                metadata + "\nJanuary 2022 – December 2025\n• Delivered reliable services."
            )
            self.assertEqual(
                (rows[0]["title"], rows[0]["company"], rows[0]["location"]),
                ("Software Engineer", "Acme Systems", expected_location),
            )
            self.assertEqual(rows[0]["bullets"], ["Delivered reliable services."])
        with self.assertRaisesRegex(ValueError, "ambiguous"):
            experience_entries(
                "Engineering Manager\nSoftware Engineer\nJanuary 2022 – December 2025\n• Delivered services."
            )

    def test_authoritative_linux_exports_roundtrip_with_exact_evidence(self):
        fixture_dir = (
            Path(__file__).resolve().parents[4] / ".unlazy/certified-publication/root/rendered-pdfs"
        )
        if not fixture_dir.is_dir():
            self.skipTest("Authoritative Linux export fixtures are not present in this checkout")
        files = list(fixture_dir.glob("*.pdf"))
        self.assertEqual(len(files), 8)
        for path in files:
            with self.subTest(fixture=path.name):
                result = validate_pdf(path.read_bytes(), path.name)
                self.assertTrue(result["accepted"], result)
                document = result["resumeDocument"]
                role = document["experience"][0]
                self.assertEqual(
                    (role["role"], role["company"], role["location"]),
                    ("Software Engineer", "Acme Systems", "New York, NY"),
                )
                self.assertEqual(
                    len(role["bullets"]), 38 if path.name.startswith("multipage") else 2
                )
                text = result["resume_details"]["originalText"]
                for evidence in document["evidence"]:
                    self.assertEqual(
                        text[evidence["spanStart"] : evidence["spanEnd"]], evidence["sourceSpan"]
                    )
                    self.assertTrue(evidence["page"] and evidence["box"])
                self.assertEqual(document["additionalSections"][0]["title"].lower(), "community")

    def test_header_annotation_target_has_exact_source_text_and_geometry(self):
        output = io.BytesIO()
        doc = canvas.Canvas(output)
        lines = [
            "Jane Doe",
            "jane@example.com",
            "linkedIn/jane",
            "Experience",
            "Acme Corp | Senior Engineer | Jan 2020 - Present",
            "- Built Python services that provide reliable search for internal users.",
            "Skills",
            "Languages: Python, SQL",
        ]
        for i, line in enumerate(lines):
            doc.drawString(40, 800 - i * 18, line)
        doc.linkURL("https://www.linkedin.com/in/jane", (40, 760, 130, 775), relative=0)
        doc.save()
        result = validate_pdf(output.getvalue(), "resume.pdf")
        self.assertTrue(result["accepted"], result)
        canonical = result["resumeDocument"]
        text = result["resume_details"]["originalText"]
        self.assertEqual(canonical["personalInfo"]["linkedin"], "https://www.linkedin.com/in/jane")
        evidence = next(e for e in canonical["evidence"] if e["fieldId"] == "personal.linkedin")
        self.assertEqual(
            text[evidence["spanStart"] : evidence["spanEnd"]], canonical["personalInfo"]["linkedin"]
        )
        self.assertEqual(evidence["page"], 1)

    def test_previous_bullet_is_not_next_role_location(self):
        from service.document_structure import experience_entries

        roles = experience_entries(
            "Designer | Alpha  Jan 2020 - Present\n•  Built prototypes.\n•  Tested interfaces.\n\nDesigner | Beta  Jan 2019 - Jan 2020\n•  Designed products."
        )
        self.assertEqual(roles[0]["bullets"], ["Built prototypes.", "Tested interfaces."])
        self.assertEqual(roles[1]["location"], "")

    def test_education_city_state_is_not_a_degree(self):
        from service.document_structure import education_entries

        education = education_entries(
            "Example Institute  Cambridge, MA\nCandidate for a Bachelor of Science  June 20XX\nMinor in Management"
        )
        self.assertIn("Bachelor of Science", education[0]["degree"])
        self.assertEqual(education[0]["location"], "Cambridge, MA")

    def test_accepted_pdf_has_exact_evidence_and_integer_geometry(self):
        data = pdf(
            [
                "Jane Doe",
                "jane@example.com",
                "Experience",
                "Acme Corp | Senior Engineer | Jan 2020 - Present",
                "- Built Python services that provide reliable search for internal users.",
                "Skills",
                "Cloud: AWS (S3, Lambda), Azure Databricks",
                "Languages: Python, SQL",
                "Education",
                "Example University",
                "Bachelor of Science",
                "2019",
            ]
        )
        result = validate_pdf(data, "resume.pdf")
        self.assertTrue(result["accepted"], result)
        document = result["resumeDocument"]
        text = result["resume_details"]["text"]
        self.assertEqual(document, result["resume_details"]["resumeDocument"])
        self.assertEqual(document["source"]["revision"], "pending")
        self.assertEqual(document["experience"][0]["company"], "Acme Corp")
        self.assertEqual(document["experience"][0]["role"], "Senior Engineer")
        self.assertEqual(document["skills"][0]["items"][0]["text"], "AWS (S3, Lambda)")
        for evidence in document["evidence"]:
            self.assertEqual(
                text[evidence["spanStart"] : evidence["spanEnd"]], evidence["sourceSpan"]
            )
            self.assertEqual(evidence["page"], 1)
            self.assertTrue(all(isinstance(x, int) for x in evidence["box"]))
            self.assertLess(evidence["box"][0], evidence["box"][2])

    def test_ambiguous_employment_cannot_be_accepted(self):
        data = pdf(
            [
                "Jane Doe",
                "jane@example.com",
                "Experience",
                "Acme Corp | Jan 2020 - Present",
                "- Built Python services that provide reliable search for internal users.",
                "Skills",
                "Python, SQL",
            ]
        )
        result = validate_pdf(data, "resume.pdf")
        self.assertFalse(result["accepted"])
        self.assertEqual(result["reasonCode"], "AMBIGUOUS_STRUCTURE")

    def test_missing_dates_are_never_invented(self):
        text = "Jane Doe\nEducation\nExample University\nBachelor of Science"
        result = source_document(
            {
                "text": text,
                "header": {"name": "Jane Doe"},
                "education": "Example University\nBachelor of Science",
                "educationHistory": [
                    {"college": "Example University", "degree": "Bachelor of Science"}
                ],
            },
            "a" * 64,
            "pending",
        )
        self.assertEqual(result["education"][0]["duration"], "")


if __name__ == "__main__":
    unittest.main()
