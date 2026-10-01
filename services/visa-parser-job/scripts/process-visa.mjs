import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const database = neon(process.env.DATABASE_URL);
const run = (sql, params = []) => database.query(sql, params);
const watch = process.argv.includes('--watch');
const executable = process.env.VISA_PARSER_BIN || fileURLToPath(new URL(
  `../visa-parser/target/release/visa-parser${process.platform === 'win32' ? '.exe' : ''}`,
  import.meta.url));

async function classify(jobs) {
  const parser = spawn(executable, { stdio: ['pipe', 'pipe', 'inherit'] });
  const output = [];
  const errors = [];
  parser.stdout.on('data', chunk => output.push(chunk));
  parser.on('error', error => errors.push(error));
  parser.stdin.on('error', error => errors.push(error));
  parser.stdin.end(jobs.map(job => JSON.stringify({
    id: job.id, title: job.title, description_hash: job.description_hash,
    description: job.description,
  })).join('\n') + '\n');
  const exit = await new Promise(resolve => parser.on('close', resolve));
  if (errors.length || exit !== 0) throw errors[0] || new Error(`Parser exited ${exit}`);
  const rows = Buffer.concat(output).toString('utf8').trim().split('\n').map(JSON.parse);
  if (rows.length !== jobs.length || rows.some((row, index) => row.id !== jobs[index].id))
    throw new Error('Parser returned incomplete or unordered batch');
  return rows;
}

async function cycle() {
  const jobs = await run(`WITH claimed AS (
    SELECT job_id FROM public.visa_processing_queue
    WHERE due_at <= now() AND attempts < 5
    ORDER BY due_at, job_id LIMIT 100 FOR UPDATE SKIP LOCKED
  ), leased AS (
    UPDATE public.visa_processing_queue q
    SET due_at = now() + interval '5 minutes', lease_token = gen_random_uuid(),
      attempts = q.attempts + 1
    FROM claimed c WHERE q.job_id = c.job_id
    RETURNING q.job_id, q.lease_token
  ) SELECT j.id, j.job_role_title AS title, j.job_description AS description,
      md5(j.job_description) AS description_hash, l.lease_token AS lease
    FROM leased l JOIN public.jobs j ON j.id = l.job_id ORDER BY j.id`);
  if (!jobs.length) return 0;
  let results;
  try { results = await classify(jobs); }
  catch (error) {
    await run(`UPDATE public.visa_processing_queue
      SET due_at = CASE WHEN attempts < 5 THEN now() + interval '1 minute' ELSE due_at END,
          last_error = $2
      WHERE (job_id, lease_token) IN (SELECT * FROM unnest($1::uuid[], $3::uuid[]))`,
    [jobs.map(job => job.id), String(error).slice(0, 300), jobs.map(job => job.lease)]);
    throw error;
  }
  const payload = results.map((result, index) => {
    const job = jobs[index];
    const evidence = result.evidence.join(' | ').slice(0, 4000) || null;
    const status = ['available', 'unavailable', 'conditional'].includes(result.sponsorship)
      && evidence ? result.sponsorship : 'unknown';
    return { id: result.id, lease: job.lease, description_hash: job.description_hash,
      status, evidence: status === 'unknown' ? null : evidence };
  });
  await run(`WITH input AS (
      SELECT * FROM jsonb_to_recordset($1::jsonb)
        AS x(id uuid, lease uuid, description_hash text, status text, evidence text)
    ), updated AS (
      UPDATE public.jobs j SET visa_sponsorship_status = i.status,
        visa_sponsorship_evidence = i.evidence,
        visa_sponsorship_description_hash = CASE WHEN i.status = 'unknown' THEN NULL ELSE i.description_hash END,
        visa_sponsorship_source = CASE WHEN i.status = 'unknown' THEN NULL ELSE 'jd_parser' END,
        visa_sponsorship_assessed_at = CASE WHEN i.status = 'unknown' THEN NULL ELSE now() END
      FROM input i JOIN public.visa_processing_queue q
        ON q.job_id = i.id AND q.lease_token = i.lease
      WHERE j.id = i.id AND md5(j.job_description) = i.description_hash
        AND (j.visa_sponsorship_source IS NULL OR j.visa_sponsorship_source = 'jd_parser')
      RETURNING j.id
    )
    DELETE FROM public.visa_processing_queue q USING input i
    WHERE q.job_id = i.id AND q.lease_token = i.lease`, [JSON.stringify(payload)]);
  return jobs.length;
}

do {
  try {
    const count = await cycle();
    if (count) console.log(`Processed ${count} jobs`);
    else if (watch) await delay(5000);
    if (!watch && !count) break;
  } catch (error) {
    console.error(error);
    if (!watch) process.exitCode = 1;
    if (!watch) break;
    await delay(30000);
  }
} while (true);
