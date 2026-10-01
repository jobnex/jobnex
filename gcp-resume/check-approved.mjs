import { spawnSync } from 'node:child_process';
import path from 'node:path';
for (const mode of ['types', 'lint', 'builder', 'accounting']) {
  const result = spawnSync('rtk', ['proxy', process.execPath, path.resolve('../phase-one/verify.mjs'), mode], {encoding:'utf8', windowsHide:true, timeout:240000});
  if (result.status !== 0) { process.stderr.write(result.stdout ?? ''); process.stderr.write(result.stderr ?? ''); process.exit(1); }
}
console.log('APPROVED_CHECKS_PASSED');
