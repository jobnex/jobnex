import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {mkdtempSync,writeFileSync,readFileSync,mkdirSync,unlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {setTimeout as pause} from 'node:timers/promises';
import net from 'node:net';
async function freePort(){return new Promise((resolve,reject)=>{const s=net.createServer();s.on('error',reject);s.listen(0,'127.0.0.1',()=>{const port=s.address().port;s.close(()=>resolve(port));});});}
const first=await freePort(),second=await freePort(),third=await freePort();

const root=mkdtempSync(path.join(tmpdir(),'resume-cloud-check-'));
const store=path.join(root,'storage');mkdirSync(store);
const user=randomUUID(), other=randomUUID(), job=randomUUID(), deniedJob=randomUUID();
for(const id of [user,other])writeFileSync(path.join(store,`allow-${id}-${job}`),'');
const secret='local-check-only-'+randomUUID();
const exe=process.env.PDF_TEST_BINARY||path.resolve('target/debug/resume-cloud-backend'+(process.platform==='win32'?'.exe':''));
const processes=[];
function start(port){const p=spawn(exe,[],{env:{...process.env,PORT:String(port),HOST:'127.0.0.1',APP_ROOT:process.cwd(),BACKEND_SERVICE_TOKEN:secret,TEST_STORE_ROOT:store},stdio:['ignore','pipe','pipe']});processes.push(p);p.stdout.on('data',()=>{});p.stderr.on('data',()=>{});return p;}
async function ready(port){for(let i=0;i<100;i++){try {const r=await fetch(`http://127.0.0.1:${port}/health`);if(r.ok)return;}catch{}await pause(100);}throw Error('Server failed to start');}
async function call(port,suffix,method='GET',data,identity=user,token=secret){
    const r=await fetch(`http://127.0.0.1:${port}/api/v1/jobs/${job}/${suffix}`,{method,headers:{'Authorization':`Bearer ${token}`,'X-User-Id':identity,'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)});
    const result=r.headers.get('content-type')==='application/pdf'?Buffer.from(await r.arrayBuffer()):await r.json();return {r,result};
}
function sha(bytes){return createHash('sha256').update(bytes).digest('hex');}
function checkWarnings(stderr){
    const expected=(process.env.EXPECT_FONT_WARNINGS||'').split(',').filter(Boolean);
    if(!expected.length){assert.equal(stderr.trim(),'');return;}
    const warnings=stderr.match(/^warning:.*$/gm)||[];
    assert.equal(/(?:^|\n)error:/.test(stderr),false);
    assert.ok(warnings.every(line=>expected.some(font=>line===`warning: unknown font family: ${font}`)),stderr);
}
try{
    start(first);start(second);await Promise.all([ready(first),ready(second)]);
    assert.equal((await call(first,'resume')).r.status,200);
    assert.equal((await call(first,'resume','GET',undefined,user,'wrong')).r.status,401);
    assert.equal((await call(first,'resume','GET',undefined,'not-a-uuid')).r.status,400);
    const denied=await fetch(`http://127.0.0.1:${first}/api/v1/jobs/${deniedJob}/resume`,{headers:{Authorization:`Bearer ${secret}`,'X-User-Id':user}});assert.equal(denied.status,404);
    const md='# Cloud Candidate\n\n- **Email:** candidate@example.com\n- **Role:** AI Solutions Engineer\n\n## Summary\n- FIRSTMARKER achievement that wraps naturally without losing important words.\n- SECONDPOINT achievement.\n\n## Experience\n### Company | New York\n**Engineer** *(January 2025 - December 2025)*\n- Built reliable systems.\n';
    assert.equal((await call(first,'resume','PUT',{markdown:md})).r.status,428);
    const draft=await call(first,'resume','PUT',{markdown:md,template_id:'mit-capd',expected_revision:'absent'});assert.equal(draft.r.status,200);
    let revision=draft.result.revision;
    assert.equal((await call(second,'resume')).result.revision,revision);
    assert.equal((await call(second,'resume','PUT',{markdown:md,expected_revision:'absent'})).r.status,409);
    assert.equal((await call(first,'preview','POST',{markdown:md,uploadUrl:'https://example.com'})).r.status,400);
    assert.equal((await call(first,'preview','POST',{markdown:md,theme:6})).r.status,400);
    assert.equal((await call(first,'preview','POST',{markdown:'x'.repeat(260001)})).r.status,413);
    const hashes=new Set();
    for(const [template,theme] of [['mit-capd',2],['modern-ivy',3],['minimalist-exec',5],['tech-specialist',6]]){
        const preview=await call(first,'preview','POST',{markdown:md,template_id:template,theme});assert.equal(preview.r.status,200,JSON.stringify(preview.result));
        const p=preview.result;const expected=Buffer.from(p.pdf_base64,'base64');assert.equal(sha(expected),p.pdf_sha256);hashes.add(p.pdf_sha256);
        assert.equal(p.source_map.length>0,true);assert.equal(p.source_map.every(b=>md.slice(b.start,b.end)===b.raw),true);
        assert.equal(p.typst_code.includes('FIRSTMARKER'),true);checkWarnings(p.stderr);
        const downloaded=await call(second,`pdf/${p.preview_id}`);assert.equal(downloaded.r.status,200);assert.deepEqual(downloaded.result,expected);
        assert.equal((await call(second,`pdf/${p.preview_id}`,'GET',undefined,other)).r.status,404);
        assert.equal((await call(second,'export','POST',{preview_id:p.preview_id,expected_revision:revision},other)).r.status,404);
        assert.equal((await call(second,'export','POST',{preview_id:p.preview_id,expected_revision:'absent'})).r.status,409);
        const beforeExport=revision;
        const exported=await call(second,'export','POST',{preview_id:p.preview_id,expected_revision:revision});assert.equal(exported.r.status,200);revision=exported.result.revision;
        assert.equal((await call(first,'export','POST',{preview_id:p.preview_id,expected_revision:beforeExport})).r.status,200);
        const saved=await call(first,'resume');assert.equal(saved.result.resume.status,'ready');assert.equal(saved.result.resume.markdown,md);assert.equal(saved.result.resume.theme,theme);
        assert.equal(saved.result.resume.r2_object_key.startsWith(`resumes/${user}/${job}/`),true);
        assert.equal(saved.result.pdf_url,`/api/v1/jobs/${job}/pdf/${p.preview_id}`);
        assert.deepEqual((await call(first,'pdf')).result,expected);
        assert.deepEqual((await call(first,`pdf/${p.preview_id}`)).result,expected);
        writeFileSync(path.join(root,`theme-${theme}.pdf`),expected);
        // An intentional positive corruption control proves download integrity rejection.
        const pdfPath=path.join(store,saved.result.resume.r2_object_key);writeFileSync(pdfPath,'broken');
        assert.equal((await call(first,`pdf/${p.preview_id}`)).r.status,502);writeFileSync(pdfPath,expected);
    }
    assert.equal(hashes.size,4);
    const saved=await call(first,'resume');
    const oldId=saved.result.resume.r2_object_key.split('/').pop().replace('.pdf','');
    const marker=path.join(store,`blocked-${user}-${job}-${sha(Buffer.from(md))}`);
    writeFileSync(marker,'quarantined');
    assert.equal((await call(first,'resume')).result.resume,null);
    assert.equal((await call(first,`pdf/${oldId}`)).r.status,409);
    assert.equal((await call(first,'export','POST',{preview_id:oldId,expected_revision:saved.result.revision})).r.status,409);
    assert.equal((await call(first,'preview','POST',{markdown:md})).r.status,409);
    assert.equal((await call(first,'resume','PUT',{markdown:md,expected_revision:'absent'})).r.status,409);
    unlinkSync(marker);
    assert.equal((await call(first,`pdf/${oldId}`)).r.status,200);
    // Source/template change changes revision and cannot silently reuse a stale export.
    const edited=await call(first,'resume','PUT',{markdown:md.replace('FIRSTMARKER','EDITEDMARKER'),template_id:'modern-ivy',expected_revision:saved.result.revision});assert.equal(edited.r.status,200);
    const live=await call(second,'preview','POST',{});assert.equal(live.r.status,200);assert.equal(live.result.typst_code.includes('EDITEDMARKER'),true);
    const persistedId=live.result.preview_id;
    processes[0].kill();await pause(200);start(third);await ready(third);
    assert.equal((await call(third,`pdf/${persistedId}`)).result.equals(Buffer.from(live.result.pdf_base64,'base64')),true);
    assert.equal((await call(third,'generated')).result.generation,null);
    console.log('Artifacts:',root);
    console.log('BACKEND_API_VERIFIED: four Typst themes, shared storage across instances/restart, auth, ownership, conflict guards, source ranges, direct edits, exact downloads, quarantine on saved copies/artifacts/exports and corruption control');
}finally{for(const p of processes)p.kill();}
