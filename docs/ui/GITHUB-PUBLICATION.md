# GitHub publication record — resume UI handoff

Published to [jobnex/jobnex](https://github.com/jobnex/jobnex).

- Backup branch: [docs/resume-ui-handoff-20261010](https://github.com/jobnex/jobnex/tree/docs/resume-ui-handoff-20261010).
- Tracking draft: [PR #13](https://github.com/jobnex/jobnex/pull/13).
- Verified source/archive snapshot: [4191c22e4d499d2f6784889e7d52666d28e7dcdb](https://github.com/jobnex/jobnex/commit/4191c22e4d499d2f6784889e7d52666d28e7dcdb).
- Permanent code collection: [21 source files](https://github.com/jobnex/jobnex/tree/4191c22e4d499d2f6784889e7d52666d28e7dcdb/docs/ui/source-snapshots/2026-10-10).
- Permanent handoff: [UI change and deployment document](https://github.com/jobnex/jobnex/blob/4191c22e4d499d2f6784889e7d52666d28e7dcdb/docs/ui/resume-ui-handoff-2026-10-10.md).
- Permanent ZIP: [source archive](https://github.com/jobnex/jobnex/blob/4191c22e4d499d2f6784889e7d52666d28e7dcdb/docs/ui/resume-ui-code-handoff-2026-10-10.zip).

The draft is based on fix/resume-background-credits, the branch from PR #12.
The new PR contains the handoff backup and reviewable snapshots. Source files
are collected under docs/ui/source-snapshots rather than applied to runtime files.
UI developers should diff/integrate the selected production-web, local-app or
profile-service sources into their current checkout.

TypeScript/TSX snapshots use a .txt suffix so the app does not compile them.
The ZIP retains original file names. SHA-256 verification passed for all 21
snapshot files and archive entries; ZIP integrity also passed.

The deployed contact/header/company/education fixes are documented separately
from the local A4 pagination and delete/replacement fixes awaiting release.
Publishing or merging this documentation backup does not deploy those changes.

No environment files, credentials or private resume artifacts were included.
The original working checkout's uncommitted implementation changes were preserved.


## Curated Jobs release

Source snapshot commit: [538e4fe8041b8c57e1b290ee683a650bf83eb9d5](https://github.com/jobnex/jobnex/commit/538e4fe8041b8c57e1b290ee683a650bf83eb9d5).
Collect six production source files plus three verification references from [this immutable snapshot](https://github.com/jobnex/jobnex/tree/538e4fe8041b8c57e1b290ee683a650bf83eb9d5/docs/ui/source-snapshots/2026-10-10-curated-jobs)
or [the ZIP](https://github.com/jobnex/jobnex/blob/538e4fe8041b8c57e1b290ee683a650bf83eb9d5/docs/ui/curated-jobs-code-2026-10-10.zip). See [curated-jobs-2026-10-10.md](curated-jobs-2026-10-10.md).
Cloud Run revision job-hunt-web-curated-fresh-1010 serves 100% production traffic and the neondb-trial tag.
SQL, read-only live matching, TypeScript, rendered controls, production build and staged API checks passed.
