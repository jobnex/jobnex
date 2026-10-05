const assert=require('node:assert/strict');
const fs=require('node:fs');
const {randomUUID,createHash}=require('node:crypto');
const base='https://job-hunt-web-znsph25yja-ue.a.run.app';
const jobId='1a8a3167-bf4a-5619-8167-b43d883e83e4';
const session=JSON.parse(fs.readFileSync('scratch/demo-api-session.json'));
const file='scratch/live-api-trial.json';
const evidence=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):{user_id:session.user_id,job_id:jobId,idempotency_key:randomUUID(),checks:[]};
const hash=data=>createHash('sha256').update(data).digest('hex');
function record(check){evidence.checks.push(check);fs.writeFileSync(file,JSON.stringify(evidence,null,2));console.log(JSON.stringify(check));}
async function request(path,options={}){
  const response=await fetch(base+path,{...options,headers:{Origin:base,
    Cookie:Object.entries(session.cookies).map(([k,v])=>`${k}=${v}`).join('; '),...options.headers},signal:AbortSignal.timeout(90_000)});
  return response;
}
async function json(path,options={}){const r=await request(path,options);const body=await r.json();assert(r.ok,`${path}: ${r.status} ${typeof body.error==='string'?body.error:'request failed'}`);return {body,status:r.status};}
const post=(data)=>({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
async function main(){
  const job=await json('/api/resume/tailor/jobs/'+jobId);assert.equal(job.body.job.id,jobId);record({step:'authoritative_job',status:job.status,title:job.body.job.title,company:job.body.job.company});
  if(!evidence.request_id){
    if(!evidence.resume_id){
      const form=new FormData();form.set('file',new File([fs.readFileSync('scratch/Synthetic_ProjectWise_Demo.pdf')],'Synthetic_ProjectWise_Demo.pdf',{type:'application/pdf'}));
      const upload=await json('/api/resume/tailor/upload',{method:'POST',body:form});
      assert(upload.body.resume.markdown?.includes('ProjectWise'));evidence.resume_id=upload.body.resume.id;
      record({step:'pdf_upload_and_parse',status:upload.status,resume_id:evidence.resume_id,extracted_chars:upload.body.resume.markdown.length});
    }
    // Reviewed text contains only facts already present in the synthetic PDF.
    const source=fs.readFileSync('tests/fixtures/projectwise-demo.md','utf8').trim();
    const saved=await json('/api/resume/tailor/resumes/'+evidence.resume_id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({markdown:source})});
    assert.equal(saved.body.resume.content,source);record({step:'reviewed_source_saved',status:saved.status,source_sha256:hash(source)});
    const preview=await json(`/api/resume/tailor/resumes/${evidence.resume_id}/preview?jobId=${jobId}`);
    record({step:'deterministic_preview',status:preview.status,matched:preview.body.preview.matched,missing:preview.body.preview.missing});
    const payload={jobId,resumeId:evidence.resume_id,idempotencyKey:evidence.idempotency_key};
    const queued=await json('/api/resume/tailor/requests',post(payload));evidence.request_id=queued.body.request.id;
    record({step:'queued',status:queued.status,request_id:evidence.request_id,credit_state:queued.body.request.credit_state});
    const repeated=await json('/api/resume/tailor/requests',post(payload));assert.equal(repeated.body.request.id,evidence.request_id);
    record({step:'idempotent_repeat',status:repeated.status,same_request:true});
  }
  for(let attempt=0;attempt<160;attempt++){
    const poll=await json('/api/resume/tailor/requests/'+evidence.request_id);
    assert.equal(poll.body.request.job_id,jobId);const state=poll.body.request.status;
    if(['failed','needs_review'].includes(state)) {record({step:'terminal',...poll.body.request});throw Error('Generation requires investigation; no automatic second charge');}
    if(state==='completed'){
      assert.equal(poll.body.request.credit_state,'consumed');record({step:'completed',request_id:evidence.request_id,credit_state:poll.body.request.credit_state});break;
    }
    if(attempt===159)throw Error('Trial timed out; keep existing request, do not enqueue another');
    await new Promise(resolve=>setTimeout(resolve,2500));
  }
  const downloaded=await request('/api/resume/tailor/generated/'+evidence.request_id);assert.equal(downloaded.status,200);
  assert.match(downloaded.headers.get('Content-Type'),/text\/markdown/);const markdown=Buffer.from(await downloaded.arrayBuffer());
  fs.writeFileSync('scratch/tailored-demo.md',markdown);evidence.markdown_sha256=hash(markdown);
  record({step:'markdown_download',status:200,bytes:markdown.length,sha256:evidence.markdown_sha256});
  const anonymous=await fetch(base+'/api/resume/tailor/generated/'+evidence.request_id);assert.equal(anonymous.status,401);record({step:'anonymous_real_generation_denied',status:anonymous.status});
  if(process.argv.includes('--pdf')){
    const exported=await json('/api/resume/tailor/generated/'+evidence.request_id+'/pdf',post({markdown:markdown.toString('utf8'),templateId:'mit-capd'}));
    evidence.preview_id=exported.body.previewId;
    const pdf=await request(exported.body.downloadUrl);assert.equal(pdf.status,200);const bytes=Buffer.from(await pdf.arrayBuffer());
    assert.equal(bytes.subarray(0,5).toString(),'%PDF-');assert.equal(hash(bytes),exported.body.pdfSha256);fs.writeFileSync('scratch/tailored-demo.pdf',bytes);
    record({step:'pdf_export_download',status:200,preview_id:evidence.preview_id,bytes:bytes.length,pdf_sha256:hash(bytes),reviewed_markdown_sha256:exported.body.markdownSha256});
  }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
