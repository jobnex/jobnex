// This script requires the existing pg package from the application checkout.
// NODE_PATH can point to that checkout's node_modules; production needs no Node runtime.
const { Client } = require('pg');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const path = require('node:path');

async function main() {
  const reviewHost = process.argv[2];
  if (!reviewHost || !/^ep-[a-z0-9-]+\.c-\d+\.[a-z0-9-]+\.aws\.neon\.tech$/.test(reviewHost))
    throw Error('A direct Neon review-branch hostname is required');
  const secret = spawnSync('rtk', ['proxy', 'gcloud', 'secrets', 'versions', 'access', '1',
    '--secret=DB-secret', '--project=job-scout-508222'], { encoding: 'utf8', windowsHide: true });
  if (secret.status !== 0) throw Error('Cannot read database secret');
  const url = new URL(secret.stdout.trim());
  if (url.hostname.replace('-pooler.', '.') === reviewHost) throw Error('Review host must differ from production');
  url.hostname = reviewHost;
  const env = { ...process.env, DATABASE_URL: url.toString(), MAX_RUN_SECONDS: '1', BATCH_SIZE: '10' };
  url.searchParams.set('sslmode', 'verify-full');
  const binary = path.join(__dirname, 'target', 'debug', `experience-enricher${process.platform === 'win32' ? '.exe' : ''}`);
  const invoke = args => {
    const result = spawnSync('rtk', ['proxy', binary, ...args], { env, encoding: 'utf8', windowsHide: true, timeout: 90000 });
    if (result.status !== 0) {
      const allowed = ['database_error','configuration_or_input_error'];
      const category = allowed.find(c=>result.stderr && result.stderr.includes(c)) || 'execution_error';
      throw Error(`Worker integration execution failed: exit=${result.status}, code=${result.error?.code || 'none'}, category=${category}, mode=${args.join(',') || 'normal'}`);
    }
    const lines = result.stdout.trim().split(/\r?\n/).filter(line => line.startsWith('{'));
    return JSON.parse(lines.at(-1));
  };
  const client = new Client({ connectionString: url.toString() });
  await client.connect();
  const ids = Array.from({ length: 8 }, (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`);
  const fixtures = [
    ['3+ years of experience', null],
    ['Our company has 20 years of experience serving customers.', null],
    ['3 years of experience', 7],
    ['Preferred Qualifications:\n8 years of experience', null],
    ['5 years of experience', null],
    ['No prior experience required.', null],
    ['Minimum 6 months of relevant experience', null],
    ["Qualifications:\nBachelor's with 5 years experience or master's with 3 years experience", null],
  ];
  try {
    assert.equal(Number((await client.query('SELECT count(*) FROM public.jobs WHERE id=ANY($1::uuid[])', [ids])).rows[0].count), 0);
    invoke(['--migrate']);
    assert.equal((await client.query("SELECT is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='jobs' AND column_name='experience_details'")).rows[0].is_nullable, 'NO');
    for (let i = 0; i < ids.length; i++) {
      await client.query(`INSERT INTO public.jobs(id,job_role_title,job_description,company_name,location,employment_type,work_model,status,experience_required)
        VALUES($1,'Experience integration fixture',$2,'Integration fixture','Test','full_time','remote','published',$3)`,
      [ids[i], fixtures[i][0], fixtures[i][1]]);
    }
    const values = async () => (await client.query('SELECT experience_required FROM public.jobs WHERE id=ANY($1::uuid[]) ORDER BY id', [ids])).rows.map(r => r.experience_required);
    assert.ok((await client.query('SELECT experience_details FROM public.jobs WHERE id=ANY($1::uuid[])', [ids])).rows.every(r=>r.experience_details.status==='pending'));
    invoke(['--dry-run']);
    assert.deepEqual(await values(), [null,null,7,null,null,null,null,null]);
    invoke([]);
    assert.deepEqual(await values(), [3,null,7,null,5,0,null,null]);
    const details = (await client.query('SELECT experience_details FROM public.jobs WHERE id=ANY($1::uuid[]) ORDER BY id', [ids])).rows.map(r=>r.experience_details);
    assert.ok(details.every(d=>d && typeof d.status === 'string' && Array.isArray(d.requirements)));
    assert.equal(details[2].numeric_source, 'manual');
    assert.equal(details[2].effective_years, 7);
    assert.equal(details[3].status, 'preferred_only');
    assert.equal(details[6].minimum_months, 6);
    assert.equal(details[6].years, null);
    assert.equal(details[7].status, 'conditional_education');
    assert.equal(details[7].requirements.filter(r=>r.kind==='conditional').length, 2);
    assert.deepEqual(details[7].requirements.map(r=>r.condition).sort(), ['bachelors','masters']);
    assert.deepEqual(details[7].requirements.map(r=>r.minimum_months).sort((a,b)=>a-b), [36,60]);
    const stamp = (await client.query('SELECT processed_at FROM public.job_experience_processing WHERE job_id=$1', [ids[0]])).rows[0].processed_at.toISOString();
    invoke([]);
    assert.equal((await client.query('SELECT processed_at FROM public.job_experience_processing WHERE job_id=$1', [ids[0]])).rows[0].processed_at.toISOString(), stamp);
    await client.query('UPDATE public.jobs SET job_description=$2 WHERE id=$1', [ids[0], '5 years of experience']);
    await client.query('UPDATE public.jobs SET experience_required=9,job_description=$2 WHERE id=$1', [ids[2], '6 years of experience']);
    await client.query('UPDATE public.jobs SET job_description=$2 WHERE id=$1', [ids[4], 'Experience with SQL is useful.']);
    assert.equal((await client.query('SELECT experience_details FROM public.jobs WHERE id=$1', [ids[0]])).rows[0].experience_details.status, 'pending');
    invoke([]);
    assert.deepEqual(await values(), [5,null,9,null,null,0,null,null]);
    await client.query('UPDATE public.jobs SET job_description=$2 WHERE id=$1', [ids[0], '6 years of experience']);
    await client.query('BEGIN');
    await client.query('SELECT job_id FROM public.job_experience_processing WHERE job_id=$1 FOR UPDATE', [ids[0]]);
    invoke([]);
    assert.equal((await client.query('SELECT pending FROM public.job_experience_processing WHERE job_id=$1', [ids[0]])).rows[0].pending, true);
    await client.query('ROLLBACK');
    invoke([]);
    assert.equal((await values())[0], 6);
    const rows = (await client.query(`SELECT id,job_description AS description FROM public.jobs
      WHERE job_description ~* '\\m[0-9]+\\s*\\+?\\s*years?\\M' ORDER BY id LIMIT 1000`)).rows;
    const sample = spawnSync('rtk', ['proxy', binary, '--stdin'], {
      input: rows.map(r => JSON.stringify(r)).join('\n') + '\n', encoding: 'utf8', windowsHide: true,
    });
    assert.equal(sample.status, 0);
    const results = sample.stdout.trim().split(/\r?\n/).filter(l => l.startsWith('{')).map(JSON.parse);
    assert.equal(results.length, rows.length);
    const known = results.filter(r => r.result.years !== null);
    const record = { integration: 'passed', sampled: results.length, explicit: known.length,
      examples: known.slice(0, 12).map(r => ({ id:r.id, ...r.result })) };
    fs.writeFileSync(path.join(__dirname, 'verification.local.json'), JSON.stringify(record, null, 2));
    console.log(JSON.stringify({ integration:'passed', sampled:results.length, explicit:known.length }));
  } finally {
    await client.query('ROLLBACK');
    await client.query("DELETE FROM public.jobs WHERE id=ANY($1::uuid[]) AND company_name='Integration fixture'", [ids]);
    await client.end();
  }
}
main().catch(error => {
  console.error(error.name === 'AssertionError' || error.message.startsWith('Worker integration execution failed:') ? error.message : `integration verification failed (${error.code || error.name})`);
  process.exitCode = 1;
});
