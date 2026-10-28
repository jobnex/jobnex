const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const destination = path.join(root, 'scratch/verification');
fs.mkdirSync(destination, { recursive: true });
for (const [name, args] of [
  ['types', ['node_modules/typescript/bin/tsc', '--noEmit']],
  ['lint', ['node_modules/eslint/bin/eslint.js', '.']],
  ['build', ['node_modules/next/dist/bin/next', 'build', '--webpack']],
]) {
  const result = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', windowsHide: true, maxBuffer: 10 * 1024 * 1024 });
  fs.writeFileSync(path.join(destination, name + '.log'), (result.stdout || '') + (result.stderr || ''));
  if (result.status !== 0) { console.error(name + ' failed; see scratch/verification/' + name + '.log'); process.exit(1); }
  console.log(name + ' passed');
}
console.log('RESUME_RELEASE_CHECKS_PASS');
