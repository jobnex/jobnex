import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
const require = createRequire(import.meta.url), ts = require('typescript');
const dev = JSON.parse(await fs.readFile('scratch/dev-db.json', 'utf8'));
const pool = new Pool({ connectionString: dev.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const userId = randomUUID();
let signedIn = true, db;
const cache = new Map();
async function load(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file);
  const exports = {}; cache.set(file, exports);
  const source = ts.transpileModule(await fs.readFile(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const dependencies = {};
  for (const match of source.matchAll(/require\("([^"\n]+)"\)/g)) {
    const name = match[1];
    if (name === '@/lib/db') dependencies[name] = { db, pool };
    else if (name === '@/lib/auth/server') dependencies[name] = { getCurrentUser: async () => signedIn ? { id: userId } : null };
    else if (name === 'next/cache') dependencies[name] = { revalidatePath() {} };
    else if (name.startsWith('@/') || name.startsWith('.')) {
      let target = name.startsWith('@/') ? path.resolve(name.slice(2)) : path.resolve(path.dirname(file), name);
      try { await fs.access(target + '.ts'); target += '.ts'; }
      catch { target = path.join(target, 'index.ts'); }
      dependencies[name] = await load(target);
    }
  }
  vm.runInNewContext(source, { exports, module: { exports }, require: name => dependencies[name] ?? require(name), process, console, Date }, { filename: file });
  return exports;
}
const plain = value => JSON.parse(JSON.stringify(value));
try {
  const schema = await load('lib/db/schema/index.ts'); db = drizzle(pool, { schema });
  const helpers = await load('lib/preferences-confirmation.ts');
  const old = { skills: ['SQL'], isConfirmed: true, confirmedAt: '2026-09-01', lastConfirmedPreferences: { skills: ['SQL'] } };
  const pending = plain(helpers.pendingPreferences(old, { skills: ['Python'], isConfirmed: true, confirmedAt: 'bad', lastConfirmedPreferences: {} }));
  assert.equal(pending.isConfirmed, false); assert.equal(pending.confirmedAt, old.confirmedAt);
  assert.deepEqual(pending.lastConfirmedPreferences, old.lastConfirmedPreferences);
  assert.equal(helpers.samePreferences({ skills: ['Python'] }, old.lastConfirmedPreferences), false);
  assert.equal(helpers.samePreferences({ skills: ['SQL'] }, old.lastConfirmedPreferences), true);
  const actions = await load('app/actions/preferences.ts');
  const input = { country: 'us', cities: ['Seattle, WA'], skills: ['SQL'], domains: ['Backend Engineer'] };
  signedIn = false; assert.equal((await actions.confirmUserJobPreferences(input)).success, false);
  signedIn = true;
  let result = await actions.confirmUserJobPreferences(input);
  assert.equal(result.success, true); const confirmed = plain(result.data.preferences);
  assert.equal(confirmed.isConfirmed, true); assert.ok(Date.parse(confirmed.confirmedAt));
  assert.deepEqual(confirmed.lastConfirmedPreferences.skills, ['SQL']);
  result = await actions.saveUserJobPreferences({ ...input, skills: ['Python'], isConfirmed: true, confirmedAt: 'forged', lastConfirmedPreferences: {} });
  assert.equal(result.success, true); let saved = plain(result.data.preferences);
  assert.equal(saved.isConfirmed, false); assert.equal(saved.confirmedAt, confirmed.confirmedAt);
  assert.deepEqual(saved.lastConfirmedPreferences, confirmed.lastConfirmedPreferences);
  const python = spawnSync('python', ['-c', 'from service.confirmation import PENDING_UPDATE; print(PENDING_UPDATE)'], { cwd: 'services/job-hunt-profile', encoding: 'utf8' });
  assert.equal(python.status, 0, python.stderr);
  // Execute the exact Python service upsert expression in isolated Neon.
  const update = { skills: ['Rust'], isConfirmed: true, confirmedAt: 'forged', lastConfirmedPreferences: { skills: ['Rust'] } };
  await pool.query(`INSERT INTO user_job_preferences(user_id,preferences) VALUES($1,$2::jsonb) ON CONFLICT(user_id) DO UPDATE SET preferences=${python.stdout}`, [userId, JSON.stringify(update)]);
  saved = (await pool.query('SELECT preferences FROM user_job_preferences WHERE user_id=$1', [userId])).rows[0].preferences;
  assert.equal(saved.isConfirmed, false); assert.equal(saved.confirmedAt, confirmed.confirmedAt);
  assert.deepEqual(saved.lastConfirmedPreferences, confirmed.lastConfirmedPreferences);
  // Legacy baseline missing or explicitly null initializes from pre-update fields.
  await pool.query('UPDATE user_job_preferences SET preferences=$2::jsonb WHERE user_id=$1', [userId, JSON.stringify({ skills: ['Legacy'], confirmedAt: 'old', lastConfirmedPreferences: null })]);
  await pool.query(`INSERT INTO user_job_preferences(user_id,preferences) VALUES($1,$2::jsonb) ON CONFLICT(user_id) DO UPDATE SET preferences=${python.stdout}`, [userId, JSON.stringify({ skills: ['New'] })]);
  saved = (await pool.query('SELECT preferences FROM user_job_preferences WHERE user_id=$1', [userId])).rows[0].preferences;
  assert.deepEqual(saved.lastConfirmedPreferences, { skills: ['Legacy'] }); assert.equal(saved.confirmedAt, 'old');
  result = await actions.confirmUserJobPreferences({ ...input, skills: ['New'] });
  assert.equal(result.success, true); assert.equal(result.data.preferences.isConfirmed, true);
  assert.deepEqual(plain(result.data.preferences.lastConfirmedPreferences.skills), ['New']);
  assert.equal((await actions.confirmUserJobPreferences({ ...input, cities: ['A', 'B', 'C', 'D'] })).success, false);
  const tests = spawnSync('python', ['-m', 'unittest', 'service.test_main'], { cwd: 'services/job-hunt-profile', encoding: 'utf8', env: { ...process.env, JOB_HUNT_SERVICE_SECRET: 'confirmation-test-only' } });
  assert.equal(tests.status, 0, tests.stderr);
  console.log('CONFIRMATION CONTRACT VERIFIED');
} finally {
  await pool.query('DELETE FROM user_job_preferences WHERE user_id=$1', [userId]);
  await pool.end();
}
