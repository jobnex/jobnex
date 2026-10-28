import {createHash} from 'node:crypto';
import {readdirSync,readFileSync} from 'node:fs';
import path from 'node:path';
export function sourceDigest(root=process.cwd()){
  const files=[];
  function visit(dir){for(const e of readdirSync(dir,{withFileTypes:true})){
    if(['target','.tools','.git','.terraform','test-evidence','__pycache__'].includes(e.name)||e.name==='.gitignore'||e.name==='.env'||e.name.startsWith('.env.')||/\.(log|exe|zip|tfvars|tfplan)$|\.tfstate/.test(e.name))continue;
    const p=path.join(dir,e.name);if(e.isDirectory())visit(p);else if(e.isFile())files.push(path.relative(root,p).split(path.sep).join('/'));
  }}
  visit(root);files.sort();const hash=createHash('sha256');
  for(const file of files)hash.update(file+'\0').update(readFileSync(path.join(root,file))).update('\0');
  return hash.digest('hex');
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname.replace(/^\/(?=[A-Za-z]:)/,'')))console.log('CERTIFIED_SOURCE_SHA256='+sourceDigest());
