
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const local=path.resolve(process.argv[2] || 'docs/ui/releases/app-fixes-20261010/local-app'),prod=path.resolve(process.argv[3] || 'docs/ui/releases/app-fixes-20261010/production-web');
const req=require('node:module').createRequire(path.join(local,'package.json')),ts=req('typescript');
function load(root,file,aliases) {
 const exports={};
 const source=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(source,{exports,require:n=>n in aliases?aliases[n]:req(n),process,console,fetch,Buffer,Request,Response,URL,AbortSignal},{filename:file});
 return exports;
}
(async()=>{
 for(const root of [local,prod]) {
 let user=null,calls=[];
 const utils=load(root,'lib/job-utils.ts',{});
 const match=async args=>{calls.push(args);return {jobs:[],nextCursor:'next-control',nextKeyset:{id:'control'},hasMore:true,executionTimeMs:3}};
 const route=load(root,'app/api/jobs/matched/route.ts',{
 '@/lib/auth/server':{getCurrentUser:async()=>user},
 '@/lib/db/job-preference-matching':{matchUserJobs:match},'@/lib/db/job-matching':{getMatchedJobs:match},
 '@/lib/job-utils':utils,'next/server':{NextResponse:Response}});
 const request=(method,url,body)=>new Request(url,{method,...(body?{body:JSON.stringify(body),headers:{'Content-Type':'application/json'}}:{})});
 assert.equal((await route.GET(request('GET','https://example.test/api/jobs/matched?userId=victim'))).status,401);
 assert.equal((await route.POST(request('POST','https://example.test/api/jobs/matched',{userId:'victim'}))).status,401);
 assert.equal(calls.length,0);
 user={id:'00000000-0000-4000-8000-000000000001'};
 const response=await route.GET(request('GET','https://example.test/api/jobs/matched?userId=victim&limit=NaN&cursor=retained'));
 const result=await response.json();assert.equal(response.status,200);assert.equal(calls.at(-1).userId,user.id);if(root===prod)assert.equal(calls.at(-1).cursor,'retained');assert.equal(calls.at(-1).limit,24);assert.equal(result.nextCursor,'next-control');assert.equal(result.hasMore,true);
 await route.POST(request('POST','https://example.test/api/jobs/matched',{userId:'victim',limit:10000}));
 assert.equal(calls.at(-1).userId,user.id);assert.equal(calls.at(-1).limit,50);
 assert.equal(utils.formatJobLocation('Atlanta, GA, United States','United States'),'Atlanta, GA, United States');
 assert.equal(utils.formatJobLocation('Seattle, WA, USA','United States'),'Seattle, WA, USA');
 assert.equal(utils.formatJobLocation(null,null),'Location not specified');
 }
 // Admission rejects a base replaced after preview before any credit hold/outbox mutation.
 let sql=[];
 const client={release(){},async query(q,p){sql.push(String(q));if(String(q).includes('currentBase'))throw new Error('bad');if(String(q).includes('SELECT r.id,r.content'))return {rows:[]};return {rows:[]}}};
 const tailoring=load(prod,'lib/resume-tailoring.ts',{'@/lib/db':{pool:{connect:async()=>client}},'@/lib/resume-content':{resumeText:(c)=>c||''}});
 await assert.rejects(tailoring.enqueueTailoring('owner','job',{id:'old-base',markdown:'old source'},'key'),/base resume changed/);
 assert.ok(sql.some(q=>q.includes('pg_advisory_xact_lock')));
 assert.ok(sql.includes('ROLLBACK'));assert.ok(!sql.some(q=>q.includes('UPDATE wallets')));
 // Successful admission records the exact current source only after shared base lock.
 sql=[];
 client.query=async(q,p)=>{sql.push(String(q));if(String(q).includes('SELECT r.id,r.content'))return {rows:[{id:'base',content:'current source',parsed_data:{}}]};if(String(q).includes('SELECT job_description'))return {rows:[{job_description:'job'}]};if(String(q).includes('SELECT balance'))return {rows:[{balance:1}]};return {rows:[]}};
 const accepted=await tailoring.enqueueTailoring('owner','job',{id:'base',markdown:'current source'},'key2');
 assert.equal(accepted.status,'queued');assert.ok(sql.indexOf('COMMIT')>sql.findIndex(q=>q.includes('INSERT INTO resume_dispatch_outbox')));
 console.log('ROOT RELEASE CHECKS PASSED: session privacy, keyset, limits, locations, stale-base no-charge rejection and positive admission');
})().catch(e=>{console.error(e);process.exitCode=1});
