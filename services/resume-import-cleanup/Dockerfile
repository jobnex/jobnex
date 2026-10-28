FROM us-east1-docker.pkg.dev/job-scout-508222/job-hunt/job-hunt-resume-worker-layout@sha256:05b51b7faaf25c27f32567bc2ec0cc7e48ed502be401090ca640158364cf393c
COPY scripts/cleanup-resume-imports.cjs /app/cleanup.cjs
CMD ["node", "/app/cleanup.cjs"]
