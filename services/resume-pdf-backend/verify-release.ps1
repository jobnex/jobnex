$ErrorActionPreference='Stop'
rtk proxy powershell -NoProfile -File verify-build.ps1
if ($LASTEXITCODE -ne 0) { throw 'Build verification failed' }
rtk proxy powershell -NoProfile -File verify-api.ps1
if ($LASTEXITCODE -ne 0) { throw 'API verification failed' }
rtk proxy node verify-config.mjs
if ($LASTEXITCODE -ne 0) { throw 'Cloud configuration verification failed' }
Write-Output 'RELEASE_CODE_VERIFIED'
