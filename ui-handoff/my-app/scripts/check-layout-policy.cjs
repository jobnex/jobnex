const {spawnSync}=require('node:child_process');
const path=require('node:path');
const python=process.env.RESUME_TEST_PYTHON || path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe');
const {spawnSync:run}=require('node:child_process');
for(const [command,args] of [[process.execPath,[path.join(__dirname,'check-resume-regressions.cjs')]],
  [python,[path.join(__dirname,'check_pdf.py')]]]){
  const built=run(command,args,{encoding:'utf8',windowsHide:true});
  if(built.status!==0){process.stderr.write(built.stdout||'');process.stderr.write(built.stderr||'');process.exit(built.status??1);}
}
const result=spawnSync(python,[path.join(__dirname,'check_layout_policy.py')],{encoding:'utf8',windowsHide:true});
process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');
if(result.status!==0)process.exit(result.status??1);
const {load}=require('./load-ts.cjs');
const {resumeContentError}=load('lib/resume-validation.ts');
const {parseResumeMarkdown,serializeResumeToMarkdown}=load('lib/resume-parser.ts');
const fs=require('node:fs');
for(const markdown of JSON.parse(fs.readFileSync(path.join(__dirname,'../scratch/verification/private-accepted-markdown.json'),'utf8'))){
  const error=resumeContentError(markdown,{allowUndatedExperience:true});
  if(error)throw new Error('Accepted PDF failed frontend contract: '+error);
  const model=parseResumeMarkdown(markdown);
  let project=false;const raw=[];
  for(const line of markdown.split('\n')){
    if(/^##\s/.test(line)){project=/project/i.test(line);continue;}
    if(project&&line.trim())raw.push(line);
  }
  if(raw.length&&!model.projects.length){
    if(!model.additionalSections?.projects?.lines?.length)throw Error('Unstructured project content was dropped.');
    const saved=serializeResumeToMarkdown(model);
    for(const line of raw)if(!saved.includes(line))throw Error('A project line was lost during save.');
  }
}
console.log('LAYOUT_POLICY_PASSED');
