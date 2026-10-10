/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS Node regression runner. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const jsx = require('react/jsx-runtime');
function load(file,mocks,globals={}) {
  const exports={};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText,
    {exports,require:name=>name==='react/jsx-runtime'?jsx:mocks[name]||{},console,...globals});
  return exports;
}
function find(node,predicate) {
  if (!node) return;
  if (Array.isArray(node)){for(const child of node){const result=find(child,predicate);if(result)return result;}return;}
  return predicate(node)?node:find(node.props?.children,predicate);
}
async function main(){
  const templates=load('data/resume-templates.ts',{});
  assert.equal(templates.RESUME_TEMPLATES.length,4);
  assert.deepEqual(Array.from(templates.RESUME_TEMPLATES,t=>t.themeId).sort(),[2,3,5,6]);
  const backend=fs.readFileSync('services/resume-pdf-backend/src/main.rs','utf8');
  for(const template of templates.RESUME_TEMPLATES)assert.match(backend,new RegExp('"'+template.id+'"[^\\n]*Some\\('+template.themeId+'\\)'));
  for(const [alias,id,theme] of [['contemporary-compact','modern-ivy',3],['standard-overleaf','mit-capd',2]]){
    assert.equal(templates.getTemplateById(alias).id,id);assert.equal(templates.getThemeForTemplate(alias),theme);
    let state;const stored=new Map([['strawberry_resume_template_id',alias]]);
    const store=load('store/useResumeStore.ts',{
      zustand:{create:initialize=>{state=initialize(value=>Object.assign(state,value),()=>state);return state;}},
      '@/data/resume-templates':templates,'@/data/sample-resume':{sampleResumeMarkdown:'# Candidate'},
      '@/lib/resumeApi':{saveResumePayloadLocally:async()=>({success:true})}
    },{window:{},localStorage:{getItem:key=>stored.get(key),setItem:(key,value)=>stored.set(key,value)}}).useResumeStore;
    assert.equal(store.selectedTemplateId,id);assert.equal(store.activeThemeId,theme);
    store.setSelectedTemplateId(alias);assert.equal(store.selectedTemplateId,id);
    await store.saveResume('# Saved',alias);assert.equal(stored.get('strawberry_resume_template_id'),id);
  }
  let prints=0,portalTarget;
  const body={style:{}};
  const mocks={react:{useState:value=>[value,()=>{}],useRef:()=>({current:null}),useEffect(){}},
    'react-dom':{createPortal:(tree,target)=>{portalTarget=target;return tree;}},
    '@/data/resume-templates':templates,'@/store/useResumeStore':{useResumeStore:()=>({selectedTemplateId:'contemporary-compact',resumeMarkdown:'# Candidate'})},
    '@/components/ResumeSheet':{ResumeSheet:'ResumeSheet'}};
  const modal=load('components/ResumeModal.tsx',mocks,{document:{body},window:{print:()=>prints++}});
  assert.equal(modal.ResumeModal({isOpen:false,onClose(){}}),null);
  const tree=modal.ResumeModal({isOpen:true,onClose(){}});assert.equal(portalTarget,body);assert.equal(tree.props['data-resume-print-root'],true);
  const sheet=find(tree,node=>node.type==='ResumeSheet');assert.equal(sheet.props.themeId,3,'Saved alias keeps its theme');
  const button=find(tree,node=>node.type==='button'&&node.props.title?.includes('physical US Letter'));
  assert.ok(button);button.props.onClick();assert.equal(prints,1);
  const server=load('components/ResumeModal.tsx',mocks);assert.equal(server.ResumeModal({isOpen:true,onClose(){}}),null,'No document access during server rendering');
  console.log('PASS: four backend theme mappings, saved alias migration, canonical store saves, body portal print action and SSR guard');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
