// Reuse the isolated transport/browser harness; exercise automatic admission.
const fs=require('node:fs');
const path=require('node:path');
const Module=require('node:module');
let source=fs.readFileSync(path.join(__dirname,'check-layout-browser.cjs'),'utf8');
const start=source.indexOf("    const picker=page.getByLabel");
const end=source.indexOf("  }finally{await browser.close()");
if(start<0||end<0)throw new Error('Browser harness changed');
source=source.slice(0,start)+`
    const picker=page.getByLabel('Choose resume PDF');
    assert.equal(await page.getByRole('button',{name:'Validate current resume'}).count(),0);
    assert.equal(await page.getByRole('button',{name:'Confirm resume',exact:true}).count(),0);
    assert(await page.getByRole('button',{name:'Preview resume',exact:true}).isVisible());
    assert(await page.getByRole('button',{name:'Delete resume',exact:true}).isVisible());
    await picker.setInputFiles({name:'resume.docx',mimeType:'application/msword',buffer:Buffer.from('no')});
    await page.getByRole('alert').filter({hasText:'Export Word'}).waitFor();assert.equal(previews,0);
    await picker.setInputFiles({name:'large.pdf',mimeType:'application/pdf',buffer:Buffer.alloc(10*1024*1024+1)});
    await page.getByRole('alert').filter({hasText:'10 MB'}).waitFor();assert.equal(previews,0);
    await picker.setInputFiles({name:'columns.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-test')});
    await page.getByRole('alert').filter({hasText:'Multiple text columns'}).waitFor();
    assert(await page.getByText('Current.pdf',{exact:true}).isVisible());assert.equal(confirmed,0);
    await picker.setInputFiles({name:'standard.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-test')});
    await page.getByRole('status').filter({hasText:'Confirmed replacements: 1'}).waitFor();
    assert.equal(confirmed,1);assert.equal(previews,2);assert.equal(cancelled,0);assert.deepEqual(errors,[]);
    await page.screenshot({path:path.join(work,'simple-upload-tested.png')});
    console.log('SIMPLE_UPLOAD_PASSED');
`+source.slice(end);
const test=new Module(__filename,module);
test.filename=__filename;test.paths=module.paths;test._compile(source,__filename);
