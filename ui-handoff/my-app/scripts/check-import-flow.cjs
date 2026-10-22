const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {load}=require('./load-ts.cjs');
const {cleanup}=require('./cleanup-resume-imports.cjs');
const {sourceDigest,admissionError}=load('lib/resume-admission.ts');
const markdown=fs.readFileSync(path.join(__dirname,'fixtures/resume-regression.md'),'utf8').trim();
const user='11111111-1111-4111-8111-111111111111',id='22222222-2222-4222-8222-222222222222';
const key=`resume_imports/${user}/new.pdf`,old=`user_pref_resumes/${user}/old.pdf`;
const bytes=Buffer.from('%PDF-synthetic-test-object');
const hash=crypto.createHash('sha256').update(bytes).digest('hex');
function harness(options={}){
  const events=[];
  const candidate={id,user_id:user,object_key:key,file_name:'resume.pdf',baseline_key:old,baseline_content_sha256:sourceDigest('old source'),status:'accepted',revision:1,
    expires_at:new Date(Date.now()+3600000),validator_version:'single-column-v1',file_sha256:hash,parsed_data:{},markdown,...options.candidate};
  const query=async(sql,args=[])=>{
    events.push({sql,args});
    if(sql.includes('INSERT INTO resume_imports'))return {rows:options.alreadyConfirmed?[]:[{id,revision:1}]};
    if(sql.includes('SELECT * FROM resume_imports'))return {rows:options.missing?[]:[candidate]};
    if(sql.includes('SELECT r.file_key'))return {rows:[{file_key:options.changedBase?'different.pdf':old,content:options.editedBase?'edited source':'old source'}]};
    if(sql.includes('SELECT id FROM resume_generation_requests'))return {rows:options.busy?[{id:'busy'}]:[]};
    if(sql.includes("status='accepted'")&&sql.includes('RETURNING id'))return {rows:[{id}]};
    if(sql.includes('INSERT INTO user_pref_resumes'))return {rows:[{id:'active'}]};
    return {rows:[]};
  };
  const pool={query,connect:async()=>({query,release:()=>events.push({sql:'RELEASE'})})};
  class Command{constructor(input){this.input=input;}}
  const r2={send:async(command)=>{
    if(command.input.Body){events.push({sql:'PUT_VERIFIED',key:command.input.Key,bytes:Buffer.from(command.input.Body)});return {};}
    if(command.input.Key===old){events.push({sql:'DELETE_OLD'});if(options.deleteFailure)throw Error('delete failed');return {};}
    events.push({sql:'GET_BYTES'});
    return {ContentLength:bytes.length,Body:{transformToByteArray:async()=>options.fileChanged?Buffer.from('changed'):bytes}};
  }};
  const api=load('lib/resume-imports.ts',{
    '@/lib/db':{pool},'@/lib/storage/r2':{r2Client:r2,R2_BUCKET_NAME:'test'},
    '@aws-sdk/client-s3':{GetObjectCommand:Command,PutObjectCommand:Command,DeleteObjectCommand:Command},
    '@/app/actions/storage':{getPresignedDownloadUrl:async()=>({success:true,downloadUrl:'https://test.invalid/signed'})},
    '@/lib/profile-service':{extractResumeProfileFromR2:async()=>options.timeout?Promise.reject(Error('timeout')):
      ({success:true,accepted:!options.reject,reasonCode:options.reject?'MULTIPLE_COLUMNS':'ACCEPTED',validatorVersion:options.oldBackend?'old':'single-column-v1',markdown,fileSha256:hash,resume_details:{}})},
  });
  return {api,events};
}
(async()=>{
  for(const options of [{reject:true},{timeout:true},{oldBackend:true}]){
    const {api,events}=harness(options);
    if(options.reject)assert.equal((await api.previewResumeImport(user,key,'resume.pdf')).accepted,false);
    else await assert.rejects(api.previewResumeImport(user,key,'resume.pdf'));
    assert(!events.some(e=>/INSERT INTO user_pref_resumes|DELETE_OLD|user_job_preferences.*SET/.test(e.sql)));
  }
  {
    const {api,events}=harness();const result=await api.previewResumeImport(user,key,'resume.pdf');
    assert.equal(result.accepted,true);assert.equal(result.revision,1);
    assert(!events.some(e=>e.sql.includes('INSERT INTO user_pref_resumes')));
    await assert.rejects(api.previewResumeImport('other',key,'resume.pdf'));
    await assert.rejects(api.previewResumeImport(user,key,'resume.docx'));
  }
  for(const options of [{missing:true},{candidate:{revision:2}},{candidate:{status:'cancelled'}},{candidate:{status:'confirmed'}},
    {candidate:{expires_at:new Date(0)}},{candidate:{validator_version:'old'}},{changedBase:true},{editedBase:true},{busy:true},{fileChanged:true}]){
    const {api,events}=harness(options);await assert.rejects(api.confirmResumeImport(user,id,1,markdown));
    assert(!events.some(e=>e.sql.includes('INSERT INTO user_pref_resumes')||e.sql==='DELETE_OLD'));
    assert(events.some(e=>e.sql==='ROLLBACK'));
  }
  for(const deleteFailure of [false,true]){
    const {api,events}=harness({deleteFailure});const edited=markdown.replace('Example Candidate','Reviewed Candidate');
    const result=await api.confirmResumeImport(user,id,1,edited);
    assert.equal(result.success,true);
    assert.notEqual(result.objectKey,key);assert(result.objectKey.startsWith(`user_pref_resumes/${user}/`));
    assert(events.find(e=>e.sql==='PUT_VERIFIED').bytes.equals(bytes));
    assert(events.some(e=>e.sql==='COMMIT'));assert(!events.some(e=>e.sql==='DELETE_OLD'));
    const saved=events.find(e=>e.sql.includes('INSERT INTO user_pref_resumes'));
    const data=JSON.parse(saved.args[5]);assert.equal(admissionError(edited,data),null);
    assert.equal(data.personalDetails.fullName,'Reviewed Candidate');assert.equal(data.text,edited);
    assert.equal(data.experienceHistory.length,2);assert.equal(data.educationHistory.length,2);
    assert(admissionError(edited+' changed',data));
    const confirmed=events.find(e=>e.sql.includes("SET status='confirmed'"));
    assert.equal(confirmed.args[2],sourceDigest(edited));
  }
  assert(admissionError(markdown,{}));
  for(const autofill of [false,true]){
    const {api,events}=harness({candidate:{parsed_data:{inferredPreferences:{domains:['Design'],selectedTemplateId:'untrusted'}}}});
    await api.confirmResumeImport(user,id,1,markdown,autofill);
    const preferences=JSON.parse(events.find(e=>e.sql.includes('INSERT INTO user_job_preferences')).args[2]);
    assert.equal(Array.isArray(preferences.skills),autofill);
    assert.equal('selectedTemplateId' in preferences,false);
    assert.equal(Array.isArray(preferences.domains),autofill);
  }
  await assert.rejects(harness().api.confirmResumeImport(user,id,1,markdown.replace('Sept 2025','Sept 20XX')),/placeholders/);
  {
    const {api,events}=harness();await api.cancelResumeImport(user,id);
    assert.equal(events.length,1);assert(events[0].sql.includes("status='cancelled'"));
  }
  // API authentication and preview/confirm forwarding are tested without real services.
  for(const signedIn of [false,true]){
    let called=0;
    const route=load('app/api/job-hunt/profile/route.ts',{
      'next/server':{NextResponse:{json:(body,init)=>new Response(JSON.stringify(body),init)}},
      'next/cache':{revalidatePath:()=>{}},'@/lib/auth/server':{getCurrentUser:async()=>signedIn?{id:user}:null},
      '@/lib/resume-imports':{previewResumeImport:async()=>{called++;return {accepted:false,success:false};},confirmResumeImport:async()=>({success:true}),cancelResumeImport:async()=>({success:true})},
    });
    const response=await route.POST(new Request('https://test.invalid',{method:'POST',body:JSON.stringify({objectKey:key,fileName:'resume.pdf'})}));
    assert.equal(response.status,signedIn?422:401);assert.equal(called,signedIn?1:0);
  }
  // Cleanup skips active and freshly revalidated files, and supports dry-run.
  for(const mode of ['active','fresh','expired','dry']){
    let removed=0;
    const pool={query:async()=>({rows:[]}),connect:async()=>({query:async(sql)=>({rows:sql.startsWith('SELECT id FROM user_pref')&&mode==='active'||sql.includes("status IN ('accepted','parsing')")&&mode==='fresh'?[{id}]:[]}),release:()=>{}})};
    const r2={send:async(command)=>command.input.Prefix?{Contents:[{Key:key,LastModified:new Date(0)}]}:(removed++,{})};
    await cleanup({pool,r2,bucket:'test',apply:mode!=='dry'});
    assert.equal(removed,mode==='expired'?1:0);
  }
  const {spawnSync}=require('node:child_process');
  for(const script of ['check-import-database.cjs','check-source-admission.cjs']){
    const database=spawnSync(process.execPath,[path.join(__dirname,script)],{encoding:'utf8',windowsHide:true});
    process.stdout.write(database.stdout||'');process.stderr.write(database.stderr||'');
    assert.equal(database.status,0);
  }
  console.log('IMPORT_FLOW_PASSED');
})().catch(error=>{console.error(error);process.exit(1);});
