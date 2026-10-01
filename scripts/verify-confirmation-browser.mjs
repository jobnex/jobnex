import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url), ts = require('typescript');
const webpack = require('next/dist/compiled/webpack/webpack').webpack;
const { chromium } = require('C:/Users/desir/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = process.cwd(), output = path.join(root, 'scratch/confirmation-browser'), source = path.join(output, 'source');
async function write(file, text) { const target = path.join(source, file); await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, text); }
await write('package.json', '{"type":"commonjs"}');
for (const file of ['app/(main)/job-hunt/manage/page.tsx', 'lib/preferences-confirmation.ts', 'data/resume-templates.ts', 'data/sample-resume.ts']) {
  await write(file.replace(/\.tsx?$/, '.js'), ts.transpileModule(await fs.readFile(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2022 } }).outputText);
}
for (const [file, symbol] of [['components/ResumeModal.js','ResumeModal'], ['components/PdfPreviewModal.js','PdfPreviewModal'], ['components/LocationDropdown.js','FlagUS'], ['components/ManageJobHuntSkeleton.js','ManageJobHuntFormSkeleton']]) await write(file, `exports.${symbol}=()=>null;`);
await write('store/useResumeStore.js', `const state={selectedTemplateId:'mit-capd',setSelectedTemplateId:()=>{},saveResume:async()=>true}; exports.useResumeStore=()=>state;`);
await write('store/useCreditStore.js', `exports.useCreditStore={getState:()=>({deductCredit:()=>true})};`);
await write('lib/hooks/useR2Storage.js', `exports.useR2Storage=()=>({uploadFile:async()=>({success:false}),getFileUrl:async()=>null,isUploading:false,progress:0});`);
await write('app/actions/recommendations.js', `exports.getPreferenceTagOptions=async()=>({domains:[],skills:[]});`);
await write('app/actions/storage.js', `exports.getAllTemplatePresignedUrls=async()=>({success:true,data:{}}); exports.getUserActiveResume=async()=>({success:true,data:null}); exports.commitResumeUpload=async()=>({success:false}); exports.deleteUserResume=async()=>({success:true});`);
const fixture = {country:'us',cities:[],seniority:'Mid-level',jobTypes:['Full-time'],experienceYears:3,salaryMin:null,salaryMax:null,currency:'USD',domains:[],skills:[],selectedTemplateId:'mit-capd',includeSummarySections:true,autofillFromResume:true,resumeUploaded:false,resumeFileName:null,resumeFileKey:null};
await write('app/actions/preferences.js', `const {confirmedPreferences}=require('../../lib/preferences-confirmation'); const base=${JSON.stringify(fixture)};
exports.getUserJobPreferences=async()=>({success:true,data:{preferences:JSON.parse(localStorage.getItem('test-preferences')||'null')||{...base,isConfirmed:false,confirmedAt:'2026-09-01',lastConfirmedPreferences:{...base,skills:['SQL']}},resumeDetails:{}}});
exports.confirmUserJobPreferences=async(input)=>{window.confirmCalls=(window.confirmCalls||0)+1;if(window.failConfirm)return {success:false,error:'Test save failure'}; const old=(await exports.getUserJobPreferences()).data.preferences;const preferences=confirmedPreferences(old,input,new Date().toISOString()); localStorage.setItem('test-preferences',JSON.stringify(preferences));return {success:true,data:{preferences}};}; exports.saveResumeDetails=async()=>({success:true});`);
await write('icons.js', `const React=require('react');module.exports=new Proxy({}, {get:()=>()=>React.createElement('svg',{'aria-hidden':true,width:14,height:14})});`);
await write('toast.js', `exports.toast=new Proxy({}, {get:()=>()=>{}});`);
await write('entry.js', `const React=require('react');const {createRoot}=require('react-dom/client');const Page=require('./app/(main)/job-hunt/manage/page').default;createRoot(document.getElementById('root')).render(React.createElement(Page));`);
await new Promise((resolve,reject)=>webpack({mode:'development',target:'web',context:source,entry:path.join(source,'entry.js'),output:{path:output,filename:'browser.js'},resolve:{alias:{'@':source,'lucide-react':path.join(source,'icons.js'),'sonner':path.join(source,'toast.js')},modules:[path.join(root,'node_modules')]},devtool:false},(error,stats)=>error?reject(error):stats.hasErrors()?reject(new Error(stats.toString({all:false,errors:true}))):resolve()));
const home = await (await fetch('http://127.0.0.1:3000')).text();
const styles = [...home.matchAll(/href="([^"\n]+\.css[^"\n]*)"/g)].map(x=>`<link rel="stylesheet" href="http://127.0.0.1:3000${x[1]}">`).join('');
const server = http.createServer(async(req,res)=>{res.setHeader('Content-Type',req.url==='/browser.js'?'text/javascript':'text/html');res.end(req.url==='/browser.js'?await fs.readFile(path.join(output,'browser.js')):`<!doctype html><html><head>${styles}</head><body><div id="root"></div><script src="/browser.js"></script></body></html>`);});
await new Promise(resolve=>server.listen(8093,'127.0.0.1',resolve));
let browser;
try {
  browser=await chromium.launch({headless:true}); const page=await browser.newPage({viewport:{width:1280,height:900}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8093'); await page.getByRole('status').filter({hasText:'Unconfirmed changes'}).waitFor();
  const confirm=page.getByRole('button',{name:'Confirm Changes',exact:true}).first(); assert(await confirm.isEnabled());
  await page.evaluate(()=>window.failConfirm=true); await confirm.click(); assert(await confirm.isEnabled());
  assert(await page.getByRole('status').filter({hasText:'Unconfirmed changes'}).isVisible());
  await page.evaluate(()=>window.failConfirm=false); await confirm.click(); await page.getByRole('status').filter({hasText:'Preferences confirmed'}).waitFor();
  assert.equal(await confirm.isEnabled(),false);
  await page.reload(); await page.getByRole('status').filter({hasText:'Preferences confirmed'}).waitFor(); assert.equal(await confirm.isEnabled(),false);
  const autofill = page.locator('label').filter({has:page.getByRole('checkbox',{name:'Autofill from resume',exact:true})});
  await autofill.click();
  await page.getByRole('status').filter({hasText:'Unconfirmed changes'}).waitFor(); assert(await confirm.isEnabled());
  await autofill.click();
  await page.getByRole('status').filter({hasText:'Preferences confirmed'}).waitFor(); assert.equal(await confirm.isEnabled(),false);
  await page.screenshot({path:path.join(output,'confirmed.png')}); assert.deepEqual(errors,[]);
  console.log('CONFIRMATION BROWSER VERIFIED');
} finally {await browser?.close();await new Promise(resolve=>server.close(resolve));}
