const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const cache = new Map();
function load(file, mocks = {}) {
  file = path.resolve(__dirname, '..', file);
  if (cache.has(file) && !Object.keys(mocks).length) return cache.get(file);
  const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const result = { exports: {} };
  const importer = name => {
    if (name in mocks) return mocks[name];
    if (name.startsWith('.')) return load(path.relative(path.resolve(__dirname, '..'), path.resolve(path.dirname(file), name + (path.extname(name) ? '' : '.ts'))), mocks);
    if (name.startsWith('@/')) return load(name.slice(2) + '.ts', mocks);
    return require(name);
  };
  vm.runInNewContext(compiled, { module: result, exports: result.exports, require: importer, console, Buffer,
    process, URL, Request, Response, AbortController, AbortSignal, setTimeout, clearTimeout, fetch: mocks.fetch || fetch }, { filename: file });
  if (!Object.keys(mocks).length) cache.set(file, result.exports);
  return result.exports;
}
module.exports = { load };
