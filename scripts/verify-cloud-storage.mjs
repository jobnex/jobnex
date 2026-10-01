import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import dotenv from 'dotenv';
dotenv.config({path:'.env.local',quiet:true});
const services=['job-hunt-profile','resume-pdf-compiler'];
for(const service of services){
  const result=spawnSync('rtk',['proxy','gcloud','run','services','describe',service,'--project','job-scout-508222','--region','us-east1','--format=json(spec.template.spec.containerConcurrency,metadata.annotations,spec.template.spec.containers.image)'],{encoding:'utf8',shell:process.platform==='win32'});
  assert.equal(result.status,0);const config=JSON.parse(result.stdout);
  assert.equal(config.spec.template.spec.containerConcurrency,4);
  assert.equal(config.metadata.annotations['run.googleapis.com/maxScale'],'3');
}
const base=process.env.RESUME_COMPILER_URL;
assert.equal((await (await fetch(base+'/health')).json()).capacity,4);
assert.equal((await fetch(base+'/api/v1/ui-export',{method:'POST',body:'{}'})).status,401);
const profile=process.env.JOB_HUNT_SERVICE_URL;
assert.equal((await fetch(profile+'/health')).status,200);
assert.equal((await fetch(profile+'/profile/resume-from-r2',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,401);
const proof=JSON.parse(await fs.readFile('scratch/integration-results.json','utf8'));
assert.equal(proof.cloudCompiler,true);assert.equal(proof.templates,6);assert.equal(proof.concurrentExports,4);
console.log('CLOUD STORAGE CONFIGURATION VERIFIED');
