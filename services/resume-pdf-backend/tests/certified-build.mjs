import {run} from './certified-helpers.mjs';
if(process.env.SKIP_BUILD!=='true'){
  await run('rtk',['proxy','cargo','check','--locked']);
  await run('rtk',['proxy','cargo','test','--locked','--no-default-features','--features','local-test']);
  await run('rtk',['proxy','cargo','build','--locked','--no-default-features','--features','local-test']);
}
await run(process.execPath,['tests/smoke.mjs']);
console.log('CERTIFIED_BUILD_VERIFIED');
