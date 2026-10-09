import unittest
from service.resume_content import normalize, markdown_from
from scripts.resume_to_json import resume_details

class ResumeContentTest(unittest.TestCase):
    def test_pdf_layout_heading_spaces_and_verbatim_experience(self):
        extracted=resume_details("Example Person\nPROFESSIONAL      SUMMARY\nBuilds reliable systems\nTECHNICAL      SKILLS\nSQL, Python\nPROFESSIONAL       EXPERIENCE\nEvery source line stays here\nEDUCATION\nCollege")
        rendered=markdown_from(extracted,edited=True)
        for expected in ["Builds reliable systems","SQL, Python","Every source line stays here","College"]:
            self.assertIn(expected,rendered)
    def test_edits_preserve_extraction_and_other_sections(self):
        details = {"text":"Original source","compiler_payload":{"templateId":"mit-capd","markdown":"# Old name\n\n## Experience\nOld role\n\n## Projects\nBuilt a queue\n\n## Skills\nSQL"},"personalDetails":{"fullName":"New name"},"experienceHistory":[{"role":"Engineer","company":"Acme","jobDescription":"Built APIs"}],"educationHistory":[]}
        result=normalize(details,edited=True);markdown=markdown_from(result)
        self.assertIn("# New name",markdown);self.assertIn("Built APIs",markdown)
        self.assertNotIn("Old role",markdown);self.assertNotIn("Old name",markdown)
        self.assertIn("Built a queue",markdown);self.assertIn("SQL",markdown)
        self.assertEqual(result["text"],"Original source")
        self.assertEqual(result["compiler_payload"]["templateId"],"mit-capd")
        self.assertEqual(markdown_from({"text":"Uploaded PDF text"}),"# Resume\n\nUploaded PDF text")
        self.assertEqual(markdown_from({}),"")
