import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { pool, processRequest, recover } from "../services/resume-tailor/worker";
import { dispatchRequest } from "../services/resume-tailor/dispatch";

async function main() {
  const state = (await pool.query("SELECT current_setting('neon.branch_id',true) AS branch")).rows[0];
  assert.equal(state.branch, "br-winter-mode-ayrrnkzi", "Never run these fixtures in the live database");
  await pool.query(await readFile("migrations/20261006_resume_dispatch.sql", "utf8"));
  // Applying twice is safe and cannot create a second dispatch for one request.
  await pool.query(await readFile("migrations/20261006_resume_dispatch.sql", "utf8"));
  const job = (await pool.query("SELECT id,job_description FROM jobs WHERE status='published' AND length(job_description)>0 LIMIT 1")).rows[0];
  const user = "cost-test-" + randomUUID();
  const resume = randomUUID();
  await pool.query("INSERT INTO user_pref_resumes(id,user_id,title,content) VALUES($1,$2,'synthetic cost test','# Synthetic résumé')", [resume,user]);
  await pool.query("INSERT INTO wallets(user_id,balance) VALUES($1,10)", [user]);
  async function fixture() {
    const id=randomUUID();
    await pool.query("UPDATE wallets SET balance=balance-1 WHERE user_id=$1",[user]);
    await pool.query(`INSERT INTO resume_generation_requests(id,user_id,job_id,base_resume_id,idempotency_key,source_text,job_description,status,credit_state)
      VALUES($1,$2,$3,$4,$5,'# Synthetic résumé',$6,'queued','held')`,[id,user,job.id,resume,randomUUID(),job.job_description]);
    await pool.query("INSERT INTO credit_transactions(user_id,amount,transaction_type,status,reference_id) VALUES($1,-1,'resume_tailor','pending',$2)",[user,id]);
    await pool.query("INSERT INTO resume_dispatch_outbox(request_id) VALUES($1)",[id]);
    return id;
  }
  let calls=0;
  const agent = async (_command:string,args:string[]) => {
    calls++;
    const id=args[args.indexOf('--generation-id')+1];
    const output=args[args.indexOf('--out')+1];
    const markdown='# Synthetic tailored résumé';
    const jobHash=createHash('sha256').update(job.job_description.normalize('NFC').replace(/\s+/gu,' ').trim()).digest('hex');
    const audit={status:'completed',resume_markdown:markdown,source_hash:'test-source',job_hash:jobHash,usage:[{model:'mock',stage:'mock',input_tokens:2,output_tokens:3,estimated_cost_usd:0}]};
    await pool.query(`INSERT INTO resume_generations(id,user_id,job_id,base_resume_id,version,status,resume_markdown,audit_json,source_hash,job_hash)
      VALUES($1,$2,$3,$4,$5,'completed',$6,$7,'test-source',$8)`,[id,user,job.id,resume,calls,markdown,JSON.stringify(audit),jobHash]);
    await writeFile(output,markdown); return 0;
  };
  const good=await fixture();
  assert.equal(await processRequest(good,agent),true);
  assert.equal(await processRequest(good,agent),false); assert.equal(calls,1);
  assert.equal((await pool.query("SELECT credit_state FROM resume_generation_requests WHERE id=$1",[good])).rows[0].credit_state,'consumed');
  const bad=await fixture();
  await processRequest(bad,async()=>{throw new Error('mock_provider_failure');});
  await processRequest(bad,agent);
  assert.equal((await pool.query("SELECT credit_state FROM resume_generation_requests WHERE id=$1",[bad])).rows[0].credit_state,'released');
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM credit_transactions WHERE reference_id=$1 AND transaction_type='refund'",[bad])).rows[0].n,1);
  const interrupted=await fixture();
  await pool.query("UPDATE resume_generation_requests SET status='running',lease_token=gen_random_uuid(),lease_expires_at=now()-interval '1 second' WHERE id=$1",[interrupted]);
  await recover(); await recover();
  assert.equal((await pool.query("SELECT status,credit_state FROM resume_generation_requests WHERE id=$1",[interrupted])).rows[0].status,'needs_review');
  assert.equal(calls,1);
  const deferred=await fixture(); delete process.env.RESUME_TASK_QUEUE;
  await dispatchRequest(pool,deferred);
  assert.equal((await pool.query("SELECT status,credit_state FROM resume_generation_requests WHERE id=$1",[deferred])).rows[0].status,'queued');
  const o=(await pool.query("SELECT attempts,last_error FROM resume_dispatch_outbox WHERE request_id=$1",[deferred])).rows[0];
  assert.equal(o.attempts,1); assert.equal(o.last_error,'dispatch_configuration_missing');
  await processRequest(deferred,async()=>{throw new Error('mock_timeout');});
  const persisted=await fixture();
  await processRequest(persisted,async(command,args,cwd)=>{await agent(command,args);void cwd;throw new Error('mock_crash_after_persistence');});
  assert.equal((await pool.query("SELECT credit_state FROM resume_generation_requests WHERE id=$1",[persisted])).rows[0].credit_state,'consumed');
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM resume_ai_calls WHERE request_id=$1",[persisted])).rows[0].n,1);
  const active=await fixture();
  await pool.query("UPDATE resume_generation_requests SET status='running',lease_token=gen_random_uuid(),lease_expires_at=now()+interval '15 minutes' WHERE id=$1",[active]);
  await assert.rejects(processRequest(active,agent),/request_busy/); assert.equal(calls,2);
  const {enqueueTailoring}=await import('../lib/resume-tailoring');
  const {pool: webPool}=await import('../lib/db');
  const candidate='cost-contract-'+randomUUID(), candidateResume=randomUUID(), key=randomUUID();
  await pool.query("INSERT INTO user_pref_resumes(id,user_id,title,content) VALUES($1,$2,'synthetic contract test','# Synthetic résumé')",[candidateResume,candidate]);
  await pool.query("INSERT INTO wallets(user_id,balance) VALUES($1,1)",[candidate]);
  const input={id:candidateResume,markdown:'# Synthetic résumé',parsed:{},fileName:null};
  const [first,second]=await Promise.all([enqueueTailoring(candidate,job.id,input,key),enqueueTailoring(candidate,job.id,input,key)]);
  assert.equal(first.id,second.id);
  assert.equal((await pool.query("SELECT balance FROM wallets WHERE user_id=$1",[candidate])).rows[0].balance,0);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM resume_dispatch_outbox WHERE request_id=$1",[first.id])).rows[0].n,1);
  await webPool.end();
  console.log('PASS: migration twice, successful settlement, duplicate delivery, single refund, expired lease/no AI retry, durable dispatch failure, active lease exclusion, crash-after-persistence recovery, concurrent enqueue/one credit/one outbox');
  await pool.end();
}
main().catch(async error=>{console.error(error.message);await pool.end();process.exitCode=1;});
