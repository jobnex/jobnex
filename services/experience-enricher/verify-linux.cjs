// Linux image builds execute the Rust tests; Windows Application Control can block local test binaries.
const {spawnSync}=require('node:child_process');
const {createHash}=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const files=['Cargo.toml','Cargo.lock','src/lib.rs','src/main.rs','db/migration.sql','Dockerfile','cloudbuild.yaml'];
const digest=()=>{
  const h=createHash('sha256');
  for(const file of files) { h.update(file+'\0'); h.update(fs.readFileSync(path.join(__dirname,file))); }
  return h.digest('hex');
};
const recordPath=path.join(__dirname,'linux-build.local.json');
const cloud=args=>spawnSync('rtk',['proxy','gcloud',...args,'--project=job-scout-508222'],{encoding:'utf8',windowsHide:true,cwd:__dirname,timeout:120000});
if(process.argv[2]==='start') {
  const hash=digest();
  const tag=`us-central1-docker.pkg.dev/job-scout-508222/job-repo/experience-enricher:v10-${hash.slice(0,12)}`;
  const result=cloud(['builds','submit','.','--config=cloudbuild.yaml',`--substitutions=_IMAGE=${tag}`,'--async','--format=value(id)']);
  if(result.status!==0) {console.error('Linux build submission failed');process.exit(1);}
  const id=result.stdout.trim();
  if(!/^[a-f0-9-]{36}$/.test(id)||hash!==digest()) {console.error('Build source verification failed');process.exit(1);}
  fs.writeFileSync(recordPath,JSON.stringify({id,hash,image:tag},null,2));
  console.log(JSON.stringify({build:id,source_hash:hash,image:tag}));
} else if(process.argv[2]==='verify') {
  const record=JSON.parse(fs.readFileSync(recordPath,'utf8'));
  if(record.hash!==digest()||!/^[a-f0-9-]{36}$/.test(record.id)) {console.error('Build source changed');process.exit(1);}
  const result=cloud(['builds','describe',record.id,'--format=json(status,results.images)']);
  if(result.status!==0) {console.error('Build status unavailable');process.exit(1);}
  const state=JSON.parse(result.stdout);
  if(state.status!=='SUCCESS') {console.error(`Linux build ${state.status}`);process.exit(1);}
  if(!fs.readFileSync(path.join(__dirname,'Dockerfile'),'utf8').includes('cargo test --locked')) {console.error('Image does not run tests');process.exit(1);}
  record.digest=state.results.images[0].digest;
  fs.writeFileSync(recordPath,JSON.stringify(record,null,2));
  console.log('Linux tests verification passed');
} else process.exit(2);
