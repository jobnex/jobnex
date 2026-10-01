import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import { S3Client, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command, HeadObjectCommand } from '@aws-sdk/client-s3';
dotenv.config({path:'.env.local',quiet:true});
if (process.argv.includes('--cloud')) process.env.USE_CLOUD_COMPILER = '1';
const dev = JSON.parse(await fs.readFile('scratch/dev-db.json','utf8'));
process.env.DATABASE_URL = dev.DATABASE_URL;
const cloudUrl = process.env.RESUME_COMPILER_URL;
const cloudSecret = process.env.RESUME_COMPILER_SECRET;
process.env.RESUME_COMPILER_SECRET = process.env.USE_CLOUD_COMPILER ? cloudSecret : randomUUID();
process.env.RESUME_COMPILER_URL = process.env.USE_CLOUD_COMPILER ? cloudUrl : 'http://127.0.0.1:18081';
process.env.JOB_HUNT_SERVICE_SECRET = randomUUID();
process.env.JOB_HUNT_SERVICE_URL = 'http://127.0.0.1:18082';
const pool = new Pool({connectionString:dev.DATABASE_URL,max:8,ssl:{rejectUnauthorized:false}});
const e=process.env;
const r2 = new S3Client({region:'auto',endpoint:`https://${e.R2_ACCOUNT_ID}.${e.R2_JURISDICTION}.r2.cloudflarestorage.com`,credentials:{accessKeyId:e.R2_ACCESS_KEY_ID,secretAccessKey:e.R2_SECRET_ACCESS_KEY}});
const bucket=e.R2_BUCKET_NAME;
const require=createRequire(import.meta.url),ts=require('typescript');
const cache=new Map();
let userId;
async function load(file) {
  if(cache.has(file)) return cache.get(file);
  const exports={};cache.set(file,exports);
  const text=ts.transpileModule(await fs.readFile(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const aliases={
    '@/lib/db':{pool}, '@/lib/auth/server':{getCurrentUser:async()=>userId?{id:userId}:null},
    '@/lib/storage/r2':{r2Client:r2,R2_BUCKET_NAME:bucket},
  };
  for(const name of text.matchAll(/require\("(@\/[^"\n]+)"\)/g)) {
    if(!(name[1] in aliases)) aliases[name[1]]=await load(name[1].slice(2)+'.ts');
  }
  vm.runInNewContext(text,{exports,require:name=>aliases[name]??require(name),process,console,fetch,Buffer,Response,Request,URL,AbortSignal},{filename:file});
  return exports;
}
const children=[];let users=[],jobs=[],originalProfiles=[],fixtureKey;
async function start(command,args,options,url) {
  const child=spawn(command,args,{...options,stdio:'ignore'});children.push(child);
  for(let i=0;i<80;i++){ try {if((await fetch(url)).ok)return;}catch{} await new Promise(r=>setTimeout(r,250)); }
  throw new Error('Test service did not start');
}
const req=data=>new Request('http://localhost/api/resume/export',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
const markdown='# Integration Example\nengineer@example.test | Seattle, WA\n\n## Skills\n- Rust, TypeScript\n\n## Experience\n### Engineer | Example Systems | Seattle | 2022 - Present\n- Built reliable services.\n';
await fs.mkdir('scratch/resume-export-qa',{recursive:true});
await fs.writeFile('scratch/resume-export-qa/fixture.md',markdown);
try {
  users=(await pool.query('SELECT id FROM neon_auth."user" ORDER BY id LIMIT 2')).rows.map(x=>x.id);
  jobs=[randomUUID(),randomUUID()];
  for(const job of jobs) await pool.query(`INSERT INTO jobs(id,source_service,job_role_title,job_description,company_name,location,employment_type,work_model,status)
    SELECT $1,source_service,'Integration Fixture',job_description,company_name,location,employment_type,work_model,'published' FROM jobs WHERE status='published' LIMIT 1`,[job]);
  assert.equal(users.length,2);assert.equal(jobs.length,2);
  originalProfiles=(await pool.query('SELECT * FROM user_job_preferences WHERE user_id=ANY($1::text[])',[users])).rows;
  for(const [index,id] of users.entries()) await pool.query('INSERT INTO applications(user_id,job_id) VALUES($1,$2)',[id,jobs[index]]);
  if (!process.env.USE_CLOUD_COMPILER) await start('python',['services/pdf-compiler/server.py'],{env:{...e,PORT:'18081',RESUME_RUST_BIN:'C:/Users/desir/Projects/resume-builder-agent/target/release/resume-builder-rs.exe',TYPST_BIN:'C:/Users/desir/Projects/resume-builder-agent/typst.exe'}},'http://127.0.0.1:18081/health');
  await start('python',['-m','uvicorn','service.main:app','--host','127.0.0.1','--port','18082'],{cwd:'services/job-hunt-profile',env:{...e}},'http://127.0.0.1:18082/health');
  const {POST}=await load('app/api/resume/export/route.ts');
  assert.equal((await POST(req({jobId:jobs[0],markdown,templateId:'mit-capd'}))).status,401);
  userId=users[1];assert.equal((await POST(req({jobId:jobs[0],markdown,templateId:'mit-capd'}))).status,404);
  userId=users[0];assert.equal((await POST(req({jobId:'1',markdown,templateId:'mit-capd'}))).status,400);
  const templates=(await load('data/resume-templates.ts')).RESUME_TEMPLATES;
  const {exportJobResume}=await load('lib/job-resumes.ts');
  const timings=[];const keys=[];
  for(const template of templates) {
    const started=performance.now();const response=await POST(req({jobId:jobs[0],markdown,templateId:template.id}));assert.equal(response.status,200);
    const result=await response.json();assert.equal(result.cleanupPending,false);
    const pdf=await fetch(result.downloadUrl,{headers:{Origin:'http://127.0.0.1:3000'}});assert.equal(pdf.status,200);
    const bytes=Buffer.from(await pdf.arrayBuffer());
    assert.equal(bytes.subarray(0,5).toString(),'%PDF-');
    await fs.writeFile(`scratch/resume-export-qa/${template.id}.pdf`,bytes);
    const rows=(await pool.query('SELECT * FROM user_job_resumes WHERE user_id=$1 AND job_id=$2',[users[0],jobs[0]])).rows;
    assert.equal(rows.length,1);assert.equal(rows[0].template_id,template.id);assert.equal(rows[0].theme,template.themeId);
    keys.push(rows[0].r2_object_key);timings.push(Math.round(performance.now()-started));
  }
  for(const key of keys.slice(0,-1)) await assert.rejects(r2.send(new HeadObjectCommand({Bucket:bucket,Key:key})));
  const concurrent=await Promise.all([exportJobResume(users[0],jobs[0],markdown.replace('Integration Example','Concurrent One'),'mit-capd'),exportJobResume(users[0],jobs[0],markdown.replace('Integration Example','Concurrent Two'),'modern-ivy'),exportJobResume(users[1],jobs[1],markdown.replace('Integration Example','Second User'),'tech-specialist'),exportJobResume(users[1],jobs[1],markdown.replace('Integration Example','Second User Again'),'minimalist-exec')]);
  assert.equal(concurrent.length,4);
  const latest=(await pool.query('SELECT * FROM user_job_resumes WHERE user_id=$1 AND job_id=$2',[users[0],jobs[0]])).rows;
  assert.equal(latest.length,1);
  process.env.RESUME_COMPILER_URL='http://127.0.0.1:1';
  await assert.rejects(exportJobResume(users[0],jobs[0],markdown,'mit-capd'));
  assert.equal((await pool.query('SELECT r2_object_key FROM user_job_resumes WHERE user_id=$1 AND job_id=$2',[users[0],jobs[0]])).rows[0].r2_object_key,latest[0].r2_object_key);
  await r2.send(new HeadObjectCommand({Bucket:bucket,Key:latest[0].r2_object_key}));
  const direct=await fetch((process.env.USE_CLOUD_COMPILER ? cloudUrl : 'http://127.0.0.1:18081')+'/api/v1/ui-export',{method:'POST',body:'{}'});assert.equal(direct.status,401);
  // A real DOCX travels from R2 to the extraction service and persists normalized UI fields.
  const fixture='scratch/profile-fixture.docx';
  const make=spawn('python',['-c',`from docx import Document; d=Document(); [d.add_paragraph(x) for x in ['Integration Person','Email: integration@example.test','Phone: 555-123-4567','Software Engineer','TECHNICAL SKILLS','Python SQL Docker','EDUCATION','Example University','Bachelor of Science','EXPERIENCE','Example Company | 2022 - Present','Software Engineer','- Built reliable APIs']]; d.save('${fixture}')`],{stdio:'ignore'});
  assert.equal(await new Promise(resolve=>make.on('exit',resolve)),0);
  fixtureKey=`user_pref_resumes/${users[0]}/integration-${randomUUID()}.docx`;
  await r2.send(new PutObjectCommand({Bucket:bucket,Key:fixtureKey,Body:await fs.readFile(fixture),ContentType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}));
  await pool.query(`INSERT INTO user_pref_resumes(user_id,title,file_name,file_key) VALUES($1,'Integration','fixture.docx',$2) ON CONFLICT(user_id) DO UPDATE SET file_key=EXCLUDED.file_key`,[users[0],fixtureKey]);
  // Use the same body-bound signature as the real app, with direct private source URL.
  const {getSignedUrl}=require('@aws-sdk/s3-request-presigner');const {GetObjectCommand}=require('@aws-sdk/client-s3');
  const downloadUrl=await getSignedUrl(r2,new GetObjectCommand({Bucket:bucket,Key:fixtureKey}),{expiresIn:60});
  const {profileService}=await load('lib/profile-service.ts');
  const profile=await profileService(users[0],'/profile/resume-from-r2',{objectKey:fixtureKey,fileName:'fixture.docx',downloadUrl});
  assert.equal(profile.resume_details.personalDetails.fullName,'Integration Person');
  assert.equal(profile.resume_details.personalDetails.email,'integration@example.test');
  assert.equal(profile.resume_details.educationHistory.length,1);assert.equal(profile.resume_details.experienceHistory.length,1);
  const stored=(await pool.query('SELECT resume_details FROM user_job_preferences WHERE user_id=$1',[users[0]])).rows[0].resume_details;
  assert.equal(stored.personalDetails.fullName,'Integration Person');assert.match(stored.compiler_payload.markdown,/Integration Person/);
  await assert.rejects(profileService(users[1],'/profile/resume-from-r2',{objectKey:fixtureKey,fileName:'fixture.docx',downloadUrl}));
  await fs.writeFile('scratch/integration-results.json',JSON.stringify({templates:templates.length,concurrentExports:4,exportMilliseconds:timings,isolatedDatabase:true,cloudCompiler:!!process.env.USE_CLOUD_COMPILER},null,2));
  console.log('STORAGE INTEGRATION VERIFIED');
} finally {
  for(const child of children)child.kill();
  if(fixtureKey)await r2.send(new DeleteObjectCommand({Bucket:bucket,Key:fixtureKey}));
  for(const [index,user] of users.entries()) {
    for(const job of jobs) {
      const prefix=`resumes/${user}/${job}/`;
      const list=await r2.send(new ListObjectsV2Command({Bucket:bucket,Prefix:prefix}));
      for(const item of list.Contents??[])await r2.send(new DeleteObjectCommand({Bucket:bucket,Key:item.Key}));
    }
    await pool.query('DELETE FROM user_job_resumes WHERE user_id=$1 AND job_id=ANY($2::uuid[])',[user,jobs]);
    await pool.query('DELETE FROM applications WHERE user_id=$1 AND job_id=$2',[user,jobs[index]]);
  }
  if(jobs.length) await pool.query('DELETE FROM jobs WHERE id=ANY($1::uuid[])',[jobs]);
  await pool.end();
}
