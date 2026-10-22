import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {build,fixture,harness,sha,digest} from './certified-helpers.mjs';

await build();
const h=await harness(),off=await harness({enabled:false}),strict=await harness({strict:true});
try{
  let f=fixture(),v=h.save(f);
  const preview=()=>h.call('preview',{method:'POST',data:h.input(v)});
  assert.equal((await h.call('preview',{method:'POST',data:h.input(v),token:'wrong'})).r.status,401);
  assert.equal((await h.call('preview',{method:'POST',data:h.input(v),identity:'not-a-uuid'})).r.status,400);
  assert.equal((await h.call('preview',{method:'POST',data:h.input(v),identity:h.other})).r.status,404);
  assert.equal((await off.call('preview',{method:'POST',data:h.input(v)})).r.status,404);
  for(const extra of [{document:f.document},{certificationChecks:{factual:true}},{human_review:true},{pdfSha256:'a'.repeat(64)}])assert.equal((await h.call('preview',{method:'POST',data:{...h.input(v),...extra}})).r.status,400);
  const noCert=await h.call(`publication?generationId=${v.generation}&documentRevision=1&templateId=mit-capd`);assert.equal(noCert.result.publicationStatus,'blocked');
  assert.equal((await h.call('preview',{method:'POST',data:{...h.input(v),documentHash:'c'.repeat(64)}})).r.status,409);
  for(const audit of [null,{}, {...f.audit,status:'needs_review'}, {...f.audit,status:undefined}, {...f.audit,resume_document:undefined}, {...f.audit,resume_document:{}}, {...f.audit,resume_document:{...f.audit.resume_document,id:f.source.id}}, {...f.audit,resume_document:{...f.audit.resume_document,source:{...f.source.source,fileSha256:'f'.repeat(64)}}}, {...f.audit,certificationChecks:{schema:true,source:true,factual:false}}, {...f.audit,compliance_ledger:[]}, {...f.audit,compliance_ledger:[{code:'source.factual',passed:false,severity:'error',waiver:'human_review'}]}]){
    const original=f.audit;f.audit=audit;v=h.save(f);const blocked=await preview();assert.equal(blocked.r.status,200,JSON.stringify(blocked.result));assert.equal(blocked.result.publicationStatus,'blocked');assert.equal(blocked.result.artifactId,null);assert.equal(blocked.result.pdfSha256,null);f.audit=original;
  }
  const originalTitle=f.document.personalInfo.title;
  f.document.personalInfo.title='Chief Scientist';v=h.save(f);const invented=await preview();assert.equal(invented.result.publicationStatus,'blocked');assert.ok(invented.result.issues.some(i=>i.code==='claim.uncertain'&&i.fieldId==='personal.title'));
  f.document.personalInfo.title='Engineer';v=h.save(f);assert.equal((await preview()).result.publicationStatus,'ready','same-field source title substrings are allowed after factual admission');
  f.document.personalInfo.title=originalTitle;
  v=h.save(f);
  const ready=await preview();assert.equal(ready.result.publicationStatus,'ready',JSON.stringify(ready.result));
  const repeated=await preview();assert.equal(repeated.result.publicationStatus,'ready');assert.equal(repeated.result.pdfSha256,ready.result.pdfSha256,'identical canonical input and template produce identical PDF bytes');
  const id=ready.result.artifactId;
  const inline=await h.call(`artifacts/${id}/pdf`),download=await h.call(`artifacts/${id}/pdf?download=1`);
  assert.equal(inline.r.status,200);assert.match(inline.r.headers.get('content-disposition'),/^inline;/);assert.match(download.r.headers.get('content-disposition'),/^attachment;/);assert.deepEqual(download.result,inline.result);assert.equal(sha(inline.result),ready.result.pdfSha256);
  assert.equal((await h.call(`artifacts/${id}/pdf`,{identity:h.other})).r.status,404);
  assert.equal((await h.call(`artifacts/${id}/pdf?download=0`)).r.status,400);
  assert.equal((await h.call(`publication?generationId=${v.generation}&documentRevision=1&templateId=mit-capd`)).result.artifactId,repeated.result.artifactId);
  assert.equal((await h.call(`publication?generationId=${v.generation}&documentRevision=1&templateId=modern-ivy`)).result.publicationStatus,'blocked');
  const record=JSON.parse(readFileSync(path.join(h.store,`certification-${id}.json`))),pdfPath=path.join(h.store,record.r2_object_key);
  writeFileSync(pdfPath,'invalid');assert.equal((await h.call(`artifacts/${id}/pdf`)).r.status,502);writeFileSync(pdfPath,inline.result);
  // Audit mutations invalidate existing downloads, even with unchanged canonical JSON.
  f.audit.certificationChecks.factual=false;h.save(f);assert.equal((await h.call(`artifacts/${id}/pdf`)).r.status,409);f.audit.certificationChecks.factual=true;h.save(f);
  f.document.summary[0].text+=' Edited wording.';v=h.save(f,{revision:2});assert.equal((await h.call(`artifacts/${id}/pdf`)).r.status,409);assert.equal((await h.call('preview',{method:'POST',data:{...h.input(v),documentRevision:1}})).r.status,409);
  // A revision committed while a long compile is running must win over publication.
  f=fixture({bullets:70});v=h.save(f);
  const marker=path.join(h.store,'compile-started');if(existsSync(marker))unlinkSync(marker);
  const inFlight=preview();
  for(let i=0;i<1000;i++){if(existsSync(marker)&&readFileSync(marker,'utf8')===v.document_hash)break;await new Promise(r=>setTimeout(r,2));}
  assert.equal(readFileSync(marker,'utf8'),v.document_hash,'race begins after the renderer loads the old authoritative revision');
  f.document.summary[0].text+=' Concurrent edit.';h.save(f,{revision:2});
  const raced=await inFlight;assert.equal(raced.r.status,409,JSON.stringify(raced.result));
  for(const action of ['preview','export','pdf']){const blocked=await strict.call(action,{v:1,method:action==='pdf'?'GET':'POST',data:action==='pdf'?undefined:{}});assert.equal(blocked.r.status,409);assert.equal(blocked.result.code,'USE_CERTIFIED_PUBLICATION');}
  const legacy=await h.call('resume',{v:1});assert.equal(legacy.r.status,200);
  console.log('CERTIFIED_API_VERIFIED');
}finally{await h.stop();await off.stop();await strict.stop();}
