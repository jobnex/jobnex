const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('./load-ts.cjs');
const { resumeDigest, resumeReviewError } = load('lib/resume-review.ts');
const markdown = fs.readFileSync(path.join(__dirname, 'fixtures/resume-regression.md'), 'utf8');
const userId = '11111111-1111-4111-8111-111111111111';
const jobId = '22222222-2222-4222-8222-222222222222';
const id = '33333333-3333-4333-8333-333333333333';
const generation = { id, status: 'completed', auditJson: {} };
assert(resumeReviewError({ ...generation, status: 'needs_review' }, id, markdown));
const approved = { ...generation, status: 'needs_review', auditJson: {
  human_review: { generation_id: id, markdown_sha256: resumeDigest(markdown) },
} };
assert.equal(resumeReviewError(approved, id, markdown), null);
assert(resumeReviewError(approved, id, markdown + '\nChanged'));
assert(resumeReviewError(generation, 'different', markdown));

function harness(options = {}) {
  const events = [];
  let selects = options.rows || [{ id: jobId, title: 'Designer', company: 'Example' }, options.generation || generation,
    options.concurrent || options.generation || generation, { r2ObjectKey: 'old.pdf' }];
  const db = {
    select() { const chain = { from() { return chain; }, where() { return chain; }, orderBy() { return chain; }, limit() { return Promise.resolve([selects.shift()].filter(Boolean)); } }; return chain; },
    insert() { return { values(value) { events.push(['insert', value]); return { onConflictDoUpdate() { return Promise.resolve(); } }; } }; },
    transaction(callback) { return callback(db); },
  };
  const schema = Object.fromEntries(['userJobResumes', 'resumeGenerations', 'jobs'].map(table => [table, new Proxy({}, { get: (_, key) => table + '.' + String(key) })]));
  const route = load('app/api/resume/export/route.ts', {
    'next/server': { NextResponse: { json: (body, options) => new Response(JSON.stringify(body), { status: options?.status || 200 }) } },
    '@/lib/auth/server': { getCurrentUser: async () => options.unauthorized ? null : { id: userId } },
    '@/lib/db': { db }, '@/lib/db/schema': schema,
    'drizzle-orm': { eq() {}, and() {}, desc() {} },
    '@/lib/storage/r2': {
      R2_BUCKET_NAME: 'test',
      r2Client: { async send(command) {
        events.push(['r2', command.constructor.name]);
        if (command.constructor.name === 'HeadObjectCommand') return { ContentLength: 12345, ContentType: 'application/pdf' };
        if (command.constructor.name === 'GetObjectCommand') return { Body: { transformToByteArray: async () => Buffer.from('%PDF-') } };
        return {};
      } },
      generateResumeUploadUrl: async () => ({ uploadUrl: 'https://example.r2.cloudflarestorage.com/upload', objectKey: 'new.pdf' }),
      generateResumeDownloadUrl: async () => 'https://example.test/download',
    },
    fetch: async url => url.endsWith('/health') ? Response.json({ resumeContractVersion: options.contract || 2 }) : Response.json({ uploaded: true, fileSize: 999 }),
  });
  return { route, events };
}

