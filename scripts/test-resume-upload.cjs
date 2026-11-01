const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const ts=require('typescript');
const file=path.join(root,'app/actions/storage.ts');
const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
let calls=[];let outcome={valid:false,detail:'Missing employer'};
let storedBytes=Buffer.from('validated test bytes');
class Command {constructor(input){this.input=input;}}
const modules={
 '@aws-sdk/client-s3':{PutObjectCommand:Command,GetObjectCommand:Command,DeleteObjectCommand:Command,ListObjectsV2Command:Command},
 '@aws-sdk/s3-request-presigner':{getSignedUrl:async()=> 'https://example.r2.cloudflarestorage.com/test'},
 '@/lib/storage/r2':{R2_BUCKET_NAME:'test',r2Client:{send:async(command)=>{
  if(command.input.Body){calls.push('storage-write');return {};}
  calls.push('storage-read');return {ContentLength:storedBytes.length,Body:{transformToByteArray:async()=>storedBytes}};
 }}},
 '@/lib/auth/server':{getCurrentUser:async()=>({id:'test-user'})},
 '@/lib/db':{db:{transaction:async()=>{calls.push('transaction');throw Error('Simulated database failure');}}},
 '@/lib/db/schema':{userPrefResumes:{},userJobPreferences:{}},
 'drizzle-orm':{},'next/cache':{},'crypto':{default:require('node:crypto')},
 '@/lib/db/preferences-confirmation':{},
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
 outcome={valid:true,resume_details:{header:{name:'Test User'}},markdown:'# Test User',fileSha256:require('node:crypto').createHash('sha256').update(storedBytes).digest('hex')};calls=[];
 const failedCommit=await actionExports.commitResumeUpload({objectKey:'user_pref_resumes/test-user/new.pdf',fileName:'resume.pdf'});
 assert.equal(failedCommit.success,false);
 assert.deepEqual(calls,['validate','storage-read','storage-write','transaction']);
 assert.match(failedCommit.error,/Simulated database failure/);
 storedBytes=Buffer.from('changed after validation');calls=[];
 const changed=await actionExports.commitResumeUpload({objectKey:'user_pref_resumes/test-user/new.pdf',fileName:'resume.pdf'});
 assert.equal(changed.success,false);assert.deepEqual(calls,['validate','storage-read']);
 assert.match(changed.error,/changed during validation/);
 console.log('UPLOAD_REJECTIONS_PRESERVE_ACTIVE_RESUME');
})().catch(error=>{console.error(error);process.exit(1)});
