# Working together

Use a feature branch for each change and open a pull request into `main`. Ask one teammate to review it. Frontend work lives in `app/`, `components/`, and `store/`; server work lives in `lib/`, `app/actions/`, and API routes. Coordinate before changing shared files.

Run `npm ci --ignore-scripts`, `npx tsc --noEmit`, and `npm run lint` before review. Keep database maintenance scripts out of automated checks: several scripts delete or replace data.

Use separate databases, R2 buckets, authentication configuration, and credentials for local development, staging, and production. Never commit `.env.local`. Staging and production deployment are not configured yet. Promote a tested commit to production only after a release review; retain the prior build for rollback.

This repository starts with the `my-app(4).7z` frontend. The previous Python resume worker and its queue/credit integration are not included in this archive. Restore and test that integration before replacing the deployed application. The compiler payload currently uses shared local JSON storage and needs per-user durable storage before production.
