// Run from the repository root: node scripts/test-resume-reviewable-contract.cjs
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const ts=require('typescript'),root=path.resolve(__dirname,'..');
const worker=fs.readFileSync(path.join(root,'services/resume-tailor/worker.ts'),'utf8');
const body=worker.slice(worker.indexOf('function usableAudit('),worker.indexOf('async function recoverOutput('));
assert.ok(body.startsWith('function usableAudit('));
const usable=vm.runInNewContext(ts.transpileModule(body,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText+'\nusableAudit');
const codes=s=>[...s.matchAll(/["']([a-z_]+(?:\.[a-z_]+)+)["']/g)].map(m=>m[1]).sort();
const allowed=codes(body.match(/new Set\(\[([\s\S]*?)\]\)/)[1]);
const pipeline=fs.readFileSync(path.join(root,'resume-agent-inspect/src/low_risk_agent/pipeline.py'),'utf8');
assert.deepEqual(allowed,codes(pipeline.match(/reviewable = \{([\s\S]*?)\}/)[1]));
const migration=fs.readFileSync(path.join(root,'services/resume-tailor/migrations/20261018_resume_project_density_review.sql'),'utf8');
assert.deepEqual(allowed,codes(migration.match(/c->>'code' IN \(([\s\S]*?)\)/)[1]));
const check=code=>({code,passed:false,severity:'error'});
for(const code of allowed){
 assert.equal(usable({compliance_ledger:[check(code)]},'needs_review'),true,code);
 assert.equal(usable({compliance_ledger:[check(code)]},'completed'),false,code);
}
for(const code of ['claim.evidence','metric.provenance','protected.company','unknown.rule']){
 assert.equal(usable({compliance_ledger:[check('project.bullet_count'),check(code)]},'needs_review'),false,code);
}
assert.equal(usable({compliance_ledger:[]},'needs_review'),false);
assert.equal(usable({compliance_ledger:[{code:'project.bullet_count',passed:'false',severity:'error'}]},'needs_review'),false);
assert.equal(usable({compliance_ledger:[{code:'claim.evidence',passed:true,severity:'error'}]},'completed'),true);
console.log('REVIEWABLE_CONTRACT_PASS: pipeline, worker, SQL code sets agree; factual, unknown and malformed failures remain blocked.');
