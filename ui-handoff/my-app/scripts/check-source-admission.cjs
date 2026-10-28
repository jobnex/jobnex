const assert=require('node:assert/strict');
const {load}=require('./load-ts.cjs');
const fs=require('node:fs'),path=require('node:path');
const backend=fs.existsSync(path.join(__dirname,'../../resume-backend-release/lib/resume-tailoring.ts'))?'../resume-backend-release':'backend-fixes/admission';
const user='11111111-1111-4111-8111-111111111111',id='22222222-2222-4222-8222-222222222222';
(async()=>{
  for(const allowed of [false,true]){
    const events=[];
    const query=async(sql,args=[])=>{
      events.push({sql,args});
      if(sql.includes('SELECT r.id,r.content'))return {rows:[{id,content:'# Candidate',parsed_data:{}}]};
      if(sql.includes('SELECT i.id FROM resume_imports'))return {rows:allowed?[{id}]:[]};
      if(sql.includes('SELECT job_description'))return {rows:[{job_description:'Test job'}]};
      if(sql.includes('SELECT balance FROM wallets'))return {rows:[{balance:1}]};
      return {rows:[]};
    };
    const pool={connect:async()=>({query,release:()=>{}})};
    const api=load(backend+'/lib/resume-tailoring.ts',{'@/lib/db':{pool},'@/lib/resume-content':{resumeText:c=>c}});
    const run=api.enqueueTailoring(user,id,{id,markdown:'# Candidate'},'idempotency');
    if(allowed)await run;else await assert.rejects(run,/supported PDF/);
    const charge=events.findIndex(e=>e.sql.includes('UPDATE wallets SET balance=balance-1'));
    assert.equal(charge>=0,allowed);
    if(allowed){
      assert(charge>events.findIndex(e=>e.sql.includes('SELECT i.id FROM resume_imports')));
      const saved=events.find(e=>e.sql.includes('INSERT INTO resume_generation_requests'));
      assert.equal(saved.args[7],id,'Request must retain its validated import for the strict worker');
    }
  }
  const previous=process.env.DATABASE_URL;process.env.DATABASE_URL='synthetic-test';
  try{
    for(const allowed of [false,true]){
      let calls=0;const events=[];
      const query=async(sql,args=[])=>{
        events.push({sql,args});
        if(sql.includes("SET status='running'"))return {rows:[{id,user_id:user,source_text:'# Candidate',lease_token:id}]};
        if(sql.includes('SELECT public.resume_source_is_admitted'))return {rows:[{allowed}]};
        if(sql.includes("credit_state='released'"))return {rows:[{id}]};
        return {rows:[]};
      };
      const pool={query,connect:async()=>({query,release:()=>{}})};
      class Pool{constructor(){return pool;}}
      const api=load(backend+'/services/resume-tailor/worker.ts',{'pg':{Pool},'./dispatch':{dispatchRequest:async()=>{}},
        'node:fs/promises':{mkdtemp:async()=>'/synthetic-test',writeFile:async()=>{},readFile:async()=>'',rm:async()=>{}}});
      await api.processRequest(id,async()=>{calls++;return 3;});
      assert.equal(calls,allowed?1:0);
      assert.equal(events.some(e=>e.sql.includes('UPDATE wallets SET balance=balance+1')), !allowed);
    }
  }finally{if(previous===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=previous;}
  console.log('SOURCE_ADMISSION_PASSED');
})().catch(error=>{console.error(error);process.exit(1);});
