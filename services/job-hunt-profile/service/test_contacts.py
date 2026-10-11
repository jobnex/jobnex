import json
import tempfile
import unittest
from pathlib import Path
from docx import Document
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.opc.constants import RELATIONSHIP_TYPE as RT
from pypdf import PdfWriter
from pypdf.annotations import Link
from service.contacts import extract_contacts, contact_values
from service.resume_content import normalize, markdown_from
from scripts.resume_to_json import convert, resume_details, recover_pdf_spacing

class ContactTests(unittest.TestCase):
    def test_layout_and_negative_controls(self):
        for phone in ['(212) 555-0123', '+44 20 7946 0958', '+91 98765 43210', '+49 (30) 12345678', '212.555.0123 ext 42', '5550123']:
            with self.subTest(phone=phone):
                result = extract_contacts('Example Person | person@example.com | '+phone+'\nlinkedin.com/in/example\nSKILLS\nNode.js ASP.NET\nEXPERIENCE\n2020-2024\n2024-01-31\nRevenue 10000000')
                self.assertIn(phone, result['phones'])
                self.assertEqual(result['phones'], [phone])
                self.assertEqual(result['links'], ['linkedin.com/in/example'])
                self.assertEqual(result['emails'], ['person@example.com'])

    def test_title_and_email_do_not_become_contacts(self):
        self.assertEqual(extract_contacts('first.last@example.com')['links'], [])
        self.assertEqual(extract_contacts('linkedin.com/in/example | https://linkedin.com/in/example/')['links'],
                         ['linkedin.com/in/example'])
        title = 'Backend Developer | AI Infrastructure | Python | AWS'
        details = resume_details('Example Person\n'+title+'\nfirst.last@example.com\nSKILLS\nPython')
        self.assertEqual(details['header']['title'], title)
        self.assertEqual(details['header'].get('additional_contacts', []), [])
        values = contact_values({}, {'title': title, 'additional_contacts': title.split(' | ')})
        self.assertEqual(values, [])

    def test_links_and_round_trip_and_explicit_delete(self):
        extracted = resume_details('# José Example\n123 Main Street\nVisa: authorized\nSKILLS\nPython')
        rendered = markdown_from(extracted, edited=True)
        for value in ['José Example','123 Main Street','Visa: authorized']:
            self.assertIn(value,rendered)
        contacts = extract_contacts('Example Person\nSKILLS\nPython', ['https://linkedin.com/in/example','https://example.dev/about', 'mailto:other@example.org','tel:+442079460958','javascript:alert(1)'])
        self.assertEqual(len(contacts['links']),2)
        self.assertEqual(contacts['phones'], ['+442079460958'])
        details = {'text':'Example Person\n(212) 555-0123 | linkedin.com/in/example',
                   'header':contacts, 'personalDetails':{'fullName':'Example Person','phoneNumber':'(212) 555-0123'},
                   'compiler_payload':{'markdown':'# Example Person\n\n## Skills\nPython'}}
        rendered = markdown_from(details)
        for value in ['(212) 555-0123','linkedin.com/in/example','https://example.dev/about','other@example.org']:
            self.assertIn(value,rendered)
        changed = normalize({**details,'personalDetails':{'fullName':'New Name','phoneNumber':'','email':'','links':[],'phones':[]}}, edited=True)
        self.assertNotIn('555-0123',markdown_from(changed))
        self.assertNotIn('linkedin.com',markdown_from(changed))
        self.assertIn('# New Name',markdown_from(changed))
        self.assertIn('Visa: authorized', ' | '.join(contact_values({'visa':'Visa: authorized'})))

    def test_docx_header_table_and_hidden_link(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder)/'resume.docx'
            document = Document()
            document.sections[0].header.paragraphs[0].text = '+44 20 7946 0958'
            document.add_paragraph('Example Person')
            paragraph = document.add_paragraph('Profile ')
            relationship = paragraph.part.relate_to('https://example.dev/portfolio',RT.HYPERLINK,is_external=True)
            link = OxmlElement('w:hyperlink');link.set(qn('r:id'),relationship)
            run=OxmlElement('w:r');text=OxmlElement('w:t');text.text='Portfolio';run.append(text);link.append(run);paragraph._p.append(link)
            document.add_table(rows=1,cols=2).cell(0,0).text = 'person@example.org'
            document.add_paragraph('SKILLS');document.add_paragraph('Python')
            document.save(path)
            data=json.loads(convert(path,Path(folder)).read_text())
            self.assertIn('+44 20 7946 0958',data['header']['phones'])
            self.assertIn('https://example.dev/portfolio',data['header']['links'])
            self.assertEqual(data['header']['email'],'person@example.org')
            self.assertEqual(data['header']['name'],'Example Person')

    def test_spacing_uses_identical_glyphs_and_preserves_columns_and_technology_names(self):
        layout = "  AI/MLInfrastructure: HuggingFaceTransformers, LangChain\n  Reduced latency approximately25%."
        plain = "AI/ML Infrastructure: HuggingFace Transformers, LangChain\nReduced latency approximately 25%."
        recovered = recover_pdf_spacing(layout, plain)
        self.assertIn("  AI/ML Infrastructure", recovered)
        self.assertIn("HuggingFace Transformers, LangChain", recovered)
        self.assertIn("approximately 25%", recovered)
        self.assertEqual(recovered.count("\n"), layout.count("\n"))
        self.assertEqual(recover_pdf_spacing("left column\nright column", "right column\nleft column"), "left column\nright column")
        self.assertEqual(recover_pdf_spacing("Node.js PyTorch TensorRT", "Node.js PyTorch TensorRT"), "Node.js PyTorch TensorRT")
        self.assertEqual(recover_pdf_spacing("Jane Doe", "Janet Doe"), "Jane Doe")

    def test_pdf_annotation_and_image_only_rejection(self):
        # Reuse a real text PDF fixture generated by the standard PDF library.
        from reportlab.pdfgen.canvas import Canvas
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'text.pdf'
            canvas=Canvas(str(path));canvas.drawString(30,800,'Example Person');canvas.drawString(30,780,'Portfolio');canvas.drawString(30,760,'(212) 555-0123');canvas.save()
            writer=PdfWriter(clone_from=path)
            writer.add_annotation(0,Link(rect=(30,770,150,795),url='https://example.dev/about'))
            with path.open('wb') as file: writer.write(file)
            data=json.loads(convert(path,Path(folder)).read_text())
            self.assertIn('https://example.dev/about',data['header']['links'])
            self.assertIn('(212) 555-0123',data['header']['phones'])
            blank=Path(folder)/'image.pdf';writer=PdfWriter();writer.add_blank_page(width=210,height=297)
            with blank.open('wb') as file:writer.write(file)
            with self.assertRaisesRegex(ValueError,'No extractable text'):convert(blank,Path(folder))

if __name__=='__main__': unittest.main()