(async () => {
  const previous = { url: process.env.RESUME_COMPILER_URL, secret: process.env.RESUME_COMPILER_SECRET };
  process.env.RESUME_COMPILER_URL = 'https://compiler.example.test'; process.env.RESUME_COMPILER_SECRET = 'synthetic-test-only';
  try {
    for (const [options, patch, expected] of [
      [{}, {}, 200],
      [{ unauthorized: true }, {}, 401],
      [{}, { markdown: '# {"source_file":"bad.pdf"}' }, 422],
      [{}, { expectedGenerationId: '44444444-4444-4444-8444-444444444444' }, 409],
      [{ generation: { ...generation, status: 'needs_review' } }, {}, 409],
      [{ generation: approved }, {}, 200],
      [{ contract: 1 }, {}, 503],
      [{ concurrent: { ...generation, id: 'new-generation' } }, {}, 503],
    ]) {
      const { route, events } = harness(options);
      const response = await route.POST(new Request('https://local.test/api/resume/export', { method: 'POST', body: JSON.stringify({ jobId, markdown, templateId: 'mit-capd', expectedGenerationId: id, ...patch }) }));
      assert.equal(response.status, expected, JSON.stringify(options));
      if (expected === 200) {
        assert.equal((await response.json()).fileSize, 12345, 'Use actual R2 size');
        assert.equal(events.filter(event => event[0] === 'insert').length, 1);
      } else assert(!events.some(event => event[0] === 'insert'), 'Rejected exports must never save');
      if (options.concurrent) assert(events.some(event => event[1] === 'DeleteObjectCommand'), 'Clean up rejected upload');
    }
    const saved = { markdown, r2ObjectKey: 'old.pdf', templateId: 'mit-capd', exportedAt: new Date('2026-10-01'), updatedAt: new Date('2026-10-02') };
    const stale = harness({ rows: [saved, generation] });
    const response = await stale.route.GET(new Request(`https://local.test/api/resume/export?jobId=${jobId}&expectedGenerationId=${id}`));
    assert.equal((await response.json()).hasExportedPdf, false);
    const drafts = new Map();
    let currentUser = 'first-user';
    const baseActions = load('app/actions/resume.ts', {
      '@/lib/auth/server': { getCurrentUser: async () => currentUser ? { id: currentUser } : null },
      '@/lib/db': { pool: { async query(sql, values) {
        assert(sql.includes('user_id=$1') || sql.includes('VALUES($1'), 'Every draft operation must bind the current user');
        if (sql.startsWith('SELECT')) return { rows: [{ payload: drafts.get(values[0]) }] };
        drafts.set(values[0], JSON.parse(values[1])); return { rows: [] };
      } } },
    });
    assert((await baseActions.saveResumePayloadLocallyServer({markdown, templateId:'mit-capd'})).success);
    currentUser = 'second-user';
    assert.equal((await baseActions.fetchResumePayloadLocallyServer()).success, false, 'A different user must not receive the previous draft');
    currentUser = null;
    assert.equal((await baseActions.saveResumePayloadLocallyServer({markdown})).success, false);
    assert.equal((await baseActions.fetchResumePayloadLocallyServer()).success, false);
    let backgroundSaves = 0;
    const { useResumeStore } = load('store/useResumeStore.ts', {
      '@/lib/resumeApi': { saveResumePayloadLocally: async () => { backgroundSaves++; return { success: true }; } },
    });
    assert.equal(useResumeStore.getState().resumeMarkdown, '');
    useResumeStore.getState().setSelectedTemplateId('modern-ivy');
    assert.equal(backgroundSaves, 0, 'Selecting a template must not overwrite a resume draft');
    const mutationEvents = [];
    const tables = Object.fromEntries(['jobs', 'userJobPreferences', 'userJobResumes', 'resumeGenerationRequests', 'resumeGenerations'].map(table => [table, new Proxy({}, { get: (_, key) => table + '.' + String(key) })]));
    const selectRows = [{ ...generation, status: 'needs_review' }, { id: 'saved', markdown: markdown.replace('Example Motors', 'Old Motors'), templateId: 'mit-capd', r2ObjectKey: 'old.pdf' }];
    const mutations = {
      select() { const chain = { from() { return chain; }, where() { return chain; }, orderBy() { return chain; }, limit() { return Promise.resolve([selectRows.shift()]); } }; return chain; },
      insert() { return { values(value) { mutationEvents.push(['save', value]); return { onConflictDoUpdate() { return Promise.resolve(); } }; } }; },
      update(table) { return { set(value) { mutationEvents.push(['update', table, value]); return { where() { return Promise.resolve(); } }; } }; },
      transaction(callback) { return callback(mutations); },
    };
    const actions = load('app/actions/tailored-resume.ts', {
      '@/lib/auth/server': { getCurrentUser: async () => ({ id: userId }) },
      '@/lib/db': { db: mutations }, '@/lib/db/schema': tables,
      '@/app/actions/credits': { getCredits: async () => ({ balance: 0 }) },
      '@/lib/active-resume': { activeResumeId: () => null },
      'next/cache': { revalidatePath() {} }, 'next/headers': { cookies: async () => ({ toString: () => '' }) },
      'drizzle-orm': { eq() {}, and() {}, sql() {} },
    });
    assert((await actions.updateTailoredResumeMarkdown(jobId, markdown, 'mit-capd', id)).success);
    const savedEdit = mutationEvents.find(event => event[0] === 'save')[1];
    assert.equal(savedEdit.status, 'draft', 'Editing never implicitly approves a review draft');
    assert.equal(savedEdit.r2ObjectKey, null, 'Changed edits must invalidate the old PDF');
    assert(!mutationEvents.some(event => event[1] === tables.resumeGenerationRequests), 'Saving never erases review status');
    console.log('RESUME_EXPORT_REGRESSIONS_PASS');
  } finally {
    for (const [key, value] of [['RESUME_COMPILER_URL', previous.url], ['RESUME_COMPILER_SECRET', previous.secret]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
