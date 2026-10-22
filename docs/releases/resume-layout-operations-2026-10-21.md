# Operations: resume layout backend

These commands are operator references. The backend deployment and prepare migration are already complete; do not rerun blindly. The global trigger and UI production cutover remain pending the UI team. Check `deployment.json` and `verification.json` for the actual released images/revisions.

## Reproduce backend images from the release branch

From the repository root, authenticated to GCP project `job-scout-508222`:

```powershell
gcloud builds submit services/job-hunt-profile --project=job-scout-508222 --region=us-east1 --tag=us-east1-docker.pkg.dev/job-scout-508222/job-hunt/job-hunt-profile:layout-20261021
gcloud builds submit . --project=job-scout-508222 --region=us-east1 --config=cloudbuild.resume-worker.yaml --substitutions=_IMAGE=us-east1-docker.pkg.dev/job-scout-508222/job-hunt/job-hunt-resume-worker-layout:layout-20261021
gcloud builds submit . --project=job-scout-508222 --region=us-east1 --tag=us-east1-docker.pkg.dev/job-scout-508222/job-hunt/job-hunt-web:layout-20261021
```

Deploy images by immutable digest, not mutable tag. Preserve existing environment, Secret Manager references, IAM, service accounts, queues, concurrency and resource limits. The web and profile release revisions are tagged `layout-v1` with no default traffic change. The dedicated `job-hunt-resume-worker-layout` service requires IAM authentication; its policy uses the existing worker's authorized invoker bindings. Its `RESUME_WORKER_URL` points to itself for durable batch continuation.

Do not publish a new service unauthenticated merely to make a smoke test pass. The owner approved Secret Accessor only for the three specific existing web-runtime bindings recorded in the release document; this is not approval for project-wide secret access.

## Database prepare versus final enforcement

Use the existing operator SQL workflow and a private database connection. `migrations/20261021_resume_imports_prepare.sql` was applied for staging/proof storage, the SHA-256 proof function and `source_import_id` column. It leaves existing generation triggers unchanged.

After the new Vercel UI is deployed and legacy in-flight generation has settled, execute `migrations/20261021_strict_resume_imports.sql` as the database owner. It is transactional and rerunnable. Verify `resume_source_admission` exists on `resume_generation_requests`, and that an invalid/missing import cannot be inserted. Historical outputs are retained. Record that activation separately; its presence is not claimed by this staged release.

## Runtime smoke checks

```powershell
curl.exe https://layout-v1---job-hunt-profile-znsph25yja-ue.a.run.app/health
```

Expect `resumeLayoutContractVersion: 1`. A request to `/profile/resume-from-r2` without valid HMAC headers must return 401. Use the delivered Next.js wrapper for signed validation rather than putting HMAC material in terminal history. Verify an accepted source's returned hash matches the uploaded bytes and the confirmed import's hash.

An unauthenticated request to the private worker's `/health` must return 401/403 at Cloud Run. An authorized identity returns `status: ok`, `enabled: true`, `mode: tasks`. Unauthorized generation requests to the versioned web API must return 401. Do not queue real generation merely for a health check; it reserves credits and can spend model budget.

## Cleanup scheduling during cutover

Install an hourly job using `scripts/cleanup-resume-imports.cjs` and existing private database/R2 bindings. Run without `--apply` first, review counts, then schedule with `--apply`. It expires abandoned imports after 24 hours and deletes only exact expired/retired keys after active/fresh-source checks under the user lock. It never deletes prefixes or historical generated PDF namespaces. Keep job logs free of candidate documents and credentials. Scheduling is a required cutover operation, not an already-deployed scheduler in this release.

## Recorded rollback targets

Until the UI cutover, default traffic remains on `job-hunt-profile-parser-dates-v4-1018`, `job-hunt-web-curated-fresh-1010` and `job-hunt-resume-worker-project-review-1018`. The deployment record captures their original traffic tags. The new tagged endpoints can be left idle without dropping data.

After cutover, pause admission before coordinating UI/backend rollback. Keep proof/history storage. Do not drop global enforcement while old workers can process newly unvalidated jobs. Restore the recorded Vercel deployment and appropriate Cloud Run traffic only after the operator reconciles queue, worker and trigger versions.
