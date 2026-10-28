# Resume applications release — October 10, 2026

My Applications now shows each job after its resume generation request is accepted. The list restores from owned requests after reload, selects one latest request per job, displays generation status, opens the correct saved draft with a review warning when required, and persists manually selected application stages. Generating does not claim the user submitted to the employer.

- GCP project: `job-scout-508222`; region: `us-east1`.
- Web revision: `job-hunt-web-00030-muv`; verified traffic: 100%.
- Image: `us-east1-docker.pkg.dev/job-scout-508222/job-hunt/job-hunt-web@sha256:fb0c6ad07229ffb8184c7901f901891cea13cd83a997beeda0f3d42155c3231f`.
- Deployed source: `45ee44ff11dc63dfa18c1d01ce4e39a17edd99e6`.
- Cloud Build: `5fc4a6be-7104-4cb8-a3a9-8c2cf517e151`; SUCCESS.
- Runtime bindings preserved; temporary validation tag removed.
- Worker unchanged by this release.
- Previous web revision for rollback: `job-hunt-web-00027-duw`.

Validation: both frontend checkouts pass TypeScript; changed page/actions/test pass scoped ESLint; applications and prior background behavioral checks pass. The actual signed-in browser restores TensorWave and AWS jobs, and opens the TensorWave draft with its review warning. Cloud Run checks verify HTTP 200 for the web root and HTTP 401 for an unauthenticated generated-output request before and after promotion. No paid generation or real employer application submission was used for testing. Manual stage mutation is checked with doubles and its existing live unique index is verified; no real employer status was changed merely for testing.

Frontend integration and database behavior are documented in `docs/ui-team-resume-applications.md`. No schema migration or new generation endpoint is required.
