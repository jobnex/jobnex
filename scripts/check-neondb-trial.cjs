// Operator-only synthetic trial evidence. Supply DATABASE_URL in memory, never commit it.
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const { Client } = require('pg');
const email = 'jobnex-neondb-trial-20261005@example.com';
const jobId = '1a8a3167-bf4a-5619-8167-b43d883e83e4';
const grantReference = '0af41d94-6447-4c4e-8997-e4c282544ef0';
const hash = text => createHash('sha256').update(text).digest('hex');
async function main() {
  const url = new URL(process.env.DATABASE_URL); url.searchParams.set('sslmode', 'verify-full');
  const db = new Client({ connectionString: url.toString(), connectionTimeoutMillis: 15000 });
  try {
    await db.connect();
    assert.equal((await db.query('SELECT current_database() AS name')).rows[0].name, 'neondb');
    const user = (await db.query('SELECT id FROM neon_auth."user" WHERE email=$1', [email])).rows[0];
    assert(user, 'Synthetic demo identity has not signed in yet');
    if (process.argv.includes('--grant')) {
      assert.equal(process.env.NEONDB_DEMO_GRANT_ACK, 'yes');
      await db.query('BEGIN');
      await db.query('INSERT INTO wallets(user_id,balance) VALUES($1,0) ON CONFLICT(user_id) DO NOTHING', [user.id]);
      await db.query('SELECT 1 FROM wallets WHERE user_id=$1 FOR UPDATE', [user.id]);
      const prior = await db.query('SELECT id FROM credit_transactions WHERE user_id=$1 AND reference_id=$2', [user.id, grantReference]);
      if (!prior.rowCount) await db.query("INSERT INTO credit_transactions(user_id,amount,transaction_type,status,reference_id,metadata) VALUES($1,1,'adjustment','completed',$2,$3)", [user.id, grantReference, JSON.stringify({kind:'retained_neondb_demo_credit', synthetic:true})]);
      await db.query('COMMIT');
    }
    const wallet = (await db.query('SELECT balance FROM wallets WHERE user_id=$1', [user.id])).rows[0];
    const requests = (await db.query(`SELECT r.id,r.status,r.credit_state,r.error_code,r.job_id,r.source_text,r.job_description,
      r.created_at,r.finished_at,r.lease_expires_at,g.resume_markdown,g.status AS generation_status,g.version,
      j.job_role_title,j.company_name,j.job_description AS current_jd,
      (SELECT count(*)::int FROM resume_ai_calls a WHERE a.request_id=r.id) AS ai_calls
      FROM resume_generation_requests r LEFT JOIN resume_generations g ON g.id=r.id AND g.user_id=r.user_id
      JOIN jobs j ON j.id=r.job_id WHERE r.user_id=$1 ORDER BY r.created_at`, [user.id])).rows;
    const saved = (await db.query('SELECT markdown,r2_object_key,status,template_id FROM user_job_resumes WHERE user_id=$1 AND job_id=$2',[user.id,jobId])).rows[0];
    const ledger = (await db.query('SELECT amount,transaction_type,status,reference_id,metadata FROM credit_transactions WHERE user_id=$1 ORDER BY created_at',[user.id])).rows;
    const evidence = { user_id:user.id, job_id:jobId, balance:wallet?.balance, ledger,
      requests:requests.map(r=>({id:r.id,status:r.status,credit_state:r.credit_state,error_code:r.error_code,job_id:r.job_id,
        job_title:r.job_role_title,company:r.company_name,version:r.version,generation_status:r.generation_status,
        ai_calls:r.ai_calls,created_at:r.created_at,finished_at:r.finished_at,lease_expires_at:r.lease_expires_at,
        source_sha256:hash(r.source_text),jd_sha256:hash(r.job_description),jd_matches_current:r.job_description===r.current_jd,
        markdown_sha256:r.resume_markdown ? hash(r.resume_markdown) : null})),
      saved:saved&&{status:saved.status,template_id:saved.template_id,r2_object_key:saved.r2_object_key,markdown_sha256:hash(saved.markdown)} };
    const completed = requests.filter(r=>r.status==='completed' && r.credit_state==='consumed');
    if (process.argv.includes('--assert-complete')) {
      assert.equal(completed.length,1,'Expected exactly one completed trial generation');
      const r=completed[0]; assert.equal(r.job_id,jobId); assert(r.resume_markdown?.trim()); assert(r.ai_calls>0);
      assert.equal(r.job_description,r.current_jd); assert.equal(Number(wallet.balance),0);
      assert(!requests.some(r=>['queued','running'].includes(r.status)), 'Trial work still active');
      assert.equal(ledger.filter(x=>x.transaction_type==='resume_tailor'&&x.status==='completed'&&Number(x.amount)===-1).length,1);
      if(process.env.TRIAL_MARKDOWN_DOWNLOAD) assert.equal(hash(fs.readFileSync(process.env.TRIAL_MARKDOWN_DOWNLOAD)),hash(r.resume_markdown));
      if(process.argv.includes('--assert-pdf')) {assert.equal(saved?.status,'ready');assert.equal(saved.markdown,r.resume_markdown.trim());assert(saved.r2_object_key?.includes(`/resumes/`)===false);assert(saved.r2_object_key?.startsWith(`resumes/${user.id}/${jobId}/previews/`));}
    }
    const output = process.env.TRIAL_EVIDENCE_PATH;
    if(output){fs.mkdirSync(require('node:path').dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(evidence,null,2));}
    console.log(JSON.stringify(evidence,null,2));
  } finally { await db.end(); }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
