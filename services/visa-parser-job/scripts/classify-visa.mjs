import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { rename, rm } from 'node:fs/promises';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { neon } from '@neondatabase/serverless';

const outputPath = process.argv[2];
if (!outputPath?.endsWith('.jsonl') || !process.env.DATABASE_URL) {
  console.error('Usage: DATABASE_URL=... node scripts/classify-visa.mjs output.jsonl');
  process.exit(2);
}

const query = neon(process.env.DATABASE_URL);
const parser = spawn('cargo', ['run', '--quiet', '--offline', '--release', '--manifest-path', 'visa-parser/Cargo.toml'], {
  cwd: new URL('../', import.meta.url),
  stdio: ['pipe', 'pipe', 'inherit'],
});
const candidatesPath = outputPath.replace(/\.jsonl$/, '-available.csv');
const tempOutput = `${outputPath}.tmp`;
const tempCandidates = `${candidatesPath}.tmp`;
const output = createWriteStream(tempOutput, { flags: 'w' });
const candidates = createWriteStream(tempCandidates, { flags: 'w' });
candidates.write('id,title,company,description_hash,evidence\n');
const csv = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
let count = 0;
let available = 0;
let conditional = 0;
let parserError;
parser.on('error', (error) => { parserError = error; });

const readResults = (async () => {
  for await (const line of createInterface({ input: parser.stdout })) {
    const row = JSON.parse(line);
    count++;
    if (row.sponsorship === 'available') {
      available++;
      candidates.write([row.id, row.title, row.company, row.description_hash, row.evidence.join(' | ')].map(csv).join(',') + '\n');
    } else if (row.sponsorship === 'conditional') {
      conditional++;
    }
    if (row.evidence.length) {
      if (!output.write(`${line}\n`)) await once(output, 'drain');
    }
  }
})();

try {
  let lastId = '00000000-0000-0000-0000-000000000000';
  while (true) {
    const rows = await query.query(`SELECT id,job_role_title AS title,company_name AS company,job_description AS description,md5(job_description) AS description_hash
      FROM public.jobs WHERE id > $1::uuid ORDER BY id LIMIT 500`, [lastId]);
    if (!rows.length) break;
    for (const row of rows) {
      if (!parser.stdin.write(`${JSON.stringify(row)}\n`)) await once(parser.stdin, 'drain');
    }
    lastId = rows.at(-1).id;
  }
  parser.stdin.end();
  await readResults;
  const [code] = await once(parser, 'close');
  if (parserError || code !== 0) throw parserError || new Error(`Rust parser exited ${code}`);
  const completed = Promise.all([once(output, 'finish'), once(candidates, 'finish')]);
  output.end();
  candidates.end();
  await completed;
  await rename(tempOutput, outputPath);
  await rename(tempCandidates, candidatesPath);
  console.log(`Scanned ${count} jobs; ${available} available, ${conditional} conditional; evidence: ${outputPath}; role list: ${candidatesPath}`);
} catch (error) {
  parser.kill();
  output.destroy();
  candidates.destroy();
  await Promise.all([rm(tempOutput, { force: true }), rm(tempCandidates, { force: true })]);
  console.error(error);
  process.exitCode = 1;
}
