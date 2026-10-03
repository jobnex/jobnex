// Read-only corpus comparison. Credentials stay in memory; optional change reports include source evidence.
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
  const report = {scanned:0, previous:0, extracted:0, newlyExtracted:0, cleared:0, exactMonthRequirements:0, mentionsByKind:{}, reasons:{}};
  let after = '00000000-0000-0000-0000-000000000000';
  const sample = process.argv.includes('--sample');
  const clearedSample = process.argv.includes('--cleared-sample');
  const review = process.argv.includes('--review');
  const changes = process.argv.includes('--changes') ? [] : null;
  const remainingReviews = [];
  try {
    for (;;) {
      const rows = (await client.query(sample || clearedSample
        ? `SELECT id,job_description AS description,experience_required FROM public.jobs WHERE status='published'
          AND experience_required IS ${clearedSample ? 'NOT NULL' : 'NULL'} ORDER BY md5(id::text) LIMIT 500`
        : `SELECT id,job_description AS description,experience_required FROM public.jobs
        WHERE status='published' AND id>$1 ${review ? "AND experience_details->>'status'='needs_review'" : ''} ORDER BY id LIMIT 1000`, sample || clearedSample ? [] : [after])).rows;
      if (!rows.length) break;
      const run = spawnSync(path.join(__dirname,'target',process.argv.includes('--debug') ? 'debug' : 'release',`experience-enricher${process.platform === 'win32' ? '.exe' : ''}`), ['--stdin'], {
        input:rows.map(row=>JSON.stringify(row)).join('\n')+'\n',encoding:'utf8',windowsHide:true,maxBuffer:64*1024*1024});
      if (run.status !== 0) throw Error('Parser failed');
      const results = run.stdout.trim().split(/\r?\n/).map(JSON.parse);
      if (results.length !== rows.length) throw Error('Missing parser output');
      results.forEach((entry,i)=>{
        const known = entry.result.years !== null;
        const previous = rows[i].experience_required !== null;
        report.scanned++; report.previous += +previous; report.extracted += +known;
        report.newlyExtracted += +(known && !previous); report.cleared += +(!known && previous);
        report.exactMonthRequirements += +(entry.result.minimum_months !== null && !known);
        if (changes && entry.result.years !== rows[i].experience_required)
          changes.push({id:entry.id,previous:rows[i].experience_required,result:entry.result});
        if (changes && entry.result.reason === 'needs_review') remainingReviews.push(entry);
        for (const mention of entry.result.requirements || []) report.mentionsByKind[mention.kind]=(report.mentionsByKind[mention.kind] || 0)+1;
        report.reasons[entry.result.reason] = (report.reasons[entry.result.reason] || 0)+1;
      });
      after = rows.at(-1).id;
      if (review && report.scanned <= 1000) console.log(JSON.stringify(results.filter(r=>r.result.reason !== 'needs_review').slice(0,30).map(r=>({years:r.result.years,reason:r.result.reason,requirements:r.result.requirements}))));
      if (review && report.scanned <= 1000) console.log(JSON.stringify({remainingSample:results.filter(r=>r.result.reason === 'needs_review').slice(0,25).map(r=>r.result.requirements)}));
      if (clearedSample) { console.log(JSON.stringify(results.filter(r=>r.result.years===null).slice(0,30))); break; }
      if (sample) {
        console.log(JSON.stringify(results.filter(r=>r.result.years!==null).slice(0,30).map(r=>({id:r.id,years:r.result.years,evidence:r.result.evidence.map(e=>e.slice(0,180))}))));
        break;
      }
      if (report.scanned % 10000 === 0) console.log(JSON.stringify({progress:report.scanned}));
    }
    if (!sample && !clearedSample) fs.writeFileSync(path.join(__dirname,review ? 'review-coverage.local.json' : 'coverage.local.json'),JSON.stringify(report,null,2));
    if (changes) fs.writeFileSync(path.join(__dirname,'changes.local.json'),JSON.stringify(changes));
    if (changes) fs.writeFileSync(path.join(__dirname,'corpus-review.local.json'),JSON.stringify(remainingReviews));
    console.log(JSON.stringify(report));
  } finally { await client.end(); }
}
main().catch(()=>{console.error('Corpus verification failed');process.exitCode=1;});
