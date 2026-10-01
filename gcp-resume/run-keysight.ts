import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const app = 'C:/Users/desir/Projects/JD_match/incoming-my-app-2b/my-app';
const root = 'C:/Users/desir/Projects/techjobs/gcp-resume';
const require = createRequire(app+'/package.json');
require('dotenv').config({path:app+'/.env.local',quiet:true});
async function main() {
  const generation = await import(pathToFileURL(app+'/lib/resume-generation.ts').href);
  const worker = await import(pathToFileURL(app+'/lib/resume-worker.ts').href);
  const user = '96419deb-a030-4ac8-9f20-22a90cef6026';
  const job = '24c330df-8c97-59f0-bcba-f004772bf704';
  const keyFile = root+'/keysight-run.json';
  let request = fs.existsSync(keyFile) ? JSON.parse(fs.readFileSync(keyFile,'utf8')) : {key:crypto.randomUUID()};
  if(process.argv.includes('--retry')) {
    const old = await generation.resumePool.query('SELECT status FROM resume_generation_requests WHERE id=$1 AND user_id=$2',[request.id,user]);
    if(old.rows[0]?.status !== 'failed') throw new Error('Previous request is not failed');
    request = {key:crypto.randomUUID(),previous:request.id};
  }
  fs.writeFileSync(keyFile,JSON.stringify(request,null,2));
  if (!request.id) {
    for (const [key,secret] of [['OPENROUTER_API_KEY','job-hunt-openrouter-api-key'],['LANGSMITH_API_KEY','job-hunt-langsmith-api-key']]) {
      process.env[key] = execFileSync('rtk',['proxy','gcloud','secrets','versions','access','1','--secret',secret,'--project','job-scout-508222'],{encoding:'utf8',windowsHide:true}).trim();
    }
    process.env.RESUME_ENABLE_LANGSMITH='1';
    process.env.LANGSMITH_PROJECT='resume-builder-gcp';
    process.env.RESUME_LANGSMITH_ALLOW_CONTENT='0';
    const result = await generation.enqueue(user,job,null,request.key,null);
    request = {...request,...result};
    fs.writeFileSync(keyFile,JSON.stringify(request,null,2));
    console.log(JSON.stringify(result));
    const claimed = await generation.transaction(async (client: any) => {
      await generation.lockWallet(client,user);
      const lease = crypto.randomUUID();
      return (await client.query(`UPDATE resume_generation_requests SET status='running',lease_token=$1,
        lease_expires_at=now()+interval '11 minutes' WHERE id=$2 AND user_id=$3 AND status='queued' RETURNING *`,[lease,request.id,user])).rows[0];
    });
    if(claimed) await worker.execute(claimed);
  }
  const result = await generation.resumePool.query(`SELECT r.id,r.status,r.error_code,r.credit_state,g.resume_markdown,g.audit_json,
    (SELECT count(*) FROM credit_transactions t WHERE t.reference_id=r.id::text AND t.amount=-1) AS charges
    FROM resume_generation_requests r LEFT JOIN resume_generations g ON g.id=r.id WHERE r.id=$1 AND r.user_id=$2`,[request.id,user]);
  const row = result.rows[0];
  if(row?.resume_markdown) {
    fs.writeFileSync(root+'/Keysight-Forward-Deployment-Engineer.md',row.resume_markdown);
    fs.writeFileSync(root+'/Keysight-audit.json',JSON.stringify(row.audit_json,null,2));
  }
  console.log(JSON.stringify({id:row?.id,status:row?.status,error:row?.error_code,credit_state:row?.credit_state,charges:row?.charges,markdown_saved:!!row?.resume_markdown}));
  await generation.resumePool.end();
}
main().catch(()=>{console.error('Resume execution or storage unavailable');process.exitCode=1;});
