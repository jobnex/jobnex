$ErrorActionPreference='Stop'
rtk proxy cargo test --release --locked -- --test-threads=1
if ($LASTEXITCODE -ne 0) { throw 'Rust tests failed' }
rtk proxy cargo build --release --locked
if ($LASTEXITCODE -ne 0) { throw 'Release build failed' }
Write-Output 'BACKEND_BUILD_VERIFIED'
