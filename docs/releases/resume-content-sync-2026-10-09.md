# Resume content release — 2026-10-09

Base-resume uploads, profile edits, and active selection now maintain a single owned resume contract: Markdown content, structured extracted JSON, editable profile details preserving extraction, and an owned active resume ID. Generation reads only that active resume. PDF headings with wide layout spacing are recognized; unmatched extraction facts remain available in structured source data.

Deployed source commit: `7d57c461eaa8b25ca51ed85f521b000bf24040ed`. [Cloud Build](https://console.cloud.google.com/cloud-build/builds;region=us-east1/e84b96e1-bd21-4155-b19c-0f91bc3acf86?project=job-scout-508222) completed successfully. Documentation added after that source commit does not change the deployed images.

| Service | Live revision | Rollback revision | Traffic |
| --- | --- | --- | --- |
| `job-hunt-profile` | `job-hunt-profile-00005-sd8` | `job-hunt-profile-00004-r6n` | 100% |
| `job-hunt-web` | `job-hunt-web-00017-glg` | `job-hunt-web-00016-g5t` | 100% |

Immutable images:

- `job-hunt-profile`: `us-east1-docker.pkg.dev/job-scout-508222/job-hunt/job-hunt-profile@sha256:c0accd52008c858fc4875edf36467f93c538f4d13b3de7cd1a7176bbc4a9f789`
- `job-hunt-web`: `us-east1-docker.pkg.dev/job-scout-508222/job-hunt/job-hunt-web@sha256:9b12f6caad67573bfde8ada904e3f887e0facbbaa13310bd11486f2a1945de61`

Environment/secret bindings and service accounts were preserved. The existing web route tag now points at the new revision. The new web image was validated through a zero-production-traffic tagged URL before promotion: page HTTP 200, unauthenticated request route HTTP 401, revision Ready. The temporary tag was removed. Worker and PDF services were not redeployed.

Three selected active resume records were repaired from owned existing uploaded sources or structured extraction. Row locks and original file/profile timestamps fenced the repair. Manual personal/education/experience fields were preserved; full raw extraction stays in JSON. Post-repair queries confirmed Markdown equals the compiler payload, parsed data equals profile details, every active pointer belongs to its user, and a foreign-owner selection returns no row. No schema migration or source deletion.

Validation: six Python profile/parser tests; TypeScript resume assertions; repository and local UI type checks; scoped lint; production Docker builds. Full repository lint retains existing failures (100 errors, 1,869 warnings). Scoped lint excludes the existing `no-explicit-any` findings in preferences/storage. Profile `/health` and web `/` returned HTTP 200.

Signed-in local UI to live GCP preview: skill-gap analysis available, match score 21%, Generate Tailored Resume enabled, wallet still 3 credits. No paid generation was run. Request count remained 11, total wallet balance 584, held requests 0 across verification.

Rollback: route profile traffic to its previous revision above, and route web traffic plus the existing `neondb-trial` tag to its previous revision above. Previous revision images are retained. A code rollback alone will not undo the data repair, which retained owned source extraction and manual edits.

GitHub: [PR #11](https://github.com/jobnex/jobnex/pull/11), branch `fix/resume-content-sync`. Changes are pushed for review; `main` has not been merged.
