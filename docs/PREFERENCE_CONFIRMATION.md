# Preference confirmation release

October 1, 2026. Follow-up to backend commit `00bf9cb`.

## Behavior

Automated profile/extraction/upload/remove updates set `preferences.isConfirmed` to false. They preserve `confirmedAt` and `lastConfirmedPreferences`. If the baseline is missing or JSON null, the database initializes it from the pre-update preference values, excluding confirmation metadata. These merges happen against the current database row to preserve a concurrent user confirmation.

The Manage Job Hunt form displays an amber **Unconfirmed changes** status. **Confirm Changes** is enabled for pending backend changes or edits that differ from the saved baseline. Successful confirmation stamps a server timestamp, saves the new baseline, displays **Preferences confirmed**, and disables the button. Editing or receiving a backend update enables confirmation again. Reload restores persisted status. Failed confirmation leaves the form unconfirmed.

Existing rows without confirmation metadata are treated as unconfirmed. No blanket production backfill or schema migration is needed. Metadata lives in the existing JSONB column; rows gain it on their next relevant write.

## Backend API usage

These are authenticated Next.js server actions, not new REST endpoints:

- `saveUserJobPreferences(input)`: save pending preferences; never confirms.
- `confirmUserJobPreferences(input)`: explicit user confirmation; stamps the server clock and stores the baseline.
- Clients cannot set confirmation metadata through the regular save payload. The validation schema strips it.

The existing cloud profile paths remain unchanged. All three preference-writing paths (`PATCH /profile`, `POST /profile/resume`, `POST /profile/resume-from-r2`) use the same pending-write SQL contract. Extracted cities are capped at three; legacy override validation rejects more than three. Original-file upload/remove server actions also invalidate confirmation without discarding its metadata.

## Deployment

GCP: project `job-scout-508222`, region `us-east1`, service `job-hunt-profile`, revision `job-hunt-profile-00003-5rm`.

Image: `us-east1-docker.pkg.dev/job-scout-508222/job-hunt/job-hunt-profile:confirmation-20261001`. Concurrency 4; maximum 3 instances. PDF compiler and latest job-resume schema are unchanged.

This release includes the Manage Job Hunt confirmation controls and required profile-loading integration. Other previously local application pages, job cards, PDF modal styling, and client store edits are excluded from this release.

## Verification

```powershell
rtk proxy node scripts/verify-confirmation.mjs
rtk proxy node scripts/verify-confirmation-browser.mjs
```

The contract check uses a disposable user fixture in the isolated Neon development branch configured by ignored `scratch/dev-db.json`. It exercises actual preference server actions, the Python service's SQL expression, authenticated/unauthenticated behavior, forged metadata rejection, missing/null legacy baselines, explicit re-confirmation, and city limits. Production users are not modified by these tests.

The browser check mounts the actual Manage page with fixture server actions and application CSS. It verifies failed-save recovery, confirmation, reload, edited values, and reverting to the baseline. It does not confirm the real signed-in user's preferences.

Existing storage regression checks also passed for six templates and four simultaneous exports.
