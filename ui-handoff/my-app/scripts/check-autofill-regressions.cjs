const {spawnSync}=require('node:child_process');
const path=require('node:path');
for(const name of ['check-import-database.cjs','check-import-flow.cjs','check-deleted-resume-drafts.cjs']){
  const result=spawnSync(process.execPath,[path.join(__dirname,name)],{encoding:'utf8',windowsHide:true});
  process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');
  if(result.status!==0)process.exit(result.status||1);
}
console.log('AUTOFILL_REGRESSIONS_PASSED');
