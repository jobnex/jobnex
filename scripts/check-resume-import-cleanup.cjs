const assert=require('node:assert/strict');
const {cleanup}=require('./cleanup-resume-imports.cjs');
(async()=>{for(const mode of ['active','draft','fresh','expired','dry']){let removed=0;const prefixes=[];
const pool={query:async()=>({rows:[]}),connect:async()=>({query:async(sql)=>({rows:(sql.startsWith('SELECT id FROM user_pref')&&mode==='active')||(sql.startsWith('SELECT user_id FROM user_job_preferences')&&mode==='draft')||(sql.includes("status IN ('accepted','parsing')")&&mode==='fresh')?[{id:'test'}]:[]}),release(){}})};
const r2={send:async command=>{if(command.input.Prefix){prefixes.push(command.input.Prefix);return {Contents:[{Key:'resume_imports/test/old.pdf',LastModified:new Date(0)}]}}removed++;return {}}};
await cleanup({pool,r2,bucket:'test',apply:mode!=='dry'});assert.equal(removed,mode==='expired'?1:0);assert.deepEqual(prefixes,['resume_imports/']);
}console.log('SAFE_CLEANUP_PASSED')})().catch(e=>{console.error(e);process.exitCode=1});
