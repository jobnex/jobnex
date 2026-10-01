# Working together

Use a feature branch for each change and open a pull request into `main`. Ask one teammate to review it. Frontend work lives in `app/`, `components/`, and `store/`; server work lives in `lib/`, `app/actions/`, and API routes. Coordinate before changing shared files.

Run `npm ci --ignore-scripts`, `npx tsc --noEmit`, and `npm run lint` before review. Keep database maintenance scripts out of automated checks: several scripts delete or replace data.

Use separate databases, R2 buckets, authentication configuration, and credentials for local development, staging, and production. Never commit `.env.local`. Staging and production deployment are not configured yet. Promote a tested commit to production only after a release review; retain the prior build for rollback.

The repository contains the `my-app(4).7z` frontend at its root, the Python resume pipeline in `resume-agent-inspect/`, the scraper in `techjobs/`, and historical GCP deployment material in `gcp-resume/`. Keep these existing folder names to avoid unnecessary moves.

The App 4 archive does not include the previous queue/credit integration. Adding the Python source to this repository does not connect it to the frontend. Restore and test that integration before replacing the deployed application. The compiler payload currently uses shared local JSON storage and needs per-user durable storage before production.

GCP scripts reference previous local app paths and existing production resources. They are preserved for review, not configured as a fresh deployment workflow. Read `gcp-resume/IMPORT_NOTES.md` before using them.
