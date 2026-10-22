// Isolated browser integration: actual component and renderer, stubbed storage
// transport and local API. No auth cookies, Neon, R2, or production requests.
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const assert=require('node:assert/strict');
const esbuild=require('esbuild');
const root=path.resolve(__dirname,'..');
const {chromium}=require(path.join(root,'scratch/ui-test/node_modules/playwright-core'));
const work=path.join(root,'scratch/verification');
const markdown=fs.readFileSync(path.join(__dirname,'fixtures/resume-regression.md'),'utf8');
(async()=>{
  const result=await esbuild.build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {ResumeImportPanel} from './components/ResumeImportPanel';
    function App(){const[version,setVersion]=React.useState(0);return <main><h1>Manage resume</h1><p role="status">Confirmed replacements: {version}</p><ResumeImportPanel key={version} currentKey="user_pref_resumes/test/current.pdf" currentFileName="Current.pdf" themeId={2} onConfirmed={()=>setVersion(version+1)}/><h2 id="resume-templates">Our four app templates</h2></main>};createRoot(document.getElementById('root')).render(<App/>);`,resolveDir:root,loader:'jsx'},
    bundle:true,write:false,platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'},
    plugins:[{name:'test-storage',setup(build){build.onResolve({filter:/^@\/(lib\/hooks\/useR2Storage|app\/actions\/storage)$/},args=>({path:args.path,namespace:'test'}));build.onLoad({filter:/.*/,namespace:'test'},args=>({contents:args.path.includes('hooks/')?`export function useR2Storage(){return {uploadFile:async({file})=>({success:true,objectKey:'resume_imports/test/'+file.name})}}`:`export async function deleteUserResume(){return {success:true}};export async function getPresignedDownloadUrl(){return {success:true,downloadUrl:'/original.pdf'}}`,loader:'js'}));build.onResolve({filter:/^@\//},args=>({path:path.join(root,args.path.slice(2)+(/\.[a-z]+$/.test(args.path)?'':args.path.includes('components/')?'.tsx':'.ts'))}));}}]});
  let previews=0,confirmed=0,cancelled=0;
  const server=http.createServer(async(req,res)=>{
    if(req.url==='/bundle.js'){res.setHeader('Content-Type','application/javascript');return res.end(result.outputFiles[0].contents);}
    if(req.url==='/original.pdf'){res.setHeader('Content-Type','application/pdf');return res.end(fs.readFileSync(path.join(work,'resume-preservation-2.pdf')));}
    if(req.url==='/api/job-hunt/profile'){
      let raw='';for await(const chunk of req)raw+=chunk;
      const body=JSON.parse(raw);res.setHeader('Content-Type','application/json');
      if(body.operation==='preview'){
        previews++;
        if(body.fileName==='columns.pdf'){res.statusCode=422;return res.end(JSON.stringify({success:false,message:"This layout isn't supported. Use one of our four templates or upload a standard single-column PDF.",detail:'Multiple text columns detected.'}));}
        return res.end(JSON.stringify({success:true,accepted:true,importId:'test-import',revision:1,markdown,previewUrl:'/original.pdf'}));
      }
      if(body.operation==='confirm'){confirmed++;return res.end(JSON.stringify({success:true}));}
      if(body.operation==='cancel'){cancelled++;return res.end(JSON.stringify({success:true}));}
    }
    res.setHeader('Content-Type','text/html');res.end(`<html><head><style>body{font:15px Arial;background:#f5f5f5;color:#171717;margin:24px}main{max-width:1100px;margin:auto;background:white;padding:24px}button,a{display:inline-block;margin:8px;padding:10px;border:1px solid #bbb;border-radius:8px;color:inherit}textarea{width:95%;height:160px;display:block}iframe{width:48%;height:320px}button:disabled{opacity:.4}p[role=alert]{color:#b91c1c}label{display:block;margin:12px 0}</style></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>`);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url=`http://127.0.0.1:${server.address().port}`;
  const browser=await chromium.launch({executablePath:process.env.RESUME_TEST_CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--disable-background-networking']});
  try{
    const page=await browser.newPage({viewport:{width:1200,height:900}});const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(url);
    const picker=page.getByLabel('Choose resume PDF');
    await picker.setInputFiles({name:'resume.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',buffer:Buffer.from('not-pdf')});
    await page.getByRole('alert').filter({hasText:'Export Word'}).waitFor();assert.equal(previews,0);
    await picker.setInputFiles({name:'large.pdf',mimeType:'application/pdf',buffer:Buffer.alloc(10*1024*1024+1)});
    await page.getByRole('alert').filter({hasText:'10 MB'}).waitFor();assert.equal(previews,0);
    await picker.setInputFiles({name:'columns.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-test')});
    await page.getByRole('alert').filter({hasText:'Multiple text columns'}).waitFor();
    assert(await page.getByRole('button',{name:'Choose another PDF'}).isVisible());
    assert(await page.getByText('Current resume: Current.pdf',{exact:false}).isVisible());
    assert.equal(confirmed,0);await page.screenshot({path:path.join(work,'layout-rejected.png')});
    await picker.setInputFiles({name:'standard.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-test')});
    const confirm=page.getByRole('button',{name:'Confirm resume',exact:true});await confirm.waitFor();assert(await confirm.isDisabled());
    const check=page.getByRole('checkbox');await check.check();assert(await confirm.isEnabled());
    const edit=page.getByLabel('Extracted resume details',{exact:true});await edit.fill(markdown.replace('Example Candidate','Reviewed Candidate'));assert(await confirm.isDisabled());
    await page.screenshot({path:path.join(work,'layout-confirmation.png')});
    await page.getByRole('button',{name:'Cancel',exact:true}).click();await picker.waitFor();assert.equal(cancelled,1);assert.equal(confirmed,0);
    await picker.setInputFiles({name:'standard.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-test')});
    await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Confirm resume',exact:true}).click();
    await page.getByRole('status').filter({hasText:'Confirmed replacements: 1'}).waitFor();assert.equal(confirmed,1);assert.deepEqual(errors,[]);
    console.log('LAYOUT_BROWSER_PASSED');
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exit(1);});
