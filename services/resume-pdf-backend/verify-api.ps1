$ErrorActionPreference='Stop'
rtk proxy cargo build --locked --features local-test
if ($LASTEXITCODE -ne 0) { throw 'Test executable build failed' }
if (!$env:TYPST_BIN) { $env:TYPST_BIN='C:\Users\desir\Projects\Agentic_Resume_Studio\typst.exe' }
rtk proxy node tests/smoke.mjs
if ($LASTEXITCODE -ne 0) { throw 'API smoke check failed' }
