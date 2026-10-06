// Operator-only: credentials remain in process memory; never log connection strings.
const { execFileSync } = require('node:child_process');
const { Client } = require('pg');
const fs = require('node:fs');
const gcloud = 'C:/Users/91767/AppData/Local/Google/Cloud SDK/google-cloud-sdk/bin/gcloud.cmd';
function gc(args) { return execFileSync('powershell.exe', ['-NoProfile','-Command', "& '"+gcloud+"' "+args.join(' ')], {encoding:'utf8'}).trim(); }
async function connect(secret) {
  const url = new URL(gc(['secrets','versions','access','latest','--project=job-scout-508222','--secret='+secret]));
  url.hostname = url.hostname.replace('-pooler.', '.');
  const db = new Client({connectionString:url.toString()}); await db.connect(); return db;
}
async function main() {
  if(process.argv[2]==='dependencies') {
    const services=JSON.parse(gc(['run','services','list','--project=job-scout-508222','--region=us-east1','--format=json']));
    const secrets=new Map(); let dependencies=0;
    for(const s of services) {
      if(s.metadata.name==='ai-job-portal-staging') continue;
      for(const container of s.spec.template.spec.containers) for(const env of container.env||[]) {
        let value=env.value||'';
        if(env.valueFrom?.secretKeyRef) {
          const name=env.valueFrom.secretKeyRef.name;
          if(!secrets.has(name)) secrets.set(name,gc(['secrets','versions','access','latest','--project=job-scout-508222','--secret='+name]));
          value=secrets.get(name);
        }
        if(value.includes('ai-job-portal-staging')) {dependencies++;console.log('DEPENDENCY',s.metadata.name,env.name);}
      }
    }
    console.log('Checked',secrets.size,'secret-backed dependencies; staging references:',dependencies);
    if(dependencies) throw new Error('Staging deletion blocked by dependency');return;
  }
  if (['test','migrate-live'].includes(process.argv[2])) {
    const url=new URL(gc(['secrets','versions','access','latest','--project=job-scout-508222','--secret=job-hunt-profile-database-url']));
    url.hostname=process.argv[2]==='test'?'ep-little-hill-ay3ltxxp.c-5.us-east-2.aws.neon.tech':url.hostname.replace('-pooler.','.');
    url.searchParams.set('sslmode','verify-full');
    if(process.argv[2]==='test') {
      execFileSync(process.execPath,['node_modules/tsx/dist/cli.mjs','scripts/test-on-demand-tailoring.ts'],{env:{...process.env,DATABASE_URL:url.toString()},stdio:['ignore','inherit','inherit']});
    } else {
      const db=new Client({connectionString:url.toString()}); await db.connect();
      try {const s=(await db.query("SELECT current_database() AS db,current_setting('neon.branch_id',true) AS branch")).rows[0];
        if(s.db!=='neondb'||s.branch!=='br-plain-morning-ayf71kf3') throw new Error('Unexpected migration target');
        await db.query(fs.readFileSync('migrations/20261006_resume_dispatch.sql','utf8')); console.log('Applied additive dispatch migration to original neondb',s);
      } finally {await db.end();}
    } return;
  }
  if (process.argv[2] === 'schema') {
    const db=await connect('job-hunt-profile-database-url');
    try { console.log((await db.query(`SELECT conrelid::regclass::text AS table_name,pg_get_constraintdef(oid) AS definition FROM pg_constraint
      WHERE conrelid IN ('public.resume_generation_requests'::regclass,'public.resume_generations'::regclass,'public.user_pref_resumes'::regclass,'public.wallets'::regclass)`)).rows);
      console.log((await db.query(`SELECT pg_get_functiondef(t.tgfoid) AS definition FROM pg_trigger t WHERE NOT t.tgisinternal
        AND t.tgrelid IN ('public.resume_generations'::regclass,'public.resume_ai_calls'::regclass)`)).rows);
    }
    finally {await db.end();} return;
  }
  if (process.argv[2] === 'neon') {
    const credentials = JSON.parse(fs.readFileSync('C:/Users/91767/.config/neon/credentials.json','utf8'));
    const response = await fetch('https://console.neon.tech/api/v2/projects/broad-base-06154424/branches', {headers:{Authorization:'Bearer '+credentials.access_token}});
    if (!response.ok) throw new Error('Neon API status '+response.status);
    const data=await response.json(); console.log(data.branches.map(x=>({id:x.id,name:x.name,parent_id:x.parent_id})));
    return;
  }
  for (const [name,secret] of [['jobnex','job-hunt-profile-database-url'],['rust','ai-job-portal-staging-app-migrator-database-url']]) {
    const db=await connect(secret);
    try {
      console.log(name,(await db.query("SELECT current_database() AS database,current_user AS role,current_setting('neon.branch_id',true) AS branch")).rows);
      const table=name==='jobnex'?'resume_generation_requests':'resume_requests';
      console.log('requests',(await db.query(name==='jobnex'?`SELECT status,credit_state,count(*)::int AS count FROM ${table} GROUP BY 1,2`:`SELECT status,count(*)::int AS count FROM ${table} GROUP BY 1`)).rows);
      if(name==='rust') {
        console.log('reservations',(await db.query("SELECT state,count(*)::int AS count FROM credit_reservations GROUP BY state")).rows);
        console.log('refunds',(await db.query("SELECT state,count(*)::int AS count FROM refunds GROUP BY state")).rows);
        console.log('reserved_wallets',(await db.query("SELECT count(*)::int AS count FROM credit_wallets WHERE reserved<>0")).rows);
        console.log('pending_payments',(await db.query("SELECT count(*)::int AS count FROM payments WHERE status='pending'")).rows);
      }
    } finally {await db.end();}
  }
}
main().catch(error=>{console.error(error.code || error.message.replace(/postgres(?:ql)?:\/\/\S+/g,'[redacted]'));process.exitCode=1;});
