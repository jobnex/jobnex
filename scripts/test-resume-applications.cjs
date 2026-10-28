/* eslint-disable @typescript-eslint/no-require-imports -- Node test runner uses CommonJS. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const jsx = require('react/jsx-runtime');
function load(file,mocks,globals={}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText,
    {exports,require:name=>name==='react/jsx-runtime'?jsx:mocks[name]||{},console,...globals});
  return exports;
}
function find(node,predicate) {
  if (!node) return;
  if (Array.isArray(node)) { for (const child of node) { const result=find(child,predicate); if(result)return result; } return; }
  return predicate(node)?node:find(node.props?.children,predicate);
}
const flush=async()=>{for(let i=0;i<5;i++)await Promise.resolve();};
async function main() {
  let user={id:'owner'},calls=[];
  const actions=load('app/actions/resume-applications.ts',{
    '@/lib/auth/server':{getCurrentUser:async()=>user},
    '@/lib/db':{pool:{query:async(sql,args)=>{calls.push({sql,args});return {rows:[{id:'job',job_role_title:'Technician',company_name:'TensorWave',employment_type:'full_time',location:'US',job_description:'Description',request_id:'request',generation_status:'queued',requested_at:'2026-10-09T00:00:00Z',application_stage:null}]};}}},
    '@/lib/job-utils':{formatSalary:()=>'',mapDBJobTypeToUI:()=>'Full-time'}
  });
  const listed=await actions.listResumeApplications();
  assert.equal(listed.userId,'owner');assert.equal(listed.applications[0].requestId,'request');assert.equal(listed.applications[0].stage,null);
  assert.deepEqual(Array.from(calls[0].args),['owner']);
  assert.match(calls[0].sql,/DISTINCT ON \(job_id\)/);assert.match(calls[0].sql,/WHERE user_id=\$1/);assert.doesNotMatch(calls[0].sql,/LIMIT|wallets|credit_transactions/);
  const id='1edf5626-21a7-52b7-b78d-889bdde9668f';
  await actions.updateResumeApplicationStage(id,'interview');
  assert.match(calls[1].sql,/WHERE EXISTS.*resume_generation_requests/s);assert.match(calls[1].sql,/ON CONFLICT\(user_id,job_id\)/);
  assert.deepEqual(Array.from(calls[1].args),['owner',id,'interview']);
  await assert.rejects(()=>actions.updateResumeApplicationStage(id,'hired'),/Invalid application stage/);
  await assert.rejects(()=>actions.updateResumeApplicationStage('bad','applied'),/Invalid application stage/);
  user=null;const count=calls.length;
  assert.equal((await actions.listResumeApplications()).applications.length,0);
  await assert.rejects(()=>actions.updateResumeApplicationStage(id,'applied'),/Unauthorized/);assert.equal(calls.length,count);

  let response={userId:'owner',applications:listed.applications},effect,timer,delay,reads=0,errors=0,snapshot;
  const states=[],listeners={};let stateIndex=0,account='owner';
  const page=load('app/(main)/job-hunt/applications/page.tsx',{
    react:{useRef:value=>({current:value}),useState:initial=>{const index=stateIndex++;if(!(index in states))states[index]=initial;return [states[index],value=>{states[index]=typeof value==='function'?value(states[index]):value;if(index===0)snapshot=states[index];if(index===1&&value)errors++;}];},useMemo:fn=>fn(),useEffect:fn=>{effect=fn;}},
    '@/lib/auth/client':{authClient:{useSession:()=>({data:{user:{id:account}}})}},
    '@/app/actions/resume-applications':{listResumeApplications:async()=>{reads++;if(response instanceof Error)throw response;return response;},updateResumeApplicationStage:async()=>{}},
    '@/app/actions/tailored-resume':{getExistingTailoredResume:async jobId=>{assert.equal(jobId,'job');return {exists:true,resume:{markdown:'# TensorWave draft',status:'needs_review'}};}},
    '@/store/useJobStore':{useJobStore:selector=>selector({openModal(){}})},
    '@/lib/hooks/useDebounce':{useDebounce:value=>value},
    '@/components/ResumeModal':{ResumeModal:'ResumeModal'},
    '@/lib/job-utils':{normalizeExternalUrl:()=>null},sonner:{toast:{error(){},warning(){}}}
  },{window:{addEventListener:(name,fn)=>listeners[name]=fn,removeEventListener:name=>delete listeners[name]},setTimeout:(fn,ms)=>{timer=fn;delay=ms;return 1;},clearTimeout(){}});
  const render=()=>{stateIndex=0;return page.default();};
  render();let cleanup=effect();await flush();assert.equal(snapshot.applications[0].generationStatus,'queued');assert.equal(delay,4000);
  for(let i=0;i<30;i++){timer();await flush();}assert.equal(reads,31,'Still polling after 120 seconds');
  response=new Error('Outage');timer();await flush();assert.equal(errors,1);assert.equal(snapshot.applications.length,1);
  response={userId:'owner',applications:[{...listed.applications[0],generationStatus:'needs_review'}]};listeners['resume-requests-changed']();await flush();
  let tree=render();const dropdown=find(tree,node=>node.props?.onView&&node.props?.onDownload);assert.ok(dropdown);assert.equal(dropdown.props.disabled,false);
  await dropdown.props.onView();await flush();tree=render();const preview=find(tree,node=>node.type==='ResumeModal');assert.equal(preview.props.initialMarkdown,'# TensorWave draft');assert.match(preview.props.reviewWarning,/Review/);assert.equal(preview.props.isOpen,true);
  account='other';tree=render();assert.equal(find(tree,node=>node.type==='ResumeModal').props.isOpen,false);assert.equal(find(tree,node=>node.props?.onView),undefined);
  cleanup();account='owner';render();cleanup=effect();await flush();assert.equal(snapshot.applications[0].generationStatus,'needs_review','Restored after remount');cleanup();
  console.log('PASS: owned durable request list, deduplication query, guarded stage writes, 120-second polling, outage/reload, matching review draft, account isolation');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
