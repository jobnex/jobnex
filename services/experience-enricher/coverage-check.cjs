// Read-only corpus comparison. Credentials stay in memory; reports contain counts only.
const { Client } = require('pg');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
async function main() {
  const secret = spawnSync('rtk', ['proxy', 'gcloud', 'secrets', 'versions', 'access', '1',
    '--secret=experience-enricher-database-url', '--project=job-scout-508222'], {encoding:'utf8', windowsHide:true});
  if (secret.status !== 0) throw Error('Secret access failed');
  const url = new URL(secret.stdout.trim());
  url.searchParams.set('sslmode', 'verify-full');
  const client = new Client({connectionString:url.toString()});
  await client.connect();
  const report = {scanned:0, previous:0, extracted:0, newlyExtracted:0, cleared:0, reasons:{}};
  let after = '00000000-0000-0000-0000-000000000000';
  const sample = process.argv.includes('--sample');
  try {
    for (;;) {
      const rows = (await client.query(sample
        ? `SELECT id,job_description AS description,experience_required FROM public.jobs WHERE status='published'
          AND experience_required IS NULL ORDER BY md5(id::text) LIMIT 500`
        : `SELECT id,job_description AS description,experience_required FROM public.jobs
        WHERE status='published' AND id>$1 ORDER BY id LIMIT 1000`, sample ? [] : [after])).rows;
      if (!rows.length) break;
      const run = spawnSync(path.join(__dirname,'target','release',`experience-enricher${process.platform === 'win32' ? '.exe' : ''}`), ['--stdin'], {
        input:rows.map(row=>JSON.stringify(row)).join('\n')+'\n',encoding:'utf8',windowsHide:true,maxBuffer:64*1024*1024});
      if (run.status !== 0) throw Error('Parser failed');
      const results = run.stdout.trim().split(/\r?\n/).map(JSON.parse);
      if (results.length !== rows.length) throw Error('Missing parser output');
      results.forEach((entry,i)=>{
        const known = entry.result.years !== null;
        const previous = rows[i].experience_required !== null;
        report.scanned++; report.previous += +previous; report.extracted += +known;
        report.newlyExtracted += +(known && !previous); report.cleared += +(!known && previous);
        report.reasons[entry.result.reason] = (report.reasons[entry.result.reason] || 0)+1;
      });
      after = rows.at(-1).id;
      if (sample) {
        console.log(JSON.stringify(results.filter(r=>r.result.years!==null).slice(0,30).map(r=>({id:r.id,years:r.result.years,evidence:r.result.evidence.map(e=>e.slice(0,180))}))));
        break;
      }
      if (report.scanned % 10000 === 0) console.log(JSON.stringify({progress:report.scanned}));
    }
    if (!sample) fs.writeFileSync(path.join(__dirname,'coverage.local.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify(report));
  } finally { await client.end(); }
}
main().catch(()=>{console.error('Corpus verification failed');process.exitCode=1;});
