const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('./load-ts.cjs');
const { parseResumeMarkdown: parse, serializeResumeToMarkdown: serialize } = load('lib/resume-parser.ts');
const { resumeContentError } = load('lib/resume-validation.ts');
const source = fs.readFileSync(path.join(__dirname, 'fixtures/resume-regression.md'), 'utf8');
let text = source;
for (let i = 0; i < 4; i++) {
  const resume = parse(text);
  assert.equal(resume.education.length, 2);
  assert.equal(resume.education[0].degree, 'MS Human Centered Design & Engineering');
  assert.equal(resume.education[1].degree, 'B.Des Interaction Design');
  assert.equal(resume.experience[0].duration, 'Sept 2025 – Present');
  assert.equal(resume.experience[1].duration, 'Jun 2025 – Sept 2025');
  assert.equal(resume.personalInfo.extraContacts.filter(s => s === 'example.design').length, 1);
  assert.equal(resumeContentError(text), null);
  resume.summary = ['Changed summary without changing other sections.'];
  resume.sectionOrder.push(...(!resume.sectionOrder.includes('summary') ? ['summary'] : []));
  text = serialize(resume);
  assert(text.includes('Design Scholarship'));
  assert(text.includes('Mentored students'));
  assert(!text.includes('Engineering**'));
}
const legacy = parse('# Example\n## Education\nExample University                    Aug 2024 - Dec 2025\nMaster of Science in Data Science                    Buffalo, NY\nRelevant Coursework: Statistics,\nGenerative AI, Deep Learning.');
assert.equal(legacy.education[0].degree, 'Master of Science in Data Science');
assert(legacy.education[0].details.includes('Generative AI, Deep Learning.'));
assert.equal(parse(serialize(legacy)).education[0].details, legacy.education[0].details);
for (const invalid of ['# {"source_file":"resume.pdf"}', '# Example\n## Experience\n', '# Example\n## Experience\n### ### Engineer\n', source.replace('B.Des Interaction Design', '')]) {
  assert(resumeContentError(invalid), 'Known invalid control must fail validation');
}
assert.equal(resumeContentError(source), null, 'Valid positive control must pass');
assert.equal(resumeContentError(source.replace('# Example Candidate', '# [Example Candidate](https://example.design)')), null, 'A Markdown name link is not parser JSON');
fs.mkdirSync(path.join(__dirname, '../scratch/verification'), { recursive: true });
fs.writeFileSync(path.join(__dirname, '../scratch/verification/resume-model.json'), JSON.stringify(parse(source), null, 2));
console.log('RESUME_UI_REGRESSIONS_PASS');
