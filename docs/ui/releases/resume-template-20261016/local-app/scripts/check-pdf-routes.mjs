// Run from the app root. --live exercises the real compiler/R2 with synthetic
// data and a mocked database. Never reads or changes customer records/credits.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import ts from 'typescript';
import * as aws from '@aws-sdk/client-s3';
const moduleRequire = createRequire(import.meta.url);
const live = process.argv.includes('--live');
let user = null;
let owns = true;
const userId = randomUUID(), jobId = randomUUID(), generationId = randomUUID();
const statements = [], keys = new Set();
let phase = 'initialization', compilerStatus = null, storageError = null;
const mocks = {
  '@/lib/auth/server': { getCurrentUser: async () => user },
  '@/lib/db': { pool: {
    query: async () => ({ rowCount: owns ? 1 : 0, rows: [] }),
    connect: async () => ({ release() {}, query: async (sql, values) => {
      statements.push(sql);
      if (sql.includes('SELECT g.id')) return { rows: [{ id: generationId }] };
      if (sql.includes('INSERT INTO user_job_resumes')) {
        assert.equal(values[0], userId);
        assert.equal(values[1], jobId);
        keys.add(values[3]);
      }
      return { rows: [] };
    } }),
  } },
};
const cache = new Map();
function load(file) {
  if (cache.has(file)) return cache.get(file);
  const exports = {};
  cache.set(file, exports);
  const source = ts.transpileModule(fs.readFileSync(path.resolve(file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(source, {
    exports, process, console, Buffer, Response, Request, URL, AbortSignal, Error,
    fetch: async (...args) => {
      const response = await fetch(...args);
      compilerStatus = response.status;
      return response;
    },
    require: name => mocks[name] || (name.startsWith('@/') ? load(name.slice(2) + '.ts')
      : name.startsWith('./') ? load(path.join(path.dirname(file), name + '.ts')) : moduleRequire(name)),
  }, { filename: file });
  return exports;
}

(async () => {
  const r2 = load('lib/storage/r2.ts');
  const originalSend = r2.r2Client.send.bind(r2.r2Client);
  // Track only newly created test keys, including temporary base/stale exports.
  r2.r2Client.send = async command => {
    if (command.input.Key && command instanceof aws.HeadObjectCommand) keys.add(command.input.Key);
    try { return await originalSend(command); }
    catch (error) { storageError = error.name; throw error; }
  };
  const exportRoute = load('app/api/resume/export/route.ts');
  const baseRoute = load('app/api/resume/base/route.ts');
  const post = body => new Request('http://localhost/api/resume/export', { method: 'POST', body: JSON.stringify(body) });
  const markdown = '# PDF Test Candidate\n+1 212 555 0101 | candidate@example.test\n\n## Experience\n### ### AI Engineer | Example Labs\n- Built a reliable service.\n\n## Skills\nLanguages: Python, SQL\n\n## Projects\n### Test Queue\n- Preserved every test task.\n';
  const input = { jobId, expectedGenerationId: generationId, markdown, templateId: 'modern-ivy' };
  assert.equal((await exportRoute.POST(post(input))).status, 401);
  assert.equal((await baseRoute.POST(post(input))).status, 401);
  user = { id: userId };
  assert.equal((await exportRoute.POST(post({ ...input, jobId: 'invalid' }))).status, 400);
  assert.equal((await exportRoute.POST(post({ ...input, templateId: 'invalid' }))).status, 400);
  assert.equal((await baseRoute.POST(post({ markdown: '', templateId: 'modern-ivy' }))).status, 400);
  owns = false;
  assert.equal((await exportRoute.POST(post(input))).status, 404);
  owns = true;
  assert.equal(statements.length, 0, 'Rejected requests must not mutate data');
  if (!live) {
    console.log('PDF ROUTE CONTRACT CHECKS PASSED: auth, malformed input, template and ownership guards.');
    return;
  }
  assert.ok(process.env.RESUME_COMPILER_URL && process.env.RESUME_COMPILER_SECRET);
  const templates = load('data/resume-templates.ts').RESUME_TEMPLATES;
  const results = [];
  try {
    for (const template of templates) {
      phase = template.id + ' base export';
      const base = await baseRoute.POST(post({ markdown, templateId: template.id }));
      assert.equal(base.status, 200, 'Temporary base PDF compile failed');
      assert.equal(base.headers.get('content-type'), 'application/pdf');
      const bytes = Buffer.from(await base.arrayBuffer());
      assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
      phase = template.id + ' application export';
      const exported = await exportRoute.POST(post({ ...input, templateId: template.id }));
      assert.equal(exported.status, 200, 'Owned application export failed');
      const result = await exported.json();
      const download = await fetch(result.downloadUrl);
      assert.equal(download.status, 200);
      assert.equal(Buffer.from(await download.arrayBuffer()).subarray(0, 5).toString(), '%PDF-');
      results.push({ template: template.id, temporaryBasePdf: true, applicationPdf: true });
    }
    phase = 'stale generation rejection';
    const before = statements.filter(sql => /^(INSERT|UPDATE)/.test(sql)).length;
    assert.equal((await exportRoute.POST(post({ ...input, expectedGenerationId: randomUUID() }))).status, 409);
    assert.equal(statements.filter(sql => /^(INSERT|UPDATE)/.test(sql)).length, before, 'Stale export must not save data');
    console.log('LIVE PDF ROUTES PASSED: ' + JSON.stringify(results) + '; stale generation blocked; no customer DB/credits changed.');
  } finally {
    for (const key of keys) {
      assert.ok(key.startsWith(`resumes/${userId}/${jobId}/`), 'Cleanup must remain in this test fixture namespace');
      await originalSend(new aws.DeleteObjectCommand({ Bucket: r2.R2_BUCKET_NAME, Key: key }));
    }
  }
})().catch(error => {
  console.error('PDF verification failed at ' + phase + ': ' + error.name + '; compiler status=' + compilerStatus + '; storage error=' + storageError);
  if (error.name === 'AssertionError') console.error(error.message);
  process.exitCode = 1;
});
