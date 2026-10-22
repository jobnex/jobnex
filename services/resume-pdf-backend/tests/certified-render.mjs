import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {build,fixture,harness,python,run} from './certified-helpers.mjs';

assert.deepEqual(readFileSync('resume-document-v1.schema.json'),readFileSync(process.env.CERTIFIED_SHARED_SCHEMA||'../../contracts/resume-document-v1.schema.json'));
await build();
const h=await harness();
try{
  const short=fixture(),long=fixture({bullets:38});
  const hashes=new Set();
  for(const f of [short,long]){
    const value=h.save(f);
    for(const template of ['mit-capd','modern-ivy','minimalist-exec','tech-specialist']){
      const {r,result}=await h.call('preview',{method:'POST',data:h.input(value,template)});
      assert.equal(r.status,200,JSON.stringify(result));
      assert.equal(result.publicationStatus,'ready',JSON.stringify(result)+' '+h.diagnostics());
      assert.deepEqual(result.issues,[]);
      const cert=JSON.parse(readFileSync(path.join(h.store,`certification-${result.artifactId}.json`)));
      assert.equal(cert.source_map.every(s=>s.positions&&s.boxes?.length&&s.boxes.every(b=>b.box.every(Number.isInteger))),true);
      const downloaded=await h.call(`artifacts/${result.artifactId}/pdf`);
      assert.equal(downloaded.r.status,200);
      const out=path.join(h.root,`${f===short?'short':'multipage'}-${template}.pdf`);
      writeFileSync(out,downloaded.result);
      const manifest={fields:cert.source_map.map(({id,text,kind,minPt,link,roleId})=>({id,text,kind,minPt,link,roleId})),sourceMap:cert.source_map};
      const manifestPath=out+'.manifest.json';writeFileSync(manifestPath,JSON.stringify(manifest));
      const checked=JSON.parse((await run(python,['validate_pdf.py',out,manifestPath])).stdout);
      assert.deepEqual(checked.issues,[]);
      if(f===short)hashes.add(result.pdfSha256);
      else assert.ok(Math.max(...cert.source_map.flatMap(s=>s.boxes.map(b=>b.page)))>=2,'long resume must preserve content on multiple pages');
      if(f===short&&template==='mit-capd')await run(python,['tests/test_validate_pdf.py',out,manifestPath,h.root]);
    }
  }
  assert.equal(hashes.size,4,'four existing styles must remain distinct');
  console.log('PDF artifacts:',h.root);
  console.log('CERTIFIED_RENDER_VERIFIED');
}finally{await h.stop();}
