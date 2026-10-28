import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {existsSync,mkdirSync,mkdtempSync,writeFileSync,readFileSync,renameSync} from 'node:fs';
import {homedir,tmpdir} from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {setTimeout as pause} from 'node:timers/promises';
export const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export function canonical(v){return Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;}
export const digest=v=>sha(Buffer.from(JSON.stringify(canonical(v))));
export const python=process.env.PDF_CHECKER_PYTHON||(process.platform==='win32'?path.join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'):'python3');
export function run(command,args,env={}){return new Promise((resolve,reject)=>{let stdout='',stderr='';const child=spawn(command,args,{env:{...process.env,PYTHONUTF8:'1',PYTHONIOENCODING:'utf-8',...env},stdio:['ignore','pipe','pipe']});child.stdout.on('data',x=>stdout+=x);child.stderr.on('data',x=>stderr+=x);child.on('error',reject);child.on('exit',code=>code===0?resolve({stdout,stderr}):reject(Error(command+' failed ('+code+')\n'+stdout+'\n'+stderr)));});}
export async function build(){if(process.env.SKIP_BUILD!=='true')await run('rtk',['proxy','cargo','build','--locked','--no-default-features','--features','local-test']);}
export function fixture({bullets=2}={}){
 const generation=randomUUID(),sourceRevision=randomUUID();
 const block=(id,text)=>({id,text,evidenceIds:['e-'+id+'-0']});
 const document={schemaVersion:'ResumeDocumentV1',id:generation,revision:1,source:{fileSha256:'a'.repeat(64),textSha256:'b'.repeat(64),revision:sourceRevision,validatorVersion:'source-v1'},personalInfo:{id:'personal',name:'Café Candidate',title:'Software Engineer',email:'candidate@example.com',phone:'+1 (212) 555-0123',linkedin:'https://linkedin.com/in/candidate',github:'https://github.com/candidate',location:'New York, NY',extraContacts:[]},summary:[block('summary-1','Builds reliable software and communicates clearly with engineering teams.')],skills:[{id:'skills-1',category:'Engineering',items:[block('skills-1-1','Rust, Python, and PostgreSQL'),block('skills-1-2','Observability (Prometheus, Grafana)')]}],experience:[{id:'role-1',role:'Software Engineer',company:'Acme Systems',location:'New York, NY',duration:'January 2022 – December 2025',bullets:Array.from({length:bullets},(_,i)=>block('role-1-bullet-'+(i+1),'Delivered reliable service '+(i+1)+' with careful testing, readable documentation, and useful operational dashboards for customer support teams.'))}],projects:[{id:'project-1',title:'Service Inspector',technologies:['Rust','PostgreSQL'],duration:'2024',bullets:[block('project-1-bullet-1','Built a tool that inspects service health and displays actionable diagnostics.')]}],education:[{id:'education-1',institution:'Example University',location:'Boston, MA',degree:'Bachelor of Science in Computer Science',duration:'2018 – 2022',details:[block('education-1-detail-1','Completed a capstone project on dependable distributed systems.')]}],additionalSections:[{id:'additional-1',title:'Community',items:[block('additional-1-item-1','Mentored engineers in a local software community.')]}],sectionOrder:['summary','skills','experience','projects','education','additional-1'],evidence:[]};
 function evidence(fieldId,text,roleId=null){document.evidence.push({id:'e-'+fieldId+'-'+document.evidence.filter(e=>e.fieldId===fieldId).length,fieldId,sourceSpan:text,spanStart:0,spanEnd:[...text].length,page:null,box:null,roleId,origin:'user'});}
 for(const key of ['name','title','email','phone','linkedin','github','location']) evidence('personal.'+key,document.personalInfo[key]);
 for(const section of ['experience','projects','education'])for(const e of document[section])for(const key of section==='experience'?['role','company','location','duration']:section==='education'?['institution','location','degree','duration']:['title','duration'])evidence(e.id+'.'+key,e[key],section==='education'?null:e.id);
 for(const group of document.skills)if(group.category)evidence(group.id+'.category',group.category);
 for(const group of document.projects)for(const technology of group.technologies)evidence(group.id+'.technologies',technology,group.id);
 for(const group of document.additionalSections)if(group.title)evidence(group.id+'.title',group.title);
 function blocks(value,role=null){if(Array.isArray(value)){for(const v of value)blocks(v,role);}else if(value&&typeof value==='object'){if(value.evidenceIds)evidence(value.id,value.text,role);for(const [k,v] of Object.entries(value))if(k!=='evidence')blocks(v,value.id?.startsWith('role-')||value.id?.startsWith('project-')?value.id:role);}}
 blocks(document);
 const source=structuredClone(document);source.id=sourceRevision;
 const audit={status:'completed',resume_document:structuredClone(document),certificationChecks:{schema:true,source:true,factual:true},source_document:source,compliance_ledger:[{code:'source.factual',passed:true,severity:'error',field_path:'document',evidence_ids:[],repair_message:'',waiver:null}]};
 return {generation,document,source,audit,sourceRevision};
}
export async function harness({enabled=true,strict=false}={}){
 const root=mkdtempSync(path.join(tmpdir(),'certified-pdf-')),store=path.join(root,'store');mkdirSync(store);
 const user=randomUUID(),other=randomUUID(),job=randomUUID(),secret='local-certified-'+randomUUID();
 for(const id of [user,other])writeFileSync(path.join(store,'allow-'+id+'-'+job),'');
 const port=await new Promise((resolve,reject)=>{const s=net.createServer();s.on('error',reject);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
 const exe=process.env.PDF_TEST_BINARY||path.resolve('target/debug/resume-cloud-backend'+(process.platform==='win32'?'.exe':''));
 const child=spawn(exe,[],{env:{...process.env,HOST:'127.0.0.1',PORT:String(port),APP_ROOT:process.cwd(),BACKEND_SERVICE_TOKEN:secret,TEST_STORE_ROOT:store,CERTIFIED_PUBLICATION_ENABLED:String(enabled),RESUME_CERTIFIED_PUBLICATION_STRICT:String(strict),PDF_CHECKER_PYTHON:python},stdio:['ignore','pipe','pipe']});
 let errors='',logs='';child.stdout.on('data',x=>logs+=x);child.stderr.on('data',x=>errors+=x);child.on('error',e=>errors+=e.message);
 const base='http://127.0.0.1:'+port;
 for(let i=0;i<150;i++){try{if((await fetch(base+'/health')).ok)break;}catch{}if(i===149||child.exitCode!==null){child.kill();throw Error('Backend not ready (exit '+child.exitCode+'): '+errors+' '+logs);}await pause(100);}
 async function call(suffix,{method='GET',data,identity=user,token=secret,v=2}={}){const r=await fetch(base+'/api/v'+v+'/jobs/'+job+'/'+suffix,{method,headers:{Authorization:'Bearer '+token,'X-User-Id':identity,'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)});const result=r.headers.get('content-type')==='application/pdf'?Buffer.from(await r.arrayBuffer()):await r.json();return{r,result};}
 function save(f,{revision=f.document.revision}={}){f.document.revision=revision;const value={user,job,generation:f.generation,revision,source_import_id:f.sourceRevision,document:f.document,document_hash:digest(f.document),source_hash:digest(f.source),audit:f.audit};const temp=path.join(store,'next-'+randomUUID()+'.json');writeFileSync(temp,JSON.stringify(value));renameSync(temp,path.join(store,'document-'+user+'-'+job+'.json'));return value;}
 const input=(value,templateId='mit-capd')=>({generationId:value.generation,documentRevision:value.revision,documentHash:value.document_hash,templateId});
 async function stop(){if(child.exitCode===null)await new Promise(resolve=>{child.once('exit',resolve);child.kill();});}
 return {root,store,user,other,job,secret,base,call,save,input,diagnostics:()=>errors,stop};
}
