const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const ts=require('typescript');
const file=path.join(root,'app/actions/storage.ts');
const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
let calls=[];let outcome={valid:false,detail:'Missing employer'};
let storedBytes=Buffer.from('validated test bytes');let databaseMode='fail-before';let committed=[];
const sql=(parts,...values)=>({text:parts.join('?'),values});
const transaction=async(callback)=>{
 calls.push('transaction');if(databaseMode==='fail-before')throw Error('Simulated database failure');
 const pending=[];
 const tx={execute:async(statement)=>{pending.push(statement);if(statement.text.includes('INSERT INTO resume_imports')&&databaseMode==='fail-import')throw Error('Simulated import failure');return {rows:[]};},
 select:()=>({from:()=>({where:()=>({limit:async()=>[]})})}),
 insert:table=>({values:values=>({onConflictDoUpdate:()=>({returning:async()=>[{id:'active-resume',...values}],then:resolve=>resolve([])})})})};
 const result=await callback(tx);committed=pending;return result;
};
const canonicalExports={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,'lib/resume-document.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
 {exports:canonicalExports,require:()=>({default:require(path.join(root,'lib/contracts/resume-document-v1.schema.json'))})});
class Command {constructor(input){this.input=input;}}
const modules={
 '@aws-sdk/client-s3':{PutObjectCommand:Command,GetObjectCommand:Command,DeleteObjectCommand:Command,ListObjectsV2Command:Command},
 '@aws-sdk/s3-request-presigner':{getSignedUrl:async()=> 'https://example.r2.cloudflarestorage.com/test'},
 '@/lib/storage/r2':{R2_BUCKET_NAME:'test',r2Client:{send:async(command)=>{
  if(command.input.Body){calls.push('storage-write');return {};}
  calls.push('storage-read');return {ContentLength:storedBytes.length,Body:{transformToByteArray:async()=>storedBytes}};
 }}},
 '@/lib/auth/server':{getCurrentUser:async()=>({id:'test-user'})},
 '@/lib/db':{db:{transaction}},
 '@/lib/db/schema':{userPrefResumes:{},userJobPreferences:{}},
 'drizzle-orm':{sql,eq:()=>true},'next/cache':{revalidatePath(){}},'crypto':{default:require('node:crypto')},
 '@/lib/db/preferences-confirmation':{preferenceWrite:()=>({})},
 '@/lib/resume-document':canonicalExports,
 '@/lib/profile-service':{profileService:async(user,route,body)=>{calls.push('validate');assert.equal(user,'test-user');assert.equal(body.validateOnly,true);if(outcome instanceof Error)throw outcome;return outcome;}}
};
let actionExports={};
const context={exports:actionExports,require:name=>{assert.ok(name in modules,name);return modules[name];},console:{error(){},log(){}},Date,URL};
vm.runInNewContext(code,context,{filename:file});
(async()=>{
 for(const value of [{valid:false,detail:'Missing employer'},new Error('Unreadable PDF')]){
  outcome=value;calls=[];
  const result=await actionExports.commitResumeUpload({objectKey:'user_pref_resumes/test-user/new.pdf',fileName:'resume.pdf'});
  assert.equal(result.success,false);assert.deepEqual(calls,['validate']);
  assert.match(result.error,/Missing employer|Unreadable PDF/);
 }
 calls=[];
 const result=await actionExports.commitResumeUpload({objectKey:'user_pref_resumes/another-user/new.pdf',fileName:'resume.pdf'});
 assert.equal(result.success,false);assert.deepEqual(calls,[]);
 const fileHash=require('node:crypto').createHash('sha256').update(storedBytes).digest('hex');
 const document=require(path.join(root,'services/resume-pdf-backend/tests/canonical-fixture.json')).document;
 document.source.fileSha256=fileHash;document.source.validatorVersion='single-column-v2';
 outcome={valid:true,resume_details:{header:{name:'Test User'},resumeDocument:document},validatorVersion:'single-column-v2',markdown:'# Test User',fileSha256:fileHash};calls=[];
 const failedCommit=await actionExports.commitResumeUpload({objectKey:'user_pref_resumes/test-user/new.pdf',fileName:'resume.pdf'});
 assert.equal(failedCommit.success,false);
 assert.deepEqual(calls,['validate','storage-read','storage-write','transaction'],failedCommit.error);
 assert.match(failedCommit.error,/Simulated database failure/);
 databaseMode='fail-import';calls=[];
 const failedImport=await actionExports.commitResumeUpload({objectKey:'user_pref_resumes/test-user/new.pdf',fileName:'resume.pdf'});
 assert.equal(failedImport.success,false);assert.match(failedImport.error,/Simulated import failure/);assert.equal(committed.length,0);
 databaseMode='success';calls=[];
 const success=await actionExports.commitResumeUpload({objectKey:'user_pref_resumes/test-user/new.pdf',fileName:'resume.pdf'});
 assert.equal(success.success,true,success.error);
 const admission=committed.find(s=>s.text.includes('INSERT INTO resume_imports'));assert.ok(admission);
 assert.ok(admission.values.includes(fileHash));assert.ok(admission.values.includes('single-column-v2'));
 const savedDocument=success.extraction.resume_details.resumeDocument;
 assert.equal(savedDocument.id,savedDocument.source.revision);assert.ok(admission.values.includes(savedDocument.id));
 assert.ok(admission.values.includes(success.data.fileKey));
 committed=[];calls=[];
 const docx=await actionExports.commitResumeUpload({objectKey:'user_pref_resumes/test-user/new.docx',fileName:'resume.docx'});
 assert.equal(docx.success,true,docx.error);assert.ok(!committed.some(s=>s.text.includes('INSERT INTO resume_imports')));
 storedBytes=Buffer.from('changed after validation');calls=[];
 const changed=await actionExports.commitResumeUpload({objectKey:'user_pref_resumes/test-user/new.pdf',fileName:'resume.pdf'});
 assert.equal(changed.success,false);assert.deepEqual(calls,['validate','storage-read']);
 assert.match(changed.error,/changed during validation/);
 console.log('UPLOAD_REJECTIONS_PRESERVE_ACTIVE_RESUME');
 console.log('PDF_CONFIRMATION_ATOMIC_AND_DOCX_UPLOAD_VERIFIED');
})().catch(error=>{console.error(error);process.exit(1)});
