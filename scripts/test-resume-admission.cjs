const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

async function main() {
  const rows = [];
  let balance = 8, holds = 0, injectRetry = false;
  const userId = 'synthetic-user';
  const resume = { id: 'resume', markdown: '# Synthetic resume' };
  const result = (data = []) => ({ rows: data, rowCount: data.length });
  const client = { release() {}, async query(sql, values = []) {
    const text = sql.replace(/\s+/g, ' ');
    if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(text)) return result();
    if (text.includes('WHERE user_id=$1 AND idempotency_key=$2')) return result(rows.filter(row => row.user_id === values[0] && row.key === values[1]));
    if (text.startsWith('SELECT job_description')) return result([{ job_description: 'Synthetic job' }]);
    if (text.startsWith('INSERT INTO wallets')) return result();
    if (text.startsWith('SELECT balance')) {
      if (injectRetry) { rows.push({ id: 'concurrent-id', user_id: userId, key: 'race', job: 'race-job', status: 'queued', credit_state: 'held' }); injectRetry = false; }
      return result([{ balance }]);
    }
    if (text.includes("status IN ('queued','running')")) {
      assert.match(text, /job_id=\$2/);
      return result(rows.filter(row => row.user_id === values[0] && row.job === values[1] && ['queued', 'running'].includes(row.status)));
    }
    if (text.startsWith('UPDATE wallets')) { balance--; return result(); }
    if (text.startsWith('INSERT INTO credit_transactions')) { holds++; return result(); }
    if (text.startsWith('INSERT INTO resume_generation_requests')) {
      rows.push({ id: values[0], user_id: values[1], job: values[2], key: values[4], status: 'queued', credit_state: 'held' }); return result();
    }
    if (text.startsWith('INSERT INTO resume_dispatch_outbox')) return result();
    throw Error('Unexpected query: ' + text);
  }};
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync('lib/resume-tailoring.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(code, { exports, require: name => name === '@/lib/db' ? { pool: { connect: async () => client } } : name === '@/lib/resume-content' ? { resumeText: () => '' } : require(name) });
  const enqueue = exports.enqueueTailoring;
  const first = await enqueue(userId, 'job-a', resume, 'key-a');
  const second = await enqueue(userId, 'job-b', resume, 'key-b');
  const third = await enqueue(userId, 'job-c', resume, 'key-c');
  assert.equal(new Set([first.id, second.id, third.id]).size, 3);
  assert.equal(balance, 5); assert.equal(holds, 3);
  assert.equal((await enqueue(userId, 'job-a', resume, 'new-key')).id, first.id);
  assert.equal((await enqueue(userId, 'job-a', resume, 'key-a')).id, first.id);
  injectRetry = true;
  assert.equal((await enqueue(userId, 'race-job', resume, 'race')).id, 'concurrent-id');
  assert.equal(holds, 3); assert.equal(balance, 5);
  rows[0].status = 'completed';
  assert.notEqual((await enqueue(userId, 'job-a', resume, 'regenerate')).id, first.id);
  assert.equal(holds, 4);
  balance = 0;
  await assert.rejects(enqueue(userId, 'job-d', resume, 'no-credit'), /Insufficient credits/);
  assert.equal(holds, 4);
  console.log('PASS: distinct jobs queue with independent holds; same-job/key and concurrent retry deduplicate; completed jobs regenerate; no-credit rejects; no DB or AI calls');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
