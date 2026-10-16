/* eslint-disable @typescript-eslint/no-require-imports -- Offline UI integration check. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const jsx = require('react/jsx-runtime');
function load(file, mocks = {}, globals = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, { exports, require: name => {
    if (name in mocks) return mocks[name];
    if (['react', 'react/jsx-runtime', 'crypto', 'node:crypto'].includes(name)) return require(name);
    throw new Error('Unexpected dependency in offline test: ' + name);
  }, console, ...globals });
  return exports;
}
const templates = load('data/resume-templates.ts');
const contacts = load('lib/resume-contacts.ts');
const parser = load('lib/resume-parser.ts', { './resume-contacts': contacts });
const pages = load('components/A4ResumePages.tsx');
const sheet = load('components/ResumeSheet.tsx', {
  '@/lib/resume-parser': parser, '@/lib/resume-contacts': contacts, '@/components/A4ResumePages': pages,
});
const markdown = '# Test Candidate\n+1 212-555-0100 | candidate@example.com | https://linkedin.com/in/test-candidate\n\n## Technical Skills\n**Languages:** Python, SQL\n\n## Professional Experience\n### Engineer | Example One | NYC | 2022 - 2024\n- Built a service.\n### ### AI Engineer | Example Two | Remote | 2024 - Present\n- Tested an API.\n\n## Technical Projects\n### Parser Project | Python | 2024\n- Preserved source details.\n';
function find(node, predicate) {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) { for (const child of node) { const found = find(child, predicate); if (found) return found; } return null; }
  return predicate(node) ? node : find(node.props?.children, predicate);
}
async function main() {
  const parsed = parser.parseResumeMarkdown(markdown);
  assert.equal(parsed.experience.length, 2);
  assert.equal(parsed.experience[1].company, 'Example Two');
  assert.equal(parsed.experience[1].role, 'AI Engineer');
  assert.equal(parsed.projects.length, 1);
  for (const template of templates.RESUME_TEMPLATES) {
    const html = renderToStaticMarkup(React.createElement(sheet.ResumeSheet, { markdown, themeId: template.themeId }));
    for (const text of ['Example One', 'Example Two', 'Parser Project', '212-555-0100', 'linkedin.com/in/test-candidate']) assert.ok(html.includes(text), template.id + ': ' + text);
    assert.ok(!html.includes('### AI Engineer'), 'Nested heading markers must not display');
  }
  assert.deepEqual(Array.from(pages.resumePageEnds([70, 10, 40], [false, true, false], 100)), [1, 3]);

  const columns = new Proxy({}, { get: (_, name) => String(name) });
  let rows = [], writes = 0, selection;
  const query = { from() { return this; }, innerJoin() { return this; }, leftJoin() { return this; }, where() { return this; },
    orderBy() { return Promise.resolve(rows); }, limit() { return Promise.resolve(rows); } };
  const db = { select(fields) { selection = fields; return query; }, insert() { writes++; throw new Error('Read path attempted to write'); } };
  const sql = (parts, ...values) => parts.reduce((s, p, i) => s + p + (values[i] ?? ''), '');
  const actions = load('app/actions/resume-applications.ts', {
    '@/lib/db': { db }, '@/lib/db/schema/applications': { resumeGenerationRequests: columns, resumeGenerations: columns, applications: columns, userJobResumes: columns },
    '@/lib/db/schema/preferences': { userJobPreferences: columns }, '@/lib/db/schema/jobs': { jobs: columns }, '@/lib/db/schema/countries': { countries: columns },
    '@/data/resume-templates': templates, '@/lib/auth/server': { getCurrentUser: async () => ({ id: 'test-user' }) },
    'drizzle-orm': { eq() {}, and() {}, desc() {}, sql }, 'next/cache': { revalidatePath() {} }, '@/lib/job-utils': { mapDbRowToJob: row => row },
  });
  const base = { requestId: 'request', jobId: 'job', createdAt: new Date(), genMarkdown: '# Retained historical text', genAudit: {}, userJobMarkdown: '# Stale mirror' };
  rows = [{ ...base, requestStatus: 'failed', creditState: 'released' }];
  let result = await actions.listResumeApplications();
  assert.equal(result.success, true); assert.equal(result.applications[0].markdown, null); assert.equal(result.applications[0].hasDraft, false);
  assert.match(selection.genMarkdown, /resume_generation_is_publishable/);
  assert.match(selection.genMarkdown, /manual_edit,markdown/);
  rows = [{ ...base, requestStatus: 'completed', creditState: 'consumed', genMarkdown: '# Verified edited draft' }];
  result = await actions.listResumeApplications();
  assert.equal(result.applications[0].markdown, '# Verified edited draft'); assert.equal(result.applications[0].hasDraft, true); assert.equal(writes, 0);

  let sent, prints = 0;
  const mockReact = { ...React, useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}], useEffect() {}, useRef: () => ({ current: null }) };
  const modal = load('components/ResumeModal.tsx', {
    react: mockReact, 'lucide-react': new Proxy({}, { get: (_, name) => String(name) }), '@/components/ResumeSheet': sheet,
    '@/store/useResumeStore': { useResumeStore: () => ({ selectedTemplateId: 'mit-capd', resumeMarkdown: '# Store fallback' }) },
    '@/data/resume-templates': templates, '@/lib/resumeApi': { downloadMarkdownFile() {} },
    sonner: { toast: { success() {}, error(error) { throw new Error(error); } } }, '@/lib/utils/scrollLock': { lockBodyScroll() {}, unlockBodyScroll() {} },
  }, {
    window: { print() { prints++; } }, document: { createElement: () => ({ click() {}, remove() {} }), body: { appendChild() {} } },
    fetch: async (url, options) => { sent = { url, body: JSON.parse(options.body) }; return { ok: true, json: async () => ({ downloadUrl: 'https://example.invalid/pdf' }) }; },
    setTimeout() {}, URL,
  });
  const tree = modal.ResumeModal({ isOpen: true, onClose() {}, jobId: 'job', expectedGenerationId: 'generation', initialMarkdown: markdown, templateId: 'mit-capd' });
  const button = find(tree, node => node.type === 'button' && node.props.title === 'Compile and export vector PDF via Cloud Run Typst service');
  assert.ok(button); await button.props.onClick();
  assert.equal(sent.url, '/api/resume/export'); assert.equal(sent.body.markdown, markdown); assert.equal(sent.body.expectedGenerationId, 'generation'); assert.equal(prints, 0);
  console.log('PASS: four templates retain contacts/employers/projects; page boundaries; failed draft hidden; verified edits preferred; reads do not backfill; PDF sends current Markdown to backend.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
