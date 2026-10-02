import { spawnSync } from 'node:child_process';
const mode = process.argv[2];
const args = mode === 'test' ? ['test', '--locked', '--target-dir', 'target/verification']
  : mode === 'lint' ? ['clippy', '--locked', '--all-targets', '--', '-D', 'warnings'] : null;
if (!args) process.exit(2);
const result = spawnSync('rtk', ['proxy', 'cargo', ...args], { stdio: 'inherit', windowsHide: true });
if (result.status !== 0) process.exit(result.status || 1);
console.log(`${mode} verification passed`);
