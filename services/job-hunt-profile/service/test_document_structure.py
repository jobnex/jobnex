import unittest
from service.document_structure import experience_entries,education_entries,form_details
from service.resume_content import markdown_from
from scripts.resume_to_json import resume_details,extract_pdf_page

class DocumentStructureTests(unittest.TestCase):
    def test_role_below_company_and_date_is_metadata(self):
        entry=experience_entries('Example Co  Sep 2024 – Present\nAI Engineer  New York, NY\n- Built APIs.')[0]
        self.assertEqual(entry['title'],'AI Engineer')
        self.assertEqual(entry['location'],'New York, NY')
        self.assertEqual(entry['bullets'],['Built APIs.'])

    def test_dates_and_company_stay_with_their_own_role(self):
        raw='Designer @ Example Co  Sep 2025\n- Built a tool.\n\nOther Co / Engineer\nJan. 2020 - Present | Remote\n- Shipped APIs.'
        jobs=experience_entries(raw)
        self.assertEqual([(x['company'],x['title'],x['dates']) for x in jobs],
            [('Example Co','Designer','Sep 2025'),('Other Co','Engineer','Jan. 2020 - Present')])
        details=form_details({'experience':jobs})
        self.assertEqual(details['experienceHistory'][1]['startDate'],'Jan. 2020')
        self.assertEqual(details['experienceHistory'][1]['endDate'],'Present')
        self.assertIn('Jan. 2020 – Present',markdown_from(details,edited=True))
        self.assertIn('### Engineer\n**Other Co** | Jan. 2020 – Present',markdown_from(details,edited=True))

    def test_education_separates_school_degree_and_graduation_date(self):
        rows=education_entries('Example University  Sep 2022 – Jun 2026\nBachelor of Science\nOther College\nMS Design\nMarch 2027')
        self.assertEqual(len(rows),2)
        self.assertEqual(rows[0]['college'],'Example University')
        self.assertEqual(rows[0]['startDate'],'Sep 2022')
        self.assertEqual(rows[0]['endDate'],'Jun 2026')
        self.assertEqual(rows[1]['college'],'Other College')
        self.assertEqual(rows[1]['endDate'],'March 2027')
        md=markdown_from({'educationHistory':rows},edited=True)
        self.assertIn('**Example University** —\n*Bachelor of Science* | Sep 2022 – Jun 2026',md)

    def test_shared_institution_name_does_not_create_a_second_degree(self):
        rows=education_entries('Business School,  Honours in Computer Science\nExample University  Scholarship ($10,000)')
        self.assertEqual(len(rows),1)
        self.assertEqual(rows[0]['college'],'Business School, Example University')
        self.assertIn('Scholarship',rows[0]['details'])
        self.assertEqual(rows[0]['endDate'],'')

    def test_grade_is_not_part_of_degree_or_date(self):
        entry=education_entries('Example University\nM.Des | CPI: 9.16 / 10')[0]
        self.assertEqual(entry['degree'],'M.Des')
        self.assertEqual((entry['grade'],entry['maxGrade']),('9.16','10'))
        self.assertEqual(entry['endDate'],'')
        self.assertIn('CPI: 9.16 / 10',markdown_from({'educationHistory':[entry]},edited=True))

    def test_implicit_education_cards_and_header_summary(self):
        details=resume_details('Test Person\nProduct Designer\nExperienced designer building useful interfaces.\nuser@example.com\nExample University  Other College\nMS Design  B.Des Design\nExperience\nAcme / Designer\nJan 2024 - Present\n- Built tools.')
        self.assertEqual(len(details['educationHistory']),2)
        self.assertEqual(details['header']['name'],'Test Person')
        self.assertNotIn('Example University',details['header'].get('additional_contacts',[]))
        self.assertIn('Experienced designer',details['summary'])

    def test_layout_failure_keeps_plain_text_extracted_before_failure(self):
        class Page(dict):
            def extract_text(self,**kwargs):
                if kwargs:raise ZeroDivisionError()
                return 'Retained original text'
        self.assertEqual(extract_pdf_page(Page({'/Contents':True})),'Retained original text')
