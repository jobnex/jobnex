const {spawnSync}=require('node:child_process');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const fs=require('node:fs');
let profile=path.join(root,'../resume-backend-release/services/job-hunt-profile');
if(!fs.existsSync(profile))profile=path.join(root,'backend-fixes/job-hunt-profile');
for(const script of ['check-resume-regressions.cjs','check-resume-export.cjs']){
  const result=spawnSync(process.execPath,[path.join(__dirname,script)],{encoding:'utf8',windowsHide:true});
  process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');if(result.status!==0)process.exit(result.status??1);
}
for(const [command,args,cwd] of [
  ['python',[path.join(root,'backend-fixes/check_generator_regressions.py')],root],
  ['python',['-c',`import sys;sys.path.insert(0,${JSON.stringify(path.join(root,'scratch/profile-test'))});import tempfile,unittest,os;tempfile.tempdir=${JSON.stringify(path.join(root,'scratch'))};os.environ['JOB_HUNT_SERVICE_SECRET']='test-only';s=unittest.defaultTestLoader.discover('service',pattern='test_*.py');r=unittest.TextTestRunner().run(s);raise SystemExit(not r.wasSuccessful())`],profile],
]){
  const result=spawnSync(command,args,{cwd,encoding:'utf8',windowsHide:true});
  process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');if(result.status!==0)process.exit(result.status??1);
}
console.log('LAYOUT_REGRESSIONS_PASSED');
