const assert=require('node:assert/strict');
const {load}=require('./load-ts.cjs');
const preferences={};const resumes={};
let active=null;
const api=load('app/actions/preferences.ts',{
  '@/lib/db':{db:{select:()=>({from:table=>({where:()=>({limit:async()=>table===resumes?(active?[active]:[]):[{preferences:{isConfirmed:false,manualEdits:{resumeUploaded:true,resumeFileKey:'deleted.pdf',resumeFileName:'deleted.pdf',cities:['Seattle']}}}]})})})}},
  '@/lib/db/schema':{userJobPreferences:preferences,userPrefResumes:resumes},
  '@/lib/auth/server':{getCurrentUser:async()=>({id:'owner'})},'next/cache':{},'drizzle-orm':{eq:()=>true},'@/lib/resume-content':{}
});
(async()=>{
  const removed=(await api.getUserJobPreferences()).data;
  assert.equal(removed.preferences.resumeUploaded,false);assert.equal(removed.preferences.resumeFileKey,null);assert.equal(removed.preferences.resumeFileName,null);assert.equal(removed.activeResumeId,null);
  assert.deepEqual(Array.from(removed.preferences.cities),['Seattle']);
  active={id:'new',fileKey:'new.pdf',fileName:'new.pdf'};
  const current=(await api.getUserJobPreferences()).data;
  assert.equal(current.preferences.resumeFileKey,'new.pdf');assert.equal(current.activeResumeId,'new');
  console.log('DELETED_RESUME_DRAFTS_PASSED');
})().catch(e=>{console.error(e);process.exit(1);});
