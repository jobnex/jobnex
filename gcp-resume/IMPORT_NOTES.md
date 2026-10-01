# Deployment reference import

These scripts and overlays are source snapshots from the existing Jobnex GCP setup. No script was run during the GitHub import. No cloud resources, IAM settings, secrets, database rows, or running services changed.

`deploy.py` and `deploy_runtime.py` still point to `incoming-my-app-3/my-app`, outside this repository layout. `install.py` references an older absolute Windows app path. The `fix-*`, `credits-only.py`, and related release scripts are historical one-off modifications and must not be replayed blindly over App 4. The `app/` directory contains older integration overlays, not a complete runnable frontend.

Deployment records, `web-env.json`, generated build contexts, private files, and run outputs were intentionally omitted. Scripts that consume those records require a newly reviewed configuration. The README describes the earlier deployed system and may not reflect its current live state.

Before a new deployment: integrate the resume queue and worker with App 4; configure portable app paths; review the Docker build context; create separate staging resources and secret bindings; run integration checks; and review the exact release commit. No automatic deployment is enabled by this import.
