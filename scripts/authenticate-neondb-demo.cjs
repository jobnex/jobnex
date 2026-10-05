// Normal public auth endpoints only. Local credentials/session stay in ignored scratch/.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { randomBytes } = require('node:crypto');
const base = 'https://job-hunt-web-znsph25yja-ue.a.run.app';
const other = process.argv.includes('--other');
const file = other ? 'scratch/demo-other-session.json' : 'scratch/demo-api-session.json';
async function main() {
  fs.mkdirSync('scratch', {recursive:true});
  const state = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : {
    email:other ? 'jobnex-neondb-other-20261005@example.com' : 'jobnex-neondb-trial-20261005@example.com', password:randomBytes(24).toString('base64url'), cookies:{}
  };
  fs.writeFileSync(file,JSON.stringify(state));
  const capture = response => {
    for(const item of response.headers.getSetCookie()) {
      const pair=item.split(';')[0], i=pair.indexOf('=');
      if(i<0) continue;
      if(/max-age=0/i.test(item)) delete state.cookies[pair.slice(0,i)];
      else state.cookies[pair.slice(0,i)]=pair.slice(i+1);
    }
  };
  const headers = () => ({'Content-Type':'application/json',Origin:base,
    Cookie:Object.entries(state.cookies).map(([k,v])=>`${k}=${v}`).join('; ')});
  let response = await fetch(base+'/api/auth/sign-in/email',{method:'POST',headers:headers(),
    body:JSON.stringify({email:state.email,password:state.password})});
  capture(response);
  if(!response.ok) {
    response=await fetch(base+'/api/auth/sign-up/email',{method:'POST',headers:headers(),
      body:JSON.stringify({name:'Synthetic Neon Trial Candidate',email:state.email,password:state.password})});
    capture(response);
  }
  if(!response.ok) {
    const error=await response.json().catch(()=>({}));
    console.log(JSON.stringify({event:'demo_auth_failed',status:response.status,code:error.code,message:error.message}));
    process.exitCode=1; return;
  }
  const session=await fetch(base+'/api/auth/get-session',{headers:headers()});capture(session);
  const body=await session.json();
  const user=body?.user||body?.data?.user;
  assert(user?.id,'Public auth did not establish a demo session');
  state.user_id=user.id;fs.writeFileSync(file,JSON.stringify(state));
  console.log(JSON.stringify({event:'demo_authenticated',status:session.status,user_id:user.id}));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
